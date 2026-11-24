import { createServer } from 'node:http';

import { createReadStream, readFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { abrirBanco, consultarProdutos, transacao } from './banco.js';
import { confereSenha, criarToken, ErroHttp, hashSenha, hashToken, validarCadastro } from './contas.js';
import { criarFilaEmail } from './email.js';
import { configuracaoEmail, validarEmail } from './config-email.js';
import { consultarCep } from './cep.js';

const raiz = fileURLToPath(new URL('../', import.meta.url));
const diasDeSessao = 7;
const arquivos = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.webp': 'image/webp' };

function json(res, status, dados) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(dados));
}

async function lerJson(req) {
  if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') {
    throw new ErroHttp(415, 'Envie os dados no formato JSON.');
  }
  const partes = [];
  let tamanho = 0;
  for await (const parte of req.iterator({ destroyOnReturn: false })) {
    tamanho += parte.length;
    if (tamanho > 16_384) throw new ErroHttp(413, 'Dados muito grandes.');
    partes.push(parte);
  }
  try {
    const dados = JSON.parse(Buffer.concat(partes).toString('utf8'));
    if (!dados || typeof dados !== 'object' || Array.isArray(dados)) throw new Error();
    return dados;
  } catch {
    throw new ErroHttp(400, 'Dados inválidos.');
  }
}

function contaPublica(conta) {
  const { id, nome, razao_social, cnpj, email, perfil, endereco_json } = conta;
  return {
    id, nome, razao_social, cnpj, email, perfil, endereco: JSON.parse(endereco_json),
    receber_promocoes: conta.receber_promocoes === 1
  };
}

export function criarAplicacao(opcoes = {}) {
  const config = {
    dataDir: resolve(raiz, process.env.DATA_DIR || 'data'),
    catalogPath: resolve(raiz, process.env.CATALOG_FILE || 'src/catalogo.json'),
    sitePath: resolve(raiz, process.env.SITE_FILE || 'src/site.json'),
    ...configuracaoEmail(),
    secure: process.env.SECURE_COOKIES === 'true',
    ...opcoes
  };
  const catalogo = JSON.parse(readFileSync(config.catalogPath, 'utf8'));
  const site = JSON.parse(readFileSync(config.sitePath, 'utf8'));
  validarEmail(config);
  config.representante = site.representante.nome;

  const db = abrirBanco(config.dataDir, catalogo, site);
  const filaEmail = criarFilaEmail(db, config);
  const filaSeguro = () => filaEmail().catch((erro) => console.error('Fila de e-mail: ' + erro.message));
  const ciclo = setInterval(() => {
    const agora = Date.now();
    db.prepare('DELETE FROM sessoes WHERE expira_em <= ?').run(agora);
    for (const [chave, valor] of tentativas) if (valor.expira <= agora) tentativas.delete(chave);
    void filaSeguro();
  }, 30_000).unref();
  const tentativas = new Map();
  const hashAlternativo = hashSenha(criarToken());
  let autenticacoesAtivas = 0;
  const nomeCookie = config.secure ? '__Host-msc' : 'msc';

  function limitar(req) {
    const chave = req.socket.remoteAddress;
    const agora = Date.now();
    const atual = tentativas.get(chave);
    if (!atual || atual.expira <= agora) {
      tentativas.set(chave, { expira: agora + 60_000, total: 1 });
    } else if (++atual.total > 20) {
      throw new ErroHttp(429, 'Muitas tentativas. Aguarde um minuto.');
    }
  }

  function cookie(res, token, segundos) {
    res.setHeader('Set-Cookie', nomeCookie + '=' + token + '; Path=/; HttpOnly; SameSite=Strict; Max-Age=' + segundos + (config.secure ? '; Secure' : ''));
  }

  function iniciarSessao(res, id) {
    const token = criarToken();
    const segundos = diasDeSessao * 86400;
    db.prepare('INSERT INTO sessoes VALUES (?, ?, ?)').run(hashToken(token), id, Date.now() + segundos * 1000);
    cookie(res, token, segundos);
    return Date.now() + segundos * 1000;
  }

  function carrinho(conta) {
    const produtos = new Map(consultarProdutos(db, conta.perfil).map((produto) => [produto.id, produto]));
    const registros = db.prepare('SELECT produto_id, quantidade FROM carrinho WHERE conta_id = ? ORDER BY rowid').all(conta.id);
    return registros.map(({ produto_id, quantidade }) => ({
      ...(produtos.get(produto_id) ??
        { id: produto_id, nome: 'Produto indisponível', preco_centavos: null, disponivel: false }),
      quantidade
    }));
  }

  function estadoCarrinho(conta) {
    const itens = carrinho(conta);
    return { itens, versao: hashToken(JSON.stringify(itens)) };
  }

  async function autenticar(req, res, caminho, tokenHash) {
    limitar(req);
    if (autenticacoesAtivas >= 4) throw new ErroHttp(429, 'Aguarde alguns segundos e tente novamente.');
    autenticacoesAtivas++;
    try {
      const dados = await lerJson(req);
      let conta;
      if (caminho === '/api/cadastro') {
        const c = validarCadastro(dados);
        const senha = await hashSenha(c.senha);
        try {
          const r = db.prepare('INSERT INTO contas (nome, razao_social, cnpj, email, senha_hash, perfil, endereco_json, receber_promocoes, promocoes_atualizado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
            .run(c.nome, c.razao_social, c.cnpj, c.email, senha, c.perfil, JSON.stringify(c.endereco), c.receber_promocoes ? 1 : 0, new Date().toISOString());
          conta = db.prepare('SELECT * FROM contas WHERE id = ?').get(r.lastInsertRowid);
        } catch (erro) {
          if (erro.errcode !== 2067) throw erro;
          throw new ErroHttp(409, 'Já existe uma conta com este e-mail ou CNPJ.');
        }
      } else {
        const email = typeof dados.email === 'string' ? dados.email.trim().toLowerCase() : '';
        if (typeof dados.senha !== 'string' || dados.senha.length > 128 || email.length > 254) throw new ErroHttp(401, 'E-mail ou senha incorretos.');
        conta = db.prepare('SELECT * FROM contas WHERE email = ?').get(email);
        if (!(await confereSenha(dados.senha, conta?.senha_hash ?? await hashAlternativo)) || !conta) {
          throw new ErroHttp(401, 'E-mail ou senha incorretos.');
        }
      }
      if (tokenHash) db.prepare('DELETE FROM sessoes WHERE token_hash = ?').run(tokenHash);
      const expira_em = iniciarSessao(res, conta.id);
      json(res, caminho === '/api/cadastro' ? 201 : 200, { conta: contaPublica(conta), expira_em });
    } finally {
      autenticacoesAtivas--;
    }
  }

  async function api(req, res, caminho, parametros) {
    if (req.method === 'GET' && caminho.startsWith('/api/cep/')) {
      return json(res, 200, await consultarCep(caminho.slice('/api/cep/'.length), config.cepFetch));
    }
    const token = (req.headers.cookie || '').split(';').map((parte) => parte.trim()).find((parte) => parte.startsWith(nomeCookie + '='))?.split('=')[1];
    const tokenHash = /^[0-9a-f]{64}$/.test(token || '') ? hashToken(token) : null;
    const conta = tokenHash && db.prepare('SELECT c.*, s.expira_em FROM sessoes s JOIN contas c ON c.id = s.conta_id WHERE s.token_hash = ? AND s.expira_em > ?').get(tokenHash, Date.now());
    const rota = req.method + ' ' + caminho;

    switch (rota) {
      case 'GET /api/sessao':
        return json(res, 200, { conta: conta ? contaPublica(conta) : null, expira_em: conta ? conta.expira_em : null });
      case 'GET /api/site':
        return json(res, 200, site);
      case 'GET /api/catalogo':
        return json(res, 200, {
          demonstracao: catalogo.demonstracao,
          conta_id: conta ? conta.id : null,
          perfil: conta ? conta.perfil : null,
          produtos: consultarProdutos(db, conta?.perfil)
        });
      case 'POST /api/cadastro':
      case 'POST /api/login':
        return autenticar(req, res, caminho, tokenHash);
      case 'POST /api/logout':
        await lerJson(req);
        if (tokenHash) db.prepare('DELETE FROM sessoes WHERE token_hash = ?').run(tokenHash);
        cookie(res, '', 0);
        return json(res, 200, { conta: null });
    }

    if (!conta) throw new ErroHttp(401, 'Entre na sua conta para continuar.');
    const detalhePedido = req.method === 'GET' && /^\/api\/pedidos\/([1-9][0-9]*)$/.exec(caminho);
    if (detalhePedido) {
      const pedido = db.prepare('SELECT id, criado_em, total_centavos, cliente_json FROM pedidos WHERE id = ? AND conta_id = ?')
        .get(detalhePedido[1], conta.id);
      if (!pedido) throw new ErroHttp(404, 'Pedido não encontrado.');
      const itens = db.prepare('SELECT produto_id, nome, apresentacao, venda, quantidade, preco_centavos FROM itens_pedido WHERE pedido_id = ? ORDER BY produto_id').all(pedido.id);
      const { cliente_json, ...resumo } = pedido;
      return json(res, 200, { pedido: { ...resumo, cliente: JSON.parse(cliente_json), itens } });
    }
    switch (rota) {
      case 'PATCH /api/conta/promocoes': {
        const { receber_promocoes } = await lerJson(req);
        if (typeof receber_promocoes !== 'boolean') throw new ErroHttp(400, 'Informe sua preferência de promoções.');
        db.prepare('UPDATE contas SET receber_promocoes = ?, promocoes_atualizado_em = ? WHERE id = ?')
          .run(receber_promocoes ? 1 : 0, new Date().toISOString(), conta.id);
        return json(res, 200, { receber_promocoes });
      }
      case 'GET /api/carrinho':
        return json(res, 200, estadoCarrinho(conta));
      case 'PUT /api/carrinho': {
        const { id, acao } = await lerJson(req);
        if (typeof id !== 'string' || id.length > 120 || !['adicionar', 'retirar', 'remover'].includes(acao)) {
          throw new ErroHttp(400, 'Confira a alteração solicitada no carrinho.');
        }
        transacao(db, () => {
          const atual = db.prepare('SELECT quantidade FROM carrinho WHERE conta_id = ? AND produto_id = ?').get(conta.id, id)?.quantidade ?? 0;
          if (acao === 'adicionar') {
            const produto = db.prepare(`SELECT t.preco_centavos FROM produtos p
              JOIN precos_produto t ON t.produto_id = p.id AND t.perfil = ?
              JOIN marcas m ON m.id = p.marca_id AND m.ativo = 1
              WHERE p.id = ? AND p.ativo = 1`).get(conta.perfil, id);
            if (!produto) throw new ErroHttp(409, 'Produto sem preço disponível para o seu perfil.');
          }
          const quantidade = acao === 'remover' ? 0 : atual + (acao === 'adicionar' ? 1 : -1);
          if (quantidade > 999) throw new ErroHttp(400, 'O limite é de 999 por item.');
          if (quantidade <= 0) {
            db.prepare('DELETE FROM carrinho WHERE conta_id = ? AND produto_id = ?').run(conta.id, id);
          } else {
            db.prepare('INSERT INTO carrinho VALUES (?, ?, ?) ON CONFLICT (conta_id, produto_id) DO UPDATE SET quantidade = excluded.quantidade')
              .run(conta.id, id, quantidade);
          }
        });
        return json(res, 200, estadoCarrinho(conta));
      }
      case 'GET /api/pedidos': {
        const antes = parametros.get('antes');
        if (antes !== null && !/^[1-9][0-9]{0,14}$/.test(antes)) {
          throw new ErroHttp(400, 'Página de pedidos inválida.');
        }
        const registros = db.prepare(`SELECT id, criado_em, total_centavos FROM pedidos
          WHERE conta_id = ? AND id < ? ORDER BY id DESC LIMIT 21`).all(conta.id, antes ?? Number.MAX_SAFE_INTEGER);
        const pedidos = registros.slice(0, 20);
        return json(res, 200, { pedidos, proxima_pagina: registros.length > 20 ? pedidos.at(-1).id : null });
      }
      case 'POST /api/pedidos': {
        const { chave, versao } = await lerJson(req);
        if (typeof chave !== 'string' || !/^[0-9a-f]{36}$/.test(chave)) throw new ErroHttp(400, 'Identificador de pedido inválido.');
        const pedido = transacao(db, () => {
          const anterior = db.prepare('SELECT id, criado_em, total_centavos FROM pedidos WHERE conta_id = ? AND chave = ?').get(conta.id, chave);
          if (anterior) return anterior;
          const atual = estadoCarrinho(conta);
          if (atual.versao !== versao) throw new ErroHttp(409, 'O carrinho mudou. Revise os itens e confirme novamente.');
          const { itens } = atual;
          if (!itens.length) throw new ErroHttp(409, 'O carrinho está vazio.');
          if (itens.some((item) => item.preco_centavos === null)) throw new ErroHttp(409, 'Remova os itens indisponíveis para concluir.');
          const total = itens.reduce((soma, item) => soma + item.quantidade * item.preco_centavos, 0);
          const data = new Date().toISOString();
          const { lastInsertRowid: id } = db.prepare('INSERT INTO pedidos (conta_id, chave, criado_em, cliente_json, total_centavos) VALUES (?, ?, ?, ?, ?)')
            .run(conta.id, chave, data, JSON.stringify(contaPublica(conta)), total);
          const gravarItem = db.prepare('INSERT INTO itens_pedido VALUES (?, ?, ?, ?, ?, ?, ?)');
          for (const item of itens) gravarItem.run(id, item.id, item.nome, item.apresentacao, item.venda, item.quantidade, item.preco_centavos);
          db.prepare('DELETE FROM carrinho WHERE conta_id = ?').run(conta.id);
          return { id, criado_em: data, total_centavos: total };
        });
        void filaSeguro();
        return json(res, 201, { pedido });
      }
      default:
        throw new ErroHttp(404, 'Recurso não encontrado.');
    }
  }

  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    try {
      const url = new URL(req.url, 'http://localhost');
      const caminho = url.pathname;
      if (caminho.startsWith('/api/')) {
        if (req.headers['sec-fetch-site'] === 'cross-site') throw new ErroHttp(403, 'Origem não permitida.');
        return await api(req, res, caminho, url.searchParams);
      }
      if (!['GET', 'HEAD'].includes(req.method)) throw new ErroHttp(405, 'Método inválido.');
      const publico = caminho === '/' ? '/index.html' : caminho;
      if (!/^\/(?:index\.html|estilo\.css|app\.js|img\/[a-z0-9-]+\.(?:webp|png|jpe?g))$/.test(publico)) throw new ErroHttp(404, 'Página não encontrada.');
      const arquivo = join(raiz, 'public', publico);
      const info = await stat(arquivo);
      res.writeHead(200, { 'Content-Type': arquivos[extname(arquivo)], 'Content-Length': info.size });
      if (req.method === 'HEAD') return res.end();
      createReadStream(arquivo).on('error', () => res.destroy()).pipe(res);
    } catch (erro) {
      if (erro instanceof ErroHttp) return json(res, erro.status, { erro: erro.message });
      if (erro.code === 'ENOENT') return json(res, 404, { erro: 'Arquivo não encontrado.' });
      console.error(erro);
      if (!res.headersSent) return json(res, 500, { erro: 'Não foi possível concluir. Tente novamente.' });
      res.destroy();
    }
  });
  server.requestTimeout = 20_000;
  server.on('close', () => clearInterval(ciclo));
  server.once('listening', () => { void filaSeguro(); });
  return { server, db, filaEmail };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({
    options: { host: { type: 'string' }, port: { type: 'string' }, strictPort: { type: 'boolean' } }
  });
  const { server } = criarAplicacao();
  const host = values.host || process.env.HOST || '127.0.0.1';
  const port = Number(values.port || process.env.PORT || 3000);
  server.listen(port, host, () => console.log('Catálogo disponível em http://' + host + ':' + port));
}
