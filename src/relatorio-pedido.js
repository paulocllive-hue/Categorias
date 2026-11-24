import ExcelJS from 'exceljs';

const dinheiro = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const data = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Cuiaba' });
const perfis = { varejista: 'Varejo', atacadista: 'Atacado', distribuidor: 'Distribuidor' };
const escapar = (valor) => String(valor ?? '').replace(/[&<>"']/g, (letra) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[letra]);
const brl = (centavos) => dinheiro.format(centavos / 100);

export async function montarEmailPedido(pedido, itens, representante = 'A14 Representações') {
  const cliente = JSON.parse(pedido.cliente_json);
  const endereco = cliente.endereco ?? {};
  const cep = String(endereco.cep ?? '').replace(/^(\d{5})(\d{3})$/, '$1-$2');
  const campos = [
    ['Empresa', cliente.razao_social],
    ['CNPJ', cliente.cnpj],
    ['Responsável', cliente.nome],
    ['E-mail', cliente.email],
    ['Segmento', perfis[cliente.perfil] || cliente.perfil],
    ['CEP', cep],
    ['Logradouro', endereco.logradouro],
    ['Número', endereco.numero],
    ['Complemento', endereco.complemento || ''],
    ['Bairro', endereco.bairro],
    ['Cidade', endereco.cidade],
    ['UF', endereco.uf]
  ];
  const linhasTexto = itens.map((item) => item.quantidade + ' × ' + item.nome + ' (' +
    item.apresentacao + ', ' + item.venda + ') — ' + brl(item.quantidade * item.preco_centavos));
  const assunto = 'Novo pedido ' + representante + ' #' + pedido.id;
  const texto = [
    'Pedido #' + pedido.id, 'Data: ' + data.format(new Date(pedido.criado_em)),
    ...campos.map(([rotulo, valor]) => rotulo + ': ' + (valor ?? '')),
    '', ...linhasTexto, '', 'Total dos produtos: ' + brl(pedido.total_centavos),
    '', 'Planilha do pedido anexada.'
  ].join('\n');
  const detalhesHtml = campos.map(([rotulo, valor]) => '<tr><th align="left" style="padding:7px 12px;border-bottom:1px solid #e5e7eb;width:150px;color:#475569;font-weight:normal">' +
    escapar(rotulo) + '</th><td style="padding:7px 12px;border-bottom:1px solid #e5e7eb">' + escapar(valor) + '</td></tr>').join('');
  const itensHtml = itens.map((item) => '<tr><td style="padding:10px;border-bottom:1px solid #e5e7eb">' +
    escapar(item.nome) + '<br><small>' + escapar(item.apresentacao) + ' · ' + escapar(item.venda) +
    '</small></td><td align="center" style="padding:10px">' + item.quantidade +
    '</td><td align="right" style="padding:10px;white-space:nowrap">' + brl(item.preco_centavos) +
    '</td><td align="right" style="padding:10px;white-space:nowrap">' + brl(item.quantidade * item.preco_centavos) + '</td></tr>').join('');
  const html = '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><body style="margin:0;background:#f3f4f6;font:14px Arial,sans-serif;color:#17233d">' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px 10px">' +
    '<table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:100%;background:#fff;border:1px solid #e5e7eb">' +
    '<tr><td style="padding:24px;background:#1e3a8a;color:#fff"><p style="margin:0 0 8px">' + escapar(representante) +
    '</p><h1 style="font-size:25px;margin:0">Pedido #' + escapar(pedido.id) + '</h1><p style="margin:8px 0 0">' +
    escapar(data.format(new Date(pedido.criado_em))) + '</p></td></tr><tr><td style="padding:20px">' +
    '<h2 style="font-size:17px">Empresa e endereço de entrega</h2><table width="100%" cellspacing="0" style="border-collapse:collapse">' +
    detalhesHtml + '</table><h2 style="font-size:17px;margin-top:26px">Produtos solicitados</h2>' +
    '<table width="100%" cellspacing="0" style="border-collapse:collapse"><thead><tr style="background:#f3f4f6">' +
    '<th align="left" style="padding:10px">Produto</th><th>Qtd.</th><th>Preço</th><th>Subtotal</th></tr></thead><tbody>' + itensHtml +
    '</tbody></table><p style="font-size:18px;text-align:right"><strong>Total dos produtos ' + brl(pedido.total_centavos) +
    '</strong></p><p style="color:#475569">A planilha anexada reúne os dados de entrega e os itens deste pedido.</p></td></tr></table></td></tr></table></body></html>';

  const workbook = new ExcelJS.Workbook();
  workbook.creator = representante;
  workbook.created = new Date(pedido.criado_em);
  workbook.modified = new Date(pedido.criado_em);
  const sheet = workbook.addWorksheet('Pedido', {
    views: [{ state: 'frozen', ySplit: 18 }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
  });
  sheet.columns = [
    { width: 38 }, { width: 38 }, { width: 20 }, { width: 17 }, { width: 19 }, { width: 20 }
  ];
  sheet.mergeCells('A1:F1');
  sheet.getCell('A1').value = representante + ' · Pedido #' + pedido.id;
  sheet.getCell('A1').font = { name: 'Calibri', size: 18, bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
  sheet.getRow(1).height = 36;
  sheet.mergeCells('A2:F2');
  sheet.getCell('A2').value = 'Solicitado em ' + data.format(new Date(pedido.criado_em));
  campos.forEach(([rotulo, valor], indice) => {
    const linha = indice + 4;
    sheet.getCell('A' + linha).value = rotulo;
    sheet.getCell('A' + linha).font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF475569' } };
    sheet.mergeCells('B' + linha + ':F' + linha);
    sheet.getCell('B' + linha).value = String(valor ?? '');
    sheet.getCell('B' + linha).numFmt = '@';
    sheet.getCell('B' + linha).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
    sheet.getRow(linha).height = 27;
  });
  sheet.addRow([]);
  sheet.getRow(18).values = ['Produto', 'Apresentação', 'Venda', 'Quantidade', 'Preço unitário', 'Subtotal'];
  sheet.getRow(18).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(18).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
  sheet.getRow(18).height = 28;
  itens.forEach((item, indice) => {
    const row = sheet.getRow(19 + indice);
    row.values = [item.nome, item.apresentacao, item.venda, item.quantidade, item.preco_centavos / 100,
      { formula: 'D' + row.number + '*E' + row.number, result: item.quantidade * item.preco_centavos / 100 }];
    row.height = 42;
    row.alignment = { wrapText: true, vertical: 'middle' };
    row.getCell(5).numFmt = '"R$" #,##0.00';
    row.getCell(6).numFmt = '"R$" #,##0.00';
    if (indice % 2 === 0) row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
  });
  const totalRow = 19 + itens.length;
  sheet.getCell('E' + totalRow).value = 'Total dos produtos';
  sheet.getCell('F' + totalRow).value = { formula: 'SUM(F19:F' + (totalRow - 1) + ')', result: pedido.total_centavos / 100 };
  sheet.getCell('F' + totalRow).numFmt = '"R$" #,##0.00';
  sheet.getRow(totalRow).font = { bold: true };
  sheet.getRow(totalRow).height = 30;
  sheet.autoFilter = { from: 'A18', to: 'F' + (totalRow - 1) };
  sheet.pageSetup.printArea = 'A1:F' + totalRow;
  workbook.calcProperties.fullCalcOnLoad = true;
  const planilha = Buffer.from(await workbook.xlsx.writeBuffer());
  return { assunto, texto, html, planilha, replyTo: cliente.email, nomeArquivo: 'pedido-' + pedido.id + '.xlsx' };
}
