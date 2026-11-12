PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS contas (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL,
  razao_social TEXT NOT NULL,
  cnpj TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  senha_hash TEXT NOT NULL,
  perfil TEXT NOT NULL CHECK (perfil IN ('varejista','atacadista','distribuidor')),
  endereco_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessoes (
  token_hash TEXT PRIMARY KEY,
  conta_id INTEGER NOT NULL REFERENCES contas(id) ON DELETE CASCADE,
  expira_em INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS carrinho (
  conta_id INTEGER NOT NULL REFERENCES contas(id) ON DELETE CASCADE,
  produto_id TEXT NOT NULL,
  quantidade INTEGER NOT NULL CHECK (quantidade BETWEEN 1 AND 999),
  PRIMARY KEY (conta_id, produto_id)
);

CREATE TABLE IF NOT EXISTS pedidos (
  id INTEGER PRIMARY KEY,
  conta_id INTEGER NOT NULL REFERENCES contas(id),
  chave TEXT NOT NULL,
  criado_em TEXT NOT NULL,
  cliente_json TEXT NOT NULL,
  total_centavos INTEGER NOT NULL,
  email_status TEXT NOT NULL DEFAULT 'pendente',
  email_tentativas INTEGER NOT NULL DEFAULT 0,
  email_proxima_tentativa INTEGER NOT NULL DEFAULT 0,
  UNIQUE (conta_id, chave)
);

CREATE TABLE IF NOT EXISTS itens_pedido (
  pedido_id INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  produto_id TEXT NOT NULL,
  nome TEXT NOT NULL,
  apresentacao TEXT NOT NULL,
  venda TEXT NOT NULL,
  quantidade INTEGER NOT NULL,
  preco_centavos INTEGER NOT NULL,
  PRIMARY KEY (pedido_id, produto_id)
);
