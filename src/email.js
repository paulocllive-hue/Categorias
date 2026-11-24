import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { montarEmailPedido } from './relatorio-pedido.js';
import { enviarRelatorio } from './envio-email.js';

async function carregarRelatorio(config, pedido, itens) {
  const pasta = join(config.dataDir, 'email-outbox');
  const arquivo = join(pasta, 'pedido-' + pedido.id + '-' + pedido.chave + '.json');
  try {
    const salvo = JSON.parse(await readFile(arquivo, 'utf8'));
    return { ...salvo, planilha: Buffer.from(salvo.planilha, 'base64') };
  } catch (erro) {
    if (erro.code !== 'ENOENT') throw erro;
  }
  const relatorio = await montarEmailPedido(pedido, itens, config.representante);
  await mkdir(pasta, { recursive: true, mode: 0o700 });
  await writeFile(arquivo + '.tmp', JSON.stringify({
    ...relatorio, planilha: relatorio.planilha.toString('base64')
  }), { mode: 0o600 });
  await rename(arquivo + '.tmp', arquivo);
  return relatorio;
}

export function criarFilaEmail(db, config, dependencias = {}) {
  let processando = false;
  return async function processarFila({ pedidoIds } = {}) {
    if (processando) return;
    processando = true;
    try {
      if (pedidoIds && (!pedidoIds.length || pedidoIds.some((id) => !Number.isSafeInteger(id) || id < 1))) {
        throw new Error('Informe identificadores válidos para a fila.');
      }
      const filtro = pedidoIds ? ' AND id IN (' + pedidoIds.map(() => '?').join(',') + ')' : '';
      const agora = Date.now();
      const fila = db.prepare(`SELECT * FROM pedidos WHERE email_status = 'pendente'
        AND email_proxima_tentativa <= ? AND email_bloqueio_ate <= ? ${filtro} ORDER BY id LIMIT 10`)
        .all(agora, agora, ...(pedidoIds || []));
      for (const pedido of fila) {
        // A reserva atômica também protege quando o comando e o servidor estão ativos juntos.
        // Uma reserva abandonada por queda do processo expira em dez minutos.
        const token = randomUUID();
        const reservado = db.prepare(`UPDATE pedidos SET email_bloqueio_token = ?, email_bloqueio_ate = ?
          WHERE id = ? AND email_status = 'pendente' AND email_proxima_tentativa <= ? AND email_bloqueio_ate <= ?
          RETURNING email_tentativas`)
          .get(token, Date.now() + 10 * 60_000, pedido.id, Date.now(), Date.now());
        if (!reservado) continue;
        try {
          const itens = db.prepare('SELECT * FROM itens_pedido WHERE pedido_id = ? ORDER BY produto_id').all(pedido.id);
          const relatorio = await carregarRelatorio(config, pedido, itens);
          const resultado = await enviarRelatorio(config, relatorio, 'msc-pedido/' + pedido.id + '/' + pedido.chave, dependencias);
          db.prepare(`UPDATE pedidos SET email_status = ?, email_ultimo_erro = NULL,
            email_bloqueio_token = NULL, email_bloqueio_ate = 0 WHERE id = ? AND email_bloqueio_token = ?`)
            .run(resultado.status, pedido.id, token);
        } catch (erro) {
          const tentativas = reservado.email_tentativas + 1;
          const espera = Math.min(60 * 60_000, 60_000 * 2 ** (tentativas - 1));
          const codigo = typeof erro.code === 'string' ? erro.code.replace(/[^A-Z0-9_]/gi, '').slice(0, 40) : '';
          const resumo = codigo || (/^Resend HTTP \d{3}$/.test(erro.message) ? erro.message : 'Falha no envio; confira o terminal e a configuração.');
          db.prepare(`UPDATE pedidos SET email_status = ?, email_tentativas = ?, email_proxima_tentativa = ?,
            email_ultimo_erro = ?, email_bloqueio_token = NULL, email_bloqueio_ate = 0
            WHERE id = ? AND email_bloqueio_token = ?`)
            .run(tentativas >= 8 ? 'falhou' : 'pendente', tentativas, Date.now() + espera, resumo, pedido.id, token);
          console.error('Falha na notificação do pedido ' + pedido.id + ': ' + erro.message);
        }
      }
    } finally {
      processando = false;
    }
  };
}
