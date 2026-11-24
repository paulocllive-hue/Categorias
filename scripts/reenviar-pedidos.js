import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { abrirBanco } from '../src/banco.js';
import { configuracaoEmail, validarEmail } from '../src/config-email.js';
import { criarFilaEmail } from '../src/email.js';
import { reagendarNotificacoes } from '../src/recuperar-emails.js';

const raiz = fileURLToPath(new URL('../', import.meta.url));
let db;
try {
  const { values } = parseArgs({ options: {
    listar: { type: 'boolean' }, pendentes: { type: 'boolean' }, pedido: { type: 'string' }
  } });
  if (Number(Boolean(values.listar)) + Number(Boolean(values.pendentes)) + Number(values.pedido !== undefined) !== 1) {
    throw new Error('Use --listar, --pendentes ou --pedido 2. Escolha uma opção por execução.');
  }
  if (values.pedido !== undefined && (!/^[1-9][0-9]*$/.test(values.pedido) || !Number.isSafeInteger(Number(values.pedido)))) {
    throw new Error('Informe um número de pedido válido. Exemplo: --pedido 2.');
  }
  const config = { ...configuracaoEmail(), dataDir: resolve(raiz, process.env.DATA_DIR || 'data') };
  if (!values.listar) {
    validarEmail(config);
    if (config.emailMode === 'file') throw new Error('O reenvio real exige EMAIL_MODE=smtp ou resend. Use npm run testar-email para gerar prévias.');
  }
  if (!existsSync(join(config.dataDir, 'msc.sqlite'))) {
    throw new Error('Banco não encontrado em DATA_DIR. Nenhum banco novo foi criado.');
  }
  const catalogo = JSON.parse(readFileSync(resolve(raiz, process.env.CATALOG_FILE || 'src/catalogo.json')));
  const site = JSON.parse(readFileSync(resolve(raiz, process.env.SITE_FILE || 'src/site.json')));
  config.representante = site.representante.nome;
  db = abrirBanco(config.dataDir, catalogo, site);
  if (values.listar) {
    const resumo = db.prepare('SELECT email_status AS estado, COUNT(*) AS total FROM pedidos GROUP BY email_status').all();
    console.table(resumo);
    const notificacoes = db.prepare(`SELECT id AS pedido, email_status AS estado, email_tentativas AS falhas,
      email_proxima_tentativa, email_bloqueio_ate, email_ultimo_erro AS ultimo_erro
      FROM pedidos ORDER BY id DESC LIMIT 100`).all();
    console.table(notificacoes.map(({ email_proxima_tentativa, email_bloqueio_ate, ...item }) => ({
      ...item,
      proxima_tentativa: item.estado !== 'pendente' ? '—' :
        email_proxima_tentativa <= Date.now() ? 'agora' : new Date(email_proxima_tentativa).toISOString(),
      em_processamento: email_bloqueio_ate > Date.now() ? 'sim' : 'não'
    })));
    console.log('Banco: ' + config.dataDir + '. Detalhes dos 100 pedidos mais recentes.');
    console.log('aceito = provedor aceitou; simulado = apenas arquivos locais; falhou = requer recuperação.');
  } else {
    const { ids, bloqueados } = reagendarNotificacoes(db, {
      pedidoId: values.pedido === undefined ? undefined : Number(values.pedido), pendentes: Boolean(values.pendentes)
    });
    if (bloqueados.length) console.log('Já em processamento, mantidos sem alteração: ' + bloqueados.join(', '));
    console.log('Notificações recolocadas na fila: ' + ids.length + '. Destino: ' + config.emailTo);
    const fila = criarFilaEmail(db, config);
    for (let inicio = 0; inicio < ids.length; inicio += 10) await fila({ pedidoIds: ids.slice(inicio, inicio + 10) });
    const estado = db.prepare('SELECT email_status FROM pedidos WHERE id = ?');
    const totais = {};
    for (const id of ids) {
      const status = estado.get(id).email_status;
      totais[status] = (totais[status] || 0) + 1;
    }
    console.table(Object.entries(totais).map(([estado, total]) => ({ estado, total })));
    if ((totais.pendente || 0) + (totais.falhou || 0) + bloqueados.length) {
      console.log('Há notificações ainda não confirmadas pelo provedor. Mantenha npm start ativo para novas tentativas e consulte --listar.');
      process.exitCode = 1;
    }
  }
} catch (erro) {
  console.error('Não foi possível recuperar as notificações: ' + erro.message);
  process.exitCode = 1;
} finally {
  db?.close();
}
