import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import nodemailer from 'nodemailer';
import ExcelJS from 'exceljs';
import { criarAplicacao } from '../src/server.js';
import { consultarCep } from '../src/cep.js';
import { montarEmailPedido, nomeEmpresaCurto } from '../src/relatorio-pedido.js';
import { enviarRelatorio } from '../src/envio-email.js';
import { abrirBanco } from '../src/banco.js';
import { criarFilaEmail } from '../src/email.js';

const cliente = {
  nome: 'Comprador de Teste', razao_social: 'Empresa <Teste> & Filhos',
  cnpj: '12345678000195', email: 'comprador@example.test', perfil: 'varejista',
  endereco: { cep: '01001000', logradouro: 'Praça da Sé', numero: '100',
    complemento: 'Sala 2', bairro: 'Sé', cidade: 'São Paulo', uf: 'SP' }
};
const pedido = { id: 99, criado_em: '2026-11-23T12:00:00.000Z', cliente_json: JSON.stringify(cliente), total_centavos: 50400 };
const itens = [
  { produto_id: 'kamai-gin', nome: 'Kamai Gin Sunset', apresentacao: '750 ml', venda: 'unidade', quantidade: 1, preco_centavos: 7200 },
  { produto_id: 'kamai-gin-caixa', nome: 'Kamai Gin Sunset', apresentacao: '6 × 750 ml', venda: 'caixa', quantidade: 1, preco_centavos: 43200 }
];

test('CEP válido, inexistente, serviço indisponível e rota pública', async () => {
  const resposta = { logradouro: 'Praça da Sé', bairro: 'Sé', localidade: 'São Paulo', uf: 'SP' };
  let url;
  const buscar = async (endereco) => {
    url = endereco;
    return Response.json(resposta);
  };
  assert.equal((await consultarCep('01001000', buscar)).cidade, 'São Paulo');
  assert.equal(url, 'https://viacep.com.br/ws/01001000/json/');
  await assert.rejects(consultarCep('123', buscar), { status: 400 });
  await assert.rejects(consultarCep('99999999', async () => Response.json({ erro: true })), { status: 404 });
  await assert.rejects(consultarCep('01001000', async () => { throw new Error('offline'); }), { status: 503 });
  const pasta = await mkdtemp(join(tmpdir(), 'a14-cep-'));
  const app = criarAplicacao({ dataDir: pasta, emailMode: 'file', cepFetch: buscar });
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  try {
    const base = 'http://127.0.0.1:' + app.server.address().port;
    const api = await fetch(base + '/api/cep/01001000');
    assert.equal(api.status, 200);
    assert.equal((await api.json()).logradouro, 'Praça da Sé');
    assert.equal((await fetch(base + '/api/cep/abc')).status, 400);
  } finally {
    const encerrado = once(app.server, 'close');
    app.server.close();
    await encerrado;
    app.db.close();
    await rm(pasta, { recursive: true, force: true });
  }
});

test('e-mail HTML e planilha contêm empresa, CEP textual, endereço e valores corretos', async () => {
  const relatorio = await montarEmailPedido(pedido, itens);
  assert.equal(relatorio.assunto, 'Empresa <Teste> & Filhos enviou um novo pedido · #99');
  assert.equal(relatorio.nomeRemetente, 'Empresa <Teste> & Filhos via A14 Representações');
  assert.match(relatorio.html, /Empresa &lt;Teste&gt; &amp; Filhos/);
  assert.ok(!relatorio.html.includes('Empresa <Teste>'));
  assert.match(relatorio.html, /01001-000/);
  assert.match(relatorio.texto, /Número: 100/);
  assert.match(relatorio.texto, /Complemento: Sala 2/);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(relatorio.planilha);
  const sheet = workbook.getWorksheet('Pedido');
  assert.equal(sheet.getCell('B4').value, cliente.razao_social);
  assert.equal(sheet.getCell('B9').value, '01001-000');
  assert.equal(sheet.getCell('B9').type, ExcelJS.ValueType.String);
  assert.equal(sheet.getCell('B11').value, '100');
  assert.equal(sheet.getCell('B12').value, 'Sala 2');
  assert.equal(sheet.getCell('E19').value, 72);
  assert.equal(sheet.getCell('F19').value.result, 72);
  assert.equal(sheet.getCell('F21').value.result, 504);
});

test('empresa é abreviada no assunto e remetente mantém a conta autorizada nos três modos', async () => {
  const nome = 'Empresa de Distribuição de Alimentos e Bebidas do Centro Oeste Ltda';
  assert.ok(Array.from(nomeEmpresaCurto({ razao_social: nome })).length <= 40);
  assert.ok(nomeEmpresaCurto({ razao_social: nome }).endsWith('…'));
  assert.equal(nomeEmpresaCurto({ razao_social: 'Empresa\r\nBcc: teste', nome: 'Nome' }), 'Empresa Bcc: teste');
  assert.equal(nomeEmpresaCurto({ nome: 'Responsável' }), 'Responsável');
  const dados = { ...pedido, cliente_json: JSON.stringify({ ...cliente, razao_social: nome }) };
  const relatorio = await montarEmailPedido(dados, itens);
  assert.ok(relatorio.html.includes(nome));
  let recebido;
  await enviarRelatorio({ emailMode: 'smtp', emailFrom: 'A14 <pedidos@example.test>', emailTo: 'comercial@example.test' },
    relatorio, 'identidade', { transporte: { sendMail: async (mensagem) => {
      recebido = mensagem;
      return { accepted: ['comercial@example.test'], rejected: [] };
    } } });
  assert.equal(recebido.from.address, 'pedidos@example.test');
  assert.equal(recebido.from.name, relatorio.nomeRemetente);
  assert.equal(recebido.replyTo, cliente.email);
  let resend;
  await enviarRelatorio({ emailMode: 'resend', emailFrom: 'pedidos@example.test', emailTo: 'comercial@example.test' },
    relatorio, 'identidade-resend', { buscar: async (_url, config) => {
      resend = JSON.parse(config.body);
      return new Response('{}');
    } });
  assert.ok(resend.from.includes('<pedidos@example.test>'));
  assert.ok(resend.from.includes(nomeEmpresaCurto({ razao_social: nome })));
  assert.equal(resend.subject, relatorio.assunto);
  assert.equal(resend.reply_to, cliente.email);
  const pasta = await mkdtemp(join(tmpdir(), 'a14-identidade-'));
  try {
    await enviarRelatorio({ dataDir: pasta, emailMode: 'file', emailFrom: 'pedidos@example.test' }, relatorio, 'identidade-file');
    const eml = await readFile(join(pasta, 'emails', 'pedido-99.eml'), 'utf8');
    assert.match(eml, /From: .*\r?\n(?:[^\r\n]*\r?\n)*?[^\r\n]*<pedidos@example.test>/);
    assert.match(eml, /Reply-To: comprador@example.test/);
  } finally { await rm(pasta, { recursive: true, force: true }); }
});

test('SMTP local recebe o e-mail completo e o anexo Excel', async () => {
  const recebidos = [];
  const smtp = createServer((socket) => {
    socket.write('220 localhost ESMTP\r\n');
    let pendente = '';
    let emDados = false;
    let linhas = [];
    socket.on('data', (chunk) => {
      pendente += chunk.toString();
      let fim;
      while ((fim = pendente.indexOf('\r\n')) >= 0) {
        const linha = pendente.slice(0, fim);
        pendente = pendente.slice(fim + 2);
        if (emDados) {
          if (linha === '.') {
            recebidos.push(linhas.join('\r\n'));
            emDados = false;
            socket.write('250 Message queued\r\n');
          } else linhas.push(linha);
        } else if (linha.startsWith('EHLO') || linha.startsWith('HELO')) {
          socket.write('250 localhost\r\n');
        } else if (linha.startsWith('MAIL') || linha.startsWith('RCPT')) {
          socket.write('250 OK\r\n');
        } else if (linha === 'DATA') {
          emDados = true;
          linhas = [];
          socket.write('354 End with dot\r\n');
        } else if (linha === 'QUIT') socket.end('221 Bye\r\n');
        else socket.write('250 OK\r\n');
      }
    });
  });
  smtp.listen(0, '127.0.0.1');
  await once(smtp, 'listening');
  const transporte = nodemailer.createTransport({
    host: '127.0.0.1', port: smtp.address().port, secure: false, ignoreTLS: true
  });
  try {
    await transporte.verify();
    const relatorio = await montarEmailPedido(pedido, itens);
    const resultado = await enviarRelatorio({
      emailMode: 'smtp', emailFrom: 'pedidos@example.test', emailTo: 'comercial@example.test'
    }, relatorio, 'teste-smtp', { transporte });
    assert.equal(resultado.status, 'aceito');
    assert.equal(recebidos.length, 1);
    assert.match(recebidos[0], /Reply-To: comprador@example.test/);
    assert.match(recebidos[0], /Content-Type: text\/html/);
    assert.match(recebidos[0], /application\/vnd.openxmlformats-officedocument.spreadsheetml.sheet/);
    assert.ok(recebidos[0].includes(relatorio.planilha.toString('base64').slice(0, 50)));
  } finally {
    transporte.close();
    await new Promise((resolve) => smtp.close(resolve));
  }
});

test('fila mantém o pedido e repete exatamente o mesmo anexo após falha do provedor', async (t) => {
  t.mock.method(console, 'error', () => {});
  const pasta = await mkdtemp(join(tmpdir(), 'a14-fila-'));
  const catalogo = JSON.parse(await readFile(new URL('../src/catalogo.json', import.meta.url)));
  const site = JSON.parse(await readFile(new URL('../src/site.json', import.meta.url)));
  const db = abrirBanco(pasta, catalogo, site);
  try {
    db.prepare('INSERT INTO contas (id,nome,razao_social,cnpj,email,senha_hash,perfil,endereco_json) VALUES (1,?,?,?,?,?,?,?)')
      .run(cliente.nome, cliente.razao_social, cliente.cnpj, cliente.email, 'teste', cliente.perfil, JSON.stringify(cliente.endereco));
    db.prepare('INSERT INTO pedidos (id,conta_id,chave,criado_em,cliente_json,total_centavos) VALUES (?,1,?,?,?,?)')
      .run(pedido.id, 'a'.repeat(36), pedido.criado_em, pedido.cliente_json, pedido.total_centavos);
    for (const item of itens) db.prepare('INSERT INTO itens_pedido VALUES (?,?,?,?,?,?,?)')
      .run(pedido.id, item.produto_id, item.nome, item.apresentacao, item.venda, item.quantidade, item.preco_centavos);
    const chamadas = [];
    const fila = criarFilaEmail(db, {
      dataDir: pasta, emailMode: 'resend', emailFrom: 'pedidos@example.test',
      emailTo: 'comercial@example.test', emailKey: 'chave-ficticia'
    }, { buscar: async (_url, options) => {
      chamadas.push(options);
      return new Response('{}', { status: chamadas.length === 1 ? 503 : 200 });
    } });
    await fila();
    assert.equal(db.prepare('SELECT email_status FROM pedidos').get().email_status, 'pendente');
    db.prepare('UPDATE pedidos SET email_proxima_tentativa = 0').run();
    await fila();
    assert.equal(db.prepare('SELECT email_status FROM pedidos').get().email_status, 'aceito');
    assert.equal(chamadas[0].body, chamadas[1].body);
    assert.equal(chamadas[0].headers['Idempotency-Key'], chamadas[1].headers['Idempotency-Key']);
    await fila();
    assert.equal(chamadas.length, 2);
    assert.equal(JSON.parse(chamadas[0].body).reply_to, cliente.email);
  } finally {
    db.close();
    await rm(pasta, { recursive: true, force: true });
  }
});
