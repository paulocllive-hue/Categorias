export function configuracaoEmail() {
  return {
    emailMode: process.env.EMAIL_MODE || 'file',
    emailKey: process.env.RESEND_API_KEY,
    emailFrom: process.env.ORDER_EMAIL_FROM || process.env.SMTP_USER,
    emailTo: process.env.ORDER_EMAIL_TO,
    smtpHost: process.env.SMTP_HOST,
    smtpPort: Number(process.env.SMTP_PORT || 465),
    smtpSecure: process.env.SMTP_SECURE !== 'false',
    smtpUser: process.env.SMTP_USER,
    smtpPass: process.env.SMTP_PASS
  };
}

export function validarEmail(config) {
  if (!['file', 'resend', 'smtp'].includes(config.emailMode)) {
    throw new Error('EMAIL_MODE deve ser file, smtp ou resend.');
  }
  if (config.emailMode === 'file') return;
  if (!config.emailFrom || !config.emailTo) throw new Error('Preencha ORDER_EMAIL_FROM e ORDER_EMAIL_TO no .env.');
  if (config.emailMode === 'resend' && !config.emailKey) throw new Error('Preencha RESEND_API_KEY no .env.');
  if (config.emailMode === 'smtp' && (!config.smtpHost || !config.smtpUser || !config.smtpPass ||
      !Number.isInteger(config.smtpPort) || config.smtpPort < 1 || config.smtpPort > 65535)) {
    throw new Error('Preencha SMTP_HOST, SMTP_PORT, SMTP_USER e SMTP_PASS no .env.');
  }
  if (config.emailMode === 'smtp' && (/seu-provedor|example\./i.test(config.smtpHost) ||
      ['sua-credencial-smtp', 'credencial-smtp-da-conta', 'COLOQUE_A_SENHA_DE_APP_AQUI'].includes(config.smtpPass))) {
    throw new Error('Substitua os exemplos de SMTP_HOST e SMTP_PASS pelos dados reais do seu provedor.');
  }
}
