/**
 * Código da PX no padrão da empresa (mesma regra da função montar_codigo_px do banco).
 * Marcadores: {seq} / {seq:N} (sequencial com N dígitos, padrão 4), {ano}, {campo:Nome}.
 */
export const PADRAO_INICIAL = 'PX-{seq:4}';

/** Nomes dos campos {campo:Nome} do padrão, na ordem, sem repetir. */
export function camposDoPadrao(padrao: string): string[] {
  return [...new Set([...padrao.matchAll(/\{campo:([^}]+)\}/g)].map(m => m[1]))];
}

export const limparValor = (v: string) => v.replace(/[^A-Za-z0-9._-]/g, '').toUpperCase();

export function montarCodigo(padrao: string, seq: number, campos: Record<string, string>, ano = new Date().getFullYear()): string {
  return padrao
    .replace(/\{seq(?::(\d))?\}/g, (_, n) => String(seq).padStart(Number(n ?? 4), '0'))
    .replace(/\{ano\}/g, String(ano))
    .replace(/\{campo:([^}]+)\}/g, (_, nome: string) => limparValor(campos[nome] ?? '') || 'X');
}

/** Problemas no padrão digitado pelo administrador (lista vazia = válido). */
export function validarPadrao(padrao: string): string[] {
  const erros: string[] = [];
  if (!padrao.trim()) erros.push('O padrão não pode ficar vazio.');
  if (padrao.length > 120) erros.push('O padrão pode ter no máximo 120 caracteres.');
  if (!/\{seq(:\d)?\}/.test(padrao)) erros.push('Inclua o número sequencial {seq} ou {seq:4}, para os códigos nunca se repetirem.');
  const sobra = padrao.replace(/\{seq(:\d)?\}|\{ano\}|\{campo:[^}]+\}/g, '');
  if (/[{}]/.test(sobra)) erros.push('Há chaves { } que não formam um marcador válido.');
  return erros;
}

// ---------------------------------------------------------------------------
// Montador visual: o padrão como lista de partes unidas por um separador
// ---------------------------------------------------------------------------
export type Parte =
  | { tipo: 'texto'; valor: string }
  | { tipo: 'campo'; nome: string }
  | { tipo: 'seq'; digitos: number }
  | { tipo: 'ano' };

export const SEPARADORES = ['-', '_', '.', '/', ''] as const;

function parteParaTexto(p: Parte): string {
  switch (p.tipo) {
    case 'texto': return p.valor.replace(/[{}]/g, '');
    case 'campo': return `{campo:${p.nome.replace(/[{}:]/g, '').trim()}}`;
    case 'seq': return `{seq:${Math.min(9, Math.max(1, p.digitos))}}`;
    case 'ano': return '{ano}';
  }
}

export const partesParaPadrao = (partes: Parte[], sep: string) => partes.map(parteParaTexto).join(sep);

/**
 * Converte um padrão em partes. Funciona quando todas as partes estão unidas pelo mesmo separador;
 * caso contrário devolve null (o padrão só pode ser editado no modo avançado).
 */
export function padraoParaPartes(padrao: string): { partes: Parte[]; sep: string } | null {
  for (const sep of SEPARADORES) {
    const pedacos = sep ? padrao.split(sep) : tokens(padrao);
    if (!pedacos.every(p => p.length)) continue;
    const partes = pedacos.map(paraParte);
    if (partes.some(p => p === null)) continue;
    if (partesParaPadrao(partes as Parte[], sep) === padrao) return { partes: partes as Parte[], sep };
  }
  return null;
}

const tokens = (padrao: string) => padrao.match(/\{[^}]+\}|[^{]+/g) ?? [];

function paraParte(t: string): Parte | null {
  let m: RegExpMatchArray | null;
  if ((m = t.match(/^\{seq(?::(\d))?\}$/))) return { tipo: 'seq', digitos: Number(m[1] ?? 4) };
  if (t === '{ano}') return { tipo: 'ano' };
  if ((m = t.match(/^\{campo:([^}]+)\}$/))) return { tipo: 'campo', nome: m[1] };
  if (/[{}]/.test(t)) return null;
  return { tipo: 'texto', valor: t };
}
