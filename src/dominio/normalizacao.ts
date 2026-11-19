/** Remove acentos, baixa a caixa e junta espaços. */
export const normTxt = (s: unknown) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

const base = (v: unknown) =>
  String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[()]/g, '').trim();

export function normTipo(v: unknown): string {
  const n = base(v);
  if (!n) return '';
  if (/^F\b|^FORN/.test(n)) return 'F';
  if (/^C\b|^CONSTR/.test(n)) return 'C';
  if (/^S\b|^SERV/.test(n)) return 'S';
  if (/^T\b|^TURN/.test(n)) return 'T';
  if (/^M\b|^MONT/.test(n)) return 'M';
  return n;
}

export function normOrig(v: unknown): string {
  const n = base(v);
  if (!n) return '';
  if (/^N\b|^NAC/.test(n)) return 'N';
  if (/^I\b|^IMP/.test(n)) return 'I';
  return n;
}

export function normMoeda(v: unknown): string {
  const n = normTxt(v).toUpperCase();
  if (!n) return '';
  if (/^(R\$|BRL|REAL|REAIS)$/.test(n)) return 'BRL';
  if (/^(US\$|U\$|USD|DOLAR|DOLARES|\$)$/.test(n)) return 'USD';
  if (/^(€|EUR|EURO|EUROS)$/.test(n)) return 'EUR';
  return n;
}

/** Número no formato brasileiro ("1.234,56") ou internacional ("1234.56"). */
export function parseNum(str: unknown): number {
  let v = String(str ?? '').trim();
  if (!v) return NaN;
  if (v.includes(',')) v = v.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(v)) v = v.replace(/\./g, '');
  return parseFloat(v);
}

/** Chave canônica de pacote: ignora zeros à esquerda, caixa e símbolos ("serv civ 001" = "SERV-CIV-1"). */
export function chavePacote(code: unknown): string {
  if (!code) return '';
  const t = String(code).normalize('NFKD').replace(/[̀-ͯ]/g, '').toUpperCase().match(/[A-Z]+|[0-9]+/g);
  return t ? t.map(x => (/^[0-9]+$/.test(x) ? x.replace(/^0+(?=.)/, '') : x)).join('|') : '';
}

export const vazio = (v: unknown) =>
  v === '' || v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v));
