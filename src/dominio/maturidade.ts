/**
 * Maturidade da PX: quanto do valor tem preço firme (contrato/pedido emitido ou cotação firme de fornecedor),
 * comparado com a meta de cotações firmes da classe AACE do projeto.
 */
import { normTxt } from './normalizacao';
import type { Item, Resultado } from './tipos';

/** Origens do preço, da mais firme para a menos firme. */
export const ORIGENS = [
  { k: 'contrato', nome: 'Contrato ou pedido de compra emitido', curto: 'Contrato/pedido', cor: '#084f55', firme: true },
  { k: 'firme', nome: 'Cotação firme de fornecedor', curto: 'Cotação firme', cor: '#1f8a92', firme: true },
  { k: 'orcamentaria', nome: 'Cotação orçamentária', curto: 'Orçamentária', cor: '#6fb8bd', firme: false },
  { k: 'cpu', nome: 'Composição de preços unitários', curto: 'CPU', cor: '#a8d3d6', firme: false },
  { k: 'historico', nome: 'Histórico de projetos anteriores', curto: 'Histórico', cor: '#c9b896', firme: false },
  { k: 'benchmark', nome: 'Benchmark de mercado', curto: 'Benchmark', cor: '#ddd0b8', firme: false },
  { k: 'parametrica', nome: 'Estimativa paramétrica', curto: 'Paramétrica', cor: '#ebe3d3', firme: false },
] as const;
export const SEM_ORIGEM = { k: '', nome: 'Sem origem informada', curto: 'Sem origem', cor: '#f2c9c4', firme: false } as const;
export const nomeOrigem = (k: string) => ORIGENS.find(o => o.k === k)?.nome ?? '';

/** Classes AACE: maturidade do projeto (informativa) e meta de cotações firmes (frações). */
export const CLASSES: Record<number, { maturidade: [number, number]; meta: [number, number] }> = {
  5: { maturidade: [0, 0.02], meta: [0, 0] },
  4: { maturidade: [0.01, 0.15], meta: [0, 0.2] },
  3: { maturidade: [0.1, 0.4], meta: [0.4, 0.6] },
  2: { maturidade: [0.3, 0.75], meta: [0.7, 0.9] },
  1: { maturidade: [0.65, 1], meta: [0.9, 1] },
};

export type Aderencia = 'muito_abaixo' | 'abaixo' | 'dentro' | 'acima';
export const ROTULO_ADERENCIA: Record<Aderencia, string> = {
  muito_abaixo: 'Muito abaixo da meta', abaixo: 'Abaixo da meta', dentro: 'Dentro da meta', acima: 'Acima da meta',
};

export interface Maturidade {
  total: number;                       // Total geral considerado (R$)
  firme: number;                       // parte com preço firme (R$)
  pct: number | null;                  // firme ÷ total (null se total = 0)
  porOrigem: Record<string, number>;   // R$ por origem ('' = sem origem)
  linhas: number;                      // itens considerados
  semOrigem: number;                   // itens sem origem
}

/** Soma o Total geral por origem (só itens calculados; títulos e linhas sem valor ficam de fora). */
export function calcularMaturidade(itens: Item[], res: Map<string, Resultado>): Maturidade {
  const m: Maturidade = { total: 0, firme: 0, pct: null, porOrigem: {}, linhas: 0, semOrigem: 0 };
  for (const it of itens) {
    if (it.titulo) continue;
    const v = res.get(it.id)?.ger;
    if (!v) continue;
    const k = ORIGENS.some(o => o.k === it.origem) ? it.origem : '';
    m.total += v; m.linhas++;
    if (!k) m.semOrigem++;
    m.porOrigem[k] = (m.porOrigem[k] || 0) + v;
    if (ORIGENS.find(o => o.k === k)?.firme) m.firme += v;
  }
  m.pct = m.total > 0 ? m.firme / m.total : null;
  return m;
}

/**
 * Aderência à meta da classe. Abaixo da meta por mais de 20 pontos = "muito abaixo".
 * Sem classe informada ou sem valor: null.
 */
export function aderencia(pct: number | null, classe: number | null | undefined): Aderencia | null {
  if (pct === null || !classe || !CLASSES[classe]) return null;
  const [min, max] = CLASSES[classe].meta, eps = 1e-9;
  if (pct < min - 0.2 - eps) return 'muito_abaixo';
  if (pct < min - eps) return 'abaixo';
  if (pct > max + eps) return 'acima';
  return 'dentro';
}

/** Converte o texto de uma planilha em origem do preço (pelo nome completo, curto ou palavras-chave). */
export function normOrigem(txt: string): string {
  const t = normTxt(txt);
  if (!t) return '';
  const o = ORIGENS.find(x => normTxt(x.nome) === t || normTxt(x.curto) === t || x.k === t);
  if (o) return o.k;
  if (/contrato|pedido/.test(t)) return 'contrato';
  if (/firme/.test(t)) return 'firme';
  if (/orcament/.test(t)) return 'orcamentaria';
  if (/composic|cpu/.test(t)) return 'cpu';
  if (/historic/.test(t)) return 'historico';
  if (/benchmark|mercado/.test(t)) return 'benchmark';
  if (/parametr/.test(t)) return 'parametrica';
  return '';
}

export const pctTxt = (f: number, d = 0) => (f * 100).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) + '%';
export const faixaTxt = ([a, b]: [number, number]) => (a === b ? pctTxt(a) : `${pctTxt(a)} a ${pctTxt(b)}`);
