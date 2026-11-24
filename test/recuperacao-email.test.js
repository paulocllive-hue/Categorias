import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { abrirBanco } from '../src/banco.js';
import { criarFilaEmail } from '../src/email.js';
import { reagendarNotificacoes } from '../src/recuperar-emails.js';
import { validarEmail } from '../src/config-email.js';

const catalogo = JSON.parse(await readFile(new URL('../src/catalogo.json', import.meta.url)));
const site = JSON.parse(await readFile(new URL('../src/site.json', import.meta.url)));
const executar = promisify(execFile);
const cliente = { nome: 'Teste', razao_social: 'Empresa Teste', email: 'comprador@example.test',
  cnpj: '12345678000195', perfil: 'varejista', endereco: { cep: '01001000',
    logradouro: 'Praça da Sé', numero: '100', bairro: 'Sé', cidade: 'São Paulo', uf: 'SP' } };

async function preparar(t) {
  const pasta = await mkdtemp(join(tmpdir(), 'a14-recuperacao-'));
  const db = abrirBanco(pasta, catalogo, site);
  t.after(async () => { db.close(); await rm(pasta, { recursive: true, force: true }); });
  db.prepare('INSERT INTO contas (id,nome,razao_social,cnpj,email,senha_hash,perfil,endereco_json) VALUES (1,?,?,?,?,?,?,?)')
    .run(cliente.nome, cliente.razao_social, cliente.cnpj, cliente.email, 'teste', cliente.perfil, JSON.stringify(cliente.endereco));
  const inserir = (id, status = 'pendente') => {
    db.prepare('INSERT INTO pedidos (id,conta_id,chave,criado_em,cliente_json,total_centavos,email_status) VALUES (?,1,?,?,?,?,?)')
      .run(id, String(id).padStart(36, '0'), new Date().toISOString(), JSON.stringify(cliente), 7200, status);
    db.prepare('INSERT INTO itens_pedido VALUES (?,?,?,?,?,?,?)')
      .run(id, 'gin', 'Gin', '750 ml', 'unidade', 1, 7200);
  };
  const config = { dataDir: pasta, emailMode: 'smtp', emailFrom: 'pedidos@example.test', emailTo: 'comercial@example.test' };
  return { pasta, db, config, inserir };
}

test('recuperação seleciona falhas, preserva pedidos aceitos e exige seleção explícita de simulações', async (t) => {
  const { db, inserir } = await preparar(t);
  inserir(1, 'pendente'); inserir(2, 'falhou'); inserir(3, 'aceito'); inserir(4, 'simulado'); inserir(5, 'pendente');
  db.prepare('UPDATE pedidos SET email_tentativas = 8, email_proxima_tentativa = ? WHERE id = 2').run(Date.now() + 500000);
  db.prepare('UPDATE pedidos SET email_bloqueio_ate = ? WHERE id = 5').run(Date.now() + 600000);
  const antes = db.prepare('SELECT cliente_json, total_centavos FROM pedidos ORDER BY id').all();
  assert.deepEqual(reagendarNotificacoes(db, { pendentes: true }), { ids: [1, 2], bloqueados: [5] });
  assert.equal(db.prepare('SELECT email_tentativas FROM pedidos WHERE id = 2').get().email_tentativas, 0);
  assert.throws(() => reagendarNotificacoes(db, { pedidoId: 3 }), /já aceitou/);
  assert.throws(() => reagendarNotificacoes(db, { pedidoId: 999 }), /não encontrado/);
  assert.throws(() => reagendarNotificacoes(db, { pedidoId: -1 }), /Escolha/);
  assert.deepEqual(reagendarNotificacoes(db, { pedidoId: 4 }).ids, [4]);
  assert.deepEqual(db.prepare('SELECT cliente_json, total_centavos FROM pedidos ORDER BY id').all(), antes);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM itens_pedido').get().n, 5);
});

test('dois processos não enviam juntos; reserva abandonada é recuperada após expirar', async (t) => {
  const { pasta, db, config, inserir } = await preparar(t);
  inserir(1);
  const outro = abrirBanco(pasta, catalogo, site);
  t.after(() => outro.close());
  let liberar;
  let confirmarInicio;
  const inicio = new Promise((resolve) => { confirmarInicio = resolve; });
  const bloqueio = new Promise((resolve) => { liberar = resolve; });
  let envios = 0;
  const transporte = { sendMail: async () => {
    envios++;
    confirmarInicio();
    await bloqueio;
    return { accepted: [config.emailTo], rejected: [] };
  } };
  const fila1 = criarFilaEmail(db, config, { transporte });
  const fila2 = criarFilaEmail(outro, config, { transporte });
  const primeiro = fila1();
  await inicio;
  await fila2();
  assert.equal(envios, 1);
  assert.deepEqual(reagendarNotificacoes(outro, { pedidoId: 1 }).bloqueados, [1]);
  liberar();
  await primeiro;
  assert.equal(db.prepare('SELECT email_status FROM pedidos WHERE id = 1').get().email_status, 'aceito');
  inserir(2);
  db.prepare('UPDATE pedidos SET email_bloqueio_ate = ?, email_bloqueio_token = ? WHERE id = 2').run(Date.now() + 600000, 'processo-encerrado');
  await fila2();
  assert.equal(envios, 1);
  db.prepare('UPDATE pedidos SET email_bloqueio_ate = ? WHERE id = 2').run(Date.now() - 1);
  await fila2();
  assert.equal(envios, 2);
});

test('oito falhas persistem no banco e recuperação envia o mesmo pedido após reinício', async (t) => {
  t.mock.method(console, 'error', () => {});
  const { pasta, db, config, inserir } = await preparar(t);
  inserir(1);
  let falhas = 0;
  const fila = criarFilaEmail(db, config, { transporte: { sendMail: async () => {
    falhas++;
    throw Object.assign(new Error('conexão interrompida'), { code: 'ECONNRESET' });
  } } });
  for (let n = 0; n < 8; n++) {
    db.prepare('UPDATE pedidos SET email_proxima_tentativa = 0').run();
    await fila();
  }
  await fila();
  assert.equal(falhas, 8);
  assert.equal(db.prepare('SELECT email_status FROM pedidos').get().email_status, 'falhou');
  assert.equal(db.prepare('SELECT email_ultimo_erro FROM pedidos').get().email_ultimo_erro, 'ECONNRESET');
  const outro = abrirBanco(pasta, catalogo, site);
  try {
    assert.deepEqual(reagendarNotificacoes(outro, { pendentes: true }).ids, [1]);
    const original = await readFile(join(pasta, 'email-outbox', 'pedido-1-' + '1'.padStart(36, '0') + '.json'), 'utf8');
    let anexo;
    await criarFilaEmail(outro, config, { transporte: { sendMail: async (mensagem) => {
      anexo = mensagem.attachments[0].content;
      return { accepted: [config.emailTo], rejected: [] };
    } } })();
    assert.equal(anexo.toString('base64'), JSON.parse(original).planilha);
    assert.equal(outro.prepare('SELECT COUNT(*) AS n FROM pedidos').get().n, 1);
    assert.equal(outro.prepare('SELECT email_status FROM pedidos').get().email_status, 'aceito');
    assert.equal(outro.prepare('SELECT email_ultimo_erro FROM pedidos').get().email_ultimo_erro, null);
  } finally { outro.close(); }
});

test('comando lista sem enviar e recusa reenvio no modo file; configuração rejeita exemplos SMTP', async (t) => {
  const { pasta, inserir } = await preparar(t);
  inserir(1, 'simulado');
  const script = new URL('../scripts/reenviar-pedidos.js', import.meta.url).pathname;
  const opcoes = { env: { ...process.env, DATA_DIR: pasta, EMAIL_MODE: 'file' } };
  const resultado = await executar(process.execPath, [script, '--listar'], opcoes);
  assert.match(resultado.stdout, /simulado/);
  await assert.rejects(executar(process.execPath, [script, '--pedido', '1'], opcoes), (erro) => {
    assert.match(erro.stderr, /exige EMAIL_MODE/);
    return true;
  });
  assert.throws(() => validarEmail({ emailMode: 'smtp', emailFrom: 'a@example.test', emailTo: 'b@example.test',
    smtpHost: 'smtp.seu-provedor.com', smtpPort: 465, smtpUser: 'a@example.test', smtpPass: 'sua-credencial-smtp' }), /Substitua os exemplos/);
});

test('servidor em um processo novo retoma o pedido persistido ao iniciar', async (t) => {
  const { pasta, db, inserir } = await preparar(t);
  inserir(1);
  // O processo filho recebe somente o caminho do banco, sem memória ou fila do processo atual.
  const servidor = new URL('../src/server.js', import.meta.url).href;
  const codigo = `
    import { criarAplicacao } from ${JSON.stringify(servidor)};
    import { once } from 'node:events';
    import { setTimeout as esperar } from 'node:timers/promises';
    const app = criarAplicacao({ dataDir: ${JSON.stringify(pasta)}, emailMode: 'file' });
    app.server.listen(0, '127.0.0.1');
    await once(app.server, 'listening');
    let estado;
    for (let n = 0; n < 150; n++) {
      estado = app.db.prepare('SELECT email_status FROM pedidos WHERE id = 1').get().email_status;
      if (estado === 'simulado') break;
      await esperar(20);
    }
    app.server.close();
    await once(app.server, 'close');
    app.db.close();
    if (estado !== 'simulado') throw new Error('A fila não foi retomada ao iniciar.');
  `;
  await executar(process.execPath, ['--input-type=module', '--eval', codigo], { timeout: 10000 });
  assert.equal(db.prepare('SELECT email_status FROM pedidos').get().email_status, 'simulado');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM pedidos').get().n, 1);
  assert.ok((await readFile(join(pasta, 'emails', 'pedido-1.xlsx'))).length > 0);
});
