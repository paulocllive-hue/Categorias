import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { abrirBanco, consultarProdutos } from '../src/banco.js';

test('base anterior recebe o catálogo, preserva contas, carrinhos e preços históricos', async () => {
  const pasta = await mkdtemp(join(tmpdir(), 'a14-migracao-'));
  let banco;
  try {
    const schema = await readFile(new URL('../src/schema.sql', import.meta.url), 'utf8');
    banco = new DatabaseSync(join(pasta, 'msc.sqlite'));
    // As tabelas da versão anterior aparecem antes deste marcador no schema.
    banco.exec(schema.split('-- Catálogo e tabelas comerciais.')[0]);
    banco.prepare('INSERT INTO contas VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
      1, 'Comprador Anterior', 'Empresa Anterior', '12345678000195',
      'anterior@example.test', 'hash-anterior', 'varejista', '{}');
    banco.prepare('INSERT INTO carrinho VALUES (?, ?, ?)').run(1, 'kamai-gin', 2);
    banco.prepare('INSERT INTO pedidos (id, conta_id, chave, criado_em, cliente_json, total_centavos) VALUES (?, ?, ?, ?, ?, ?)')
      .run(42, 1, 'chave-anterior', '2026-11-10T12:00:00Z', '{}', 9890);
    banco.prepare('INSERT INTO itens_pedido VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(42, 'kamai-gin', 'Gin anterior', '700 ml', 'garrafa', 1, 9890);
    banco.close();
    banco = null;

    const catalogo = JSON.parse(await readFile(new URL('../src/catalogo.json', import.meta.url), 'utf8'));
    const site = JSON.parse(await readFile(new URL('../src/site.json', import.meta.url), 'utf8'));
    banco = abrirBanco(pasta, catalogo, site);
    assert.equal(banco.prepare('SELECT email FROM contas').get().email, 'anterior@example.test');
    assert.equal(banco.prepare('SELECT quantidade FROM carrinho').get().quantidade, 2);
    assert.equal(consultarProdutos(banco, 'varejista')[0].preco_centavos, 7200);
    assert.equal(consultarProdutos(banco, 'varejista')[0].apresentacao, '750 ml');
    assert.equal(banco.prepare('SELECT preco_centavos FROM itens_pedido').get().preco_centavos, 9890);
    assert.equal(banco.prepare('SELECT apresentacao FROM itens_pedido').get().apresentacao, '700 ml');
    banco.close();
    banco = null;

    const atualizado = structuredClone(catalogo);
    atualizado.produtos[0].precos.varejista = 7300;
    atualizado.produtos = atualizado.produtos.filter((produto) => produto.id !== 'kamai-vodka');
    banco = abrirBanco(pasta, atualizado, site);
    assert.equal(consultarProdutos(banco, 'varejista')[0].preco_centavos, 7300);
    assert.equal(banco.prepare("SELECT ativo FROM produtos WHERE id = 'kamai-vodka'").get().ativo, 0);
    assert.equal(banco.prepare('SELECT preco_centavos FROM itens_pedido').get().preco_centavos, 9890);
    banco.close();
    banco = null;

    const invalido = structuredClone(atualizado);
    invalido.produtos[0].precos.varejista = 0;
    assert.throws(() => abrirBanco(pasta, invalido, site), /preços em centavos/);
    banco = new DatabaseSync(join(pasta, 'msc.sqlite'));
    assert.equal(banco.prepare("SELECT preco_centavos FROM precos_produto WHERE produto_id = 'kamai-gin' AND perfil = 'varejista'").get().preco_centavos, 7300);
  } finally {
    banco?.close();
    await rm(pasta, { recursive: true, force: true });
  }
});
