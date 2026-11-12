'use strict';

const painel = document.querySelector('#painel');
const titulo = document.querySelector('#painel-titulo');
const mensagem = document.querySelector('#mensagem');
const conteudo = document.querySelector('#conteudo');
const botaoConta = document.querySelector('#conta');
const botaoCarrinho = document.querySelector('#carrinho');
const contador = document.querySelector('#quantidade');

const marcas = { kamai: 'Kamai Sunset', mega: 'Mega Batatas', doce: 'Doce Bem' };
const perfis = { varejista: 'Varejista', atacadista: 'Atacadista', distribuidor: 'Distribuidor' };
const dinheiro = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dataPedido = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'America/Cuiaba' });

let conta = null;
let itens = [];
let versaoCarrinho = null;
let demonstracao = false;
let tela = '';
let destino = null;
let marcaAtual = '';
let ocupado = false;
let avisoTimer;
const chaves = new Map();
const brl = (centavos) => dinheiro.format(centavos / 100);

async function api(caminho, metodo = 'GET', dados) {
  const resposta = await fetch('/api' + caminho, {
    method: metodo,
    headers: dados ? { 'Content-Type': 'application/json' } : {},
    body: dados ? JSON.stringify(dados) : undefined
  });
  const resultado = await resposta.json();
  if (!resposta.ok) {
    const erro = new Error(resultado.erro);
    erro.status = resposta.status;
    throw erro;
  }
  return resultado;
}

function criar(tag, texto, classe) {
  const elemento = document.createElement(tag);
  if (texto) elemento.textContent = texto;
  if (classe) elemento.className = classe;
  return elemento;
}

function botao(texto, acao, classe = 'botao botao-pedido') {
  const elemento = criar('button', texto, classe);
  elemento.type = 'button';
  elemento.dataset.acao = acao;
  return elemento;
}

function status(texto) {
  mensagem.textContent = texto;
  mensagem.hidden = !texto;
  if (texto) painel.scrollTop = 0;
}

function avisar(texto) {
  const aviso = document.querySelector('#aviso');
  aviso.textContent = texto;
  aviso.hidden = false;
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => { aviso.hidden = true; }, 5500);
}

function atualizarCabecalho() {
  botaoConta.textContent = conta ? 'Minha conta' : 'Entrar';
  contador.textContent = itens.reduce((total, item) => total + item.quantidade, 0);
}

function abrir(novaTela, rotulo) {
  tela = novaTela;
  titulo.textContent = rotulo;
  status('');
  conteudo.replaceChildren();
  if (!painel.open) painel.showModal();
  titulo.tabIndex = -1;
  titulo.focus({ preventScroll: true });
  painel.scrollTop = 0;
}

function avisoDemonstracao() {
  if (demonstracao) conteudo.append(criar('p', 'Ambiente de demonstração. Use dados fictícios. Os preços são ilustrativos.', 'demonstracao'));
}

function mostrarFormulario(tipo) {
  abrir(tipo, tipo === 'login' ? 'Entrar na conta' : 'Cadastrar empresa');
  avisoDemonstracao();
  conteudo.append(document.querySelector('#' + tipo + '-template').content.cloneNode(true));
  conteudo.querySelector('input')?.focus({ preventScroll: true });
}

function pedirLogin(proximaTela) {
  destino = proximaTela;
  mostrarFormulario('login');
  status('Entre ou cadastre sua empresa para ver os preços e fazer pedidos.');
}

function detalheProduto(produto, textoPreco) {
  const linha = criar('article', '', 'linha');
  if (produto.imagem) {
    const imagem = criar('img');
    imagem.src = '/img/' + produto.imagem;
    imagem.alt = '';
    linha.append(imagem);
  }
  const detalhe = criar('div', '', 'linha-detalhe');
  detalhe.append(criar('strong', produto.nome));
  if (produto.apresentacao) detalhe.append(criar('small', produto.apresentacao + ' · ' + produto.venda));
  if (textoPreco) detalhe.append(criar('small', textoPreco));
  linha.append(detalhe);
  return linha;
}

async function mostrarCatalogo(marca) {
  marcaAtual = marca;
  if (!conta) return pedirLogin('catalogo');
  abrir('catalogo', marcas[marca]);
  status('Carregando produtos…');
  const { produtos, demonstracao: modoDemo } = await api('/catalogo');
  demonstracao = modoDemo;
  status('');
  avisoDemonstracao();
  conteudo.append(criar('p', 'Tabela comercial · ' + perfis[conta.perfil]));
  const lista = produtos.filter((produto) => produto.marca === marca);
  if (!lista.length) conteudo.append(criar('p', 'Nenhum produto disponível nesta marca.'));
  for (const produto of lista) {
    if (produto.preco_centavos === null) throw Object.assign(new Error('Sua sessão expirou.'), { status: 401 });
    const linha = detalheProduto(produto, brl(produto.preco_centavos) + ' por ' + produto.venda);
    const adicionar = botao('Adicionar', 'adicionar');
    adicionar.dataset.produto = produto.id;
    adicionar.setAttribute('aria-label', 'Adicionar ' + produto.nome + ' ' + produto.apresentacao);
    linha.append(adicionar);
    conteudo.append(linha);
  }
  const rodape = criar('div', '', 'painel-rodape');
  rodape.append(botao('Ver carrinho', 'ver-carrinho'));
  conteudo.append(rodape);
}

function desenharCarrinho() {
  conteudo.replaceChildren();
  avisoDemonstracao();
  if (!itens.length) {
    conteudo.append(criar('p', 'Seu carrinho está vazio.'));
    conteudo.append(botao('Voltar às marcas', 'marcas', 'link'));
    return;
  }

  let total = 0;
  let indisponivel = false;
  for (const produto of itens) {
    const disponivel = produto.preco_centavos !== null;
    const subtotal = disponivel ? produto.preco_centavos * produto.quantidade : 0;
    total += subtotal;
    indisponivel ||= !disponivel;
    const linha = detalheProduto(produto, disponivel ? brl(produto.preco_centavos) + ' cada · ' + brl(subtotal) : 'Remova este item para concluir.');
    const acoes = criar('div', '', 'linha-acoes');
    const menos = botao(disponivel ? '−' : 'Remover', 'quantidade', disponivel ? 'quantidade-botao' : 'link');
    menos.dataset.produto = produto.id;
    menos.dataset.operacao = disponivel ? 'retirar' : 'remover';
    menos.setAttribute('aria-label', 'Retirar ' + produto.nome + ' ' + (produto.apresentacao || ''));
    acoes.append(menos, criar('span', String(produto.quantidade)));
    if (disponivel) {
      const mais = botao('+', 'quantidade', 'quantidade-botao');
      mais.dataset.produto = produto.id;
      mais.dataset.operacao = 'adicionar';
      mais.setAttribute('aria-label', 'Aumentar quantidade de ' + produto.nome + ' ' + produto.apresentacao);
      mais.disabled = produto.quantidade >= 999;
      acoes.append(mais);
    }
    linha.append(acoes);
    conteudo.append(linha);
  }
  const rodape = criar('div', '', 'painel-rodape');
  rodape.append(criar('span', 'Total dos produtos · ' + brl(total)));
  const concluir = botao('Revisar pedido', 'revisar');
  concluir.disabled = indisponivel;
  rodape.append(concluir, botao('Continuar escolhendo', 'marcas', 'link'));
  conteudo.append(rodape);
}

async function mostrarCarrinho() {
  if (!conta) return pedirLogin('carrinho');
  abrir('carrinho', 'Seu carrinho');
  status('Carregando carrinho…');
  salvarEstadoCarrinho(await api('/carrinho'));
  atualizarCabecalho();
  status('');
  desenharCarrinho();
}

function enderecoFormatado(e) {
  return [e.logradouro + ', ' + e.numero, e.complemento, e.bairro, e.cidade + '/' + e.uf, e.cep].filter(Boolean).join(' · ');
}

function mostrarRevisao() {
  abrir('revisao', 'Revisar pedido');
  avisoDemonstracao();
  conteudo.append(criar('strong', conta.razao_social), criar('p', 'Entrega · ' + enderecoFormatado(conta.endereco)));
  let total = 0;
  for (const item of itens) {
    const subtotal = item.quantidade * item.preco_centavos;
    total += subtotal;
    conteudo.append(detalheProduto(item, item.quantidade + ' × ' + brl(item.preco_centavos) + ' · ' + brl(subtotal)));
  }
  const rodape = criar('div', '', 'painel-rodape');
  rodape.append(criar('span', 'Total dos produtos · ' + brl(total)), botao('Enviar pedido', 'enviar'), botao('Editar carrinho', 'ver-carrinho', 'link'));
  conteudo.append(rodape);
}

async function mostrarConta() {
  if (!conta) return mostrarFormulario('login');
  abrir('conta', 'Minha conta');
  avisoDemonstracao();
  const { pedidos } = await api('/pedidos');
  conteudo.append(criar('strong', conta.razao_social), criar('p', conta.nome + ' · ' + perfis[conta.perfil]), criar('p', conta.email), criar('p', enderecoFormatado(conta.endereco)));
  conteudo.append(criar('h3', 'Últimos pedidos', 'pedidos'));
  if (pedidos.length) {
    const lista = criar('ul', '', 'pedidos');
    for (const p of pedidos) lista.append(criar('li', '#' + p.id + ' · ' + dataPedido.format(new Date(p.criado_em)) + ' · ' + brl(p.total_centavos)));
    conteudo.append(lista);
  } else {
    conteudo.append(criar('p', 'Você ainda não fez pedidos.'));
  }
  conteudo.append(botao('Sair da conta', 'logout', 'link'));
}

function salvarEstadoCarrinho(carrinho) {
  itens = carrinho.itens;
  versaoCarrinho = carrinho.versao;
}

async function mudarQuantidade(id, acao) {
  salvarEstadoCarrinho(await api('/carrinho', 'PUT', { id, acao }));
  atualizarCabecalho();
}

function chavePedido() {
  if (!chaves.has(conta.id)) {
    const chave = Array.from(crypto.getRandomValues(new Uint8Array(18)), (byte) => byte.toString(16).padStart(2, '0')).join('');
    chaves.set(conta.id, chave);
  }
  return chaves.get(conta.id);
}

const acoes = {
  login: () => mostrarFormulario('login'),
  cadastro: () => mostrarFormulario('cadastro'),
  'ver-carrinho': mostrarCarrinho,
  marcas: () => {
    painel.close();
    location.hash = 'marcas';
    document.querySelector('#marcas').scrollIntoView();
  },
  adicionar: async (elemento) => {
    const id = elemento.dataset.produto;
    await mudarQuantidade(id, 'adicionar');
    status('Produto adicionado. Seu carrinho foi salvo.');
  },
  quantidade: async (elemento) => {
    const { produto, operacao } = elemento.dataset;
    await mudarQuantidade(produto, operacao);
    desenharCarrinho();
    const acao = [...conteudo.querySelectorAll('[data-acao="quantidade"]')].find((botao) => botao.dataset.produto === produto && !botao.disabled);
    (acao ?? titulo).focus({ preventScroll: true });
  },
  revisar: mostrarRevisao,
  enviar: async () => {
    let pedido;
    try {
      ({ pedido } = await api('/pedidos', 'POST', { chave: chavePedido(), versao: versaoCarrinho }));
    } catch (erro) {
      if (erro.status === 409) {
        chaves.delete(conta.id);
        await mostrarCarrinho();
      }
      throw erro;
    }
    chaves.delete(conta.id);
    itens = [];
    atualizarCabecalho();
    abrir('confirmacao', 'Pedido registrado');
    avisoDemonstracao();
    conteudo.append(criar('p', 'Pedido #' + pedido.id + ' · ' + brl(pedido.total_centavos)));
    conteudo.append(botao('Ver meus pedidos', 'historico', 'link'));
  },
  historico: mostrarConta,
  logout: async () => {
    await api('/logout', 'POST', {});
    conta = null;
    itens = [];
    destino = null;
    atualizarCabecalho();
    painel.close();
    avisar('Você saiu. Seu carrinho continua salvo na conta.');
  }
};

async function executar(operacao, elemento) {
  if (ocupado) return;
  ocupado = true;
  if (elemento) elemento.disabled = true;
  try {
    await operacao();
  } catch (erro) {
    if (erro.status === 401 && !['login', 'cadastro'].includes(tela)) {
      const proximaTela = tela === 'catalogo' ? 'catalogo' : 'carrinho';
      conta = null;
      itens = [];
      atualizarCabecalho();
      pedirLogin(proximaTela);
    } else if (painel.open) {
      status(erro.message || 'Tente novamente.');
    } else {
      avisar(erro.message || 'Tente novamente.');
    }
  } finally {
    ocupado = false;
    if (elemento) elemento.disabled = false;
  }
}

const inicializacao = (async () => {
  try {
    const [sessao, catalogo] = await Promise.all([api('/sessao'), api('/catalogo')]);
    conta = sessao.conta;
    demonstracao = catalogo.demonstracao;
    if (conta) salvarEstadoCarrinho(await api('/carrinho'));
    atualizarCabecalho();
  } catch {
    avisar('Não foi possível carregar a conta e o catálogo. Atualize a página para tentar novamente.');
  }
})();

botaoConta.addEventListener('click', () => executar(async () => {
  await inicializacao;
  destino = null;
  await mostrarConta();
}));
botaoCarrinho.addEventListener('click', () => executar(async () => {
  await inicializacao;
  await mostrarCarrinho();
}));
document.querySelectorAll('[data-marca]').forEach((elemento) => {
  elemento.addEventListener('click', () => executar(async () => {
    await inicializacao;
    await mostrarCatalogo(elemento.dataset.marca);
  }));
});

document.querySelector('#fechar').addEventListener('click', () => {
  if (!ocupado) painel.close();
});
painel.addEventListener('cancel', (evento) => {
  if (ocupado) evento.preventDefault();
});
conteudo.addEventListener('click', (evento) => {
  const elemento = evento.target.closest('button[data-acao]');
  if (elemento) void executar(() => acoes[elemento.dataset.acao](elemento), elemento);
});
conteudo.addEventListener('submit', (evento) => {
  evento.preventDefault();
  const form = evento.target;
  const dados = Object.fromEntries(new FormData(form));
  if (form.dataset.form === 'cadastro') {
    dados.endereco = {};
    for (const campo of ['cep', 'uf', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade']) {
      dados.endereco[campo] = dados[campo];
      delete dados[campo];
    }
  }
  void executar(async () => {
    const { conta: novaConta } = await api('/' + form.dataset.form, 'POST', dados);
    conta = novaConta;
    const proximaTela = destino;
    destino = null;
    salvarEstadoCarrinho(await api('/carrinho'));
    atualizarCabecalho();
    if (proximaTela === 'catalogo') return mostrarCatalogo(marcaAtual);
    if (proximaTela === 'carrinho') return mostrarCarrinho();
    return mostrarConta();
  }, form.querySelector('[type="submit"]'));
});
