import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const derivar = promisify(scrypt);
export const perfis = ['varejista', 'atacadista', 'distribuidor'];
export const hashToken = (token) => createHash('sha256').update(token).digest('hex');
export const criarToken = () => randomBytes(32).toString('hex');

export class ErroHttp extends Error {
  constructor(status, mensagem) {
    super(mensagem);
    this.status = status;
  }
}

async function derivarSenha(senha, sal) {
  return derivar(senha, sal, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 });
}

export async function hashSenha(senha) {
  const sal = randomBytes(16).toString('hex');
  return sal + ':' + (await derivarSenha(senha, sal)).toString('hex');
}

export async function confereSenha(senha, hash) {
  const [sal, esperado] = hash.split(':');
  return timingSafeEqual(await derivarSenha(senha, sal), Buffer.from(esperado, 'hex'));
}

function texto(valor, min, max, campo) {
  const limpo = typeof valor === 'string' ? valor.trim() : '';
  if (limpo.length < min || limpo.length > max) {
    throw new ErroHttp(400, 'Confira o campo ' + campo + '.');
  }
  return limpo;
}

function cnpjValido(cnpj) {
  if (!/^[A-Z0-9]{12}[0-9]{2}$/.test(cnpj) || /^(.)\1{13}$/.test(cnpj)) return false;
  const digito = (base, pesos) => {
    const soma = pesos.reduce((total, peso, i) => total + (base.charCodeAt(i) - 48) * peso, 0);
    return soma % 11 < 2 ? 0 : 11 - soma % 11;
  };
  const base = cnpj.slice(0, 12);
  const primeiro = digito(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const segundo = digito(base + primeiro, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return cnpj.slice(12) === String(primeiro) + segundo;
}

export function validarCadastro(dados) {
  const email = texto(dados.email, 5, 254, 'e-mail').toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ErroHttp(400, 'Informe um e-mail válido.');
  const cnpj = texto(dados.cnpj, 14, 24, 'CNPJ').toUpperCase().replace(/[./\s-]/g, '');
  if (!cnpjValido(cnpj)) throw new ErroHttp(400, 'Informe um CNPJ válido.');
  if (!perfis.includes(dados.perfil)) throw new ErroHttp(400, 'Escolha um perfil comercial.');
  if (typeof dados.senha !== 'string' || dados.senha.length < 10 || dados.senha.length > 128) {
    throw new ErroHttp(400, 'A senha deve ter entre 10 e 128 caracteres.');
  }

  const endereco = dados.endereco ?? {};
  const cep = texto(endereco.cep, 8, 9, 'CEP').replace('-', '');
  const uf = texto(endereco.uf, 2, 2, 'UF').toUpperCase();
  if (!/^\d{8}$/.test(cep)) throw new ErroHttp(400, 'Informe um CEP com 8 dígitos.');
  if (!'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ').includes(uf)) {
    throw new ErroHttp(400, 'Informe uma UF brasileira.');
  }

  return {
    nome: texto(dados.nome, 2, 100, 'nome do responsável'),
    razao_social: texto(dados.razao_social, 2, 150, 'razão social'),
    email, cnpj, perfil: dados.perfil, senha: dados.senha,
    endereco: {
      cep, uf,
      logradouro: texto(endereco.logradouro, 2, 150, 'logradouro'),
      numero: texto(endereco.numero, 1, 20, 'número'),
      complemento: texto(endereco.complemento, 0, 100, 'complemento'),
      bairro: texto(endereco.bairro, 2, 80, 'bairro'),
      cidade: texto(endereco.cidade, 2, 80, 'cidade')
    }
  };
}
