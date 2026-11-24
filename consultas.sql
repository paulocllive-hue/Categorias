-- Abra data/msc.sqlite no visualizador SQLite e execute apenas a consulta desejada.
-- As tabelas comerciais são atualizadas de src/catalogo.json ao iniciar o servidor.

-- 1. Perfis comerciais de cada conta, sem hashes de senha ou tokens.
SELECT id, razao_social, email, cnpj, perfil FROM contas ORDER BY id;

-- 2. Tabela Kamai completa. Os valores são guardados em centavos.
SELECT p.id, p.nome, p.apresentacao, p.venda, t.perfil,
       printf('%.2f', t.preco_centavos / 100.0) AS valor_reais
FROM produtos p
JOIN precos_produto t ON t.produto_id = p.id
WHERE p.ativo = 1 AND p.marca_id = 'kamai'
ORDER BY p.ordem, t.perfil;

-- 3. Produtos sem preço para um perfil ficam fora da oferta desse perfil.
SELECT p.id, p.nome, p.apresentacao
FROM produtos p
LEFT JOIN precos_produto t ON t.produto_id = p.id AND t.perfil = 'varejista'
WHERE p.ativo = 1 AND t.produto_id IS NULL;

-- 4. Itens ainda no carrinho, com o preço do perfil da conta.
SELECT c.email, c.perfil, p.nome, p.apresentacao, ca.quantidade,
       t.preco_centavos, ca.quantidade * t.preco_centavos AS subtotal_centavos
FROM carrinho ca
JOIN contas c ON c.id = ca.conta_id
LEFT JOIN produtos p ON p.id = ca.produto_id
LEFT JOIN precos_produto t ON t.produto_id = p.id AND t.perfil = c.perfil
ORDER BY c.id, ca.produto_id;

-- 5. Pedidos salvos e processamento do e-mail.
SELECT p.id, c.email, p.criado_em, p.total_centavos, p.email_status,
       p.email_tentativas
FROM pedidos p JOIN contas c ON c.id = p.conta_id
ORDER BY p.id DESC;

-- 6. Valores históricos de cada item, fixados na data de confirmação.
SELECT pedido_id, nome, apresentacao, venda, quantidade, preco_centavos,
       quantidade * preco_centavos AS subtotal_centavos
FROM itens_pedido
ORDER BY pedido_id DESC, produto_id;

-- 7. Contagem das tabelas para conferir a primeira inicialização.
SELECT 'marcas' AS tabela, COUNT(*) AS total FROM marcas WHERE ativo = 1
UNION ALL
SELECT 'produtos', COUNT(*) FROM produtos WHERE ativo = 1
UNION ALL
SELECT 'precos_produto', COUNT(*) FROM precos_produto
UNION ALL
SELECT 'contas', COUNT(*) FROM contas;
