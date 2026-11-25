import { describe, expect, it } from 'vitest';
import { calcular } from './calculo';
import { aderencia, calcularMaturidade, CLASSES, normOrigem } from './maturidade';
import { itemVazio } from './pq';
import type { Item, Parametros } from './tipos';

const P: Parametros = { cambio: { BRL: 1 }, tributos: [], fretes: [], bdis: [] };
const I = (id: string, preco: number, origem: string, o: Partial<Item> = {}): Item =>
  ({ ...itemVazio(id, 0), desc: 'x', qtd: 1, preco, tipo: 'C', orig: 'N', moeda: 'BRL', origem, ...o });
const mat = (itens: Item[]) => calcularMaturidade(itens, new Map(itens.map(i => [i.id, calcular(i, P)])));

describe('maturidade da PX', () => {
  it('% firme pelo valor: contrato + cotação firme ÷ total geral', () => {
    const m = mat([I('a', 500, 'contrato'), I('b', 300, 'firme'), I('c', 150, 'orcamentaria'), I('d', 50, '')]);
    expect(m.total).toBe(1000);
    expect(m.firme).toBe(800);
    expect(m.pct).toBeCloseTo(0.8, 10);
    expect(m.porOrigem).toEqual({ contrato: 500, firme: 300, orcamentaria: 150, '': 50 });
    expect([m.linhas, m.semOrigem]).toEqual([4, 1]);
  });

  it('títulos e linhas incompletas (sem total) não entram; sem valor = null', () => {
    const m = mat([{ ...I('t', 0, ''), titulo: true }, I('x', 100, 'firme', { qtd: null })]);
    expect(m.total).toBe(0);
    expect(m.pct).toBeNull();
  });

  it('aderência à meta da classe (tabela AACE)', () => {
    expect(CLASSES[3].meta).toEqual([0.4, 0.6]);
    expect(aderencia(0.5, 3)).toBe('dentro');
    expect(aderencia(0.4, 3)).toBe('dentro');
    expect(aderencia(0.3, 3)).toBe('abaixo');
    expect(aderencia(0.15, 3)).toBe('muito_abaixo');
    expect(aderencia(0.7, 3)).toBe('acima');
    expect(aderencia(0, 5)).toBe('dentro');
    expect(aderencia(0.95, 1)).toBe('dentro');
    expect(aderencia(0.5, null)).toBeNull();
    expect(aderencia(null, 3)).toBeNull();
  });

  it('origem lida de planilha pelo nome ou palavras-chave', () => {
    expect(normOrigem('Cotação firme de fornecedor')).toBe('firme');
    expect(normOrigem('PEDIDO DE COMPRA')).toBe('contrato');
    expect(normOrigem('orçamentária')).toBe('orcamentaria');
    expect(normOrigem('CPU')).toBe('cpu');
    expect(normOrigem('Paramétrica')).toBe('parametrica');
    expect(normOrigem('qualquer coisa')).toBe('');
  });
});
