'use strict';

const painel = document.querySelector('#painel');
const titulo = document.querySelector('#painel-titulo');
const mensagem = document.querySelector('#mensagem');
const conteudo = document.querySelector('#conteudo');
const botaoConta = document.querySelector('#conta');
const botaoCarrinho = document.querySelector('#carrinho');
const contador = document.querySelector('#quantidade');
const botaoCadastro = document.querySelector('#cadastrar');
const botaoPedidos = document.querySelector('#meus-pedidos');
const botaoSair = document.querySelector('#sair');

const marcas = {};
let configuracaoSite = null;
const perfis = { varejista: 'Varejo', atacadista: 'Atacado', distribuidor: 'Distribuidor' };
const dinheiro = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dataPedido = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'America/Cuiaba' });

let conta = null;
let itens = [];
let versaoCarrinho = null;
let demonstracao = false;
let tela = '';
let destino = null;
let marcaAtual = '';
let produtoAtual = '';
let produtosPedido = [];
let ocupado = false;
let avisoTimer;
let timerSessao;
let revisaoSessao = 0;
let sincronizacaoPendente = false;
let produtosVitrine = [];
const chaves = new Map();
const brl = (centavos) => dinheiro.format(centavos / 100);

async function api(caminho, metodo = 'GET', dados) {
  const revisao = revisaoSessao;
  const resposta = await fetch('/api' + caminho, {
    method: metodo,
    cache: 'no-store',
    headers: dados ? { 'Content-Type': 'application/json' } : {},
    body: dados ? JSON.stringify(dados) : undefined
  });
  if (!resposta.headers.get('content-type')?.includes('application/json')) {
    throw new Error('Abra o site pela porta do servidor Node, normalmente http://127.0.0.1:3000.');
  }
  const resultado = await resposta.json();
  if (revisao !== revisaoSessao && !['/login', '/cadastro', '/logout', '/sessao', '/site'].includes(caminho)) {
    throw Object.assign(new Error('A sessão mudou. Entre novamente para continuar.'), { status: 401 });
  }
  if (!resposta.ok) {
    const erro = new Error(resultado.erro);
    erro.status = resposta.status;
    if (erro.status === 401 && caminho !== '/login') limparSessaoLocal();
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
  botaoCadastro.hidden = Boolean(conta);
  botaoPedidos.hidden = !conta;
  botaoSair.hidden = !conta;
  const perfilAtual = document.querySelector('#perfil-atual');
  perfilAtual.textContent = conta ? perfis[conta.perfil] : '';
  perfilAtual.hidden = !conta;
  contador.textContent = itens.reduce((total, item) => total + item.quantidade, 0);
}

function abrir(novaTela, rotulo) {
  tela = novaTela;
  painel.classList.toggle('painel-pedido', novaTela === 'catalogo');
  titulo.textContent = rotulo;
  status('');
  conteudo.replaceChildren();
  if (!painel.open) painel.showModal();
  titulo.tabIndex = -1;
  titulo.focus({ preventScroll: true });
  painel.scrollTop = 0;
}

function avisoDemonstracao() {
  if (demonstracao) conteudo.append(criar('p', 'Ambiente de teste. Use dados fictícios. Os pedidos serão registrados para conferência.', 'demonstracao'));
}

function mostrarFormulario(tipo) {
  abrir(tipo, tipo === 'login' ? 'Entrar na conta' : 'Cadastrar empresa');
  avisoDemonstracao();
  conteudo.append(document.querySelector('#' + tipo + '-template').content.cloneNode(true));
  conteudo.querySelector('input')?.focus({ preventScroll: true });
}

function mostrarAcesso(convite = false) {
  abrir('acesso', convite ? 'Veja os preços para sua empresa' : 'Entre para fazer seu pedido');
  conteudo.append(criar('p', 'Cadastre sua empresa ou entre para consultar os preços do seu segmento e montar pedidos. No cadastro, você também pode escolher receber promoções por e-mail.'));
  const acoes = criar('div', '', 'acesso-acoes');
  acoes.append(botao('Criar cadastro', 'cadastro'), botao('Já tenho conta · Entrar', 'login', 'botao botao-secundario'));
  conteudo.append(acoes, botao('Continuar visitando', 'continuar-visitante', 'link'));
}

function pedirLogin(proximaTela) {
  destino = proximaTela;
  mostrarAcesso();
}

function aplicarSessao(sessao) {
  clearTimeout(timerSessao);
  conta = sessao.conta;
  revisaoSessao++;
  if (conta && sessao.expira_em) {
    timerSessao = setTimeout(() => {
      limparSessaoLocal();
      avisar('Sua sessão expirou. Entre novamente para consultar os preços e continuar.');
    }, Math.max(0, sessao.expira_em - Date.now()));
  }
  atualizarCabecalho();
}

function limparSessaoLocal() {
  clearTimeout(timerSessao);
  conta = null;
  revisaoSessao++;
  itens = [];
  versaoCarrinho = null;
  produtosPedido = [];
  produtoAtual = '';
  destino = null;
  chaves.clear();
  produtosVitrine = produtosVitrine.map((produto) => ({ ...produto, preco_centavos: null }));
  renderizarCatalogoVitrine();
  atualizarCabecalho();
  painel.close();
  conteudo.replaceChildren();
}

function notificarSessao() {
  try {
    localStorage.setItem('a14-sessao-alterada', Date.now() + '-' + Math.random());
  } catch {
    // A navegação e a autenticação continuam funcionando com armazenamento bloqueado.
  }
}

async function sincronizarSessao() {
  const sessao = await api('/sessao');
  const mudou = (conta?.id ?? null) !== (sessao.conta?.id ?? null) ||
    (conta?.perfil ?? null) !== (sessao.conta?.perfil ?? null);
  if (mudou) limparSessaoLocal();
  aplicarSessao(sessao);
  await carregarCatalogoVitrine();
  if (conta) salvarEstadoCarrinho(await api('/carrinho'));
  atualizarCabecalho();
  if (tela === 'catalogo' && painel.open && conta) desenharCarrinho();
}

function validarContaCatalogo(catalogo) {
  if (catalogo.conta_id !== (conta?.id ?? null) || catalogo.perfil !== (conta?.perfil ?? null)) {
    limparSessaoLocal();
    throw Object.assign(new Error('Sua sessão mudou. Entre novamente para consultar os preços.'), { status: 401 });
  }
}

function detalheProduto(produto, textoPreco) {
  const linha = criar('article', '', 'linha');
  if (produto.imagem) {
    const imagem = criar('img');
    imagem.src = '/img/' + produto.imagem;
    imagem.alt = '';
    linha.append(imagem);
  } else {
    linha.append(criar('span', 'Sem foto', 'linha-sem-foto'));
  }
  const detalhe = criar('div', '', 'linha-detalhe');
  detalhe.append(criar('strong', produto.nome));
  if (produto.apresentacao) detalhe.append(criar('small', produto.apresentacao + ' · ' + produto.venda));
  if (textoPreco) detalhe.append(criar('small', textoPreco));
  linha.append(detalhe);
  return linha;
}

async function mostrarCatalogo(marca, produto = '') {
  marcaAtual = marca;
  produtoAtual = produto;
  if (!conta) return pedirLogin('catalogo');
  abrir('catalogo', 'Fazer pedido · ' + marcas[marca]);
  status('Carregando produtos e carrinho…');
  const [catalogo, carrinho] = await Promise.all([api('/catalogo'), api('/carrinho')]);
  validarContaCatalogo(catalogo);
  demonstracao = catalogo.demonstracao;
  produtosPedido = catalogo.produtos.filter((item) => item.marca === marca && item.disponivel);
  salvarEstadoCarrinho(carrinho);
  atualizarCabecalho();
  status('');
  montarAreaPedido();
}

function montarAreaPedido() {
  const area = criar('div', '', 'pedido-layout');
  area.dataset.aba = 'produtos';
  const abas = criar('nav', '', 'pedido-abas');
  abas.setAttribute('aria-label', 'Áreas do pedido');
  const produtos = botao('Produtos', 'aba-produtos', 'pedido-aba');
  produtos.setAttribute('aria-controls', 'pedido-selecao');
  produtos.setAttribute('aria-pressed', 'true');
  const carrinho = botao('Carrinho (' + itens.reduce((soma, item) => soma + item.quantidade, 0) + ')', 'aba-carrinho', 'pedido-aba');
  carrinho.setAttribute('aria-controls', 'carrinho-lateral');
  carrinho.setAttribute('aria-pressed', 'false');
  abas.append(produtos, carrinho);

  const selecao = criar('section', '', 'pedido-selecao');
  selecao.id = 'pedido-selecao';
  selecao.setAttribute('aria-labelledby', 'pedido-produtos-titulo');
  const cabecalho = criar('div', '', 'pedido-selecao-cabecalho');
  const rotulo = criar('h3', 'Escolha os produtos');
  rotulo.id = 'pedido-produtos-titulo';
  cabecalho.append(rotulo, criar('p', marcas[marcaAtual] + ' · Tabela de ' + perfis[conta.perfil]));
  selecao.append(cabecalho);
  if (demonstracao) selecao.append(criar('p', 'Ambiente de teste. Use dados fictícios.', 'demonstracao'));
  if (!produtosPedido.length) selecao.append(criar('p', 'Nenhum produto disponível nesta marca.'));
  for (const produto of produtosPedido) {
    if (produto.preco_centavos === null) throw Object.assign(new Error('Sua sessão expirou.'), { status: 401 });
    const linha = detalheProduto(produto, brl(produto.preco_centavos) + ' por ' + produto.venda);
    linha.id = 'pedido-produto-' + produto.id;
    linha.classList.toggle('produto-selecionado', produto.id === produtoAtual);
    const adicionar = botao('Adicionar', 'adicionar');
    adicionar.dataset.produto = produto.id;
    adicionar.setAttribute('aria-label', 'Adicionar ' + produto.nome + ' ' + produto.apresentacao);
    if (produto.fonte_preco === 'Preço ilustrativo de teste') {
      linha.querySelector('.linha-detalhe').append(criar('small', produto.fonte_preco));
    }
    linha.append(adicionar);
    selecao.append(linha);
  }
  const lateral = criar('aside', '', 'pedido-carrinho');
  lateral.id = 'carrinho-lateral';
  lateral.setAttribute('aria-labelledby', 'carrinho-titulo');
  const rodape = criar('div', '', 'pedido-acoes');
  const resumo = criar('div', '', 'pedido-resumo');
  resumo.id = 'pedido-resumo';
  resumo.setAttribute('role', 'status');
  const enviar = botao('Enviar pedido', 'enviar');
  rodape.append(resumo, enviar);
  area.append(abas, selecao, lateral, rodape);
  conteudo.replaceChildren(area);
  desenharCarrinho();
  if (produtoAtual) {
    const alvo = document.getElementById('pedido-produto-' + produtoAtual);
    alvo?.scrollIntoView({ block: 'nearest' });
    alvo?.querySelector('button')?.focus({ preventScroll: true });
  }
}

function mostrarAbaPedido(aba, focar = false) {
  const area = conteudo.querySelector('.pedido-layout');
  if (!area) return;
  area.dataset.aba = aba;
  for (const botao of area.querySelectorAll('.pedido-aba')) {
    botao.setAttribute('aria-pressed', String(botao.dataset.acao === 'aba-' + aba));
  }
  if (focar) {
    const alvo = area.querySelector(aba === 'carrinho' ? '#carrinho-titulo' : '#pedido-produtos-titulo');
    alvo.tabIndex = -1;
    alvo.focus({ preventScroll: true });
  }
}

function atualizarBotoesEnvio() {
  const indisponivel = !itens.length || itens.some((item) => item.preco_centavos === null);
  for (const enviar of conteudo.querySelectorAll('[data-acao="enviar"]')) enviar.disabled = ocupado || indisponivel;
}

function desenharCarrinho() {
  const lateral = conteudo.querySelector('#carrinho-lateral');
  if (!lateral || !conta) return;
  const rolagem = lateral.scrollTop;
  lateral.replaceChildren();
  const cabecalho = criar('div', '', 'carrinho-cabecalho');
  const heading = criar('h3', 'Seu carrinho');
  heading.id = 'carrinho-titulo';
  cabecalho.append(heading, criar('p', 'Os itens ficam salvos na sua conta.'));
  lateral.append(cabecalho);
  if (!itens.length) lateral.append(criar('p', 'Seu carrinho está vazio. Adicione um produto para começar.', 'carrinho-vazio'));
  let total = 0;
  for (const produto of itens) {
    const disponivel = produto.preco_centavos !== null;
    const subtotal = disponivel ? produto.preco_centavos * produto.quantidade : 0;
    total += subtotal;
    const linha = detalheProduto(produto, disponivel ? brl(produto.preco_centavos) + ' cada · ' + brl(subtotal) : 'Item indisponível. Remova para enviar.');
    linha.classList.add('carrinho-item');
    const acoes = criar('div', '', 'linha-acoes');
    if (disponivel) {
      const menos = botao('−', 'quantidade', 'quantidade-botao');
      menos.dataset.produto = produto.id;
      menos.dataset.operacao = 'retirar';
      menos.setAttribute('aria-label', 'Diminuir quantidade de ' + produto.nome + ' ' + produto.apresentacao);
      const quantidade = criar('span', String(produto.quantidade));
      quantidade.setAttribute('aria-label', 'Quantidade: ' + produto.quantidade);
      const mais = botao('+', 'quantidade', 'quantidade-botao');
      mais.dataset.produto = produto.id;
      mais.dataset.operacao = 'adicionar';
      mais.setAttribute('aria-label', 'Aumentar quantidade de ' + produto.nome + ' ' + produto.apresentacao);
      mais.disabled = produto.quantidade >= 999;
      acoes.append(menos, quantidade, mais);
    }
    const remover = botao('Remover', 'quantidade', 'link carrinho-remover');
    remover.dataset.produto = produto.id;
    remover.dataset.operacao = 'remover';
    remover.setAttribute('aria-label', 'Remover ' + produto.nome + ' ' + produto.apresentacao);
    acoes.append(remover);
    linha.append(acoes);
    lateral.append(linha);
  }
  const totalRotulo = criar('p', 'Total dos produtos · ' + brl(total), 'carrinho-total');
  lateral.append(totalRotulo);
  const entrega = criar('details', '', 'carrinho-entrega');
  entrega.open = true;
  entrega.append(criar('summary', 'Dados de entrega'));
  const dados = criar('dl');
  const campos = [ ['Empresa', conta.razao_social], ['CNPJ', conta.cnpj], ['Responsável', conta.nome],
    ['E-mail', conta.email], ['Endereço', enderecoFormatado(conta.endereco)] ];
  for (const [rotulo, valor] of campos) dados.append(criar('dt', rotulo), criar('dd', valor));
  entrega.append(dados);
  lateral.append(entrega, botao('Continuar escolhendo', 'aba-produtos', 'link continuar-escolhendo'));
  const quantidade = itens.reduce((soma, item) => soma + item.quantidade, 0);
  const aba = conteudo.querySelector('[data-acao="aba-carrinho"]');
  if (aba) aba.textContent = 'Carrinho (' + quantidade + ')';
  const resumo = conteudo.querySelector('#pedido-resumo');
  resumo.replaceChildren(criar('strong', brl(total)), criar('small', quantidade + (quantidade === 1 ? ' item no pedido' : ' itens no pedido')));
  lateral.scrollTop = rolagem;
  atualizarBotoesEnvio();
}

async function mostrarCarrinho() {
  if (!conta) return pedirLogin('carrinho');
  const marca = marcas[marcaAtual] ? marcaAtual : itens[0]?.marca || configuracaoSite.marcas[0].id;
  await mostrarCatalogo(marca);
  mostrarAbaPedido('carrinho');
}

function enderecoFormatado(e) {
  const cep = String(e.cep || '').replace(/^(\d{5})(\d{3})$/, '$1-$2');
  return [e.logradouro + ', ' + e.numero, e.complemento, e.bairro, e.cidade + '/' + e.uf, cep].filter(Boolean).join(' · ');
}

async function mostrarConta() {
  if (!conta) return mostrarFormulario('login');
  abrir('conta', 'Minha conta');
  avisoDemonstracao();
  conteudo.append(criar('strong', conta.razao_social), criar('p', conta.nome + ' · ' + perfis[conta.perfil]),
    criar('p', conta.email), criar('p', enderecoFormatado(conta.endereco)));
  const form = criar('form', '', 'formulario preferencias');
  form.dataset.form = 'promocoes';
  const label = criar('label', '', 'opcao-promocoes');
  const checkbox = criar('input');
  checkbox.type = 'checkbox';
  checkbox.name = 'receber_promocoes';
  checkbox.checked = conta.receber_promocoes;
  label.append(checkbox, criar('span', 'Quero receber promoções por e-mail.'));
  const salvar = criar('button', 'Salvar preferência', 'botao');
  salvar.type = 'submit';
  form.append(label, salvar);
  conteudo.append(form, botao('Meus pedidos', 'historico', 'link'), botao('Sair da conta', 'logout', 'link'));
}

async function mostrarMeusPedidos(antes) {
  if (!conta) return pedirLogin('pedidos');
  if (!antes) abrir('pedidos', 'Meus pedidos');
  const resultado = await api('/pedidos' + (antes ? '?antes=' + antes : ''));
  let lista = conteudo.querySelector('.pedidos-lista');
  if (!lista) {
    lista = criar('ul', '', 'pedidos-lista');
    conteudo.append(lista);
  }
  if (!resultado.pedidos.length && !antes) {
    conteudo.append(criar('p', 'Você ainda não fez pedidos.'), botao('Conhecer as marcas', 'marcas', 'link'));
  }
  for (const pedido of resultado.pedidos) {
    const item = criar('li', '', 'pedido-card');
    const resumo = criar('div');
    resumo.append(criar('strong', 'Pedido #' + pedido.id), criar('p', dataPedido.format(new Date(pedido.criado_em)) + ' · ' + brl(pedido.total_centavos)));
    const detalhes = botao('Ver detalhes', 'detalhe-pedido', 'botao botao-secundario');
    detalhes.dataset.pedido = pedido.id;
    item.append(resumo, detalhes);
    lista.append(item);
  }
  conteudo.querySelector('[data-acao="mais-pedidos"]')?.remove();
  if (resultado.proxima_pagina) {
    const mais = botao('Carregar mais pedidos', 'mais-pedidos', 'link');
    mais.dataset.antes = resultado.proxima_pagina;
    conteudo.append(mais);
  }
}

async function mostrarDetalhePedido(id) {
  const { pedido } = await api('/pedidos/' + id);
  abrir('detalhe-pedido', 'Pedido #' + pedido.id);
  conteudo.append(criar('p', dataPedido.format(new Date(pedido.criado_em))), criar('strong', pedido.cliente.razao_social));
  if (pedido.cliente.endereco) conteudo.append(criar('p', 'Entrega · ' + enderecoFormatado(pedido.cliente.endereco)));
  for (const item of pedido.itens) {
    conteudo.append(detalheProduto(item, item.quantidade + ' × ' + brl(item.preco_centavos) + ' · ' + brl(item.quantidade * item.preco_centavos)));
  }
  const rodape = criar('div', '', 'painel-rodape');
  rodape.append(criar('strong', 'Total dos produtos · ' + brl(pedido.total_centavos)), botao('Voltar aos pedidos', 'historico', 'link'));
  conteudo.append(rodape);
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
  'continuar-visitante': () => { destino = null; painel.close(); },
  'detalhe-pedido': (elemento) => mostrarDetalhePedido(elemento.dataset.pedido),
  'mais-pedidos': (elemento) => mostrarMeusPedidos(elemento.dataset.antes),
  'ver-carrinho': mostrarCarrinho,
  'aba-produtos': () => mostrarAbaPedido('produtos', true),
  'aba-carrinho': () => mostrarAbaPedido('carrinho', true),
  marcas: () => {
    painel.close();
    location.hash = 'marcas';
    document.querySelector('#marcas').scrollIntoView();
  },
  adicionar: async (elemento) => {
    const id = elemento.dataset.produto;
    await mudarQuantidade(id, 'adicionar');
    desenharCarrinho();
    mostrarAbaPedido('carrinho');
    avisar('Produto adicionado. Seu carrinho foi salvo.');
    if (window.matchMedia('(max-width: 900px)').matches) mostrarAbaPedido('carrinho', true);
  },
  quantidade: async (elemento) => {
    const { produto, operacao } = elemento.dataset;
    await mudarQuantidade(produto, operacao);
    desenharCarrinho();
    const acao = [...conteudo.querySelectorAll('[data-acao="quantidade"]')].find((botao) => botao.dataset.produto === produto && botao.dataset.operacao === operacao && !botao.disabled);
    const alvo = acao ?? conteudo.querySelector('#carrinho-titulo');
    alvo.tabIndex = alvo.tabIndex < 0 ? -1 : alvo.tabIndex;
    alvo.focus({ preventScroll: true });
  },
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
  historico: () => mostrarMeusPedidos(),
  logout: async () => {
    try {
      await api('/logout', 'POST', {});
    } finally {
      limparSessaoLocal();
      notificarSessao();
    }
    avisar('Você saiu. Seu carrinho continua salvo na conta.');
    await carregarCatalogoVitrine();
  }
};

async function executar(operacao, elemento) {
  if (ocupado) return;
  ocupado = true;
  if (elemento) elemento.disabled = true;
  atualizarBotoesEnvio();
  try {
    await operacao();
  } catch (erro) {
    if (erro.status === 401 && !['login', 'cadastro'].includes(tela)) {
      const proximaTela = ['catalogo', 'pedidos'].includes(tela) ? tela : 'carrinho';
      limparSessaoLocal();
      pedirLogin(proximaTela);
    } else if (painel.open) {
      status(erro.message || 'Tente novamente.');
    } else {
      avisar(erro.message || 'Tente novamente.');
    }
  } finally {
    ocupado = false;
    if (elemento) elemento.disabled = false;
    atualizarBotoesEnvio();
    if (elemento?.isConnected && !elemento.disabled && document.activeElement === document.body) {
      elemento.focus({ preventScroll: true });
    }
    if (sincronizacaoPendente) {
      sincronizacaoPendente = false;
      void executar(sincronizarSessao);
    }
  }
}

const inicializacao = (async () => {
  const estado = document.querySelector('#estado-site');
  try {
    const [sessao, site] = await Promise.all([api('/sessao'), api('/site')]);
    aplicarSessao(sessao);
    configuracaoSite = site;
    for (const marca of site.marcas) marcas[marca.id] = marca.nome;
    montarApresentacao(site);
    await carregarCatalogoVitrine();
    if (conta) salvarEstadoCarrinho(await api('/carrinho'));
    atualizarCabecalho();
    estado.hidden = true;
    if (!conta) {
      let mostrarConvite = true;
      try {
        mostrarConvite = !sessionStorage.getItem('a14-convite-visto');
        sessionStorage.setItem('a14-convite-visto', '1');
      } catch {
        // O convite também funciona sem armazenamento de sessão.
      }
      if (mostrarConvite) mostrarAcesso(true);
    }
  } catch (erro) {
    estado.textContent = erro.message || 'Não foi possível carregar o catálogo. Atualize a página.';
  }
})();

botaoConta.addEventListener('click', () => executar(async () => {
  await inicializacao;
  destino = null;
  await mostrarConta();
}));
botaoCadastro.addEventListener('click', () => executar(async () => {
  await inicializacao;
  destino = null;
  mostrarFormulario('cadastro');
}));
botaoPedidos.addEventListener('click', () => executar(async () => {
  await inicializacao;
  await mostrarMeusPedidos();
}));
botaoSair.addEventListener('click', () => executar(acoes.logout));

window.addEventListener('storage', (evento) => {
  if (evento.key !== 'a14-sessao-alterada') return;
  limparSessaoLocal();
  if (ocupado) sincronizacaoPendente = true;
  else void executar(sincronizarSessao);
});
window.addEventListener('pageshow', (evento) => {
  if (!evento.persisted) return;
  limparSessaoLocal();
  void executar(sincronizarSessao);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  if (ocupado) sincronizacaoPendente = true;
  else void executar(async () => { await inicializacao; await sincronizarSessao(); });
});

botaoCarrinho.addEventListener('click', () => executar(async () => {
  await inicializacao;
  await mostrarCarrinho();
}));
document.addEventListener('click', (evento) => {
  const elemento = evento.target.closest('button[data-marca]');
  if (!elemento) return;
  void executar(async () => {
    await inicializacao;
    await mostrarCatalogo(elemento.dataset.marca, elemento.dataset.produto || '');
  });
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
  const receberPromocoes = form.querySelector('[name="receber_promocoes"]')?.checked ?? false;
  if (form.dataset.form === 'promocoes') {
    void executar(async () => {
      const resultado = await api('/conta/promocoes', 'PATCH', { receber_promocoes: receberPromocoes });
      conta.receber_promocoes = resultado.receber_promocoes;
      status('Preferência de promoções salva.');
    }, form.querySelector('[type="submit"]'));
    return;
  }
  if (form.dataset.form === 'cadastro') {
    dados.receber_promocoes = receberPromocoes;
    dados.endereco = {};
    for (const campo of ['cep', 'uf', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade']) {
      dados.endereco[campo] = dados[campo];
      delete dados[campo];
    }
  }
  void executar(async () => {
    const sessao = await api('/' + form.dataset.form, 'POST', dados);
    aplicarSessao(sessao);
    notificarSessao();
    const proximaTela = destino;
    destino = null;
    salvarEstadoCarrinho(await api('/carrinho'));
    atualizarCabecalho();
    await carregarCatalogoVitrine();
    if (proximaTela === 'catalogo') return mostrarCatalogo(marcaAtual, produtoAtual);
    if (proximaTela === 'carrinho') return mostrarCarrinho();
    if (proximaTela === 'pedidos') return mostrarMeusPedidos();
    return mostrarConta();
  }, form.querySelector('[type="submit"]'));
});

function imagemLocal(arquivo, alt, classe) {
  const imagem = criar('img', '', classe);
  imagem.src = './img/' + encodeURIComponent(arquivo);
  imagem.alt = alt;
  imagem.loading = 'lazy';
  return imagem;
}

function montarApresentacao(site) {
  document.querySelectorAll('.logo-imagem').forEach((logo) => {
    logo.src = './img/' + encodeURIComponent(site.representante.logo);
    logo.alt = site.representante.nome;
  });
  document.querySelector('#direitos').textContent = new Date().getFullYear() + ' · ' + site.representante.nome;

  const atalhos = document.querySelector('#marcas-atalhos');
  for (const marca of site.marcas) {
    const atalho = criar('a', '', 'marca-atalho');
    atalho.href = '#' + marca.id;
    const circulo = criar('span', '', 'marca-circulo');
    circulo.append(imagemLocal(marca.logo, ''));
    atalho.append(circulo, criar('span', marca.nome));
    atalhos.append(atalho);
  }
  document.querySelector('#marcas').hidden = false;
  montarBanner(site.slides);
  montarRodape(site);
}

function montarBanner(slides) {
  if (!slides.length) return;
  const area = document.querySelector('#banner-slides');
  const indicadores = document.querySelector('#banner-indicadores');
  slides.forEach((slide, indice) => {
    const artigo = criar('article', '', 'banner-slide');
    artigo.hidden = indice !== 0;
    artigo.setAttribute('aria-roledescription', 'slide');
    artigo.setAttribute('aria-label', String(indice + 1) + ' de ' + slides.length);
    const texto = criar('div', '', 'banner-texto');
    const link = criar('a', 'Conhecer a marca', 'botao');
    link.href = '#' + slide.marca;
    texto.append(criar('p', 'Catálogo comercial', 'sobretitulo'), criar('h2', slide.titulo), criar('p', slide.texto), link);
    const imagem = imagemLocal(slide.imagem, '', 'banner-imagem');
    imagem.loading = 'eager';
    imagem.style.objectPosition = slide.posicao || 'center';
    artigo.append(texto, imagem);
    area.append(artigo);
    const indicador = criar('button', String(indice + 1));
    indicador.type = 'button';
    indicador.setAttribute('aria-label', 'Mostrar destaque ' + (indice + 1));
    indicador.setAttribute('aria-pressed', String(indice === 0));
    indicadores.append(indicador);
  });
  document.querySelector('.banner').hidden = false;
  iniciarBanner();
}

function iniciarBanner() {
  const banner = document.querySelector('.banner');
  const slides = [...banner.querySelectorAll('.banner-slide')];
  const indicadores = [...banner.querySelectorAll('.banner-indicadores button')];
  const anterior = banner.querySelector('[data-carrossel-anterior]');
  const proxima = banner.querySelector('[data-carrossel-proxima]');
  const pausa = banner.querySelector('[data-carrossel-pausa]');
  let indice = 0;
  let temporizador = null;
  let pausado = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function programar() {
    clearInterval(temporizador);
    pausa.textContent = pausado ? 'Reproduzir' : 'Pausar';
    if (!pausado && !document.hidden && slides.length > 1) {
      temporizador = setInterval(() => mostrar(indice + 1), 5000);
    }
  }
  function mostrar(proximo) {
    const alvo = (proximo + slides.length) % slides.length;
    if (alvo !== indice && slides[indice].contains(document.activeElement)) {
      // Evita esconder um link enquanto o visitante está usando o teclado.
      pausado = true;
      programar();
      return;
    }
    slides[indice].hidden = true;
    indicadores[indice].setAttribute('aria-pressed', 'false');
    indice = alvo;
    slides[indice].hidden = false;
    indicadores[indice].setAttribute('aria-pressed', 'true');
  }
  anterior.addEventListener('click', () => { mostrar(indice - 1); programar(); });
  proxima.addEventListener('click', () => { mostrar(indice + 1); programar(); });
  pausa.addEventListener('click', () => { pausado = !pausado; programar(); });
  indicadores.forEach((botao, i) => botao.addEventListener('click', () => { mostrar(i); programar(); }));
  document.addEventListener('visibilitychange', programar);
  programar();
}

async function carregarCatalogoVitrine() {
  if (!configuracaoSite) return;
  const revisao = revisaoSessao;
  const catalogo = await api('/catalogo');
  if (revisao !== revisaoSessao) return;
  validarContaCatalogo(catalogo);
  demonstracao = catalogo.demonstracao;
  produtosVitrine = catalogo.produtos;
  renderizarCatalogoVitrine();
}

function renderizarCatalogoVitrine() {
  if (!configuracaoSite) return;
  const secoes = document.querySelector('#secoes-marcas');
  secoes.replaceChildren();
  for (const marca of configuracaoSite.marcas) {
    const secao = criar('section', '', 'marca-secao');
    secao.id = marca.id;
    secao.setAttribute('aria-labelledby', 'titulo-' + marca.id);
    const container = criar('div', '', 'container');
    const cabecalho = criar('div', '', 'marca-cabecalho');
    const descricao = criar('div');
    const titulo = criar('h2', marca.nome);
    titulo.id = 'titulo-' + marca.id;
    descricao.append(titulo, criar('p', marca.descricao));
    cabecalho.append(imagemLocal(marca.logo, ''), descricao);

    const grade = criar('div', '', 'produtos-grade');
    const produtos = produtosVitrine.filter((p) => p.marca === marca.id && (!conta || p.disponivel));
    for (const produto of produtos) {
      const card = criar('article', '', 'produto-card');
      const foto = criar('div', '', 'produto-foto');
      if (produto.imagem) {
        foto.append(imagemLocal(produto.imagem, produto.nome + ' · ' + produto.apresentacao));
      } else {
        foto.append(criar('span', 'Imagem em atualização', 'imagem-pendente'));
      }
      const info = criar('div', '', 'produto-info');
      info.append(criar('h3', produto.nome), criar('p', produto.apresentacao + ' · ' + produto.venda));
      if (conta && produto.preco_centavos !== null) {
        info.append(criar('p', brl(produto.preco_centavos), 'produto-preco'));
        if (produto.fonte_preco === 'Preço ilustrativo de teste') info.append(criar('p', produto.fonte_preco));
      }
      const selecionar = botao('Selecionar produto', 'selecionar-produto', 'produto-abrir');
      selecionar.dataset.marca = marca.id;
      selecionar.dataset.produto = produto.id;
      selecionar.setAttribute('aria-label', 'Fazer pedido de ' + produto.nome + ' ' + produto.apresentacao + ' ' + produto.venda);
      selecionar.replaceChildren(criar('span', 'Selecionar produto', 'somente-leitor'));
      card.append(foto, info, selecionar);
      grade.append(card);
    }
    const rodape = criar('div', '', 'marca-rodape');
    const pedir = criar('button', 'Fazer pedido', 'botao botao-pedido');
    pedir.type = 'button';
    pedir.dataset.marca = marca.id;
    pedir.setAttribute('aria-label', 'Fazer pedido de ' + marca.nome);
    if (!conta) rodape.append(criar('p', 'Entre ou cadastre-se para consultar os preços.'));
    rodape.append(pedir);
    container.append(cabecalho, grade);
    if (!produtos.length) container.append(criar('p', 'Catálogo em atualização para este perfil.'));
    container.append(rodape);
    secao.append(container);
    secoes.append(secao);
  }
}

function montarRodape(site) {
  const contatos = document.querySelector('#lista-contatos');
  const representante = site.representante;
  const links = [
    [representante.email, 'mailto:' + representante.email],
    [representante.telefone, 'tel:' + representante.telefone.replace(/[^+0-9]/g, '')],
    [representante.whatsapp ? 'WhatsApp' : '', 'https://wa.me/' + representante.whatsapp.replace(/[^0-9]/g, '')]
  ];
  for (const [texto, url] of links) {
    if (texto) {
      const link = criar('a', texto);
      link.href = url;
      contatos.append(link);
    }
  }
  if (representante.endereco) contatos.append(criar('p', representante.endereco));
  if (!contatos.children.length) contatos.append(criar('p', 'Contatos em atualização.'));

  const lista = document.querySelector('#pontos-venda');
  for (const local of site.pontos_venda) {
    const item = criar('li');
    item.append(criar('strong', local.nome), criar('span', local.endereco));
    if (local.marcas?.length) item.append(criar('span', local.marcas.join(' · ')));
    if (local.mapa && /^https?:\/\//.test(local.mapa)) {
      const mapa = criar('a', 'Ver localização');
      mapa.href = local.mapa;
      item.append(mapa);
    }
    lista.append(item);
  }
  if (!lista.children.length) lista.append(criar('li', 'Pontos de venda em atualização.'));
}

// Busca do endereço no cadastro. O número e o complemento são preenchidos pelo cliente.
let consultaCepAtual;
let temporizadorCep;
const preenchidosCep = new WeakMap();

conteudo.addEventListener('input', (evento) => {
  const campo = evento.target;
  const form = campo.closest('form[data-form="cadastro"]');
  if (!form || campo.name !== 'cep') return;
  clearTimeout(temporizadorCep);
  consultaCepAtual?.abort();
  const cep = campo.value.replace(/\D/g, '');
  const aviso = form.querySelector('#cep-status');
  const anteriores = preenchidosCep.get(form);
  if (anteriores && anteriores.cep !== cep) {
    for (const [nome, valor] of Object.entries(anteriores.campos)) {
      if (form.elements[nome].value === valor) form.elements[nome].value = '';
    }
    preenchidosCep.delete(form);
  }
  if (cep.length !== 8) {
    aviso.textContent = 'Informe os 8 dígitos do CEP ou preencha o endereço manualmente.';
    return;
  }
  temporizadorCep = setTimeout(() => buscarEndereco(form, campo, cep), 350);
});

async function buscarEndereco(form, campo, cep) {
  const controle = new AbortController();
  consultaCepAtual = controle;
  const aviso = form.querySelector('#cep-status');
  const campos = ['logradouro', 'bairro', 'cidade', 'uf'];
  const valoresIniciais = Object.fromEntries(campos.map((nome) => [nome, form.elements[nome].value]));
  aviso.textContent = 'Buscando endereço…';
  try {
    const resposta = await fetch('/api/cep/' + cep, { signal: controle.signal, cache: 'no-store' });
    const endereco = await resposta.json();
    if (!resposta.ok) throw new Error(endereco.erro || 'Não foi possível consultar o CEP.');
    if (!form.isConnected || controle.signal.aborted || campo.value.replace(/\D/g, '') !== cep) return;
    const alterados = {};
    for (const nome of campos) {
      // Conserva alterações que o cliente fez enquanto aguardava a resposta.
      if (endereco[nome] && form.elements[nome].value === valoresIniciais[nome]) {
        form.elements[nome].value = endereco[nome];
        alterados[nome] = endereco[nome];
      }
    }
    preenchidosCep.set(form, { cep, campos: alterados });
    campo.value = cep.slice(0, 5) + '-' + cep.slice(5);
    aviso.textContent = 'Endereço localizado. Confira os campos e informe o número e o complemento.';
  } catch (erro) {
    if (controle.signal.aborted || !form.isConnected) return;
    aviso.textContent = erro.message.includes('CEP') ? erro.message :
      'A busca está indisponível. Você pode preencher o endereço manualmente.';
  }
}
