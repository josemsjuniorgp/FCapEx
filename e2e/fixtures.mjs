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
// PQ com quantidades zero e vazia (opção de não importar) — usada no roteiro desfazer
const z = new ExcelJS.Workbook();
const wz = z.addWorksheet('PQ');
wz.addRow(['ITEM', 'DESCRIÇÃO', 'UNID', 'QUANTIDADE']);
[['1.1', 'OBRA', '', null], ['1.1.1', 'Item A', 'un', 2], ['1.1.2', 'Item B zerado', 'un', 0], ['1.1.3', 'Item C sem quantidade', 'un', null], ['1.1.4', 'Item D', 'm', 5]]
  .forEach(l => wz.addRow(l));
await z.xlsx.writeFile(`${dir}/PQ-Zerados.xlsx`);
console.log('planilhas de teste geradas em', dir);
