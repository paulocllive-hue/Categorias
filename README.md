# A14 Representações

Versão 1.1 do catálogo de pedidos para compradores de empresas com CNPJ. A página segue a estrutura enviada no desenho, com cabeçalho compacto, banner de destaques, logos em círculos, uma seção horizontal por marca e rodapé para contato e pontos de venda. Os produtos e as seções crescem conforme o cadastro do catálogo.

O primeiro fluxo a testar é entrar com um perfil comercial, ver o preço Kamai correspondente, adicionar produtos e confirmar o pedido. A página usa HTML, CSS e JavaScript. O Node.js recebe o cadastro e os pedidos, e o SQLite guarda os dados no próprio projeto.

## 1. Abra a versão nova

1. Pare o servidor antigo com Ctrl+C.
2. Extraia o ZIP em uma pasta nova, ao lado do projeto anterior. Abra a pasta A14_Representacoes no VS Code. Ela contém package.json, public, src e scripts.
3. Abra o terminal do VS Code nessa pasta. Confirme que está usando Node.js 24 com o comando abaixo.

```powershell
node -v
```

4. Copie o exemplo de configuração uma única vez.

```powershell
Copy-Item .env.example .env
```

5. Prepare as três contas fictícias.

```powershell
npm run preparar-testes
```

6. Inicie o servidor.

```powershell
npm start
```

7. Acesse http://127.0.0.1:3000. Mantenha o terminal aberto durante os testes. O comando npm run dev reinicia o servidor ao editar o JavaScript do backend. Para mudanças nos arquivos JSON, pare e inicie de novo. Para HTML, CSS e JavaScript do navegador, salve e atualize a página com Ctrl+F5.

As dependências desta versão vêm com o Node.js 24. O banco e suas tabelas são criados automaticamente na primeira execução. A versão utiliza a API SQLite do Node 24, que pode exibir um aviso experimental.

O catálogo desta versão consulta a API para montar as seções. Use a porta do Node para abrir o projeto completo. O Live Server na porta 5500 não fornece esses endpoints.

## 2. Compare os três perfis

As contas novas criadas pelo comando preparar-testes têm a senha **TesteA14!2026**.

| Perfil na tela | E-mail de teste | CNPJ usado como dado de teste | Valor salvo no banco |
| --- | --- | --- | --- |
| Varejo | varejo@example.test | 12.345.678/0001-95 | varejista |
| Atacado | atacado@example.test | 12.ABC.345/01DE-35 | atacadista |
| Distribuidor | distribuidor@example.test | 11.222.333/0001-81 | distribuidor |

O comando é repetível. Contas existentes com o mesmo e-mail, CNPJ e perfil são mantidas com a senha anterior. Se houver uma conta diferente usando um desses dados, o comando interrompe a criação e informa o conflito. Você pode então usar DATA_DIR=./data-testes no seu .env para testar com uma base separada. O comando exige EMAIL_MODE=file e demonstracao=true no catálogo.

O formulário de cadastro também funciona pelo site. O comprador escolhe seu perfil, e o servidor aceita somente varejista, atacadista ou distribuidor. Essa escolha é declarada pelo comprador. A primeira versão usa diretamente esse perfil para escolher os preços. O cálculo dos dígitos do CNPJ verifica o formato informado.

## 3. Confira a tabela Kamai recebida

Os valores abaixo foram transcritos do arquivo kamai.txt. Cada linha representa uma apresentação comprável. Uma caixa adicionada ao carrinho corresponde a seis unidades de 750 ml.

| Produto | Apresentação | Atacado | Varejo | Distribuidor |
| --- | --- | --- | --- | --- |
| Gin Sunset | 750 ml | R$ 68,80 | R$ 72,00 | R$ 85,00 |
| Vodka | 750 ml | R$ 68,80 | R$ 72,00 | R$ 85,00 |
| Gin 0% Álcool | 750 ml | R$ 68,80 | R$ 72,00 | R$ 85,00 |
| Gin Sunset | Caixa de 6 × 750 ml | R$ 412,80 | R$ 432,00 | R$ 510,00 |
| Gin 0% Álcool | Caixa de 6 × 750 ml | R$ 412,80 | R$ 432,00 | R$ 510,00 |
| Vodka | Caixa de 6 × 750 ml | R$ 412,80 | R$ 432,00 | R$ 510,00 |
| Gin Sunset Econômica | 1,5 L | Sem preço informado | Sem preço informado | R$ 60,00 |
| Vodka Econômica | 1,5 L | Sem preço informado | Sem preço informado | R$ 40,00 |

O perfil distribuidor usa R$ 85,00 na unidade de 750 ml porque esse foi o valor fornecido. As apresentações de 1,5 L ficam disponíveis para distribuidor. Os outros dois perfis não receberam preço dessas embalagens na lista. Para liberá-las, acrescente os preços no catálogo e reinicie.

Mega Batatas e Doce Bem continuam com os valores ilustrativos de teste do projeto recebido. A indicação aparece junto aos preços dessas marcas depois do login. Todas as fotos usadas vieram dos arquivos fornecidos. Algumas apresentações Kamai ainda precisam de fotos específicas, então os respectivos cards mostram “Imagem em atualização”. A descrição de volume foi atualizada para 750 ml conforme a lista, e a foto de gin disponível foi reaproveitada para o teste. Confira a imagem comercial definitiva antes de disponibilizar para clientes.

## 4. Teste cada entrega

### Layout

Abra a página e aguarde cinco segundos. O banner alterna entre Kamai, Mega Batatas e Doce Bem. Use as setas, os indicadores e o botão Pausar. Se o navegador estiver configurado para reduzir movimento, use Reproduzir para iniciar.

Clique nas logos redondas. Cada uma leva à seção da sua marca, com produtos e um botão Fazer pedido ao final. Em uma tela grande, há quatro cards por linha. A grade passa para três e depois duas colunas em telas menores. Os círculos de marcas quebram de linha conforme o espaço disponível.

### Cadastro e preços

Entre como varejo e clique em Fazer pedido na seção Kamai. Os seis itens disponíveis devem usar a coluna de varejo. Saia em Minha conta, entre como atacado e repita. Depois teste distribuidor, que apresenta oito itens Kamai.

Você também pode criar uma quarta conta pelo formulário, usando um e-mail e um CNPJ diferentes. Após a criação, a aplicação retorna ao catálogo da marca selecionada.

### Carrinho e pedido

Com o carrinho vazio, adicione uma unidade de Gin Sunset 750 ml e uma caixa desse mesmo produto. Abra o carrinho e compare os totais esperados.

| Conta | Cálculo | Total |
| --- | --- | --- |
| Atacado | R$ 68,80 + R$ 412,80 | R$ 481,60 |
| Varejo | R$ 72,00 + R$ 432,00 | R$ 504,00 |
| Distribuidor | R$ 85,00 + R$ 510,00 | R$ 595,00 |

Saia da conta antes de confirmar. Entre novamente e confira os dois itens. Para testar persistência completa, pare o servidor, inicie de novo e entre na mesma conta. Os itens devem reaparecer.

Clique em Revisar pedido, confira endereço, itens e total e use Enviar pedido. O sistema mostra o número gerado, esvazia o carrinho e inclui o registro em Minha conta. Cada conta vê apenas seus próprios pedidos.

### Registro do e-mail

Com EMAIL_MODE=file, a mensagem fica em data/emails/pedido-N.txt, onde N é o número do pedido. Ela inclui razão social, CNPJ, perfil, endereço, apresentações, quantidades e valores. Esse é o modo padrão para fazer os testes solicitados.

O modo resend está implementado no backend. Para envio real, configure RESEND_API_KEY, ORDER_EMAIL_FROM e ORDER_EMAIL_TO no .env, usando um remetente autorizado na sua conta Resend, e altere EMAIL_MODE=resend. O recebimento na caixa comercial depende dessa configuração e precisa ser conferido em um teste real. Pedidos gravados permanecem disponíveis se o envio falhar.

### Testes automáticos

```powershell
npm test
```

Os dois testes usam bancos temporários próprios. A migração verifica que contas e carrinhos anteriores continuam presentes e que os preços históricos dos pedidos são mantidos. Eles verificam os três perfis, os valores Kamai, as caixas de seis unidades, a exclusividade de 1,5 L, a proteção contra preço ou perfil enviados pelo navegador, cadastro, logout, persistência do carrinho, concorrência, pedido repetido e mensagem de e-mail em arquivo.

## 5. Edite o layout e o conteúdo

| Arquivo | O que editar |
| --- | --- |
| public/index.html | Cabeçalho, áreas da página, rodapé e formulários |
| public/estilo.css | Cores no bloco :root, largura máxima, tamanhos, espaçamentos e grades |
| public/app.js | Montagem dos slides e seções, login, carrinho e chamadas à API |
| src/site.json | Nome do representante, logo, marcas, textos, slides, contatos e pontos de venda |
| src/catalogo.json | Produtos e preços por perfil, em centavos |
| src/banco.js | Criação do banco, importação do catálogo e consulta dos preços |
| src/schema.sql | Estrutura das tabelas |
| src/server.js | Rotas HTTP, sessão, carrinho e confirmação do pedido |
| src/contas.js | Validação do cadastro, perfis, senhas e sessões |
| src/email.js | Conteúdo da mensagem e processamento das notificações |
| scripts/preparar-testes.js | Criação das três contas fictícias |
| consultas.sql | Consultas de leitura para conferir o banco |

As cores estão centralizadas no início de estilo.css, com tons neutros para você aplicar seu próprio padrão. Por exemplo, --cor-acao muda os botões e --cor-banner muda o fundo do destaque. Os arquivos de imagem das marcas mantêm suas cores próprias.

A largura máxima é 1200 px. O banner tem altura mínima de 380 px no desktop e a imagem usa cover, que pode recortar as laterais. A área de produto tem altura própria, com contain para exibir a foto inteira. Essas propriedades estão identificadas pelas classes .banner-imagem e .produto-foto img.

## 6. Cadastre contatos e pontos de venda

Em src/site.json, preencha os campos de representante. Use seu e-mail real, telefone, endereço e WhatsApp com código do país e DDD. Para WhatsApp, o formato esperado é uma sequência de dígitos, como 5565999999999. Esse número é somente um exemplo de formato.

O array pontos_venda aceita um objeto por estabelecimento. Exemplo de estrutura para substituir pelos dados reais autorizados para divulgação.

```json
{
  "nome": "Nome do estabelecimento",
  "endereco": "Rua, número, bairro, cidade e UF",
  "marcas": ["Kamai", "Doce Bem"],
  "mapa": ""
}
```

O campo mapa pode receber um link HTTPS da localização. Acrescente o objeto dentro de pontos_venda, separando vários objetos com vírgula. Reinicie o servidor e atualize a página para mostrar as mudanças. Os campos vazios exibem “Contatos em atualização” e “Pontos de venda em atualização”.

Para acrescentar uma marca, adicione um objeto em marcas com id único, nome, logo e descricao. Use esse mesmo id nos produtos de catalogo.json. O círculo e a seção são montados automaticamente. Para incluir um destaque da marca, acrescente também um objeto em slides. O desenho tem espaço para expansão, e o pacote começa com as três marcas informadas.

## 7. Acrescente produtos e fotos

Salve as fotos em public/img. Use nomes com letras minúsculas, números e hífens, como kamai-vodka-750.webp. O servidor aceita WebP, PNG, JPG e JPEG nessa pasta. O campo imagem do produto recebe somente o nome do arquivo. Quando não houver foto, use null.

Exemplo de estrutura de um produto com preços nos três perfis.

```json
{
  "id": "kamai-vodka",
  "marca": "kamai",
  "nome": "Kamai Vodka",
  "apresentacao": "750 ml",
  "venda": "unidade",
  "imagem": "kamai-vodka-750.webp",
  "fonte_preco": "Tabela Kamai enviada",
  "precos": {
    "varejista": 7200,
    "atacadista": 6880,
    "distribuidor": 8500
  }
}
```

R$ 68,80 vira 6880 centavos no arquivo. Se faltar preço de um perfil, omita a chave desse perfil. O produto ficará indisponível para essa categoria. Não use zero como preço.

Para desativar um produto, retire o objeto de catalogo.json. Na próxima inicialização, o banco marca o produto anterior como inativo. Um carrinho que ainda tiver esse item mostra a indisponibilidade e permite removê-lo. Os pedidos já confirmados mantêm sua descrição e seu preço.

## 8. Entenda o banco

O arquivo SQLite fica em data/msc.sqlite. O Node executa schema.sql e importa site.json e catalogo.json ao iniciar. A primeira inicialização desta versão tem 3 marcas, 13 produtos ativos e 35 preços. Rodar preparar-testes em uma base nova acrescenta 3 contas.

| Tabela | Dados guardados |
| --- | --- |
| contas | Responsável, empresa, CNPJ, e-mail, hash da senha, perfil e endereço |
| sessoes | Hash do token de login, conta e vencimento |
| marcas | Identificador da marca, nome, ordem e situação |
| produtos | Marca, apresentação, unidade de venda, imagem e situação |
| precos_produto | Produto, perfil e preço em centavos |
| carrinho | Conta, produto e quantidade |
| pedidos | Conta, número, data, dados de entrega, total e estado da notificação |
| itens_pedido | Descrição, apresentação, quantidade e preço final de cada item |

O servidor consulta precos_produto usando o perfil salvo na conta. Na confirmação, ele recalcula o total e grava pedido e itens na mesma transação. Essa transação também esvazia o carrinho. O navegador envia uma chave para que repetir a confirmação retorne o mesmo pedido.

A revisão tem uma versão do carrinho. Se os itens ou seus preços mudarem em outro acesso antes de confirmar, o servidor pede nova revisão. O logout apaga a sessão e mantém o carrinho no banco para o próximo acesso.

Você pode abrir msc.sqlite em um visualizador SQLite e usar as consultas do arquivo consultas.sql. Para alterar os preços de forma durável nesta versão, edite src/catalogo.json. Os preços desse arquivo são importados novamente ao iniciar, substituindo alterações manuais na tabela comercial. O schema atual é para SQLite. Uma futura conexão MySQL ou PostgreSQL exigirá adaptar o driver e as consultas.

## 9. Atualize sua pasta existente

Para testar sem misturar os dados anteriores, prefira executar a nova pasta entregue. Se desejar atualizar o projeto antigo, pare o servidor, faça uma cópia completa da pasta e então copie public, src, scripts, test, package.json, README.md e consultas.sql da versão nova sobre os arquivos correspondentes.

Confira se o seu .env contém SITE_FILE=./src/site.json e se DATA_DIR aponta para a pasta de dados que você pretende usar. Mantenha o .env e a pasta data existentes para reaproveitar a base. A criação das novas tabelas é automática.

Contas, carrinhos e pedidos existentes são compatíveis com essa atualização. O produto kamai-gin mantém o identificador anterior e passa a mostrar 750 ml e os novos preços da lista. Um carrinho antigo desse produto passa a usar a nova apresentação e a tabela atual. Pedidos já confirmados conservam a descrição e o preço gravados no momento da compra.

A base pessoal do ZIP recebido e os arquivos de configuração privada não são necessários para a versão de demonstração entregue. O novo pacote cria uma base ao executar. Para usar suas contas e pedidos anteriores na nova pasta, pare o servidor antigo, copie a pasta data completa para ela e use o seu .env. Se os CNPJs das contas demonstrativas já estiverem ocupados, use a base data-testes para gerar as contas de exemplo.

## 10. O que foi verificado nesta entrega

A página foi aberta no navegador para conferir o cabeçalho, banner, troca automática, pausa, logos alinhadas, cards e abertura do formulário pelo botão de pedido. As imagens carregaram, e a página desktop ficou dentro da largura disponível. O CSS inclui adaptação para telas menores. O fluxo autenticado, os valores e o registro do pedido foram conferidos pelos testes da API.

Contatos comerciais e estabelecimentos aguardam os dados do representante. O e-mail foi exercitado no modo de arquivo local. O passo de envio real depende da conta Resend configurada por você.
