import { ErroHttp } from './contas.js';

export async function consultarCep(cep, buscar = fetch) {
  if (!/^\d{8}$/.test(cep)) throw new ErroHttp(400, 'Informe um CEP com 8 dígitos.');
  let resposta;
  let dados;
  try {
    resposta = await buscar('https://viacep.com.br/ws/' + cep + '/json/', {
      signal: AbortSignal.timeout(5000),
      headers: { Accept: 'application/json' }
    });
    if (!resposta.ok) throw new Error('Serviço indisponível.');
    dados = await resposta.json();
    if (!dados || typeof dados !== 'object') throw new Error('Resposta inválida.');
  } catch {
    throw new ErroHttp(503, 'A consulta de CEP está indisponível. Preencha o endereço manualmente.');
  }
  if (dados.erro) throw new ErroHttp(404, 'CEP não encontrado. Confira o CEP ou preencha o endereço manualmente.');
  const texto = (valor) => typeof valor === 'string' ? valor.trim() : '';
  const uf = texto(dados.uf);
  const cidade = texto(dados.localidade);
  if (!/^[A-Z]{2}$/.test(uf) || !cidade) {
    throw new ErroHttp(503, 'A consulta retornou dados incompletos. Preencha o endereço manualmente.');
  }
  return {
    cep, uf, cidade,
    logradouro: texto(dados.logradouro),
    bairro: texto(dados.bairro)
  };
}
