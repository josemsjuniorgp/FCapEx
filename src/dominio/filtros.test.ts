import { describe, expect, it } from 'vitest';
import { calcular } from './calculo';
import { colunasCompletas } from './colunas';
import { aplicarFiltros, resumoFiltro, valoresDaColuna, valorExibido, type ContextoFiltro, type Filtros } from './filtros';
import { itemVazio } from './pq';
import type { Item, Parametros } from './tipos';

const P: Parametros = { cambio: { BRL: 1, USD: 5 }, tributos: [], fretes: [], bdis: [] };
const T = (id: string, item: string, desc: string): Item => ({ ...itemVazio(id, 0), titulo: true, item, desc });
const I = (id: string, item: string, o: Partial<Item>): Item =>
  ({ ...itemVazio(id, 0), item, desc: 'x', qtd: 1, preco: 100, tipo: 'C', orig: 'N', moeda: 'BRL', ...o });
// 1 OBRA / 1.1 CIVIL (a, b) / 1.2 EQUIPAMENTOS (c, d) / 2 OUTROS (e)
const ITENS: Item[] = [
  T('t1', '1', 'OBRA'), T('t11', '1.1', 'CIVIL'),
  I('a', '1.1.1', { desc: 'Concreto', preco: 1000, tipo: 'C' }),
  I('b', '1.1.2', { desc: 'Forma de madeira', preco: 50, tipo: 'M', un: 'm2' }),
  T('t12', '1.2', 'EQUIPAMENTOS'),
  I('c', '1.2.1', { desc: 'Bomba', preco: 20000, tipo: 'F', moeda: 'USD' }),
  I('d', '1.2.2', { desc: 'Motor elétrico', preco: 8000, tipo: 'F', qtd: null }),
  T('t2', '2', 'OUTROS'),
  I('e', '2.1', { desc: 'Concreto magro', preco: 300, tipo: 'S' }),
];
const COLS = colunasCompletas([]);
const col = (k: string) => COLS.find(c => c.k === k)!;
const cx: ContextoFiltro = {
  res: new Map(ITENS.map(i => [i.id, calcular(i, P)])),
  moedas: [{ codigo: 'BRL', nome: 'Real', simbolo: 'R$' }, { codigo: 'USD', nome: 'Dólar', simbolo: 'US$' }],
  fretes: [], bdis: [],
};
const vis = (f: Filtros) => { const s = aplicarFiltros(ITENS, f, COLS, cx); return s ? ITENS.filter(i => s.has(i.id)).map(i => i.id) : null; };

describe('filtros por coluna', () => {
  it('sem filtro: null (mostra tudo)', () => expect(vis({})).toBeNull());

  it('lista de valores (Tipo C ou M) mantém os títulos-pai e a ordem da PQ', () => {
    expect(vis({ tipo: { tipo: 'valores', valores: ['(C) Construção', '(M) Montagem'] } })).toEqual(['t1', 't11', 'a', 'b']);
  });

  it('"Item PQ começa com 1.2" = o grupo inteiro (substitui o filtro de grupo)', () => {
    expect(vis({ item: { tipo: 'texto', op: 'comeca', valor: '1.2' } })).toEqual(['t1', 't12', 'c', 'd']);
  });

  it('texto contém, sem diferenciar maiúsculas e acentos', () => {
    expect(vis({ desc: { tipo: 'texto', op: 'contem', valor: 'ELETRICO' } })).toEqual(['t1', 't12', 'd']);
    expect(vis({ desc: { tipo: 'texto', op: 'termina', valor: 'madeira' } })).toEqual(['t1', 't11', 'b']);
  });

  it('número: maior que, entre, 10 maiores e acima da média (preço)', () => {
    expect(vis({ preco: { tipo: 'numero', op: 'maior', a: 5000 } })).toEqual(['t1', 't12', 'c', 'd']);
    expect(vis({ preco: { tipo: 'numero', op: 'entre', a: 100, b: 1000 } })).toEqual(['t1', 't11', 'a', 't2', 'e']);
    expect(vis({ preco: { tipo: 'numero', op: 'acimaMedia' } })).toEqual(['t1', 't12', 'c', 'd']);       // média 5.870
    expect(vis({ preco: { tipo: 'numero', op: 'top10' } })?.filter(i => !i.startsWith('t'))).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('filtros de colunas diferentes se somam (E)', () => {
    expect(vis({ tipo: { tipo: 'valores', valores: ['(F) Fornecimento'] }, moeda: { tipo: 'valores', valores: ['Real (R$)'] } })).toEqual(['t1', 't12', 'd']);
  });

  it('coluna calculada: Check e Total geral (moeda convertida)', () => {
    expect(vis({ chk: { tipo: 'valores', valores: ['Incompleto'] } })).toEqual(['t1', 't12', 'd']);
    expect(valorExibido(col('ger'), ITENS[5], cx)).toBe('100.000,00');                                   // 1 × 20.000 × 5
  });

  it('lista de valores com quantidades e "(Vazias)" no fim', () => {
    expect(valoresDaColuna(col('un'), ITENS, cx)).toEqual([{ valor: 'm2', n: 1 }, { valor: '', n: 4 }]);
    expect(valoresDaColuna(col('preco'), ITENS, cx).map(v => v.valor)).toEqual(['50,00', '300,00', '1.000,00', '8.000,00', '20.000,00']);
    expect(vis({ un: { tipo: 'valores', valores: [''] } })).toEqual(['t1', 't11', 'a', 't12', 'c', 'd', 't2', 'e']);
  });

  it('resumo das etiquetas', () => {
    expect(resumoFiltro({ tipo: 'valores', valores: ['A', 'B', 'C', 'D', ''] })).toBe('A, B, C +2');
    expect(resumoFiltro({ tipo: 'texto', op: 'comeca', valor: '1.1' })).toBe('começa com 1.1');
    expect(resumoFiltro({ tipo: 'numero', op: 'entre', a: 10000, b: 50000 })).toBe('entre 10.000 e 50.000');
  });
});
