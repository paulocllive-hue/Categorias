import nodemailer from 'nodemailer';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export function transporteSmtp(config) {
  return nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    requireTLS: !config.smtpSecure,
    auth: { user: config.smtpUser, pass: config.smtpPass },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 15000,
    disableFileAccess: true,
    disableUrlAccess: true
  });
}

async function gravar(arquivo, conteudo) {
  await writeFile(arquivo + '.tmp', conteudo, { mode: 0o600 });
  await rename(arquivo + '.tmp', arquivo);
}

export async function enviarRelatorio(config, relatorio, chave, dependencias = {}) {
  const dominio = config.emailFrom?.match(/@([a-zA-Z0-9.-]+)/)?.[1] || 'a14.local';
  const mensagem = {
    from: config.emailFrom,
    to: config.emailTo,
    replyTo: relatorio.replyTo,
    subject: relatorio.assunto,
    text: relatorio.texto,
    html: relatorio.html,
    messageId: '<' + chave.replace(/[^a-zA-Z0-9-]/g, '-') + '@' + dominio + '>',
    attachments: [{
      filename: relatorio.nomeArquivo,
      content: relatorio.planilha,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    }]
  };
  if (config.emailMode === 'file') {
    const pasta = join(config.dataDir, 'emails');
    await mkdir(pasta, { recursive: true, mode: 0o700 });
    const base = join(pasta, relatorio.nomeArquivo.replace(/\.xlsx$/, ''));
    await gravar(base + '.txt', relatorio.assunto + '\n\n' + relatorio.texto + '\n');
    await gravar(base + '.html', relatorio.html);
    await gravar(base + '.xlsx', relatorio.planilha);
    const preview = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'windows' });
    const { message } = await preview.sendMail({
      ...mensagem,
      from: config.emailFrom || 'A14 <pedidos@example.test>',
      to: config.emailTo || 'comercial@example.test'
    });
    await gravar(base + '.eml', message);
    return { status: 'simulado', pasta };
  }
  if (config.emailMode === 'smtp') {
    const transporte = dependencias.transporte || transporteSmtp(config);
    const info = await transporte.sendMail(mensagem);
    if (!info.accepted?.length || info.rejected?.length) {
      throw new Error('O servidor SMTP não aceitou todos os destinatários.');
    }
    return { status: 'aceito' };
  }
  const buscar = dependencias.buscar || fetch;
  const resposta = await buscar('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + config.emailKey,
      'Content-Type': 'application/json',
      'Idempotency-Key': chave
    },
    body: JSON.stringify({
      from: config.emailFrom, to: [config.emailTo], reply_to: relatorio.replyTo,
      subject: relatorio.assunto, text: relatorio.texto, html: relatorio.html,
      attachments: [{ filename: relatorio.nomeArquivo, content: relatorio.planilha.toString('base64') }]
    }),
    signal: AbortSignal.timeout(15000)
  });
  await resposta.text();
  if (!resposta.ok) throw new Error('Resend HTTP ' + resposta.status);
  return { status: 'aceito' };
}
