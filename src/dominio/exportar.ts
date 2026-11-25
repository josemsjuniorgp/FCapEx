/**
 * Exportação da PX para Excel (.xlsx) com padrão visual profissional.
 * Abas: "PX" (documento completo), "Resumo" (totais por grupo, tipo, natureza e moeda) e "Parâmetros".
 * Os valores são os mesmos calculados pelo sistema (não são fórmulas).
 */
import type ExcelJS from 'exceljs';
import { bdiDe, bdiFinal, calcular, CORES_TITULO, gruposPorTitulo, niveisTitulos, totais } from './calculo';
import { aderencia, calcularMaturidade, CLASSES, faixaTxt, nomeOrigem, ORIGENS, ROTULO_ADERENCIA } from './maturidade';
import { OPCOES, colunasCompletas, idDoTributo, type Coluna } from './colunas';
import type { Bdi, Item, Parametros, Resultado } from './tipos';

export interface MoedaExportacao { codigo: string; nome: string; simbolo: string; cambio_brl: number | null }

export interface DadosExportacao {
  empresa: string;
  cliente: string;
  projeto: string;
  /** fase e classe AACE do projeto (maturidade) */
  fase?: string;
  classe?: number | null;
  px: { codigo: string; nome: string; modelo_nome: string; colunas: string[] };
  revisao: number;
  emEdicao: boolean;
  itens: Item[];
  parametros: Parametros;
  moedas: MoedaExportacao[];
  geradoEm?: Date;
}

// ------------------------------------------------------------------ paleta (cores do sistema)
const COR = {
  acento: 'FF0B6B73', acentoEscuro: 'FF084F55', acentoClaro: 'FFDFF0F1', tinta: 'FF15212B', cinza: 'FF566574',
  linha: 'FFD7DFE6', calc: 'FFEEF2F5', zebra: 'FFF8FAFB', titulo: 'FFE8EEF2', total: 'FFDFF0F1', branco: 'FFFFFFFF',
  ok: 'FF1D7F48', okClaro: 'FFDFF3E7', aviso: 'FF9A6209', avisoClaro: 'FFFBEFD2', erro: 'FFB3261E', erroClaro: 'FFFBE0DD',
  dolar: 'FF3F4F8F', dolarClaro: 'FFE6EAF7',
};
const FONTE = 'Calibri';
const fill = (argb: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const borda = (argb = COR.linha): Partial<ExcelJS.Borders> => {
  const b = { style: 'thin' as const, color: { argb } };
  return { top: b, left: b, bottom: b, right: b };
};
const FMT_BRL = '"R$ "#,##0.00';
const FMT_USD = '"US$ "#,##0.00';
const fmtMoeda = (simbolo: string) => `"${simbolo.replace(/"/g, '')} "#,##0.00`;
const ROT_CHK = { OK: 'OK', INCOMPLETO: 'Incompleto', ERRO: 'Erro de classificação', TITULO: 'Título' } as const;

const LARGURA: Record<string, number> = {
  seq: 6, pqdoc: 16, item: 11, area: 8, subarea: 9, ativo: 11, desc: 52, un: 7, qtd: 12, prov: 10, hh: 9,
  pacote: 13, tipo: 17, orig: 13, moeda: 9, preco: 15, bdi: 22, bdiv: 15, base: 17, trib: 16, parc: 17, ger: 18, chk: 20,
};

function rotuloOpcao(k: 'tipo' | 'orig', v: string) {
  const o = OPCOES[k].find(([c]) => c === v);
  return o ? `(${o[0]}) ${o[1]}` : v;
}

/** Título e subníveis pela numeração do Item PQ (1.1 inclui 1.1.1…). */
function ramos(itens: Item[]) {
  const titulos = itens.filter(i => i.titulo);
  const limpa = (s: string) => s.replace(/\.$/, '');
  return (id: string) => {
    const t0 = titulos.find(t => t.id === id);
    const pref = t0 ? limpa(t0.item) : '';
    return new Set([id, ...(pref ? titulos.filter(t => limpa(t.item).startsWith(pref + '.')).map(t => t.id) : [])]);
  };
}

export async function gerarExcel(d: DadosExportacao): Promise<ArrayBuffer> {
  const mod = await import('exceljs');
  const E = (mod.default ?? mod) as typeof ExcelJS;
  const wb = new E.Workbook();
  wb.creator = d.empresa;
  wb.title = `${d.px.codigo} — ${d.px.nome}`;
  wb.created = d.geradoEm ?? new Date();

  const cols = new Set(d.px.colunas);
  const colunas = colunasCompletas(d.parametros.tributos).filter(c => c.k === 'seq' || cols.has(c.k));
  const res = new Map<string, Resultado>(d.itens.map(it => [it.id, calcular(it, d.parametros, cols)]));
  const tot = totais(d.itens, d.parametros, cols);
  const usd = d.parametros.cambio.USD ?? null;
  const simbolo = (codigo: string) => d.moedas.find(m => m.codigo === codigo)?.simbolo ?? codigo;
  const quando = (d.geradoEm ?? new Date()).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const revTxt = `Rev ${d.revisao}${d.emEdicao ? ' (em edição)' : ''}`;

  abaPx(wb, d, colunas, res, tot, usd, simbolo, quando, revTxt);
  abaResumo(wb, d, cols, res, tot, quando, revTxt);
  abaParametros(wb, d, quando);
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

// ------------------------------------------------------------------ aba PX
function abaPx(
  wb: ExcelJS.Workbook, d: DadosExportacao, colunas: Coluna[], res: Map<string, Resultado>,
  tot: ReturnType<typeof totais>, usd: number | null, simbolo: (c: string) => string, quando: string, revTxt: string,
) {
  const N = colunas.length;
  const ws = wb.addWorksheet('PX', { properties: { defaultRowHeight: 18 }, views: [{ showGridLines: false }] });
  colunas.forEach((c, i) => { ws.getColumn(i + 1).width = LARGURA[c.k] ?? 12; });
  const faixa = (linha: number, de: number, ate: number) => { if (ate > de) ws.mergeCells(linha, de, linha, ate); return ws.getCell(linha, de); };

  // --- cabeçalho do documento
  const c1 = faixa(1, 1, N); c1.value = d.empresa.toUpperCase();
  c1.font = { name: FONTE, size: 10, bold: true, color: { argb: COR.acento } };
  const c2 = faixa(2, 1, N); c2.value = 'PLANILHA DE PREÇOS (PX)';
  c2.font = { name: FONTE, size: 18, bold: true, color: { argb: COR.tinta } };
  ws.getRow(2).height = 28;
  const c3 = faixa(3, 1, N); c3.value = d.px.nome;
  c3.font = { name: FONTE, size: 13, color: { argb: COR.cinza } };
  ws.getRow(3).height = 20;
  for (let c = 1; c <= N; c++) ws.getCell(3, c).border = { bottom: { style: 'medium', color: { argb: COR.acento } } };

  // --- informações (pares rótulo/valor em duas metades)
  const meio = Math.ceil(N / 2);
  const pares: [string, string][] = [
    ['Cliente', d.cliente], ['Código', d.px.codigo],
    ['Projeto', d.projeto], ['Revisão', revTxt],
    ['Modelo', d.px.modelo_nome], ['Exportado em', quando],
  ];
  pares.forEach(([rot, val], i) => {
    const linha = 5 + Math.floor(i / 2);
    const [ini, fim] = i % 2 === 0 ? [1, meio] : [meio + 1, N];
    const l = faixa(linha, ini, Math.min(ini + 1, fim));
    l.value = rot.toUpperCase();
    l.font = { name: FONTE, size: 8.5, bold: true, color: { argb: COR.cinza } };
    l.alignment = { vertical: 'middle' };
    const v = faixa(linha, Math.min(ini + 2, fim), fim);
    v.value = val;
    v.font = { name: FONTE, size: 11, bold: rot === 'Código', color: { argb: COR.tinta } };
    v.alignment = { vertical: 'middle' };
  });

  // --- quadro-resumo (4 indicadores)
  const kpis: [string, number | null, string, string][] = [
    ['TOTAL GERAL BRUTO (R$)', tot.ger, FMT_BRL, COR.acento],
    ['TOTAL GERAL LÍQUIDO (R$)', tot.liq, FMT_BRL, COR.acento],
    ['TOTAL GERAL BRUTO (US$)', usd ? tot.ger / usd : null, FMT_USD, COR.dolar],
    ['TOTAL GERAL LÍQUIDO (US$)', usd ? tot.liq / usd : null, FMT_USD, COR.dolar],
  ];
  const larg = N / 4;
  kpis.forEach(([rot, val, fmt, cor], i) => {
    const ini = Math.round(i * larg) + 1, fim = Math.round((i + 1) * larg);
    const r = faixa(9, ini, fim);
    r.value = rot;
    r.font = { name: FONTE, size: 8.5, bold: true, color: { argb: COR.cinza } };
    r.fill = fill(cor === COR.dolar ? COR.dolarClaro : COR.acentoClaro);
    r.alignment = { vertical: 'middle', indent: 1 };
    r.border = { top: { style: 'thick', color: { argb: cor } }, left: { style: 'thin', color: { argb: COR.linha } }, right: { style: 'thin', color: { argb: COR.linha } } };
    const v = faixa(10, ini, fim);
    v.value = val ?? '—';
    v.numFmt = fmt;
    v.font = { name: FONTE, size: 15, bold: true, color: { argb: cor === COR.dolar ? COR.dolar : COR.tinta } };
    v.alignment = { vertical: 'middle', indent: 1 };
    v.border = { bottom: { style: 'thin', color: { argb: COR.linha } }, left: { style: 'thin', color: { argb: COR.linha } }, right: { style: 'thin', color: { argb: COR.linha } } };
  });
  ws.getRow(9).height = 20; ws.getRow(10).height = 28;
  const cb = faixa(11, 1, N);
  const cambios = d.moedas.filter(m => m.codigo !== 'BRL')
    .map(m => `${m.simbolo} ${m.codigo} ${m.cambio_brl ? m.cambio_brl.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 }) : 'sem câmbio'}`);
  cb.value = `Câmbio (R$ por unidade):  ${cambios.join('   ·   ') || 'somente Real (R$)'}`;
  cb.font = { name: FONTE, size: 9, color: { argb: COR.cinza } };
  cb.alignment = { vertical: 'middle' };

  // --- tabela: cabeçalho em duas linhas (grupos e colunas)
  const H1 = 13, H2 = 14;
  for (let i = 0; i < N;) {
    let j = i; while (j < N && colunas[j].g === colunas[i].g) j++;
    const g = faixa(H1, i + 1, j); g.value = colunas[i].g.toUpperCase();
    i = j;
  }
  colunas.forEach((c, i) => {
    const g = ws.getCell(H1, i + 1);
    g.font = { name: FONTE, size: 8.5, bold: true, color: { argb: COR.branco } };
    g.fill = fill(COR.acento);
    g.alignment = { horizontal: 'center', vertical: 'middle' };
    g.border = borda(COR.acentoEscuro);
    const h = ws.getCell(H2, i + 1);
    h.value = c.h;
    h.font = { name: FONTE, size: 9.5, bold: true, color: { argb: COR.branco } };
    h.fill = fill(COR.acentoEscuro);
    h.alignment = { horizontal: c.num || c.t === 'calc' || c.t === 'tax' || c.k === 'seq' ? 'center' : 'left', vertical: 'middle', wrapText: true, indent: c.num || c.t === 'calc' || c.t === 'tax' ? 0 : 1 };
    h.border = borda(COR.acentoEscuro);
  });
  ws.getRow(H1).height = 18; ws.getRow(H2).height = 32;

  // --- itens
  const grupos = gruposPorTitulo(d.itens);
  const ramo = ramos(d.itens);
  const niveis = niveisTitulos(d.itens);
  const somaRamo = (id: string) => {
    const r = ramo(id);
    return d.itens.filter(i => !i.titulo && r.has(grupos.get(i.id) ?? '')).reduce((s, i) => s + (res.get(i.id)?.ger || 0), 0);
  };
  let linha = H2 + 1, par = false;
  for (const it of d.itens) {
    const r = res.get(it.id)!;
    const row = ws.getRow(linha);
    colunas.forEach((c, i) => {
      const cel = row.getCell(i + 1);
      cel.font = { name: FONTE, size: 10, color: { argb: COR.tinta } };
      cel.border = borda();
      cel.alignment = { vertical: 'middle', horizontal: c.num || c.t === 'calc' || c.t === 'tax' ? 'right' : c.k === 'seq' ? 'center' : 'left', indent: c.num || c.t === 'calc' || c.t === 'tax' || c.k === 'seq' ? 0 : 1 };
      if (it.titulo) {
        const cor = CORES_TITULO[(niveis.get(it.id) ?? 1) - 1];
        const letra = 'FF' + cor.letra;
        cel.fill = fill('FF' + cor.fundo);
        cel.font = { name: FONTE, size: 10, bold: true, color: { argb: letra } };
        if (c.k === 'seq') cel.value = it.seq;
        else if (c.k === 'item') cel.value = it.item;
        else if (c.k === 'desc') cel.value = it.desc;
        else if (c.k === 'ger') { cel.value = somaRamo(it.id); cel.numFmt = FMT_BRL; cel.font = { name: FONTE, size: 10, bold: true, italic: true, color: { argb: letra } }; }
        else if (c.k === 'chk') { cel.value = 'Subtotal do grupo'; cel.font = { name: FONTE, size: 8.5, italic: true, color: { argb: letra } }; }
        return;
      }
      if (par) cel.fill = fill(COR.zebra);
      if (c.t === 'tax') {
        const id = idDoTributo(c.k)!;
        if (r.ligados[id]) { cel.value = r.tribs[id] ?? null; cel.numFmt = FMT_BRL; }
        else { cel.value = 0; cel.numFmt = FMT_BRL; cel.font = { name: FONTE, size: 10, color: { argb: COR.cinza } }; }
        cel.fill = fill(par ? 'FFE7ECF0' : COR.calc);
        return;
      }
      if (c.t === 'calc') {
        if (c.k === 'chk') {
          const [cor, fundo] = { OK: [COR.ok, COR.okClaro], INCOMPLETO: [COR.aviso, COR.avisoClaro], ERRO: [COR.erro, COR.erroClaro], TITULO: [COR.cinza, COR.titulo] }[r.chk];
          cel.value = ROT_CHK[r.chk];
          cel.font = { name: FONTE, size: 9, bold: true, color: { argb: cor } };
          cel.fill = fill(fundo);
          cel.alignment = { horizontal: 'center', vertical: 'middle' };
        } else {
          const v = r[c.k as 'base' | 'trib' | 'parc' | 'ger' | 'fnacv' | 'fintv' | 'bdiv'];
          cel.value = v ?? ((c.k === 'fnacv' || c.k === 'fintv' || c.k === 'bdiv') && r.base !== null ? 0 : null);
          cel.numFmt = FMT_BRL;
          cel.fill = fill(par ? 'FFE7ECF0' : COR.calc);
          if (c.k === 'ger') cel.font = { name: FONTE, size: 10, bold: true, color: { argb: COR.tinta } };
        }
        return;
      }
      const v = (it as unknown as Record<string, unknown>)[c.k];
      if (c.k === 'seq') cel.value = it.seq;
      else if (c.k === 'tipo' || c.k === 'orig') cel.value = v ? rotuloOpcao(c.k, String(v)) : null;
      else if (c.k === 'origem') cel.value = nomeOrigem(String(v ?? '')) || null;
      else if (c.k === 'bdi') { const b = bdiDe(d.parametros, it.bdi); cel.value = b ? `${b.nome} (${pctBr(bdiFinal(b))})` : '-'; }
      else if (c.k === 'fnac' || c.k === 'fint') { const f = d.parametros.fretes.find(x => x.id === v); cel.value = f ? `${f.nome}${f.local ? ` · ${f.local}` : ''}` : null; }
      else if (c.num) {
        cel.value = (v as number | null) ?? null;
        cel.numFmt = c.pct ? '0.0%' : c.k === 'preco' ? fmtMoeda(simbolo(it.moeda || 'BRL')) : c.k === 'hh' ? '#,##0' : '#,##0.00';
      } else cel.value = (v as string) || null;
      if (c.k === 'desc') cel.alignment = { ...cel.alignment, wrapText: true };
    });
    if (!it.titulo) par = !par;
    linha++;
  }
  if (!d.itens.length) {
    const v = faixa(linha, 1, N); v.value = 'Esta PX ainda não tem itens.';
    v.font = { name: FONTE, size: 10, italic: true, color: { argb: COR.cinza } };
    linha++;
  }

  // --- linha de total
  const ultimaItem = linha - 1;
  const rt = ws.getRow(linha);
  const somas: Record<string, number> = { bdiv: 0, fnacv: 0, fintv: 0, base: 0, trib: 0, parc: 0, ger: 0 };
  for (const it of d.itens) for (const k of Object.keys(somas)) somas[k] += res.get(it.id)?.[k as 'base'] || 0;
  for (const c of colunas) { const id = idDoTributo(c.k); if (id) somas[c.k] = tot.porTributo[id] || 0; }
  colunas.forEach((c, i) => {
    const cel = rt.getCell(i + 1);
    cel.fill = fill(COR.total);
    cel.font = { name: FONTE, size: 10.5, bold: true, color: { argb: COR.acentoEscuro } };
    cel.border = { top: { style: 'medium', color: { argb: COR.acento } }, bottom: { style: 'medium', color: { argb: COR.acento } } };
    if (c.k === 'desc') cel.value = 'TOTAL';
    if (c.k in somas) { cel.value = somas[c.k]; cel.numFmt = FMT_BRL; cel.alignment = { horizontal: 'right' }; }
    if (c.k === 'chk') {
      cel.value = `${tot.ok} ok · ${tot.inc} incompl. · ${tot.err} erro`;
      cel.font = { name: FONTE, size: 8.5, bold: true, color: { argb: COR.cinza } };
      cel.alignment = { horizontal: 'center' };
    }
  });
  rt.height = 22;

  // --- largura automática de cada coluna pelo conteúdo (números nunca cortados; textos longos quebram linha)
  ajustarLarguras(ws, colunas, H2, linha);

  // --- usabilidade: congelar cabeçalho + colunas até a Descrição, filtro, impressão
  const iDesc = colunas.findIndex(c => c.k === 'desc');
  ws.views = [{ state: 'frozen', xSplit: iDesc >= 0 ? iDesc + 1 : 1, ySplit: H2, showGridLines: false, topLeftCell: ws.getCell(H2 + 1, iDesc + 2).address }];
  ws.autoFilter = { from: { row: H2, column: 1 }, to: { row: Math.max(H2, ultimaItem), column: N } };
  ws.pageSetup = {
    paperSize: 8 as ExcelJS.PaperSize, // A3 (código padrão do Excel; ausente na lista de tipos do ExcelJS)
    orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
    printTitlesRow: `${H1}:${H2}`, horizontalCentered: true,
    margins: { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.25, footer: 0.25 },
  };
  ws.headerFooter = {
    oddFooter: `&L&8${d.px.codigo} · ${revTxt}&C&8Página &P de &N&R&8${d.empresa.replace(/&/g, '&&')}`,
  };
}

// ------------------------------------------------------------------ aba Resumo
function abaResumo(
  wb: ExcelJS.Workbook, d: DadosExportacao, cols: Set<string>, res: Map<string, Resultado>,
  tot: ReturnType<typeof totais>, quando: string, revTxt: string,
) {
  const ws = wb.addWorksheet('Resumo', { views: [{ showGridLines: false }] });
  [12, 52, 10, 20, 20, 10].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  const t = ws.getCell('A1'); t.value = 'RESUMO DA PX';
  t.font = { name: FONTE, size: 16, bold: true, color: { argb: COR.tinta } };
  const s = ws.getCell('A2'); s.value = `${d.px.codigo} · ${d.px.nome} · ${revTxt} · exportado em ${quando}`;
  s.font = { name: FONTE, size: 10, color: { argb: COR.cinza } };
  let linha = 4;
  const itensValidos = d.itens.filter(i => !i.titulo);

  const tabela = (titulo: string, cab: string[], linhas: (string | number | null)[][], fmts: (string | null)[]) => {
    const tt = ws.getCell(linha, 1); tt.value = titulo.toUpperCase();
    tt.font = { name: FONTE, size: 10.5, bold: true, color: { argb: COR.acento } };
    linha++;
    cab.forEach((h, i) => {
      const c = ws.getCell(linha, i + 1); c.value = h;
      c.font = { name: FONTE, size: 9.5, bold: true, color: { argb: COR.branco } };
      c.fill = fill(COR.acentoEscuro); c.border = borda(COR.acentoEscuro);
      c.alignment = { horizontal: fmts[i] ? 'right' : 'left', vertical: 'middle', indent: 1 };
    });
    ws.getRow(linha).height = 20;
    linha++;
    linhas.forEach((l, n) => {
      l.forEach((v, i) => {
        const c = ws.getCell(linha, i + 1); c.value = v;
        c.font = { name: FONTE, size: 10, color: { argb: COR.tinta } }; c.border = borda();
        if (n % 2) c.fill = fill(COR.zebra);
        if (fmts[i]) { c.numFmt = fmts[i]!; c.alignment = { horizontal: 'right' }; } else c.alignment = { indent: 1 };
      });
      linha++;
    });
    linha += 2;
  };
  const pct = (v: number) => (tot.ger ? v / tot.ger : 0);

  // por grupo (títulos com recuo por nível, somando os subníveis)
  const grupos = gruposPorTitulo(d.itens);
  const ramo = ramos(d.itens);
  const titulos = d.itens.filter(i => i.titulo);
  const nivelBase = Math.min(...titulos.map(t => (t.item.match(/\./g) ?? []).length), 9);
  const porGrupo = titulos.map(ti => {
    const r = ramo(ti.id);
    const membros = itensValidos.filter(i => r.has(grupos.get(i.id) ?? ''));
    const v = membros.reduce((s2, i) => s2 + (res.get(i.id)?.ger || 0), 0);
    const nivel = Math.max(0, (ti.item.match(/\./g) ?? []).length - nivelBase);
    return [ti.item, '   '.repeat(nivel) + (ti.desc || 'Título sem nome'), membros.length, v, pct(v)];
  });
  const semGrupo = itensValidos.filter(i => !grupos.get(i.id));
  if (semGrupo.length) {
    const v = semGrupo.reduce((s2, i) => s2 + (res.get(i.id)?.ger || 0), 0);
    porGrupo.push(['', '(itens antes do primeiro título)', semGrupo.length, v, pct(v)]);
  }
  if (porGrupo.length) tabela('Por grupo (títulos da PQ)', ['Item PQ', 'Grupo', 'Itens', 'Total bruto (R$)', '%'], porGrupo, [null, null, '0', FMT_BRL, '0.0%']);

  const agrupar = (chave: (i: Item) => string, nome: (k: string) => string, titulo: string, rot: string, semRotulo = '(não classificado)', rotuloChave?: (k: string) => string) => {
    const m = new Map<string, { n: number; v: number; liq: number }>();
    for (const it of itensValidos) {
      const k = chave(it) || '';
      const a = m.get(k) ?? { n: 0, v: 0, liq: 0 };
      a.n++; a.v += res.get(it.id)?.ger || 0; a.liq += res.get(it.id)?.liq || 0;
      m.set(k, a);
    }
    const linhas = [...m.entries()].sort((a, b) => b[1].v - a[1].v)
      .map(([k, a]) => [k ? (rotuloChave ? rotuloChave(k) : k) : '—', k ? nome(k) : semRotulo, a.n, a.liq, a.v, pct(a.v)]);
    if (linhas.length) tabela(titulo, [rot, 'Descrição', 'Itens', 'Total líquido (R$)', 'Total bruto (R$)', '%'], linhas, [null, null, '0', FMT_BRL, FMT_BRL, '0.0%']);
  };
  const padrao = (k: string, p: string) => (cols.has(k) ? '' : p);
  agrupar(i => i.tipo || padrao('tipo', 'F'), k => OPCOES.tipo.find(([c]) => c === k)?.[1] ?? 'inválido', 'Por tipo de trabalho', 'Tipo');
  agrupar(i => i.orig || padrao('orig', 'N'), k => OPCOES.orig.find(([c]) => c === k)?.[1] ?? 'inválido', 'Por natureza', 'Natureza');
  if (cols.has('bdi')) {
    // chave = id do BDI; 1ª coluna mostra o BDI final (%), 2ª o nome
    agrupar(i => bdiDe(d.parametros, i.bdi)?.id ?? '', k => bdiDe(d.parametros, k)?.nome ?? '', 'Por BDI', 'BDI final', 'sem BDI (-)',
      k => { const b = bdiDe(d.parametros, k); return b ? pctBr(bdiFinal(b)) : ''; });
  }
  if (cols.has('origem')) {
    const m = calcularMaturidade(d.itens, res), ad = aderencia(m.pct, d.classe);
    tabela('Maturidade da PX', ['Fase', 'Classe AACE', '% do valor com preço firme', 'Meta de cotações firmes', 'Situação'],
      [[d.fase || '(não informada)', d.classe ? `Classe ${d.classe}` : '(não informada)', m.pct, d.classe ? faixaTxt(CLASSES[d.classe].meta) : '—',
        ad ? ROTULO_ADERENCIA[ad] : d.classe ? 'sem valores' : 'informe a classe do projeto']],
      [null, null, '0.0%', null, null]);
    agrupar(i => (ORIGENS.some(o => o.k === i.origem) ? i.origem : ''), k => nomeOrigem(k), 'Por origem do preço', 'Origem', 'sem origem informada',
      k => ORIGENS.find(o => o.k === k)?.curto ?? k);
  }
  agrupar(i => i.moeda || padrao('moeda', 'BRL'), k => d.moedas.find(m => m.codigo === k)?.nome ?? 'sem cadastro', 'Por moeda', 'Moeda');

  const tt = ws.getCell(linha, 1); tt.value = 'TOTAL GERAL BRUTO (R$)';
  tt.font = { name: FONTE, size: 10.5, bold: true, color: { argb: COR.acentoEscuro } };
  const tv = ws.getCell(linha, 4); tv.value = tot.ger; tv.numFmt = FMT_BRL;
  tv.font = { name: FONTE, size: 12, bold: true, color: { argb: COR.acentoEscuro } };
  ws.pageSetup = { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
}

// ------------------------------------------------------------------ aba Parâmetros
function abaParametros(wb: ExcelJS.Workbook, d: DadosExportacao, quando: string) {
  const ws = wb.addWorksheet('Parâmetros', { views: [{ showGridLines: false }] });
  [18, 40, 12, 26].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  const t = ws.getCell('A1'); t.value = 'PARÂMETROS USADOS NO CÁLCULO';
  t.font = { name: FONTE, size: 16, bold: true, color: { argb: COR.tinta } };
  const s = ws.getCell('A2'); s.value = `${d.empresa} · exportado em ${quando}`;
  s.font = { name: FONTE, size: 10, color: { argb: COR.cinza } };
  let linha = 4;
  const bloco = (titulo: string, cab: string[], linhas: (string | number | null)[][], fmts: (string | null)[]) => {
    const tt = ws.getCell(linha, 1); tt.value = titulo.toUpperCase();
    tt.font = { name: FONTE, size: 10.5, bold: true, color: { argb: COR.acento } };
    linha++;
    cab.forEach((h, i) => {
      const c = ws.getCell(linha, i + 1); c.value = h;
      c.font = { name: FONTE, size: 9.5, bold: true, color: { argb: COR.branco } };
      c.fill = fill(COR.acentoEscuro); c.border = borda(COR.acentoEscuro); c.alignment = { indent: 1 };
    });
    linha++;
    linhas.forEach(l => {
      l.forEach((v, i) => {
        const c = ws.getCell(linha, i + 1); c.value = v; c.border = borda();
        c.font = { name: FONTE, size: 10, color: { argb: COR.tinta } };
        if (fmts[i]) { c.numFmt = fmts[i]!; c.alignment = { horizontal: 'right' }; } else c.alignment = { indent: 1 };
      });
      linha++;
    });
    linha += 2;
  };
  bloco('Moedas e câmbio', ['Código', 'Nome', 'Símbolo', 'Câmbio (R$)'],
    d.moedas.map(m => [m.codigo, m.nome, m.simbolo, m.cambio_brl ?? 'sem câmbio']), [null, null, null, '#,##0.0000']);
  const sim = (v: boolean) => (v ? 'sim' : '—');
  const CRIT = { valor: 'Valor por linha', percentual: '% do valor líquido' };
  for (const tipo of ['nacional', 'internacional'] as const) {
    const fs = d.parametros.fretes.filter(f => f.tipo === tipo);
    bloco(`Fretes ${tipo === 'nacional' ? 'nacionais' : 'internacionais'}`, ['Frete', tipo === 'nacional' ? 'UF' : 'País', 'Critério', 'Valor'],
      fs.length ? fs.map(f => [f.nome, f.local, CRIT[f.criterio], f.criterio === 'percentual' ? f.valor : f.valor]) : [['(nenhum)', '', '', null]],
      [null, null, null, null]);
    // formato por linha: percentual ou moeda do frete
    fs.forEach((f, i) => { const c = ws.getCell(linha - 2 - fs.length + i, 4); c.numFmt = f.criterio === 'percentual' ? '0.00%' : fmtMoeda(d.moedas.find(m => m.codigo === f.moeda)?.simbolo ?? f.moeda); });
  }
  const usados = new Set(d.itens.filter(i => !i.titulo && i.bdi).map(i => i.bdi));
  const bdisUsados = d.parametros.bdis.filter(b => usados.has(b.id));
  bloco('BDIs usados nesta PX', ['BDI', 'Composição', 'BDI final', 'Linhas'],
    bdisUsados.length
      ? bdisUsados.map(b => [b.nome, composicaoBdi(b), bdiFinal(b), d.itens.filter(i => !i.titulo && i.bdi === b.id).length])
      : [['(nenhum)', '', null, null]], [null, null, '0.00%', '0']);
  if (bdisUsados.length) {
    const nb = ws.getCell(linha - 2, 1);
    nb.value = 'BDI = (1 + AC + S + G + R + parcelas personalizadas) × (1 + DF) × (1 + L) − 1 (sem tributos: eles são calculados à parte em cada linha).';
    nb.font = { name: FONTE, size: 9, italic: true, color: { argb: COR.cinza } };
  }
  bloco('Tributos', ['Tributo', 'Aplica-se a', 'Alíquota', 'Forn. / Serv. / Nac. / Imp.'],
    d.parametros.tributos.length
      ? d.parametros.tributos.map(t => [t.nome,
          [t.fornecimento && 'fornecimento', t.servico && 'serviço'].filter(Boolean).join(' e ') + ' · ' + [t.nacional && 'nacional', t.importado && 'importado'].filter(Boolean).join(' e '),
          t.aliquota, [t.fornecimento, t.servico, t.nacional, t.importado].map(sim).join(' / ')])
      : [['(nenhum)', '', null, '']], [null, null, '0.00%', null]);
  const n = ws.getCell(linha, 1);
  n.value = 'Líquido = quantidade × preço × câmbio. Base = líquido × (1 + BDI da linha) + fretes. Parcial = base ÷ (1 − soma das alíquotas ligadas na linha). Cada tributo = parcial × sua alíquota. Total geral = parcial × (1 + provisão). Cada linha pode ligar ou desligar tributos.';
  n.font = { name: FONTE, size: 9, italic: true, color: { argb: COR.cinza } };
}

const pctBr = (f: number) => (f * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
/** "AC 4,00% · S 0,40% · … · L 7,40%" (só as parcelas preenchidas) */
function composicaoBdi(b: Bdi): string {
  const partes: [string, number][] = [['AC', b.administracao], ['S', b.seguros], ['G', b.garantias], ['R', b.riscos],
    ...b.extras.map(e => [e.nome, e.pct] as [string, number]), ['DF', b.financeiras], ['L', b.lucro]];
  return partes.filter(([, v]) => v).map(([n, v]) => `${n} ${pctBr(v)}`).join(' · ') || 'sem parcelas';
}

/** Texto que o Excel mostra na célula (aproximado), para medir a largura. */
function textoExibido(cel: ExcelJS.Cell): string {
  const v = cel.value;
  if (v === null || v === undefined) return '';
  if (typeof v !== 'number') return String(v);
  const fmt = cel.numFmt || '';
  if (fmt.includes('%')) { const d = (/0\.(0+)%/.exec(fmt)?.[1] ?? '').length; return (v * 100).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) + '%'; }
  const prefixo = /^"([^"]*)"/.exec(fmt)?.[1] ?? '';
  const d = (/\.(0+)/.exec(fmt)?.[1] ?? '').length;
  return prefixo + v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
}

/**
 * Largura de cada coluna (unidades do Excel ≈ caracteres) pelo maior conteúdo, com limites.
 * Números: sempre cabem. Textos acima do limite: quebram linha. Cabeçalho pode ocupar 2 linhas.
 */
function ajustarLarguras(ws: ExcelJS.Worksheet, colunas: Coluna[], linhaCab: number, ultima: number) {
  colunas.forEach((c, i) => {
    const col = i + 1;
    const numero = c.num || c.t === 'calc' || c.t === 'tax' || c.k === 'seq';
    const palavras = c.h.split(/\s+/);
    const cab = Math.max(Math.max(...palavras.map(w => w.length)), Math.ceil(c.h.length / 2)) * 1.1 + 2;
    let maior = 0;
    for (let r = linhaCab + 1; r <= ultima; r++) {
      const cel = ws.getCell(r, col);
      const t = textoExibido(cel);
      const peso = cel.font?.bold ? 1.12 : 1;
      maior = Math.max(maior, t.length * peso);
    }
    const max = c.k === 'desc' ? 60 : numero ? 40 : 36;
    const min = c.k === 'seq' ? 5 : c.k === 'desc' ? 30 : 7;
    const w = Math.min(Math.max(maior * 1.08 + 3, cab, min), Math.max(max, cab));
    ws.getColumn(col).width = Math.round(w * 10) / 10;
    // texto maior que a coluna: quebra linha na própria célula
    if (!numero) for (let r = linhaCab + 1; r <= ultima; r++) {
      const cel = ws.getCell(r, col);
      if (textoExibido(cel).length * 1.08 + 3 > w) cel.alignment = { ...cel.alignment, wrapText: true, vertical: 'middle' };
    }
  });
}

/** Nome do arquivo: <código>_Rev<n>.xlsx, sem caracteres inválidos. */
export const nomeArquivo = (codigo: string, rev: number) => `${codigo.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'PX'}_Rev${rev}.xlsx`;
