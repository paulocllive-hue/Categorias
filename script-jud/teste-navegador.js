const { chromium } = require("playwright");
const fs = require("node:fs/promises");
const path = require("node:path");
const readline = require("node:readline/promises");

function campoCsv(valor) {
    let texto = String(valor ?? "");

    // Evita interpretar conteúdo como fórmula no Excel.
    if (/^[=+\-@\t\r\n]/.test(texto)) {
        texto = "'" + texto;
    }

    return `"${texto.replace(/"/g, '""')}"`;
}

async function exportarCsv(audiencias, url, paginaConsultada) {
    const colunas = [
        "Processo",
        "Data",
        "Horario",
        "Tipo",
        "Sala",
        "Situacao",
        "Orgao_ID"
    ];

    const linhas = audiencias.map((audiencia) => {
        const [data = "", horario = ""] =
            String(audiencia.data || "").split("T");

        return [
            audiencia.numeroProcesso,
            data,
            horario,
            audiencia.tipo,
            audiencia.sala,
            audiencia.status,
            url.searchParams.get("idOj")
        ];
    });

    const csv = "\uFEFF" + [colunas, ...linhas]
        .map((linha) => linha.map(campoCsv).join(";"))
        .join("\r\n");

    const pasta = path.join(__dirname, "resultados");

    await fs.mkdir(pasta, { recursive: true });

    const instante = new Date()
        .toISOString()
        .replace(/[:.]/g, "-");

    const arquivo = path.join(
        pasta,
        `pautas-${instante}-pagina-${Number(paginaConsultada)}.csv`
    );

    await fs.writeFile(arquivo, csv, "utf8");

    console.log("CSV salvo em:", arquivo);
}

function ehConsultaAudiencias(endereco) {
    const url = new URL(endereco);

    return (
        url.hostname === "pje.trt23.jus.br" &&
        url.pathname === "/pje-consulta-api/api/audiencias"
    );
}

async function iniciar() {
    const navegador = await chromium.launch({
        headless: false
    });

    const contexto = await navegador.newContext();
    const pagina = await contexto.newPage();

    pagina.on("request", (requisicao) => {
        if (!ehConsultaAudiencias(requisicao.url())) {
            return;
        }

        const url = new URL(requisicao.url());

        console.log("\nConsulta enviada:", {
            metodo: requisicao.method(),
            data: url.searchParams.get("data"),
            orgao: url.searchParams.get("idOj")
        });
    });

    pagina.on("requestfailed", (requisicao) => {
        if (!ehConsultaAudiencias(requisicao.url())) {
            return;
        }

        console.error(
            "Falha de rede na consulta:",
            requisicao.failure()?.errorText
        );
    });

    pagina.on("response", async (resposta) => {
        if (!ehConsultaAudiencias(resposta.url())) {
            return;
        }

        try {
            const url = new URL(resposta.url());

            console.log("\nStatus da consulta:", resposta.status());

            if (!resposta.ok()) {
                console.error(
                    "Consulta recusada ou indisponível. " +
                    "Se o acesso continuar negado, encerre o teste."
                );
                return;
            }

            const tipoConteudo =
                resposta.headers()["content-type"] || "";

            if (!tipoConteudo.includes("application/json")) {
                console.error("A resposta não contém JSON.");
                return;
            }

            const dados = await resposta.json();

            if (!Array.isArray(dados.resultado)) {
                console.error(
                    "A resposta não contém a lista esperada de audiências."
                );
                return;
            }

            const selecionadas = dados.resultado.filter(
                (audiencia) =>
                    /^(inicial|una)\b/i.test(
                        String(audiencia.tipo || "").trim()
                    )
            );

            console.log(
                "Data consultada:",
                url.searchParams.get("data")
            );
            console.log(
                "Órgão — ID:",
                url.searchParams.get("idOj")
            );
            console.log("Página:", dados.pagina);
            console.log("Total de páginas:", dados.qtdPaginas);
            console.log("Total de registros:", dados.totalRegistros);
            console.log(
                "Inicial ou Una nesta página:",
                selecionadas.length
            );

            console.table(
                selecionadas.map((audiencia) => ({
                    processo: audiencia.numeroProcesso,
                    data: audiencia.data,
                    tipo: audiencia.tipo,
                    sala: audiencia.sala,
                    situacao: audiencia.status
                }))
            );

            await exportarCsv(
                selecionadas,
                url,
                dados.pagina
            );
        } catch (erro) {
            console.error(
                "Erro ao ler ou exportar a resposta:",
                erro.message
            );
        }
    });

    try {
        await pagina.goto(
            "https://pje.trt23.jus.br/consultaprocessual/pautas",
            {
                waitUntil: "domcontentloaded",
                timeout: 60000
            }
        );
    } catch (erro) {
        console.error(
            "Não foi possível abrir a página:",
            erro.message
        );
        console.log("Confira o navegador aberto.");
        return;
    }

    const terminal = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    try {
        await terminal.question(
            "\nNo navegador, selecione o 1º grau e a vara. " +
            "Não clique em Pesquisar. " +
            "Depois volte aqui e pressione Enter..."
        );
    } finally {
        terminal.close();
    }

    try {
        const campoData = pagina.locator(
            'input[aria-label="Filtro data da pauta"]'
        );

        await campoData.fill("");

        await campoData.pressSequentially(
            "18/11/2026",
            { delay: 100 }
        );

        await campoData.press("Tab");

        console.log(
            "Data preenchida:",
            await campoData.inputValue()
        );

        const botaoPesquisar = pagina.getByRole("button", {
            name: /^\s*pesquisar\s*$/i
        });

        const quantidade = await botaoPesquisar.count();

        console.log(
            "Botões PESQUISAR encontrados:",
            quantidade
        );

        if (quantidade !== 1) {
            console.error(
                "Não foi possível identificar um único botão Pesquisar."
            );
            console.log(
                "Botões visíveis encontrados na página:"
            );

            console.log(
                await pagina.getByRole("button").allTextContents()
            );

            return;
        }

        console.log(
            "Botão habilitado:",
            await botaoPesquisar.isEnabled()
        );

        console.log("Vou clicar em PESQUISAR.");

        await botaoPesquisar.click({
            timeout: 10000
        });

        console.log("Clique automático concluído.");
        console.log(
            "Aguarde a resposta e a mensagem de CSV salvo."
        );
        console.log(
            "Feche o navegador quando terminar."
        );
    } catch (erro) {
        console.error(
            "Falha no preenchimento ou clique automático:",
            erro.message
        );

        console.log(
            "Mantenha o navegador aberto para conferir a tela."
        );
    }
}

iniciar().catch((erro) => {
    console.error("Erro ao iniciar:", erro.message);
    process.exitCode = 1;
});