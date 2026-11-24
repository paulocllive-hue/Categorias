import { transacao } from './banco.js';

// Apenas o operador com acesso ao terminal pode executar a recuperação.
// Não há endpoint público de reenvio e nenhum pedido/item é recriado.
export function reagendarNotificacoes(db, { pedidoId, pendentes = false }, agora = Date.now()) {
  if (pendentes === Boolean(pedidoId) || (pedidoId !== undefined && (!Number.isSafeInteger(pedidoId) || pedidoId < 1))) {
    throw new Error('Escolha --pendentes ou --pedido seguido do número do pedido.');
  }
  return transacao(db, () => {
    const pedidos = pedidoId
      ? db.prepare('SELECT id, email_status, email_bloqueio_ate FROM pedidos WHERE id = ?').all(pedidoId)
      : db.prepare("SELECT id, email_status, email_bloqueio_ate FROM pedidos WHERE email_status IN ('pendente', 'falhou') ORDER BY id").all();
    if (pedidoId && !pedidos.length) throw new Error('Pedido não encontrado. Confira o banco em DATA_DIR.');
    if (pedidoId && pedidos[0].email_status === 'aceito') {
      throw new Error('O provedor já aceitou este e-mail. Confira a caixa de entrada, o spam e o provedor antes de tentar outro envio.');
    }
    const ids = [];
    const bloqueados = [];
    const atualizar = db.prepare(`UPDATE pedidos SET email_status = 'pendente', email_tentativas = 0,
      email_proxima_tentativa = 0, email_bloqueio_token = NULL, email_bloqueio_ate = 0
      WHERE id = ?`);
    for (const pedido of pedidos) {
      if (!['pendente', 'falhou', 'simulado'].includes(pedido.email_status)) {
        throw new Error('Estado de notificação desconhecido no pedido ' + pedido.id + '.');
      }
      if (pedido.email_bloqueio_ate > agora) {
        bloqueados.push(pedido.id);
        continue;
      }
      atualizar.run(pedido.id);
      ids.push(pedido.id);
    }
    return { ids, bloqueados };
  });
}
