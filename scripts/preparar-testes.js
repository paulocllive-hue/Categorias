import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { abrirBanco, transacao } from '../src/banco.js';
import { hashSenha, validarCadastro } from '../src/contas.js';

const raiz = fileURLToPath(new URL('../', import.meta.url));
const catalogo = JSON.parse(readFileSync(resolve(raiz, process.env.CATALOG_FILE || 'src/catalogo.json')));
const site = JSON.parse(readFileSync(resolve(raiz, process.env.SITE_FILE || 'src/site.json')));
if (!catalogo.demonstracao || (process.env.EMAIL_MODE || 'file') !== 'file') {
  throw new Error('As contas de teste exigem demonstracao=true no catálogo e EMAIL_MODE=file.');
}
const dataDir = resolve(raiz, process.env.DATA_DIR || 'data');
const db = abrirBanco(dataDir, catalogo, site);
const senha = 'TesteA14!2026';
const perfis = [
  { perfil: 'varejista', email: 'varejo@example.test', cnpj: '12.345.678/0001-95' },
  { perfil: 'atacadista', email: 'atacado@example.test', cnpj: '12.ABC.345/01DE-35' },
  { perfil: 'distribuidor', email: 'distribuidor@example.test', cnpj: '11.222.333/0001-81' }
];
try {
  const senhaHash = await hashSenha(senha);
  transacao(db, () => {
    for (const perfil of perfis) {
      const cadastro = validarCadastro({
        ...perfil, senha, nome: 'Comprador de Teste', razao_social: 'Empresa de Teste ' + perfil.perfil,
        endereco: { cep: '78000000', uf: 'MT', logradouro: 'Rua de Teste', numero: '100',
          complemento: '', bairro: 'Centro', cidade: 'Cuiabá' }
      });
      const anterior = db.prepare('SELECT email, perfil, cnpj FROM contas WHERE email = ? OR cnpj = ?').all(cadastro.email, cadastro.cnpj);
      if (anterior.length) {
        if (anterior.length !== 1 || anterior[0].email !== cadastro.email ||
            anterior[0].cnpj !== cadastro.cnpj || anterior[0].perfil !== cadastro.perfil) {
          throw new Error('E-mail ou CNPJ de teste já está em uso. Use DATA_DIR=./data-testes em uma pasta separada.');
        }
        console.log('Conta existente mantida: ' + cadastro.email + '. A senha anterior foi preservada.');
        continue;
      }
      db.prepare(`INSERT INTO contas (nome, razao_social, cnpj, email, senha_hash, perfil, endereco_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).run(cadastro.nome, cadastro.razao_social,
        cadastro.cnpj, cadastro.email, senhaHash, cadastro.perfil, JSON.stringify(cadastro.endereco));
      console.log('Conta criada: ' + cadastro.email);
    }
  });
  console.log('Senha das contas novas: ' + senha);
  console.log('Banco de testes disponível em: ' + dataDir);
} finally {
  db.close();
}
