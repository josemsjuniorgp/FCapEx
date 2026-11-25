import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { calcular, totais } from './calculo';
import { COLUNAS } from './colunas';
import { gerarExcel, nomeArquivo, type DadosExportacao } from './exportar';
import { itemVazio } from './pq';
import type { Item, Parametros } from './tipos';

const P: Parametros = {
  cambio: { BRL: 1, USD: 5.2, EUR: null },
  tributos: [
    { id: 'pis', nome: 'PIS', aliquota: 0.0165, fornecimento: true, servico: true, nacional: true, importado: true },
    { id: 'cofins', nome: 'COFINS', aliquota: 0.076, fornecimento: true, servico: true, nacional: true, importado: true },
    { id: 'iss', nome: 'ISS', aliquota: 0.05, fornecimento: false, servico: true, nacional: true, importado: true },
  ],
  fretes: [],
  bdis: [{ id: 'civil', nome: 'BDI Obras Civis', administracao: 0.04, seguros: 0.004, garantias: 0.004, riscos: 0.0127, financeiras: 0.0123, lucro: 0.074, extras: [] }],
};
const novo = (seq: number, o: Partial<Item>): Item => ({ ...itemVazio('i' + seq, seq), ...o });
const ITENS: Item[] = [
  novo(1, { titulo: true, item: '1.1', desc: 'OBRAS CIVIS' }),
  novo(2, { item: '1.1.1', desc: 'Concreto estrutural', un: 'm³', qtd: 10, preco: 1000, bdi: 'civil', pacote: 'SERV-CIV-1', tipo: 'C', orig: 'N', moeda: 'BRL', pqdoc: 'PQ-01' }),
  novo(3, { titulo: true, item: '1.1.2', desc: 'FUNDAÇÕES' }),
  novo(4, { item: '1.1.2.1', desc: 'Estaca hélice', un: 'm', qtd: 100, preco: 50, pacote: 'P-2', tipo: 'S', orig: 'N', moeda: 'BRL' }),
  novo(5, { titulo: true, item: '1.2', desc: 'EQUIPAMENTOS' }),
  novo(6, { item: '1.2.1', desc: 'Bomba importada', un: 'un', qtd: 2, preco: 1000, pacote: 'P-3', tipo: 'F', orig: 'I', moeda: 'USD', prov: 0.1 }),
  novo(7, { item: '1.2.2', desc: 'Item sem preço', un: 'un', qtd: 1, pacote: 'P-3', tipo: 'F', orig: 'N', moeda: 'BRL' }),
  novo(8, { item: '1.2.3', desc: 'Item com erro', un: 'un', qtd: 1, preco: 10, pacote: 'P-3', tipo: 'Z', orig: 'N', moeda: 'BRL' }),
];
const DADOS: DadosExportacao = {
  empresa: 'Engenharia & Cia', cliente: 'Siderúrgica Exemplo', projeto: 'Planta Piloto',
  px: { codigo: 'PX-A1/0001', nome: 'Estimativa classe 3', modelo_nome: 'Mapa Padrão', colunas: COLUNAS.map(c => c.k) },
  revisao: 2, emEdicao: true, itens: ITENS, parametros: P,
  moedas: [{ codigo: 'BRL', nome: 'Real', simbolo: 'R$', cambio_brl: 1 }, { codigo: 'USD', nome: 'Dólar', simbolo: 'US$', cambio_brl: 5.2 }, { codigo: 'EUR', nome: 'Euro', simbolo: '€', cambio_brl: null }],
  geradoEm: new Date(2026, 10, 24, 10, 30),
};

async function abrir(d: DadosExportacao) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await gerarExcel(d));
  return wb;
}
const texto = (ws: ExcelJS.Worksheet) => {
  const t: string[] = [];
  ws.eachRow(r => r.eachCell(c => { if (c.value !== null && c.value !== undefined) t.push(String(c.value)); }));
  return t.join(' | ');
};
const achar = (ws: ExcelJS.Worksheet, valor: string) => {
  let pos: ExcelJS.Cell | null = null;
  ws.eachRow(r => r.eachCell(c => { if (!pos && c.value === valor) pos = c; }));
  return pos as ExcelJS.Cell | null;
};

describe('exportação para Excel', async () => {
  const wb = await abrir(DADOS);
  const ws = wb.getWorksheet('Mapa')!;
  const cols = new Set(DADOS.px.colunas);
  const tot = totais(ITENS, P, cols);

  it('gera as 3 abas', () => {
    expect(wb.worksheets.map(w => w.name)).toEqual(['Mapa', 'Resumo', 'Parâmetros']);
  });

  it('cabeçalho do documento com empresa, cliente, projeto, código, revisão e modelo', () => {
    const t = texto(ws);
    for (const v of ['ENGENHARIA & CIA', 'MAPA DE PREÇOS', 'Estimativa classe 3', 'Siderúrgica Exemplo', 'Planta Piloto', 'PX-A1/0001', 'Rev 2 (em edição)', 'Mapa Padrão'])
      expect(t).toContain(v);
    expect(t).toMatch(/EUR sem câmbio/);
  });

  it('quadro-resumo com os 4 totais iguais aos do sistema', () => {
    const v = (r: number, c: number) => ws.getCell(r, c).value;
    const N = COLUNAS.length, larg = N / 4;
    expect(v(10, 1)).toBeCloseTo(tot.ger, 6);
    expect(v(10, Math.round(larg) + 1)).toBeCloseTo(tot.liq, 6);
    expect(v(10, Math.round(2 * larg) + 1)).toBeCloseTo(tot.ger / 5.2, 6);
    expect(v(10, Math.round(3 * larg) + 1)).toBeCloseTo(tot.liq / 5.2, 6);
  });

  it('tabela com cabeçalho em duas linhas, todos os itens e valores calculados', () => {
    expect(ws.getCell(14, 1).value).toBe('Nº');
    expect(ws.getCell(13, 1).value).toBe('IDENTIFICAÇÃO');
    const iGer = COLUNAS.findIndex(c => c.k === 'ger') + 1;
    const iChk = COLUNAS.findIndex(c => c.k === 'chk') + 1;
    const iPreco = COLUNAS.findIndex(c => c.k === 'preco') + 1;
    const iTipo = COLUNAS.findIndex(c => c.k === 'tipo') + 1;
    // ordem da PX
    expect([15, 16, 17, 18, 19, 20, 21, 22].map(r => ws.getCell(r, 1).value)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    // item calculado
    expect(ws.getCell(16, iGer).value).toBeCloseTo(calcular(ITENS[1], P, cols).ger!, 6);
    expect(ws.getCell(16, iChk).value).toBe('OK');
    expect(ws.getCell(16, iTipo).value).toBe('(C) Construção');
    // preço em dólar com o símbolo da moeda
    expect(ws.getCell(20, iPreco).numFmt).toContain('US$');
    expect(ws.getCell(16, iPreco).numFmt).toContain('R$');
    // pendências
    expect(ws.getCell(21, iChk).value).toBe('Incompleto');
    expect(ws.getCell(22, iChk).value).toBe('Erro de classificação');
  });

  it('título com subtotal do grupo (somando subníveis)', () => {
    const iGer = COLUNAS.findIndex(c => c.k === 'ger') + 1;
    const ger = (i: number) => calcular(ITENS[i], P, cols).ger || 0;
    expect(ws.getCell(15, iGer).value).toBeCloseTo(ger(1) + ger(3), 6);   // 1.1 inclui 1.1.2
    expect(ws.getCell(17, iGer).value).toBeCloseTo(ger(3), 6);
    expect(ws.getCell(19, iGer).value).toBeCloseTo(ger(5) + ger(7), 6);
    expect(ws.getCell(15, 1).font?.bold).toBe(true);
  });

  it('títulos coloridos por nível (areia, mais forte → mais claro)', () => {
    expect((ws.getCell(15, 1).fill as ExcelJS.FillPattern).fgColor?.argb).toBe('FFD9CBB3');   // 1.1   → 1º título
    expect(ws.getCell(15, 1).font?.color?.argb).toBe('FF3D3424');
    expect((ws.getCell(17, 1).fill as ExcelJS.FillPattern).fgColor?.argb).toBe('FFE6DCCB');   // 1.1.2 → 2º título
    expect((ws.getCell(19, 1).fill as ExcelJS.FillPattern).fgColor?.argb).toBe('FFD9CBB3');   // 1.2   → 1º título
  });

  it('linha de TOTAL igual ao total geral', () => {
    const iGer = COLUNAS.findIndex(c => c.k === 'ger') + 1;
    const cel = achar(ws, 'TOTAL')!;
    expect(cel).not.toBeNull();
    expect(ws.getCell(Number(cel.row), iGer).value).toBeCloseTo(tot.ger, 6);
  });

  it('cabeçalho congelado até a Descrição, filtro automático e impressão em A3 paisagem', () => {
    const iDesc = COLUNAS.findIndex(c => c.k === 'desc') + 1;
    expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 14, xSplit: iDesc });
    expect(ws.autoFilter).toBeTruthy();
    expect(ws.pageSetup).toMatchObject({ paperSize: 8, orientation: 'landscape', fitToWidth: 1, printTitlesRow: '13:14' });
    expect(ws.headerFooter.oddFooter).toContain('Página &P de &N');
    expect(ws.headerFooter.oddFooter).toContain('Engenharia && Cia');
  });

  it('resumo por grupo, tipo, natureza e moeda', () => {
    const t = texto(wb.getWorksheet('Resumo')!);
    for (const v of ['POR GRUPO (TÍTULOS DA PQ)', 'OBRAS CIVIS', '   FUNDAÇÕES', 'POR TIPO DE TRABALHO', 'Construção', 'POR NATUREZA', 'Importado', 'POR MOEDA', 'Dólar'])
      expect(t).toContain(v);
  });

  it('BDI: nome e % na linha, BDI (R$) somado no total, quadro por BDI e composição nos parâmetros', () => {
    const iBdi = COLUNAS.findIndex(c => c.k === 'bdi') + 1, iBdiv = COLUNAS.findIndex(c => c.k === 'bdiv') + 1;
    expect(ws.getCell(16, iBdi).value).toBe('BDI Obras Civis (15,32%)');
    expect(ws.getCell(18, iBdi).value).toBe('-');
    const r = calcular(ITENS[1], P, new Set(DADOS.px.colunas));
    expect(ws.getCell(16, iBdiv).value).toBeCloseTo(r.bdiv!, 6);
    const iDesc = COLUNAS.findIndex(c => c.k === 'desc') + 1;
    let linhaTotal = 0;
    ws.eachRow((row, n) => { if (row.getCell(iDesc).value === 'TOTAL') linhaTotal = n; });
    expect(ws.getCell(linhaTotal, iBdiv).value).toBeCloseTo(r.bdiv!, 6);
    const resumo = texto(wb.getWorksheet('Resumo')!);
    for (const v of ['POR BDI', 'BDI Obras Civis', '15,32%', 'sem BDI (-)']) expect(resumo).toContain(v);
    const par = texto(wb.getWorksheet('Parâmetros')!);
    for (const v of ['BDIS USADOS NESTE MAPA', 'AC 4,00% · S 0,40% · G 0,40% · R 1,27% · DF 1,23% · L 7,40%', '(1 + AC + S + G + R']) expect(par).toContain(v);
  });

  it('parâmetros usados no cálculo', () => {
    const t = texto(wb.getWorksheet('Parâmetros')!);
    for (const v of ['MOEDAS E CÂMBIO', 'USD', '5.2', 'sem câmbio', 'TRIBUTOS', 'COFINS', 'serviço · nacional e importado']) expect(t).toContain(v);
  });

  it('respeita as colunas da PX', async () => {
    const so = ['seq', 'desc', 'qtd', 'preco', 'ger', 'chk'];
    const w = (await abrir({ ...DADOS, px: { ...DADOS.px, colunas: so } })).getWorksheet('Mapa')!;
    expect([1, 2, 3, 4, 5, 6].map(c => w.getCell(14, c).value)).toEqual(['Nº', 'Descrição', 'Quantidade', 'Preço unit.', 'Total geral (R$)', 'Check']);
    expect(w.getCell(14, 7).value).toBeNull();
  });

  it('PX sem itens também exporta', async () => {
    const w = (await abrir({ ...DADOS, itens: [] })).getWorksheet('Mapa')!;
    expect(texto(w)).toContain('Este Mapa ainda não tem itens.');
  });

  it('colunas de tributo: valor por linha, 0,00 quando desligado e total por tributo', async () => {
    const itens = ITENS.map(i => (i.id === 'i4' ? { ...i, tribLigados: { iss: false } } : i));
    const colunasPx = [...COLUNAS.map(c => c.k), 'tx:iss', 'tx:pis'];
    const w = (await abrir({ ...DADOS, itens, px: { ...DADOS.px, colunas: colunasPx } })).getWorksheet('Mapa')!;
    const cab: string[] = []; w.getRow(14).eachCell(c => cab.push(String(c.value)));
    const iIss = cab.indexOf('ISS (R$)') + 1, iPis = cab.indexOf('PIS (R$)') + 1, iTrib = cab.indexOf('Tributos (R$)') + 1;
    expect(iPis).toBeGreaterThan(0); expect(iIss).toBeGreaterThan(iPis);       // na ordem dos tributos, antes do total
    expect(iTrib).toBe(iIss + 1);
    const cols = new Set(colunasPx);
    const r2 = calcular(itens[1], P, cols);
    expect(w.getCell(16, iIss).value).toBeCloseTo(r2.tribs.iss, 6);        // linha 1.1.1 (serviço): ISS ligado
    expect(w.getCell(18, iIss).value).toBe(0);                               // linha 1.1.2.1: ISS desligado à mão
    expect(w.getCell(18, iIss).numFmt).toContain('R$');
    const tot = totais(itens, P, cols);
    const linhaTotal = Number(achar(w, 'TOTAL')!.row);
    expect(w.getCell(linhaTotal, iIss).value).toBeCloseTo(tot.porTributo.iss, 6);
    expect(w.getCell(linhaTotal, iPis).value).toBeCloseTo(tot.porTributo.pis, 6);
  });

  it('fretes: nome na coluna, valor convertido, 0,00 sem frete, total e aba Parâmetros', async () => {
    const fretes = [
      { id: 'fn', tipo: 'nacional' as const, nome: 'Rodoviário', local: 'MG', criterio: 'valor' as const, valor: 500, moeda: 'BRL' },
      { id: 'fi', tipo: 'internacional' as const, nome: 'Marítimo', local: 'China', criterio: 'percentual' as const, valor: 0.05, moeda: 'USD' },
    ];
    const itens = ITENS.map(i => (i.id === 'i2' ? { ...i, fnac: 'fn', fint: 'fi' } : i));
    const d = { ...DADOS, itens, parametros: { ...P, fretes } };
    const wb2 = await abrir(d); const w = wb2.getWorksheet('Mapa')!;
    const cab: string[] = []; w.getRow(14).eachCell(c => cab.push(String(c.value)));
    const col = (h: string) => cab.indexOf(h) + 1;
    expect(w.getCell(16, col('Frete nacional')).value).toBe('Rodoviário · MG');
    expect(w.getCell(16, col('Frete internacional')).value).toBe('Marítimo · China');
    expect(w.getCell(16, col('Frete nacional (R$)')).value).toBe(500);
    expect(w.getCell(16, col('Frete internacional (R$)')).value).toBeCloseTo(10 * 1000 * 0.05, 6);
    expect(w.getCell(18, col('Frete nacional (R$)')).value).toBe(0);               // item calculado sem frete
    const lt = Number(achar(w, 'TOTAL')!.row);
    expect(w.getCell(lt, col('Frete nacional (R$)')).value).toBe(500);
    const t = texto(wb2.getWorksheet('Parâmetros')!);
    for (const v of ['FRETES NACIONAIS', 'Rodoviário', 'MG', 'FRETES INTERNACIONAIS', 'Marítimo', '% do valor líquido']) expect(t).toContain(v);
  });

  it('larguras pelo conteúdo: números cabem, Descrição longa quebra linha, colunas curtas estreitas', async () => {
    const longa = 'FORNECIMENTO E MONTAGEM DE ESTRUTURA METÁLICA PARA COBERTURA DO GALPÃO DE ARMAZENAMENTO, INCLUINDO TERÇAS, CONTRAVENTAMENTOS E PINTURA';
    const itens = ITENS.map(i => (i.id === 'i2' ? { ...i, desc: longa, qtd: 123456.78, preco: 98765.43 } : i));
    const w = (await abrir({ ...DADOS, itens })).getWorksheet('Mapa')!;
    const cab: string[] = []; w.getRow(14).eachCell(c => cab.push(String(c.value)));
    const col = (h: string) => cab.indexOf(h) + 1;
    const larg = (h: string) => w.getColumn(col(h)).width!;
    expect(larg('Descrição')).toBeLessThanOrEqual(60);
    expect(w.getCell(16, col('Descrição')).alignment?.wrapText).toBe(true);
    const total = w.getCell(16, col('Total geral (R$)'));
    const exibido = 'R$ ' + (total.value as number).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    expect(larg('Total geral (R$)')).toBeGreaterThanOrEqual(exibido.length);
    expect(larg('Quantidade')).toBeGreaterThanOrEqual('123.456,78'.length);
    expect(larg('Unid')).toBeLessThan(12);
    expect(larg('Nº')).toBeLessThan(8);
  });

  it('nome do arquivo', () => {
    expect(nomeArquivo('PX-A1/0001', 2)).toBe('PX-A1-0001_Rev2.xlsx');
    expect(nomeArquivo('ORÇ 2026', 0)).toBe('ORÇ 2026_Rev0.xlsx');
  });
});
