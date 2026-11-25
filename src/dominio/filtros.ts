/**
 * Filtros por coluna da grade da PX (como no Excel).
 * - Lista de valores: mostra só as linhas cujo valor exibido está marcado ('' = "(Vazias)").
 * - Condição de texto: contém, começa com, termina com, é igual a (sem diferenciar maiúsculas e acentos).
 * - Condição de número: igual, maior, menor, entre, 10 maiores, acima da média.
 * Filtros de colunas diferentes se somam (E). A ordem das linhas nunca muda.
 * Títulos-pai dos itens que sobram continuam visíveis (contexto).
 */
import { bdiFinal } from './calculo';
import { OPCOES, idDoTributo, type Coluna } from './colunas';
import { nomeOrigem } from './maturidade';
import { normTxt } from './normalizacao';
import type { Bdi, Frete, Item, Resultado } from './tipos';

export type OpTexto = 'contem' | 'comeca' | 'termina' | 'igual';
export type OpNumero = 'igual' | 'maior' | 'menor' | 'entre' | 'top10' | 'acimaMedia';
export type FiltroColuna =
  | { tipo: 'valores'; valores: string[] }
  | { tipo: 'texto'; op: OpTexto; valor: string }
  | { tipo: 'numero'; op: OpNumero; a?: number; b?: number };
export type Filtros = Record<string, FiltroColuna>;

export const NOME_OP_TEXTO: Record<OpTexto, string> = { contem: 'contém', comeca: 'começa com', termina: 'termina com', igual: 'é igual a' };
export const NOME_OP_NUMERO: Record<OpNumero, string> = {
  igual: 'é igual a', maior: 'é maior que', menor: 'é menor que', entre: 'está entre', top10: '10 maiores valores', acimaMedia: 'acima da média',
};

export interface ContextoFiltro {
  res: Map<string, Resultado>;
  moedas: { codigo: string; nome: string; simbolo: string }[];
  fretes: Frete[];
  bdis: Bdi[];
}

const nf = (n: number, d: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const ROT_CHK = { OK: 'OK', INCOMPLETO: 'Incompleto', ERRO: 'Erro de classificação', TITULO: 'Título' } as const;

/** A coluna é filtrada como número? */
export const colunaNumerica = (c: Coluna) => c.k === 'seq' || !!c.num || c.t === 'tax' || (c.t === 'calc' && c.k !== 'chk');

/** Valor numérico da célula (para condições de número). */
export function valorNumerico(c: Coluna, it: Item, cx: ContextoFiltro): number | null {
  if (c.k === 'seq') return it.seq;
  const r = cx.res.get(it.id);
  if (c.t === 'tax') { const id = idDoTributo(c.k)!; return r ? (r.ligados[id] ? r.tribs[id] ?? null : 0) : null; }
  if (c.t === 'calc') { const v = r ? (r as unknown as Record<string, number | null>)[c.k] : null; return v ?? null; }
  const v = (it as unknown as Record<string, unknown>)[c.k];
  return v === null || v === undefined || v === '' ? null : Number(v);
}

/** Texto que a célula mostra (para a lista de valores e as condições de texto). '' = vazia. */
export function valorExibido(c: Coluna, it: Item, cx: ContextoFiltro): string {
  const v = (it as unknown as Record<string, unknown>)[c.k];
  if (c.k === 'chk') { const r = cx.res.get(it.id); return r ? ROT_CHK[r.chk] : ''; }
  if (c.k === 'tipo' || c.k === 'orig') { const o = OPCOES[c.k].find(([k]) => k === v); return o ? `(${o[0]}) ${o[1]}` : String(v ?? ''); }
  if (c.k === 'origem') return nomeOrigem(String(v ?? ''));
  if (c.k === 'moeda') { const m = cx.moedas.find(x => x.codigo === v); return m ? `${m.nome} (${m.simbolo})` : String(v ?? ''); }
  if (c.k === 'fnac' || c.k === 'fint') { const f = cx.fretes.find(x => x.id === v); return f ? `${f.nome}${f.local ? ` · ${f.local}` : ''}` : ''; }
  if (c.k === 'bdi') { const b = cx.bdis.find(x => x.id === v); return b ? `${b.nome} (${nf(bdiFinal(b) * 100, 2)}%)` : ''; }
  if (colunaNumerica(c)) {
    const n = valorNumerico(c, it, cx);
    if (n === null || Number.isNaN(n)) return '';
    if (c.k === 'seq') return String(n);
    if (c.pct) return nf(n * 100, 1) + '%';
    return nf(n, c.dec ?? 2);
  }
  return String(v ?? '').trim();
}

/** Lista de valores distintos de uma coluna, com quantas linhas têm cada um (na ordem em que aparecem). */
export function valoresDaColuna(c: Coluna, itens: Item[], cx: ContextoFiltro): { valor: string; n: number }[] {
  const m = new Map<string, number>();
  for (const it of itens) if (!it.titulo) { const v = valorExibido(c, it, cx); m.set(v, (m.get(v) || 0) + 1); }
  const lista = [...m.entries()].map(([valor, n]) => ({ valor, n }));
  const num = colunaNumerica(c);
  return lista.sort((a, b) => {
    if (a.valor === '' || b.valor === '') return a.valor === '' ? 1 : -1;   // "(Vazias)" no fim
    if (num) return parseFloat(a.valor.replace(/\./g, '').replace(',', '.')) - parseFloat(b.valor.replace(/\./g, '').replace(',', '.'));
    return a.valor.localeCompare(b.valor, 'pt-BR', { numeric: true });
  });
}

/** Função que diz se um item passa no filtro desta coluna (pré-calcula 10 maiores e média). */
function testador(c: Coluna, f: FiltroColuna, itens: Item[], cx: ContextoFiltro): (it: Item) => boolean {
  if (f.tipo === 'valores') { const s = new Set(f.valores); return it => s.has(valorExibido(c, it, cx)); }
  if (f.tipo === 'texto') {
    const q = normTxt(f.valor);
    return it => {
      const v = normTxt(valorExibido(c, it, cx));
      return f.op === 'contem' ? v.includes(q) : f.op === 'comeca' ? v.startsWith(q) : f.op === 'termina' ? v.endsWith(q) : v === q;
    };
  }
  const nums = itens.filter(i => !i.titulo).map(i => valorNumerico(c, i, cx)).filter((n): n is number => n !== null && !Number.isNaN(n));
  if (f.op === 'top10') {
    const corte = [...nums].sort((a, b) => b - a)[Math.min(9, nums.length - 1)] ?? Infinity;
    return it => { const n = valorNumerico(c, it, cx); return n !== null && n >= corte; };
  }
  if (f.op === 'acimaMedia') {
    const media = nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : Infinity;
    return it => { const n = valorNumerico(c, it, cx); return n !== null && n > media; };
  }
  const a = f.a ?? 0, b = f.b ?? 0, eps = 0.005;
  return it => {
    const n = valorNumerico(c, it, cx);
    if (n === null) return false;
    return f.op === 'igual' ? Math.abs(n - a) < eps : f.op === 'maior' ? n > a : f.op === 'menor' ? n < a : n >= Math.min(a, b) - eps && n <= Math.max(a, b) + eps;
  };
}

/** Título → títulos acima dele (pela numeração do Item PQ: 1.1.2 está dentro de 1.1 e de 1). */
function ancestrais(titulos: Item[]): Map<string, string[]> {
  const limpa = (s: string) => s.trim().replace(/\.+$/, '');
  const out = new Map<string, string[]>();
  for (const t of titulos) {
    const n = limpa(t.item);
    out.set(t.id, n ? titulos.filter(o => o.id !== t.id && limpa(o.item) && n.startsWith(limpa(o.item) + '.')).map(o => o.id) : []);
  }
  return out;
}

/**
 * Aplica os filtros (só os das colunas informadas). Devolve o conjunto de ids visíveis, ou null se não há filtro.
 * Itens: passam em todos os filtros. Títulos: aparecem se algum item visível está dentro deles (ou de um subnível).
 */
export function aplicarFiltros(itens: Item[], filtros: Filtros, colunas: Coluna[], cx: ContextoFiltro): Set<string> | null {
  const ativos = colunas.filter(c => filtros[c.k]).map(c => testador(c, filtros[c.k], itens, cx));
  if (!ativos.length) return null;
  const vis = new Set<string>();
  const titulos = itens.filter(i => i.titulo);
  const acima = ancestrais(titulos);
  let tituloAtual: string | null = null;
  for (const it of itens) {
    if (it.titulo) { tituloAtual = it.id; continue; }
    if (ativos.every(t => t(it))) {
      vis.add(it.id);
      if (tituloAtual) { vis.add(tituloAtual); for (const a of acima.get(tituloAtual) ?? []) vis.add(a); }
    }
  }
  return vis;
}

/** Resumo curto do filtro para a etiqueta: "C, M", "começa com 1.1", "entre 10.000 e 50.000". */
export function resumoFiltro(f: FiltroColuna): string {
  if (f.tipo === 'valores') {
    const nomes = f.valores.map(v => v || '(Vazias)');
    return nomes.length > 3 ? `${nomes.slice(0, 3).join(', ')} +${nomes.length - 3}` : nomes.join(', ') || '(nenhum)';
  }
  if (f.tipo === 'texto') return `${NOME_OP_TEXTO[f.op]} ${f.valor}`;
  const n = (x?: number) => nf(x ?? 0, Number.isInteger(x ?? 0) ? 0 : 2);
  if (f.op === 'entre') return `entre ${n(f.a)} e ${n(f.b)}`;
  if (f.op === 'top10' || f.op === 'acimaMedia') return NOME_OP_NUMERO[f.op];
  return `${NOME_OP_NUMERO[f.op]} ${n(f.a)}`;
}
