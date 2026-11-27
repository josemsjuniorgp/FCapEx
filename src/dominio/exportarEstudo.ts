/**
 * Excel do Estudo de Viabilidade (relatório para o comitê de investimento).
 * Abas: Resumo · Premissas · CapEx · OpEx · Receitas/Economias · Fluxo de caixa · Sensibilidade.
 */
import type ExcelJS from 'exceljs';
import { nomeOrigem } from './maturidade';
import { calcularEstudo, cenario, tornado, valorLinha, type EntradaEstudo, type LinhaEstudo, type TipoEstudo } from './viabilidade';

export interface DadosEstudo {
  empresa: string; cliente: string; projeto: string; nome: string; tipo: TipoEstudo;
  entrada: EntradaEstudo;
  mapas: { codigo: string; nome: string; total: number }[];
  geradoEm?: Date;
}

const COR = { acento: 'FF0B6B73', escuro: 'FF084F55', claro: 'FFC6E3E5', tinta: 'FF15212B', cinza: 'FF566574', linha: 'FFD7DFE6',
  titulo: 'FFD9CBB3', tituloTinta: 'FF3D3424', total: 'FFDFF0F1', ruim: 'FFB3261E', bom: 'FF1D7F48', branco: 'FFFFFFFF' };
const F = 'Calibri';
const BRL = '"R$ "#,##0.00', MI = '"R$ "#,##0.0,," mi"', PCT = '0.0%';
const fill = (argb: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const bordaFina = { style: 'thin' as const, color: { argb: COR.linha } };
const borda: Partial<ExcelJS.Borders> = { top: bordaFina, left: bordaFina, bottom: bordaFina, right: bordaFina };

export const nomeArquivoEstudo = (nome: string) => `Viabilidade_${nome.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'Estudo'}.xlsx`;

function cabecalho(ws: ExcelJS.Worksheet, titulo: string, d: DadosEstudo, quando: string) {
  const t = ws.getCell('A1'); t.value = titulo; t.font = { name: F, size: 16, bold: true, color: { argb: COR.tinta } };
  const s = ws.getCell('A2'); s.value = `${d.empresa} · ${d.cliente} › ${d.projeto} · ${d.nome} · exportado em ${quando}`;
  s.font = { name: F, size: 10, color: { argb: COR.cinza } };
}
function tabela(ws: ExcelJS.Worksheet, linha0: number, cab: string[], linhas: (string | number | null)[][], fmts: (string | null)[], larg?: number[]) {
  if (larg) larg.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  cab.forEach((h, i) => {
    const c = ws.getCell(linha0, i + 1); c.value = h;
    c.font = { name: F, size: 10, bold: true, color: { argb: COR.branco } }; c.fill = fill(COR.escuro); c.border = borda;
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });
  ws.getRow(linha0).height = 30;
  linhas.forEach((l, j) => l.forEach((v, i) => {
    const c = ws.getCell(linha0 + 1 + j, i + 1); c.value = v; c.border = borda; c.font = { name: F, size: 10, color: { argb: COR.tinta } };
    if (fmts[i]) { c.numFmt = fmts[i]!; c.alignment = { horizontal: 'right' }; }
  }));
  return linha0 + 1 + linhas.length;
}

export async function gerarExcelEstudo(d: DadosEstudo): Promise<ArrayBuffer> {
  const mod = await import('exceljs');
  const E = (mod.default ?? mod) as typeof ExcelJS;
  const wb = new E.Workbook(); wb.creator = d.empresa; wb.title = `Viabilidade — ${d.nome}`;
  const quando = (d.geradoEm ?? new Date()).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const e = d.entrada, p = e.premissas, r = calcularEstudo(e), torn = tornado(e);
  const pess = cenario(e, p.cenarios.pessimista), otim = cenario(e, p.cenarios.otimista);
  const n = p.anosObra + p.anosOperacao;

  // Resumo
  const res = wb.addWorksheet('Resumo', { views: [{ showGridLines: false }] });
  cabecalho(res, 'ESTUDO DE VIABILIDADE', d, quando);
  [32, 22, 22, 22].forEach((w, i) => { res.getColumn(i + 1).width = w; });
  const ind: [string, number | string | null, string | null][] = [
    ['VPL (valor presente líquido)', r.vpl, BRL], ['TIR (taxa interna de retorno)', r.tir, PCT],
    ['Taxa de desconto (real)', p.taxa, PCT], ['Payback simples (ano do projeto)', r.payback ?? 'não paga', null],
    ['Payback descontado (ano do projeto)', r.paybackDescontado ?? 'fora do horizonte', null],
    ['CapEx', r.capexTotal, BRL], ['Reinvestimentos', r.reinvestimentos, BRL], ['OpEx anual (ano cheio)', r.opexAnoCheio, BRL],
    [d.tipo === 'economia' ? 'Economia anual (ano cheio)' : 'Receita líquida anual (ano cheio)', r.receitaAnoCheio, BRL],
    ['Custo do ciclo de vida (CapEx + OpEx)', r.lcc, BRL],
  ];
  let l = tabela(res, 4, ['Indicador', 'Valor'], ind.map(([a, b]) => [a, b]), [null, null]);
  ind.forEach(([, , f], i) => { if (f) { const c = res.getCell(5 + i, 2); c.numFmt = f; c.alignment = { horizontal: 'right' }; } });
  const vc = res.getCell(5, 2); vc.font = { name: F, size: 12, bold: true, color: { argb: r.vpl >= 0 ? COR.bom : COR.ruim } };
  l += 1;
  const cen = res.getCell(l, 1); cen.value = 'CENÁRIOS'; cen.font = { name: F, size: 10.5, bold: true, color: { argb: COR.acento } };
  l = tabela(res, l + 1, ['Cenário', 'VPL', 'TIR', 'Payback'],
    [['Pessimista', pess.vpl, pess.tir, pess.payback ?? '—'], ['Base', r.vpl, r.tir, r.payback ?? '—'], ['Otimista', otim.vpl, otim.tir, otim.payback ?? '—']],
    [null, BRL, PCT, null]);
  const tipoTxt = res.getCell(l + 1, 1);
  tipoTxt.value = `Tipo: ${d.tipo === 'economia' ? 'redução de custo (economia sem × com o projeto)' : 'com receita'}. Valores reais (moeda de hoje), fluxos no fim de cada ano.`;
  tipoTxt.font = { name: F, size: 9, italic: true, color: { argb: COR.cinza } };

  // Premissas
  const pr = wb.addWorksheet('Premissas', { views: [{ showGridLines: false }] });
  cabecalho(pr, 'PREMISSAS', d, quando);
  tabela(pr, 4, ['Premissa', 'Valor'], [
    ['Ano 1 do projeto', p.anoBase], ['Anos de obra', p.anosObra], ['Anos de operação', p.anosOperacao],
    ['Taxa de desconto real (a.a.)', p.taxa], ['IR + CSLL', p.ir], ['Depreciação linear (anos)', p.depreciacaoAnos],
    ['Valor residual (% do CapEx)', p.valorResidual], ['Rampa de partida', p.rampa.map(x => `${Math.round(x * 100)}%`).join(' · ') || 'produção plena desde o início'],
  ], [null, null], [36, 30]);
  [7, 8, 10].forEach(i => { pr.getCell(i + 1, 2).numFmt = PCT; pr.getCell(i + 1, 2).alignment = { horizontal: 'right' }; });

  // CapEx
  const cx = wb.addWorksheet('CapEx', { views: [{ showGridLines: false }] });
  cabecalho(cx, 'CAPEX', d, quando);
  let lc = tabela(cx, 4, ['Mapa de Preços', 'Nome', 'Total geral (R$)'],
    [...d.mapas.map(m => [m.codigo, m.nome, m.total]), ...(e.capex.adicional ? [['Adicional', e.capex.adicionalDescricao || 'fora dos Mapas', e.capex.adicional]] : []),
      ['TOTAL', '', r.capexTotal]], [null, null, BRL], [28, 48, 22]);
  lc += 1;
  lc = tabela(cx, lc + 1, ['Ano de obra', 'Ano', 'Desembolso (R$)'],
    r.anos.filter(a => a.fase === 'obra').map(a => [`Ano ${a.ano}`, p.anoBase + a.ano - 1, a.capex]), [null, null, BRL]);
  if (e.capex.reinvestimentos.length)
    tabela(cx, lc + 2, ['Reinvestimento (ano do projeto)', 'Descrição', 'Valor (R$)'], e.capex.reinvestimentos.map(x => [x.ano, x.descricao, x.valor]), [null, null, BRL]);

  // OpEx e Receitas/Economias
  const grade = (nome: string, secao: LinhaEstudo['secao']) => {
    const ws = wb.addWorksheet(nome, { views: [{ showGridLines: false, state: 'frozen', ySplit: 4 }] });
    cabecalho(ws, nome.toUpperCase(), d, quando);
    const cab = ['Item', 'Descrição', 'Fixo/Variável', 'Unid', 'Quantidade/ano', 'Preço unit.', 'Moeda', ...(secao === 'receita' ? ['Dedução s/ venda'] : []),
      'Ano inicial', 'Ano final', 'Reajuste real a.a.', 'Origem do preço', 'Valor do 1º ano cheio (R$)'];
    const anoCheio = p.anosObra + p.rampa.length + 1;
    const ls = e.linhas.filter(x => x.secao === secao);
    const fim = tabela(ws, 4, cab, ls.map(x => x.titulo ? [x.item, x.descricao] : [
      x.item, x.descricao, x.comportamento === 'fixo' ? 'Fixo' : 'Variável', x.unidade, x.quantidade, x.preco, x.moeda,
      ...(secao === 'receita' ? [x.deducao] : []), x.anoInicio ?? p.anosObra + 1, x.anoFim ?? n, x.reajuste, nomeOrigem(x.origem),
      valorLinha(x, Math.max(anoCheio, x.anoInicio ?? 0), p, e.cambio)]),
    [null, null, null, null, '#,##0.00', '#,##0.00', null, ...(secao === 'receita' ? [PCT] : []), '0', '0', PCT, null, BRL],
    [10, 46, 13, 10, 15, 15, 8, ...(secao === 'receita' ? [12] : []), 10, 10, 12, 26, 20]);
    ls.forEach((x, i) => { if (x.titulo) ws.getRow(5 + i).eachCell(c => { c.fill = fill(COR.titulo); c.font = { name: F, size: 10, bold: true, color: { argb: COR.tituloTinta } }; }); });
    if (!ls.length) ws.getCell(fim, 1).value = '(sem linhas)';
  };
  grade('OpEx', 'opex');
  grade(d.tipo === 'economia' ? 'Economias' : 'Receitas', d.tipo === 'economia' ? 'economia' : 'receita');

  // Fluxo de caixa
  const fx = wb.addWorksheet('Fluxo de caixa', { views: [{ showGridLines: false, state: 'frozen', ySplit: 4 }] });
  cabecalho(fx, 'FLUXO DE CAIXA (valores reais, R$)', d, quando);
  tabela(fx, 4, ['Ano', 'Calendário', 'Fase', d.tipo === 'economia' ? 'Economia' : 'Receita líquida', 'OpEx', 'EBITDA', 'Depreciação', 'IR+CSLL', 'CapEx',
    'Caixa do ano', 'Acumulado', 'Descontado', 'Acumulado descontado'],
  r.anos.map(a => [a.ano, p.anoBase + a.ano - 1, a.fase === 'obra' ? 'Obra' : 'Operação', a.receita + a.economia, -a.opex, a.ebitda, a.depreciacao, -a.ir, -a.capex,
    a.caixa, a.acumulado, a.descontado, a.acumuladoDescontado]),
  [null, null, null, BRL, BRL, BRL, BRL, BRL, BRL, BRL, BRL, BRL, BRL], [7, 11, 11, 18, 18, 18, 16, 16, 18, 18, 18, 18, 20]);
  r.anos.forEach((a, i) => { const c = fx.getCell(5 + i, 10); c.font = { name: F, size: 10, bold: true, color: { argb: a.caixa < 0 ? COR.ruim : COR.tinta } }; });

  // Sensibilidade
  const se = wb.addWorksheet('Sensibilidade', { views: [{ showGridLines: false }] });
  cabecalho(se, 'SENSIBILIDADE DO VPL (cada premissa variando sozinha)', d, quando);
  const fimS = tabela(se, 4, ['Premissa', 'VPL lado desfavorável', 'VPL base', 'VPL lado favorável', 'Amplitude'],
    torn.itens.map(i => [i.nome, Math.min(i.baixo, i.alto), torn.base, Math.max(i.baixo, i.alto), Math.abs(i.alto - i.baixo)]),
    [null, MI, MI, MI, MI], [36, 22, 18, 22, 18]);
  const nota = se.getCell(fimS + 1, 1);
  nota.value = 'Ordenado do que mais mexe no VPL para o que menos mexe. Use para priorizar onde melhorar a estimativa (cotar, negociar, detalhar).';
  nota.font = { name: F, size: 9, italic: true, color: { argb: COR.cinza } };

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}
