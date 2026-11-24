import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { configuracaoEmail, validarEmail } from '../src/config-email.js';
import { transporteSmtp, enviarRelatorio } from '../src/envio-email.js';
import { montarEmailPedido } from '../src/relatorio-pedido.js';

const raiz = fileURLToPath(new URL('../', import.meta.url));
const config = {
  ...configuracaoEmail(),
  dataDir: resolve(raiz, process.env.DATA_DIR || 'data')
};
config.emailTo = process.env.TEST_EMAIL_TO || config.emailTo;
try {
  validarEmail(config);
  const transporte = config.emailMode === 'smtp' ? transporteSmtp(config) : undefined;
  if (transporte) {
    await transporte.verify();
    console.log('Conexão SMTP e autenticação verificadas.');
  }
  const id = 'TESTE-' + Date.now() + '-' + randomUUID().slice(0, 6);
  const cliente = {
    razao_social: 'Empresa de Demonstração A14', cnpj: '12.345.678/0001-95',
    nome: 'Comprador de Teste', email: 'cliente@example.test', perfil: 'varejista',
    endereco: { cep: '01001000', logradouro: 'Praça da Sé', numero: '100',
      complemento: 'Sala de teste', bairro: 'Sé', cidade: 'São Paulo', uf: 'SP' }
  };
  const pedido = { id, criado_em: new Date().toISOString(), cliente_json: JSON.stringify(cliente), total_centavos: 50400 };
  const itens = [
    { nome: 'Kamai Gin Sunset', apresentacao: '750 ml', venda: 'unidade', quantidade: 1, preco_centavos: 7200 },
    { nome: 'Kamai Gin Sunset', apresentacao: '6 × 750 ml', venda: 'caixa', quantidade: 1, preco_centavos: 43200 }
  ];
  const relatorio = await montarEmailPedido(pedido, itens);
  relatorio.assunto = '[TESTE] ' + relatorio.assunto;
  const resultado = await enviarRelatorio(config, relatorio, 'a14-email-teste/' + randomUUID(), { transporte });
  if (resultado.status === 'simulado') {
    console.log('Prévia gerada em ' + resultado.pasta + ' com arquivos HTML, TXT, EML e XLSX.');
  } else {
    console.log('E-mail de teste aceito para ' + config.emailTo + '. Confira a caixa de entrada e o spam.');
  }
  console.log('Total demonstrativo de R$ 504,00. Execute o comando novamente para fazer outro teste.');
} catch (erro) {
  console.error('Falha no teste: ' + erro.message);
  if (erro.code === 'EAUTH') console.error('Confira SMTP_USER e SMTP_PASS. O provedor pode exigir senha de aplicativo ou outro método de autenticação.');
  process.exitCode = 1;
}
