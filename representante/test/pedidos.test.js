import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as esperar } from 'node:timers/promises';
import { criarAplicacao } from '../src/server.js';

const senha = 'somente-teste-2026';
const cnpjs = ['12.345.678/0001-95', '12.ABC.345/01DE-35', '11.222.333/0001-81'];
const perfis = ['varejista', 'atacadista', 'distribuidor'];
const cadastro = (indice) => ({
  nome: 'Comprador de Teste',
  razao_social: 'Empresa Fictícia ' + indice,
  cnpj: cnpjs[indice],
  email: 'empresa' + indice + '@example.test',
  senha,
  perfil: perfis[indice],
  endereco: {
    cep: '78000-000', uf: 'MT', logradouro: 'Rua de Teste',
    numero: '100', bairro: 'Centro', cidade: 'Cuiabá'
  }
});

test('contas, tabelas, carrinho após reinício, checkout concorrente e notificação', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'msc-teste-'));
  let app;
  let base;
  async function iniciar() {
    app = criarAplicacao({ dataDir, emailMode: 'file', secure: false });
    app.server.listen(0, '127.0.0.1');
    await once(app.server, 'listening');
    base = 'http://127.0.0.1:' + app.server.address().port;
  }
  async function parar() {
    if (!app) return;
    const parada = once(app.server, 'close');
    app.server.close();
    await parada;
    app.db.close();
    app = null;
  }
  async function chamar(rota, method = 'GET', dados, cookie) {
    const headers = {};
    if (dados) headers['Content-Type'] = 'application/json';
    if (cookie) headers.Cookie = cookie;
    const resposta = await fetch(base + '/api/' + rota, {
      method, headers, body: dados ? JSON.stringify(dados) : undefined
    });
    return {
      status: resposta.status,
      cookie: resposta.headers.get('set-cookie')?.split(';')[0],
      dados: await resposta.json()
    };
  }

  try {
    await iniciar();
    assert.equal((await fetch(base)).status, 200);
    assert.equal((await fetch(base + '/img/kamai-gin.webp')).headers.get('content-type'), 'image/webp');
    assert.equal((await fetch(base + '/data/msc.sqlite')).status, 404);
    const publico = await chamar('catalogo');
    assert.ok(publico.dados.produtos.every((item) => item.preco_centavos === null && !('precos' in item)));
    assert.equal((await chamar('carrinho')).status, 401);
    assert.equal((await chamar('cadastro', 'POST', { ...cadastro(0), cnpj: '12.345.678/0001-00' })).status, 400);

    const contas = [];
    for (const [i, esperado] of [9890, 8690, 7490].entries()) {
      const conta = await chamar('cadastro', 'POST', cadastro(i));
      assert.equal(conta.status, 201, JSON.stringify(conta.dados));
      contas.push(conta.cookie);
      const catalogo = await chamar('catalogo', 'GET', undefined, conta.cookie);
      assert.equal(catalogo.dados.produtos[0].preco_centavos, esperado);
    }
    const [varejo, atacado] = contas;
    assert.equal((await chamar('cadastro', 'POST', cadastro(0))).status, 409);
    assert.equal((await chamar('login', 'POST', { email: cadastro(0).email, senha: 'outra' })).status, 401);

    const item = { id: 'kamai-gin', acao: 'adicionar', preco_centavos: 1 };
    const primeiro = await chamar('carrinho', 'PUT', item, varejo);
    assert.equal(primeiro.dados.itens[0].preco_centavos, 9890);
    assert.deepEqual((await chamar('carrinho', 'GET', undefined, atacado)).dados.itens, []);
    await chamar('logout', 'POST', {}, varejo);
    assert.equal((await chamar('carrinho', 'GET', undefined, varejo)).status, 401);

    await parar();
    await iniciar();
    const login = await chamar('login', 'POST', { email: cadastro(0).email, senha });
    assert.equal(login.status, 200);
    const sessao = login.cookie;
    const aposReiniciar = await chamar('carrinho', 'GET', undefined, sessao);
    assert.equal(aposReiniciar.dados.itens[0].quantidade, 1);
    assert.equal(aposReiniciar.dados.versao, primeiro.dados.versao);

    await Promise.all([chamar('carrinho', 'PUT', item, sessao), chamar('carrinho', 'PUT', item, sessao)]);
    const chave = 'a'.repeat(36);
    assert.equal((await chamar('pedidos', 'POST', { chave, versao: primeiro.dados.versao }, sessao)).status, 409);
    const revisado = await chamar('carrinho', 'GET', undefined, sessao);
    assert.equal(revisado.dados.itens[0].quantidade, 3);
    const corpo = { chave, versao: revisado.dados.versao, total_centavos: 1 };
    const [pedido, repetido] = await Promise.all([chamar('pedidos', 'POST', corpo, sessao), chamar('pedidos', 'POST', corpo, sessao)]);
    assert.equal(pedido.status, 201);
    assert.equal(pedido.dados.pedido.total_centavos, 29_670);
    assert.equal(repetido.dados.pedido.id, pedido.dados.pedido.id);
    assert.deepEqual((await chamar('carrinho', 'GET', undefined, sessao)).dados.itens, []);
    assert.equal((await chamar('pedidos', 'GET', undefined, sessao)).dados.pedidos.length, 1);
    assert.equal((await chamar('pedidos', 'GET', undefined, atacado)).dados.pedidos.length, 0);
    for (let i = 0; i < 50; i++) {
      if (app.db.prepare('SELECT email_status FROM pedidos').get().email_status === 'simulado') break;
      await esperar(20);
    }
    const email = await readFile(join(dataDir, 'emails', 'pedido-1.txt'), 'utf8');
    assert.match(email, /Pedido #1/);
    assert.match(email, /3 × Kamai Sunset/);
    assert.match(email, /296,70/);
  } finally {
    await parar();
    await rm(dataDir, { recursive: true, force: true });
  }
});
