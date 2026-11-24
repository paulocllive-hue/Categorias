# Configuração de e-mail e recuperação de notificações

Esta atualização atende o representante que precisa receber os pedidos salvos pelos clientes. O fluxo principal é confirmar o pedido no banco, tentar a notificação e recuperar o envio quando houver falha. A recuperação transmite a notificação do pedido original, com o mesmo número, itens, preços e planilha.

## 1. O que corrigir no seu .env

Mantenha somente uma linha de cada variável. EMAIL_MODE=file produz arquivos em data/emails e não envia e-mail. Os exemplos smtp.seu-provedor.com e sua-credencial-smtp precisam ser substituídos para envio real.

Para Gmail, mantenha suas configurações de servidor local e use o bloco abaixo com uma conta real e uma senha de app gerada por você.

```dotenv
PORT=3000
HOST=127.0.0.1
SECURE_COOKIES=false
DATA_DIR=./data
CATALOG_FILE=./src/catalogo.json
SITE_FILE=./src/site.json

EMAIL_MODE=smtp
RESEND_API_KEY=
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=seu-email@gmail.com
SMTP_PASS=COLOQUE_A_SENHA_DE_APP_AQUI
ORDER_EMAIL_FROM=seu-email@gmail.com
ORDER_EMAIL_TO=seu-email@gmail.com
TEST_EMAIL_TO=seu-email@gmail.com
```

Substitua seu-email@gmail.com nos quatro campos pelo endereço desejado. SMTP_USER é a conta que envia, e ORDER_EMAIL_FROM deve ser autorizado por essa conta. ORDER_EMAIL_TO recebe os pedidos reais. TEST_EMAIL_TO recebe somente a demonstração de npm run testar-email. Os endereços de envio e de destino podem ser iguais.

Este projeto utiliza autenticação SMTP com credencial. Para Gmail, habilite a verificação em duas etapas e, se disponível para sua conta, gere uma senha de app em https://myaccount.google.com/apppasswords. Dê um nome como A14 Representações e use a credencial gerada em SMTP_PASS. A opção pode não estar disponível em algumas contas gerenciadas ou com restrições de segurança. Nesse caso, escolha um provedor compatível ou configure Resend conforme ALTERACOES_CEP_EMAIL.md.

Não use a senha comum da conta neste exemplo. Não compartilhe o .env nem envie a senha no chat. O ZIP não inclui sua configuração particular. O código agora recusa exemplos conhecidos de host ou senha quando EMAIL_MODE=smtp.

Referências oficiais: https://developers.google.com/workspace/gmail/imap/imap-smtp?hl=pt-br e https://support.google.com/accounts/answer/185833?hl=pt-BR.

## 2. Atualize o projeto

1. Pare o servidor com Ctrl+C e faça uma cópia de segurança da pasta do projeto.
2. Copie os arquivos indicados abaixo para as mesmas posições. Preserve seu .env e toda a pasta data.
3. Execute npm install na pasta que contém package.json.
4. Edite seu .env conforme o modo de teste ou envio escolhido. Não copie o .env.example por cima das suas configurações.
5. Execute npm run testar-email. No modo smtp, confira a caixa de entrada e o spam e abra o anexo.
6. Execute npm start para iniciar o site. Use http://127.0.0.1:3000.

| Arquivo | Alteração |
| --- | --- |
| src/schema.sql | Campos de reserva do envio e último erro para bancos novos |
| src/banco.js | Acrescenta esses campos automaticamente em bancos existentes |
| src/email.js | Reserva do envio, recuperação após queda e registro resumido do erro |
| src/server.js | Retoma a fila ao iniciar o servidor |
| src/config-email.js | Recusa exemplos SMTP que ainda não foram preenchidos |
| src/recuperar-emails.js | Seleção e reagendamento seguro das notificações |
| scripts/reenviar-pedidos.js | Consulta e recuperação por terminal |
| package.json e package-lock.json | Novo comando e versão 1.4 |
| test/recuperacao-email.test.js e test/migracao.test.js | Testes de recuperação, concorrência, reinício e migração |
| README.md e REENVIO_PEDIDOS.md | Instruções de uso |

Nenhum comando SQL manual é necessário. Ao abrir o banco, o projeto acrescenta email_ultimo_erro, email_bloqueio_token e email_bloqueio_ate à tabela pedidos, preservando contas, carrinhos e itens. Dados anteriores à atualização não terão o histórico dos erros antigos, mas os estados de envio já gravados são mantidos.

## 3. Como o envio automático funciona

- O checkout salva pedido e itens no SQLite antes da tentativa de notificação.
- O pedido confirmado continua salvo se a conexão SMTP ou a internet falharem.
- A fila verifica os pedidos a cada 30 segundos enquanto npm start está funcionando. Ao iniciar o servidor, também verifica a fila imediatamente, respeitando as datas agendadas e reservas ainda válidas.
- Depois de uma falha, as próximas esperas são 1, 2, 4, 8, 16, 32 e 60 minutos. O ciclo de 30 segundos pode acrescentar um pequeno atraso.
- Após oito falhas, a notificação fica em falhou para inspeção e recuperação manual.
- Uma reserva no banco evita que duas instâncias do projeto atualizado processem o mesmo pedido ao mesmo tempo. Se um processo cair durante o envio, sua reserva expira em até dez minutos. Não execute uma versão antiga do servidor junto com a versão nova.
- A planilha original permanece em data/email-outbox e é reaproveitada nas tentativas.

No modo file, uma notificação concluída fica simulado e não será enviada automaticamente quando você trocar para smtp. A seção seguinte mostra como escolher esse pedido para envio real.

## 4. Consulte o estado das notificações

Na pasta do projeto, execute:

```powershell
npm run reenviar-pedidos -- --listar
```

O comando mostra o resumo de todos os pedidos e os detalhes dos 100 mais recentes, sem enviar e-mail. Também informa o último código de erro conhecido, a próxima tentativa e se há um processo enviando aquele pedido.

| Estado | Significado |
| --- | --- |
| pendente | Aguarda uma tentativa automática |
| falhou | Oito tentativas falharam; confira a configuração e recupere |
| simulado | Foram gerados apenas arquivos locais |
| aceito | O provedor aceitou a mensagem; confira recebimento e spam |

Se aparecer ENOTFOUND, confira o host SMTP. Se aparecer EAUTH, confira conta e senha de app. A listagem não guarda senha e não expõe os dados completos do comprador.

## 5. Reenvie após corrigir o problema

Configure EMAIL_MODE=smtp ou resend e valide a conta com npm run testar-email antes de recuperar os pedidos. Os comandos abaixo funcionam mesmo com o servidor do site parado e usam ORDER_EMAIL_TO, não TEST_EMAIL_TO.

Para tentar agora todas as notificações pendentes ou que falharam:

```powershell
npm run reenviar-pedidos -- --pendentes
```

Para tentar somente a notificação do pedido 2, inclusive se ele estiver simulado:

```powershell
npm run reenviar-pedidos -- --pedido 2
```

O comando zera o contador de falhas desses pedidos, mantém o registro do último erro até um envio bem sucedido, recoloca as notificações na fila e tenta enviá-las. Os dados comerciais do pedido não são alterados. Se falhar, a notificação permanece pendente. Mantenha npm start funcionando para as próximas tentativas automáticas ou execute a recuperação novamente depois de resolver a causa.

Pedidos aceitos são preservados e o comando recusa --pedido para esses registros. Notificações reservadas por outro processo são ignoradas e informadas. Aguarde a conclusão ou a expiração da reserva antes de recuperar. O modo file é recusado para evitar tratar um arquivo de prévia como recebimento real.

Este comando usa o banco indicado por DATA_DIR e não cria um banco vazio quando o arquivo não existe. Se nada aparecer, confira a pasta configurada. A recuperação em lote exclui simulações para não mandar todos os pedidos de demonstração por engano. Para simulações, escolha cada número explicitamente.

## 6. Teste a recuperação

Execute primeiro:

```powershell
npm test
```

Os testes usam bancos temporários e dados fictícios. Cobrem migração da base anterior, SMTP local, novas tentativas com a mesma planilha, oito falhas, recuperação seletiva, dois processos concorrentes e um servidor iniciado em processo novo que retoma um pedido persistido.

Para testar manualmente sem enviar várias demonstrações antigas, use um pedido de teste específico:

1. Com EMAIL_MODE=file, faça um pedido fictício pelo site e anote o número em Meus pedidos.
2. Confira o estado simulado com --listar.
3. Pare o servidor, configure SMTP corretamente e execute npm run testar-email.
4. Se o teste chegar, execute --pedido com o número anotado.
5. Confira a planilha e o número no e-mail real. Execute --listar novamente para conferir aceito.
6. Tente recuperar esse mesmo pedido uma segunda vez. O comando deve recusar porque já foi aceito.

Você pode repetir npm run testar-email para mensagens independentes. Ele não cria pedidos no banco. Não altere propositalmente a configuração do envio de pedidos reais para simular falhas.

## 7. Limites e preservação dos dados

Aceito significa que o provedor recebeu a mensagem para entrega. Não confirma que ela chegou à caixa de entrada. Em SMTP, uma queda depois da aceitação, mas antes de o aplicativo registrar a confirmação, pode gerar uma mensagem repetida na recuperação. O mesmo número de pedido e Message-ID ajudam a identificar essa repetição, mas não garantem a eliminação da duplicata. No Resend, a chave de idempotência existente é reaproveitada nas tentativas, conforme as regras do provedor.

Com o servidor desligado, a fila não envia e o site não recebe pedidos novos. Ao voltar a funcionar, os pedidos já gravados são recuperáveis. Uma falha antes de o checkout confirmar a gravação não equivale a um pedido salvo. O cliente pode consultar Meus pedidos para confirmar o registro.

Mantenha cópias de segurança do SQLite e da pasta data/email-outbox. Para uma cópia simples em ambiente local, pare o servidor e os comandos de recuperação antes de copiar toda a pasta data. Na hospedagem, use armazenamento persistente: a fila não recupera dados que foram apagados do disco.

A conta Gmail do usuário não foi acessada e nenhum envio real a ela foi executado neste ambiente. A entrega deve ser validada com a credencial preenchida por você no seu .env.
