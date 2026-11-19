/** Leitura de .xlsx com ExcelJS, convertendo cada aba numa Matriz para interpretar(). */
import type ExcelJS from 'exceljs';

/** Carrega o ExcelJS sob demanda (é grande; não precisa estar na abertura do site). */
async function novoWorkbook() {
  const mod = await import('exceljs');
  const E = (mod.default ?? mod) as typeof ExcelJS;
  return new E.Workbook();
}
import { chaveDoCabecalho, interpretar, type Celula, type Matriz, type Planilha } from './pq';

function valorBruto(v: ExcelJS.CellValue): unknown {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    if (v instanceof Date) return v;
    if ('result' in v) return (v as ExcelJS.CellFormulaValue).result ?? '';        // fórmula
    if ('richText' in v) return (v as ExcelJS.CellRichTextValue).richText.map(t => t.text).join('');
    if ('text' in v) return (v as ExcelJS.CellHyperlinkValue).text;
    if ('error' in v) return '';
  }
  return v;
}

function textoExibido(cell: ExcelJS.Cell, bruto: unknown): string {
  if (typeof bruto === 'number') {
    // respeita a formatação brasileira para a dedução de decimais
    const casas = /0[.,](0+)/.exec(cell.numFmt || '')?.[1]?.length;
    return casas !== undefined
      ? bruto.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
      : String(bruto).replace('.', ',');
  }
  if (bruto instanceof Date) return bruto.toLocaleDateString('pt-BR');
  return String(bruto ?? '');
}

export function matrizDaAba(ws: ExcelJS.Worksheet): Matriz {
  const m: Matriz = [];
  ws.eachRow({ includeEmpty: true }, (row, r) => {
    const linha: Celula[] = [];
    row.eachCell({ includeEmpty: true }, (cell, c) => {
      const raw = valorBruto(cell.value);
      linha[c - 1] = { txt: textoExibido(cell, raw), raw };
    });
    for (let i = 0; i < linha.length; i++) linha[i] ??= { txt: '', raw: '' };
    m[r - 1] = linha;
  });
  for (let i = 0; i < m.length; i++) m[i] ??= [];
  return m;
}

export interface AbaLida { nome: string; planilha: Planilha }

/** Lê todas as abas com itens, da que tem mais itens para a que tem menos. */
export async function lerExcel(buf: ArrayBuffer): Promise<AbaLida[]> {
  const wb = await novoWorkbook();
  await wb.xlsx.load(buf);
  const abas = wb.worksheets
    .map(ws => ({ nome: ws.name, planilha: interpretar(matrizDaAba(ws)) }))
    .filter(a => a.planilha.linhas.length);
  return abas.sort((a, b) => b.planilha.linhas.length - a.planilha.linhas.length);
}

/** Colunas reconhecidas no cabeçalho de um arquivo de modelo (pode não ter nenhum item). */
export async function colunasDoModelo(buf: ArrayBuffer): Promise<string[]> {
  const wb = await novoWorkbook();
  await wb.xlsx.load(buf);
  let melhor: string[] = [];
  for (const ws of wb.worksheets) {
    const m = matrizDaAba(ws);
    for (let r = 0; r < Math.min(40, m.length); r++) {
      const ks = [...new Set(m[r].map(c => chaveDoCabecalho(c.txt)).filter((k): k is string => !!k))];
      if (ks.length > melhor.length) melhor = ks;
    }
  }
  return melhor;
}
