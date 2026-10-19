const { chromium } = require("playwright");
const fs = require("node:fs/promises");
const path = require("node:path");

function campoCsv(valor) {
    let texto = String(valor ?? "");

    // Evita que o Excel interprete conteúdo como fórmula.
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

async function iniciar() {
    const navegador = await chromium.launch({
        headless: false
    });

    const contexto = await navegador.newContext();
    const pagina = await contexto.newPage();

    // Acompanha somente as respostas da consulta de audiências.
    pagina.on("response", async (resposta) => {
        const url = new URL(resposta.url());

        if (
            url.hostname !== "pje.trt23.jus.br" ||
            url.pathname !== "/pje-consulta-api/api/audiencias"
        ) {
            return;
        }

        try {
            console.log("\nStatus da consulta:", resposta.status());

            if (!resposta.ok()) {
                console.log(
                    "Consulta recusada. Interrompa o teste se o acesso continuar negado."
                );
                return;
            }

            const tipoConteudo =
                resposta.headers()["content-type"] || "";

            if (!tipoConteudo.includes("application/json")) {
                console.log("A resposta não contém JSON.");
                return;
            }

            const dados = await resposta.json();

            if (!Array.isArray(dados.resultado)) {
                console.log("Formato de resposta inesperado.");
                return;
            }

            const selecionadas = dados.resultado.filter((audiencia) =>
                /^(inicial|una)\b/i.test(
                    String(audiencia.tipo || "").trim()
                )
            );

            console.log("Data consultada:", url.searchParams.get("data"));
            console.log("Órgão — ID:", url.searchParams.get("idOj"));
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
            await exportarCsv(selecionadas, url, dados.pagina);
        } catch (erro) {
            console.error("Erro ao ler a resposta:", erro.message);
        }
    });

    console.log("No navegador que abrir:");
    console.log("1. Selecione o grau, a vara e a data.");
    console.log("2. Clique em Pesquisar.");
    console.log("3. Confira o resultado neste terminal.");
    console.log("Feche o navegador quando terminar.");

    try {
        await pagina.goto(
            "https://pje.trt23.jus.br/consultaprocessual/pautas",
            {
                waitUntil: "domcontentloaded",
                timeout: 60000
            }
        );
    } catch (erro) {
        console.log("Não foi possível concluir a navegação:", erro.message);
        console.log("Confira a página aberta no navegador.");
    }
}

iniciar().catch((erro) => {
    console.error("Erro ao iniciar:", erro.message);
    process.exitCode = 1;
});