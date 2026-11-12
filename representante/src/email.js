import { mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const dinheiro = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function mensagem(pedido, itens) {
  const cliente = JSON.parse(pedido.cliente_json);
  const e = cliente.endereco;
  const linhas = itens.map((item) => {
    const subtotal = dinheiro.format(item.quantidade * item.preco_centavos / 100);
    return item.quantidade + ' × ' + item.nome + ' (' + item.apresentacao + ', ' + item.venda + ') — ' + subtotal;
  });
  return [
    'Pedido #' + pedido.id,
    'Empresa: ' + cliente.razao_social + ' | CNPJ: ' + cliente.cnpj,
    'Responsável: ' + cliente.nome + ' | E-mail: ' + cliente.email,
    'Perfil: ' + cliente.perfil,
    'Entrega: ' + [e.logradouro, e.numero, e.complemento, e.bairro, e.cidade + '/' + e.uf, e.cep].filter(Boolean).join(', '),
    '', ...linhas, '',
    'Total dos produtos: ' + dinheiro.format(pedido.total_centavos / 100)
  ].join('\n');
}

export function criarFilaEmail(db, config) {
  let processando = false;
  return async function processarFila() {
    if (processando) return;
    processando = true;
    try {
      const fila = db.prepare("SELECT * FROM pedidos WHERE email_status = 'pendente' AND email_proxima_tentativa <= ? ORDER BY id LIMIT 10").all(Date.now());
      for (const pedido of fila) {
        const itens = db.prepare('SELECT * FROM itens_pedido WHERE pedido_id = ? ORDER BY produto_id').all(pedido.id);
        const assunto = 'Novo pedido MSC #' + pedido.id;
        const corpo = mensagem(pedido, itens);
        let status = 'simulado';
        try {
          if (config.emailMode === 'resend') {
            const resposta = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                Authorization: 'Bearer ' + config.emailKey,
                'Content-Type': 'application/json',
                'Idempotency-Key': 'msc-pedido/' + pedido.id + '/' + pedido.chave
              },
              body: JSON.stringify({ from: config.emailFrom, to: [config.emailTo], subject: assunto, text: corpo }),
              signal: AbortSignal.timeout(8000)
            });
            await resposta.text();
            if (!resposta.ok) throw new Error('Resend HTTP ' + resposta.status);
            status = 'aceito';
          } else {
            const pasta = join(config.dataDir, 'emails');
            const arquivo = join(pasta, 'pedido-' + pedido.id + '.txt');
            await mkdir(pasta, { recursive: true, mode: 0o700 });
            await writeFile(arquivo + '.tmp', assunto + '\n\n' + corpo + '\n', { mode: 0o600 });
            await rename(arquivo + '.tmp', arquivo);
          }
        } catch (erro) {
          const tentativas = pedido.email_tentativas + 1;
          const espera = Math.min(60 * 60_000, 60_000 * 2 ** (tentativas - 1));
          db.prepare('UPDATE pedidos SET email_status = ?, email_tentativas = ?, email_proxima_tentativa = ? WHERE id = ?')
            .run(tentativas >= 8 ? 'falhou' : 'pendente', tentativas, Date.now() + espera, pedido.id);
          console.error('Falha na notificação do pedido ' + pedido.id + ': ' + erro.message);
          continue;
        }
        db.prepare('UPDATE pedidos SET email_status = ? WHERE id = ?').run(status, pedido.id);
      }
    } finally {
      processando = false;
    }
  };
}
