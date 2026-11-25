# Carrinho lateral, clique nos produtos e identificação por empresa

Versão 1.5. O comprador cadastrado pode clicar em um produto de qualquer uma das três marcas, abrir a seleção e acompanhar os itens e os dados de entrega no mesmo pedido. O representante identifica a empresa solicitante pelo assunto do e-mail.

## 1. O que mudou

| Solicitação | Comportamento |
| --- | --- |
| Identificar o cliente no e-mail | Assunto: Empresa X enviou um novo pedido · #7 |
| Nome curto no remetente | Empresa X via A14 Representações, usando a conta de envio autorizada |
| Identificação completa | Razão social, responsável e e-mail no início da mensagem, no corpo e na planilha |
| Clicar no produto | Abre Fazer pedido da marca e destaca a apresentação escolhida |
| Adicionar produtos | Salva no banco e atualiza o carrinho automaticamente |
| Acompanhar a compra | No computador, carrinho ao lado dos produtos; até 900 px, abas Produtos e Carrinho |
| Enviar | Botão Enviar pedido no rodapé fixo do painel, com total visível |

O clique no card abre a seleção; ele não adiciona nem envia o produto sozinho. O comprador escolhe Adicionar. O carrinho reúne as marcas, permite aumentar, diminuir ou remover itens e mostra os dados de entrega da conta. É possível fechar o painel, escolher outra marca e continuar com os mesmos itens.

No layout estreito, adicionar um item abre automaticamente a aba Carrinho. Produtos e Continuar escolhendo voltam à seleção. No computador, ambas as áreas ficam visíveis desde a abertura, inclusive quando o carrinho está vazio.

O antigo botão Ver carrinho dentro da seleção foi retirado. O botão Carrinho no cabeçalho continua como atalho para recuperar o pedido salvo. Enviar pedido fica desabilitado se o carrinho estiver vazio, tiver produto indisponível ou houver uma operação em andamento.

## 2. Por que o Gmail mostra “eu”

O e-mail é transmitido pela conta configurada no SMTP, que no seu teste também recebe a mensagem. O aplicativo pode fornecer um nome de exibição, mas a coluna do remetente é controlada pelo Gmail. Portanto, o Gmail pode continuar mostrando “eu” ao enviar e receber na mesma conta.

A identificação garantida pelo conteúdo da nova mensagem fica no assunto. Exemplo:

```text
Supermercado Central enviou um novo pedido · #7
```

No cabeçalho enviado pelo aplicativo, o nome será:

```text
Supermercado Central via A14 Representações <conta-de-envio@dominio.com>
```

A razão social é abreviada para até 40 caracteres, com reticências quando necessário. O nome completo permanece no corpo e na planilha. O botão Responder continua apontando para o e-mail do comprador. Não é necessário cadastrar o endereço de cada cliente no .env.

O endereço From continua sendo ORDER_EMAIL_FROM, autorizado pelo SMTP. O código não coloca o e-mail do comprador como se ele tivesse enviado a mensagem pela conta SMTP dele. Para verificar a exibição do remetente em outra caixa, você pode usar um ORDER_EMAIL_TO que seja diferente da conta de envio e conferir um pedido novo. A apresentação final depende do aplicativo de e-mail e dos contatos salvos.

Notificações antigas em data/email-outbox conservam o relatório original para manter as tentativas consistentes. A mudança do assunto e do nome é aplicada aos novos relatórios. Não apague a pasta de notificações para mudar mensagens antigas.

Referências técnicas: https://nodemailer.com/message/addresses e https://nodemailer.com/guides/using-gmail.

## 3. Arquivos para atualizar

Faça uma cópia de segurança do projeto, pare o servidor com Ctrl+C e copie os arquivos para as mesmas posições.

| Arquivo | Alteração |
| --- | --- |
| public/app.js | Clique nos cards, painel de produtos, carrinho integrado e envio direto |
| public/estilo.css | Cards clicáveis, duas colunas e abas responsivas |
| src/relatorio-pedido.js | Nome abreviado, assunto por empresa e identificação no início do HTML |
| src/envio-email.js | Nome de exibição do remetente em SMTP, Resend e arquivo |
| test/cep-email.test.js | Teste de abreviação e identidade nos três modos de envio |
| package.json e package-lock.json | Versão 1.5, mantendo os comandos existentes |
| README.md e CARRINHO_E_IDENTIFICACAO.md | Documentação do fluxo atualizado |

Se já personalizou as cores ou outros estilos, preserve seu bloco :root. Para o novo layout, acrescente ao final do seu CSS somente o bloco que começa com o comentário “Seleção de produtos e carrinho no mesmo pedido”. Esse bloco usa as variáveis de cores existentes. Copie esse bloco uma única vez.

Mantenha o seu .env e toda a pasta data, incluindo banco, anexos e notificações. Esta etapa não exige mudança no esquema do banco nem nas credenciais SMTP. A sessão, os perfis comerciais, o histórico e os comandos de recuperação permanecem integrados ao fluxo.

Na pasta do package.json, execute:

```powershell
npm install
npm test
npm start
```

Abra http://127.0.0.1:3000 e atualize com Ctrl+F5 para carregar o JavaScript e o CSS novos. Use a porta do Node, pois o Live Server não fornece as APIs de conta e pedidos.

## 4. Como testar cada entrega

### Identificação por empresa

Execute npm run testar-email. No modo file, abra o TXT ou EML criado em data/emails para conferir o assunto e o remetente. No modo smtp, o comando envia um teste para TEST_EMAIL_TO, ou ORDER_EMAIL_TO quando o primeiro estiver vazio. O teste usa uma empresa de demonstração.

Para conferir clientes diferentes, faça pedidos novos com duas contas fictícias de razões sociais diferentes. Compare os assuntos e números. Confira que Responder aponta para cada comprador e que o anexo mantém a razão social completa e o endereço.

### Produto clicável

1. Sem login, clique na foto, nome ou área do card. Deve aparecer a opção para entrar ou cadastrar, sem revelar preços.
2. Entre em uma conta e clique em um produto Kamai. Deve abrir o pedido com esse produto destacado e com o preço do segmento da conta.
3. Feche e repita com Mega Batatas e Doce Bem. O clique abre a seleção da marca correspondente.
4. Use Tab e Enter para abrir um produto pelo teclado.

### Carrinho e envio direto

1. Adicione um produto. No computador, confira o item à direita e o total no rodapé.
2. Aumente a quantidade e confira o subtotal; depois diminua ou remova.
3. Feche a seleção, abra outra marca e adicione outro produto. O carrinho deve manter os dois.
4. Atualize a página e abra Carrinho no cabeçalho. Os itens devem continuar presentes.
5. Confira empresa, CNPJ, responsável, e-mail e endereço na área Dados de entrega.
6. Remova todos os itens. Enviar pedido deve ficar desabilitado.
7. Adicione novamente, confira os dados e clique em Enviar pedido. Esse botão confirma o pedido diretamente, sem uma segunda tela de revisão.
8. Confira o número gerado e o registro em Meus pedidos. O carrinho da conta deve ser esvaziado.
9. Em uma janela estreita, confira as abas. Adicionar deve levar automaticamente ao Carrinho; Produtos retorna à seleção.

Se o carrinho mudar em outro acesso antes de enviar, o servidor rejeita a versão antiga e o painel recarrega os dados para conferência. Se uma resposta se perder após gravar o pedido, a mesma chave de confirmação permite repetir a tentativa sem criar outro pedido. A fila e a recuperação de notificações continuam conforme REENVIO_PEDIDOS.md.

## 5. Verificações realizadas

A suíte com 12 testes passou, incluindo geração de HTML e XLSX, abreviação do nome, preservação do remetente autorizado, Reply-To do comprador, SMTP local, fila, recuperação, migração, perfis, persistência e confirmação concorrente.

A conferência visual utilizou uma empresa fictícia e envio somente em arquivo. Foram verificados os cards nas três marcas, carrinho com marcas diferentes, quantidades, remoção, envio vazio desabilitado, confirmação de pedido, recuperação após atualizar a página e abertura automática da aba Carrinho em largura reduzida.

A exibição final do nome na caixa do Gmail não foi validada por acesso à sua conta. O aplicativo agora fornece os cabeçalhos e o assunto descritos acima; faça um pedido novo para conferir no seu provedor.
