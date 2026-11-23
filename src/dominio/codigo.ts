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
