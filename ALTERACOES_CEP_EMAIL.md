# Atualização do CEP e do e-mail de pedidos

Esta versão busca o endereço pelo CEP no cadastro e gera um e-mail padronizado com os dados da empresa, o endereço de entrega, os itens e o total. A mensagem inclui uma planilha Excel com esses mesmos dados. O destinatário é a caixa comercial definida por você em ORDER_EMAIL_TO. O botão Responder do e-mail aponta para o e-mail informado pelo cliente.

## 1. Atualize os arquivos

Pare o servidor com Ctrl+C e faça uma cópia da sua pasta atual. Copie os arquivos abaixo do ZIP para as mesmas posições no seu projeto.

| Arquivo | Alteração |
| --- | --- |
| public/index.html | Mensagem de orientação e estado da busca abaixo do endereço |
| public/app.js | Consulta ao completar os oito dígitos do CEP e preenchimento dos campos |
| public/estilo.css | Estilo da mensagem de consulta do CEP |
| src/server.js | Rota de consulta do CEP e leitura da configuração de envio |
| src/cep.js | Integração com ViaCEP, validação e tratamento de falhas |
| src/config-email.js | Configuração dos modos file, smtp e resend |
| src/relatorio-pedido.js | Modelo HTML do e-mail e criação da planilha Excel |
| src/envio-email.js | Envio por SMTP ou Resend e prévias em arquivo |
| src/email.js | Fila de pedidos e reaproveitamento do mesmo anexo nas tentativas |
| scripts/testar-email.js | Comando de teste repetível com dados fictícios |
| package.json e package-lock.json | Dependências Nodemailer e ExcelJS e comando testar-email |
| test/cep-email.test.js | Verificação do CEP, da planilha, do SMTP local e das novas tentativas |

Mantenha sua pasta data e o seu arquivo .env para continuar com os pedidos e clientes cadastrados. Esta alteração utiliza o endereço e os campos de notificação que já existem no banco.

Abra o terminal na pasta do package.json e instale as dependências da nova versão.

```powershell
npm install
```

Use Node.js 24. Nodemailer monta e transmite as mensagens. ExcelJS gera o XLSX no servidor quando o pedido é confirmado.

## 2. Confira a busca do CEP

Execute npm start e abra http://127.0.0.1:3000. Vá em Cadastrar e digite 01001-000, um CEP público de demonstração. O resultado esperado do ViaCEP é Praça da Sé, bairro Sé, cidade São Paulo e UF SP.

A busca começa ao completar oito dígitos. O cliente pode conferir e editar o resultado. Número e complemento são preenchidos pelo cliente. Se o CEP não existir, o serviço demorar ou a rede falhar, uma mensagem orienta o preenchimento manual. O formulário continua disponível.

Se o cliente trocar o CEP, os valores que haviam sido preenchidos pela busca são removidos para evitar usar o endereço anterior. Uma resposta antiga é descartada quando já existe outra consulta. Alterações manuais feitas enquanto a busca está em andamento são preservadas.

O endpoint público é GET /api/cep/01001000. Ele chama https://viacep.com.br/ws/01001000/json/ no backend, com tempo limite de cinco segundos.

## 3. Gere a prévia do pedido

No .env, mantenha o modo de prévia para o primeiro teste.

```dotenv
EMAIL_MODE=file
```

No terminal da pasta do projeto, execute o comando abaixo. Ele também funciona com o servidor parado.

```powershell
npm run testar-email
```

O teste usa uma empresa fictícia, o endereço completo de demonstração e dois itens Kamai. O total esperado é R$ 504,00. Os arquivos ficam em data/emails com um nome iniciado por pedido-TESTE.

| Arquivo | Como conferir |
| --- | --- |
| .html | Abra no navegador para ver o modelo do e-mail |
| .xlsx | Abra no Excel para conferir empresa, CEP, endereço, produtos e total |
| .txt | Leia o conteúdo em texto simples |
| .eml | Abra em um aplicativo de e-mail compatível para conferir a mensagem e o anexo |

O comando cria um identificador novo a cada execução. Você pode repetir quantas vezes precisar. Ele gera apenas uma demonstração de e-mail, sem criar um pedido ou alterar os carrinhos do banco.

## 4. Envie o teste para seu e-mail

Para receber de verdade, preencha no seu .env os dados SMTP fornecidos pelo seu provedor. Edite as linhas existentes para evitar configurações duplicadas. Acrescente as que ainda não estiverem no arquivo.

```dotenv
EMAIL_MODE=smtp
SMTP_HOST=smtp.seu-provedor.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=conta-usada-para-enviar@seu-dominio.com
SMTP_PASS=credencial-smtp-da-conta
ORDER_EMAIL_FROM=conta-usada-para-enviar@seu-dominio.com
ORDER_EMAIL_TO=email-que-recebera-os-pedidos@seu-dominio.com
TEST_EMAIL_TO=email-que-recebera-os-testes@seu-dominio.com
```

Esses valores são exemplos de preenchimento. Use o host, a porta e o método de autenticação autorizados na sua conta. Se o provedor informar a porta 587, use SMTP_PORT=587 e SMTP_SECURE=false. Nesse caso, o código exige a negociação STARTTLS. Na porta 465, a conexão usa TLS desde o início.

SMTP_USER é a conta que envia. ORDER_EMAIL_FROM é o remetente autorizado. SMTP_PASS é a credencial exigida pelo provedor, que pode ser uma senha de aplicativo. Guarde esses dados somente no .env local ou nas variáveis privadas da hospedagem.

ORDER_EMAIL_TO é a caixa comercial que recebe pedidos reais. TEST_EMAIL_TO substitui o destinatário somente no comando de teste. Se TEST_EMAIL_TO ficar vazio, o teste usa ORDER_EMAIL_TO.

Depois de salvar, execute novamente.

```powershell
npm run testar-email
```

O comando verifica conexão e autenticação SMTP e então envia a mensagem. A aceitação pelo SMTP é informada no terminal. Confira a caixa de entrada e o spam, abra o anexo e valide o endereço e o total. Uma nova execução envia um novo teste com outro identificador.

Se aparecer EAUTH ou erro 535, confira a conta, a credencial e as opções de autenticação habilitadas no provedor. Uma configuração de acesso correta precisa também autorizar o remetente usado.

Se você já usa Resend, continue com EMAIL_MODE=resend e preencha RESEND_API_KEY, ORDER_EMAIL_FROM e ORDER_EMAIL_TO. O modelo HTML e o anexo XLSX também são enviados nesse modo.

## 5. Faça um pedido pelo site

Para testar todo o caminho, reinicie o servidor após editar o .env.

```powershell
npm start
```

Entre com uma conta de teste. Em Kamai, adicione uma unidade de Gin Sunset 750 ml e uma caixa de seis unidades. Na conta de varejo, o total é R$ 504,00. Revise o endereço e confirme o pedido.

A notificação será enviada para ORDER_EMAIL_TO com o número real do pedido. A planilha terá os dados do cliente e os preços que foram gravados na confirmação. Ao clicar em Responder na mensagem recebida, o aplicativo de e-mail usa o endereço do comprador.

Cada novo pedido confirmado gera sua notificação. A fila tenta novamente quando ocorre uma falha e registra o estado em pedidos.email_status. Ela conserva a mesma planilha e a mesma chave de idempotência para as tentativas via Resend. No SMTP, uma interrupção depois de o provedor aceitar a mensagem pode levar a repetição da notificação, pois esse protocolo não fornece a mesma garantia de idempotência.

Os arquivos privados em data/email-outbox mantêm o relatório original para novas tentativas. Após oito falhas, o pedido fica com email_status=falhou. Confira a causa e a configuração. O guia REENVIO_PEDIDOS.md mostra como listar e recuperar as notificações com falha ou simuladas.

## 6. O que foi testado

Execute npm test para rodar as verificações. Os testes verificam os perfis e pedidos anteriores e acrescentam os casos abaixo.

- CEP válido, inválido, inexistente e serviço indisponível, usando respostas controladas.
- Dados completos na mensagem, com escape de texto no HTML.
- Planilha com CEP textual, endereço, preços numéricos, subtotais e total de R$ 504,00.
- Transmissão SMTP para um servidor local de teste, incluindo HTML e anexo XLSX.
- Falha do provedor e nova tentativa usando o mesmo pedido e os mesmos bytes do anexo.

Também foram executadas duas prévias independentes pelo comando testar-email. A planilha gerada foi aberta para inspeção dos dados e da apresentação. O envio à sua caixa de entrada requer suas configurações SMTP ou Resend. A consulta externa ao ViaCEP não respondeu neste ambiente, e os casos de funcionamento e falha foram exercitados com respostas controladas.

Referências técnicas

- https://viacep.com.br/
- https://nodemailer.com/smtp
- https://nodemailer.com/message/attachments
- https://resend.com/docs/dashboard/emails/attachments
- https://github.com/exceljs/exceljs
