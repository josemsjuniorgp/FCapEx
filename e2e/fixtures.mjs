// Gera as planilhas usadas pelos roteiros: PQ de teste (com títulos e item repetido) e modelo de colunas.
// Uso: node e2e/fixtures.mjs <pasta-de-trabalho>
import ExcelJS from 'exceljs';
const dir = process.argv[2];

const pq = new ExcelJS.Workbook();
const ws = pq.addWorksheet('PQ');
ws.addRow(['PLANILHA DE QUANTIDADES - OBRA TESTE']);
ws.addRow(['ITEM', 'Área', 'Subárea', 'PACOTE', 'TIPO', 'DESCRIÇÃO', 'UNID', 'QUANTIDADE']);
[
  ['1.1', '', '', '', '', 'CONSTRUÇÃO DE INSTALAÇÕES PROVISÓRIAS', '', null],
  ['1.1.1', '22', '2200', 'SERV-CIV-1', 'C', 'PORTARIA EM CONTAINER – 13,69 m2', 'vb', 1],
  ['1.1.2', '22', '2200', 'SERV-CIV-1', 'C', 'REFEITÓRIO EM ESTRUTURA METÁLICA', 'm2', 120.5],
  ['1.1.2', '22', '', 'SERV-CIV-1', 'C', 'ITEM COM NÚMERO REPETIDO', 'un', 3],
  ['1.2', '', '', '', '', 'EQUIPAMENTOS', '', '-'],
  ['1.2.1', '', '', 'FOR-MEC-07', 'Fornecimento', 'BOMBA CENTRÍFUGA 150 kW', 'un', 6],
].forEach(l => ws.addRow(l));
ws.getColumn(8).numFmt = '0.00';
await pq.xlsx.writeFile(`${dir}/PQ-Teste_Rev0.xlsx`);

const mod = new ExcelJS.Workbook();
const wm = mod.addWorksheet('Modelo');
wm.addRow(['MODELO DE PX DO CLIENTE']);
wm.addRow(['Item', 'Descrição', 'Unid', 'Quantidade', 'Moeda', 'Preço unitário']);
await mod.xlsx.writeFile(`${dir}/Modelo-Cliente.xlsx`);
console.log('planilhas de teste geradas em', dir);
