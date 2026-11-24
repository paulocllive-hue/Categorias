import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { perfis } from './contas.js';

const schemaPath = fileURLToPath(new URL('./schema.sql', import.meta.url));

export function transacao(db, operacao) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const resultado = operacao();
    db.exec('COMMIT');
    return resultado;
  } catch (erro) {
    db.exec('ROLLBACK');
    throw erro;
  }
}

function validarCatalogo(catalogo, site) {
  const marcas = new Set(site.marcas.map((marca) => marca.id));
  const ids = new Set();
  if (typeof catalogo.demonstracao !== 'boolean' || marcas.size !== site.marcas.length || !marcas.size) {
    throw new Error('Confira o modo de demonstração e as marcas cadastradas.');
  }
  for (const produto of catalogo.produtos) {
    const valores = Object.entries(produto.precos ?? {});
    if (ids.has(produto.id) || !/^[a-z0-9-]+$/.test(produto.id) || !marcas.has(produto.marca) ||
        !produto.nome || !produto.apresentacao || !produto.venda || !produto.fonte_preco ||
        !valores.length || valores.some(([perfil, valor]) =>
          !perfis.includes(perfil) || !Number.isInteger(valor) || valor < 1 || valor > 10_000_000)) {
      throw new Error('Confira a marca, os dados e os preços em centavos do produto ' + produto.id + '.');
    }
    ids.add(produto.id);
  }
}

export function abrirBanco(dataDir, catalogo, site) {
  validarCatalogo(catalogo, site);
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(join(dataDir, 'msc.sqlite'), { timeout: 5000 });
  try {
    db.exec(readFileSync(schemaPath, 'utf8'));
    transacao(db, () => {
      // Um item retirado do arquivo fica inativo. Pedidos anteriores mantêm os dados gravados.
      db.exec('UPDATE marcas SET ativo = 0; UPDATE produtos SET ativo = 0');
      const gravarMarca = db.prepare(`INSERT INTO marcas (id, nome, ordem, ativo) VALUES (?, ?, ?, 1)
        ON CONFLICT (id) DO UPDATE SET nome = excluded.nome, ordem = excluded.ordem, ativo = 1`);
      site.marcas.forEach((marca, ordem) => gravarMarca.run(marca.id, marca.nome, ordem));
      const gravarProduto = db.prepare(`INSERT INTO produtos
        (id, marca_id, nome, apresentacao, venda, imagem, fonte_preco, ordem, ativo)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1) ON CONFLICT (id) DO UPDATE SET
        marca_id = excluded.marca_id, nome = excluded.nome, apresentacao = excluded.apresentacao,
        venda = excluded.venda, imagem = excluded.imagem, fonte_preco = excluded.fonte_preco,
        ordem = excluded.ordem, ativo = 1`);
      const removerPrecos = db.prepare('DELETE FROM precos_produto WHERE produto_id = ?');
      const gravarPreco = db.prepare('INSERT INTO precos_produto VALUES (?, ?, ?)');
      catalogo.produtos.forEach((produto, ordem) => {
        gravarProduto.run(produto.id, produto.marca, produto.nome, produto.apresentacao,
          produto.venda, produto.imagem ?? null, produto.fonte_preco, ordem);
        removerPrecos.run(produto.id);
        for (const [perfil, preco] of Object.entries(produto.precos)) {
          gravarPreco.run(produto.id, perfil, preco);
        }
      });
    });
    return db;
  } catch (erro) {
    db.close();
    throw erro;
  }
}

export function consultarProdutos(db, perfil) {
  const registros = db.prepare(`SELECT p.id, p.marca_id AS marca, p.nome, p.apresentacao, p.venda,
    p.imagem, p.fonte_preco, t.preco_centavos FROM produtos p
    JOIN marcas m ON m.id = p.marca_id AND m.ativo = 1
    LEFT JOIN precos_produto t ON t.produto_id = p.id AND t.perfil = ?
    WHERE p.ativo = 1 ORDER BY m.ordem, p.ordem`).all(perfil ?? '');
  return registros.map((produto) => ({ ...produto, disponivel: !perfil || produto.preco_centavos !== null }));
}
