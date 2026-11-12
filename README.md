# MSC Representações

Catálogo de pedidos para empresas com CNPJ. O comprador encontra as marcas, entra na conta, recebe os preços do perfil comercial e monta um pedido para a equipe de vendas. A equipe recebe os dados por e-mail quando o envio real está configurado.

## 1. Entenda o fluxo comercial

| Perfil | Quem compra nesse perfil | Regra usada neste projeto |
| --- | --- | --- |
| Varejista | Loja ou mercado que vende ao consumidor final | Usa o preço de varejista de cada produto |
| Atacadista | Empresa que compra e revende em volume | Usa o preço de atacadista de cada produto |
| Distribuidor | Empresa que distribui produtos para lojas e outros clientes comerciais | Usa o preço de distribuidor de cada produto |

Como o cadastro exige CNPJ, o público da primeira versão é empresarial. Uma pessoa física comprando para consumo próprio é consumidora final. Varejista, atacadista e distribuidor são perfis do comprador, enquanto Kamai, Mega Batatas e Doce Bem são seções do catálogo.

O comprador escolhe o perfil no cadastro. A aplicação salva essa escolha e carrega somente o preço correspondente para a conta. A validação do CNPJ verifica os dígitos, incluindo o formato alfanumérico. Ela não consulta a situação cadastral da empresa ou comprova o perfil comercial. As tabelas de preços podem ter a ordem que a empresa definir. Os valores que vêm no projeto servem para teste, sem mínimo por perfil. Confirme a associação de Brisa com Mega Batatas, as gramaturas, as unidades de venda e os valores antes de usar com clientes.

O pedido passa por uma tela de revisão com endereço e itens. Depois do envio, o servidor gera um número e registra o pedido em “Minha conta”. O fluxo termina com uma solicitação para a equipe comercial tratar. Pagamento, frete e faturamento ficam fora do sistema entregue.

## 2. Rode no Windows pelo VS Code

1. Extraia o ZIP e abra a pasta `representante` no VS Code.
2. Use o Node.js 24. Para confirmar sua versão, abra o terminal do VS Code e execute `node -v`.
3. Com o terminal na pasta que contém `package.json`, execute:

```powershell
Copy-Item .env.example .env
npm start
```

4. Abra [http://localhost:3000](http://localhost:3000) no navegador. Se a porta estiver em uso, altere `PORT` no arquivo `.env`, reinicie e abra a nova porta.
5. Para reiniciar o servidor automaticamente ao editar JavaScript do backend, use `npm run dev`. Atualize a página após editar HTML, CSS ou JavaScript da interface. Encerre o servidor com `Ctrl+C`.

O Node entrega a página e a API na mesma porta. Você pode rodar o projeto sem ligar Apache e MySQL no XAMPP, e o SQLite cria o arquivo `data/msc.sqlite` na primeira execução. As bibliotecas usadas já vêm no Node 24.

## 3. O que cada arquivo faz

| Arquivo | Responsabilidade | Onde experimentar |
| --- | --- | --- |
| `public/index.html` | Cabeçalho, apresentação das três marcas e estrutura dos formulários | Edite o texto de uma marca e recarregue a página |
| `public/estilo.css` | Cores, tipografia, disposição das fotos e adaptação para celular | No navegador, abra as ferramentas de desenvolvedor e teste uma largura de 390 px |
| `public/app.js` | Abre catálogo, conta e carrinho, chama a API com `fetch` e mostra respostas | Veja as chamadas na aba **Rede** ao adicionar um item |
| `src/server.js` | Recebe as requisições, busca o preço pelo perfil, atualiza o carrinho e registra o pedido | Rode os testes antes e depois de mudar uma regra |
| `src/contas.js` | Valida cadastro e CNPJ, protege a senha com hash e gera tokens de sessão | Tente cadastrar um CNPJ com dígitos inválidos |
| `src/catalogo.json` | Lista os produtos e os três preços por produto | Mude um valor, reinicie e confira o catálogo com a conta desse perfil |
| `src/schema.sql` | Cria as tabelas de contas, sessões, carrinho, pedidos e itens | Localize o arquivo `data/msc.sqlite` após iniciar |
| `src/email.js` | Monta a mensagem do pedido e processa o envio ou a simulação | Procure `data/emails/pedido-1.txt` depois de confirmar o primeiro pedido |

### Como o pedido chega ao banco

1. Ao cadastrar ou entrar, o navegador recebe um cookie de sessão. O banco guarda o hash do token da sessão, a conta associada e o vencimento.
2. Ao clicar em “Adicionar”, o JavaScript envia o identificador do produto à API. O servidor identifica a empresa pelo cookie e guarda o produto e a quantidade na tabela de carrinho. O logout encerra a sessão. O carrinho fica na conta, disponível em outro navegador ou depois de reiniciar.
3. A tela de revisão mostra os valores calculados pelo servidor. Na confirmação, o backend confere se o carrinho ainda corresponde à revisão e grava pedido, itens e preços finais em uma transação. Ele então esvazia o carrinho. Uma repetição com a mesma chave retorna o mesmo pedido.
4. A fila lê o pedido gravado para montar a mensagem. Assim, uma falha no provedor de e-mail não apaga o pedido. O servidor tenta novamente enquanto está em execução e registra o estado de envio em `pedidos.email_status`. O status `aceito` indica que o provedor aceitou a solicitação. Confira a chegada na caixa de entrada durante o teste real.

## 4. Teste por entrega

| Etapa | Ação | Resultado esperado |
| --- | --- | --- |
| Catálogo | Abra o site e clique em “Fazer pedido” de cada marca | Sem sessão, abre o login. Depois de entrar, volta à marca escolhida |
| Cadastro e preços | Crie três contas fictícias com e-mails e CNPJs diferentes, uma por perfil | Com o catálogo original, o gin de teste mostra R$ 98,90, R$ 86,90 e R$ 74,90 para varejista, atacadista e distribuidor, respectivamente |
| Carrinho persistente | Adicione dois produtos, saia da conta, pare o servidor, inicie de novo e entre | Os produtos e as quantidades reaparecem. Outra empresa começa com seu próprio carrinho |
| Pedido | Abra o carrinho, clique em “Revisar pedido” e confirme | Aparece o número do pedido, o carrinho esvazia e o registro aparece em “Minha conta” |
| E-mail de teste | Aguarde alguns segundos e abra `data/emails/pedido-1.txt` para o primeiro pedido | O arquivo contém empresa, CNPJ, endereço, itens e total |
| Testes automáticos | Execute `npm test` no terminal | Um teste de integração verifica cadastro, os três preços, isolamento de contas, logout, carrinho após reinício, revisão, pedido sem duplicação e arquivo de e-mail |

Para o teste manual, use um nome e um endereço fictícios, `78000-000` como CEP, `MT` como UF e e-mails do domínio `example.test`, como `empresa1@example.test`. Os CNPJs usados como valores de teste no código são `12.345.678/0001-95`, `12.ABC.345/01DE-35` e `11.222.333/0001-81`. O sistema usa apenas o cálculo dos dígitos para aceitá-los no ambiente de demonstração.

## 5. Cadastre o catálogo real e configure o e-mail

1. Faça uma cópia de `src/catalogo.json` ou ajuste o arquivo original. Defina a marca (`kamai`, `mega` ou `doce`), a apresentação, a unidade de venda e os três preços de cada produto. Os preços são inteiros em centavos, então R$ 18,90 entra como `1890`. Mantenha o mesmo `id` para um produto já usado em carrinhos. Ajuste também o texto de apresentação em `public/index.html` se a linha mudar.
2. Para dados comerciais, use `"demonstracao": false` no catálogo revisado. Caso tenha criado um arquivo separado, aponte `CATALOG_FILE` para ele. Use um novo `DATA_DIR` para iniciar a base comercial separada dos cadastros e pedidos fictícios.
3. No Resend, configure o domínio do remetente. No seu `.env`, preencha as variáveis abaixo. O e-mail de destino é a caixa comercial que deve receber os pedidos. Guarde a chave somente nas variáveis privadas do servidor.

```dotenv
EMAIL_MODE=resend
RESEND_API_KEY=sua_chave_privada
ORDER_EMAIL_FROM=pedidos@dominio-verificado.example
ORDER_EMAIL_TO=comercial@empresa.example
```

4. Reinicie a aplicação e faça um pedido controlado com uma conta fictícia. Confira tanto o pedido no sistema quanto a mensagem na caixa comercial. Se não chegar, verifique os registros do servidor e o painel do Resend. Os pedidos ficam armazenados enquanto o processamento da notificação estiver pendente ou falhar.

## 6. Como encaixar o Shenup

Este pacote usa SQLite para você aprender e testar o fluxo completo. A configuração exata do “Shenup” depende da URL ou do nome do painel e do tipo de banco que ele oferece. O projeto ainda não foi conectado a esse serviço.

- **Se o serviço executar Node.js 24 com disco persistente**, o próprio SQLite pode continuar em uso. Defina `DATA_DIR` para o volume persistente, configure o serviço para executar `npm start` e mantenha uma instância escrevendo no arquivo. Faça a exposição por HTTPS e defina `SECURE_COOKIES=true` no ambiente da hospedagem.
- **Se oferecer MySQL ou PostgreSQL gerenciado**, criar o banco no painel é o primeiro passo. A adaptação no código envolve instalar o driver do banco escolhido, configurar a conexão por variáveis de ambiente, adaptar `src/schema.sql` e substituir o acesso via `DatabaseSync` pelas consultas e transações do driver. Depois, rode novamente os testes do cadastro até o pedido e valide a persistência após reiniciar a hospedagem. As tabelas no SQL atual foram escritas para SQLite.
- **Se o painel hospedar apenas páginas estáticas**, o catálogo e a API precisam de uma hospedagem que execute o backend Node. As credenciais do banco e do e-mail ficam no servidor.

Documentação de referência

- [Node.js 24 e SQLite](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html)
- [Resend e envio de e-mails](https://resend.com/docs/api-reference/emails/send-email)
- [Receita Federal e cálculo do CNPJ](https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/documentos-tecnicos/cnpj)
- [OWASP e armazenamento de senhas](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
