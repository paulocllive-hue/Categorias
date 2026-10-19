async function consultarPautas() {
    const url = new URL(
        "https://pje.trt23.jus.br/pje-consulta-api/api/audiencias"
    );

    // Parâmetros da requisição que você capturou.
    url.search = new URLSearchParams({
        pagina: "1",
        tamanhoPagina: "20",
        ordenacaoColuna: "undefined",
        ordenacaoCrescente: "undefined",
        idOj: "2",
        data: "2026-11-18"
    }).toString();

    const resposta = await fetch(url, {
        headers: {
    Accept: "application/json",
    "x-grau-instancia": "1"
    },
        signal: AbortSignal.timeout(30000)
    });

    if (!resposta.ok) {
    const corpo = await resposta.text();

    console.log("Status:", resposta.status);
    console.log(
        "Tipo da resposta:",
        resposta.headers.get("content-type")
    );
    console.log("Mensagem do servidor:", corpo.slice(0, 2000));

    throw new Error(
        `Consulta recusada ou indisponível: HTTP ${resposta.status}`
    );
}

    const conteudo = resposta.headers.get("content-type") || "";

    if (!conteudo.includes("application/json")) {
        throw new Error("O servidor não retornou JSON.");
    }

    const dados = await resposta.json();

    if (!Array.isArray(dados.resultado)) {
        throw new Error("A resposta veio em um formato inesperado.");
    }

    const selecionadas = dados.resultado.filter((audiencia) => {
        const tipo = String(audiencia.tipo || "")
            .trim()
            .toLowerCase();

        return /^(inicial|una)\b/.test(tipo);
    });

    console.log("Total informado pelo servidor:", dados.totalRegistros);
    console.log("Quantidade de páginas:", dados.qtdPaginas);
    console.log("Inicial ou Una nesta página:", selecionadas.length);

    console.table(
        selecionadas.map((audiencia) => ({
            processo: audiencia.numeroProcesso,
            data: audiencia.data,
            tipo: audiencia.tipo,
            sala: audiencia.sala,
            situacao: audiencia.status
        }))
    );
}

consultarPautas().catch((erro) => {
    console.error("Erro:", erro.message);
    process.exitCode = 1;
});