import { describe, expect, it } from 'vitest';
import { calcular, detalheCheck, gruposPorTitulo, totais } from './calculo';
import { itemVazio } from './pq';
import type { Item, Parametros } from './tipos';

const P: Parametros = {
  cambio: { BRL: 1, USD: 5.2, EUR: null },
  aliquotas: { NF: 0.1865, IF: 0.312, NS: 0.1365, IS: 0.3315 },
  pacotesServico: ['SERV-CIV-1', 'SERV-MEC-1', 'TUK-ELE-2'],
};
const item = (o: Partial<Item>): Item => ({
  ...itemVazio('x', 1), desc: 'Item', qtd: 10, preco: 100, pacote: 'P-1', tipo: 'C', orig: 'N', moeda: 'BRL', ...o,
});

describe('calcular', () => {
  it('serviço nacional com BDI e provisão', () => {
    const r = calcular(item({ bdi: 0.25, prov: 0.1 }), P);
    expect(r.chk).toBe('OK');
    expect(r.regime).toBe('NS');
    expect(r.base).toBeCloseTo(1250, 6);
    expect(r.parc).toBeCloseTo(1250 / (1 - 0.1365), 6);
    expect(r.trib).toBeCloseTo(r.parc! - 1250, 6);
    expect(r.ger).toBeCloseTo(r.parc! * 1.1, 6);
  });

  it('líquido = quantidade × preço × câmbio, sem BDI, tributos e provisão', () => {
    const r = calcular(item({ bdi: 0.25, prov: 0.1, moeda: 'USD' }), P);
    expect(r.liq).toBeCloseTo(10 * 100 * 5.2, 6);
    expect(r.base).toBeCloseTo(10 * 100 * 5.2 * 1.25, 6);
    expect(calcular(item({ qtd: null }), P).liq).toBeNull();
    expect(calcular(item({ titulo: true }), P).liq).toBeNull();
  });

  it('moeda adicionada pela empresa converte pelo câmbio cadastrado', () => {
    const r = calcular(item({ moeda: 'GBP' }), { ...P, cambio: { ...P.cambio, GBP: 7 } });
    expect(r.chk).toBe('OK');
    expect(r.liq).toBeCloseTo(7000, 6);
  });

  it('fornecimento importado em dólar converte pelo câmbio', () => {
    const r = calcular(item({ tipo: 'F', orig: 'I', moeda: 'USD' }), P);
    expect(r.regime).toBe('IF');
    expect(r.base).toBeCloseTo(10 * 100 * 5.2, 6);
    expect(r.parc).toBeCloseTo(5200 / (1 - 0.312), 6);
  });

  it('pacote de serviço vale para os 5 tipos e qualquer natureza, ignorando zeros e símbolos', () => {
    for (const tipo of ['F', 'C', 'S', 'T', 'M']) {
      const r = calcular(item({ pacote: 'serv civ 001', tipo, orig: 'I' }), P);
      expect(r.pacote).toBe(true);
      expect(r.regime).toBe('NS');
      expect(r.chk).toBe('OK');
    }
  });

  it('campo obrigatório vazio = INCOMPLETO, sem valores calculados', () => {
    const r = calcular(item({ moeda: '' }), P);
    expect(r.chk).toBe('INCOMPLETO');
    expect(r.ger).toBeNull();
  });

  it('tipo fora da lista = ERRO', () => {
    expect(calcular(item({ tipo: 'D' }), P).chk).toBe('ERRO');
  });

  it('moeda sem câmbio cadastrado = ERRO', () => {
    expect(calcular(item({ moeda: 'EUR' }), P).chk).toBe('ERRO');
    expect(calcular(item({ moeda: 'JPY' }), P).chk).toBe('ERRO');
  });

  it('título não calcula nem conta como pendência', () => {
    const r = calcular(item({ titulo: true, qtd: null }), P);
    expect(r.chk).toBe('TITULO');
    expect(r.ger).toBeNull();
  });

  it('colunas fora do modelo usam os valores padrão (nacional, fornecimento, BRL)', () => {
    const cols = new Set(['seq', 'desc', 'qtd', 'preco', 'ger', 'chk']);
    const r = calcular(item({ tipo: '', orig: '', moeda: '', pacote: '' }), P, cols);
    expect(r.chk).toBe('OK');
    expect(r.regime).toBe('NF');
    expect(r.base).toBeCloseTo(1000, 6);
  });
});

describe('detalheCheck', () => {
  it('lista campos vazios e valores inválidos', () => {
    const it1 = item({ qtd: null, orig: 'X' });
    const msg = detalheCheck(it1, calcular(it1, P), P);
    expect(msg).toContain('Quantidade');
    expect(msg).toContain('Natureza = "X"');
  });
  it('explica moeda sem câmbio', () => {
    const it1 = item({ moeda: 'EUR' });
    expect(detalheCheck(it1, calcular(it1, P), P)).toContain('não tem câmbio');
  });
});

describe('totais e grupos', () => {
  it('soma só itens válidos e conta pendências', () => {
    const lista = [item({ id: 'a' }), item({ id: 'b', qtd: null }), item({ id: 'c', tipo: 'Z' }), item({ id: 't', titulo: true })];
    const t = totais(lista, P);
    expect(t).toMatchObject({ ok: 1, inc: 1, err: 1, tit: 1 });
    expect(t.ger).toBeCloseTo(calcular(lista[0], P).ger!, 6);
    expect(t.liq).toBeCloseTo(calcular(lista[0], P).liq!, 6);
  });
  it('cada item pertence ao título imediatamente acima', () => {
    const lista = [item({ id: 'x0' }), item({ id: 't1', titulo: true }), item({ id: 'a' }), item({ id: 't2', titulo: true }), item({ id: 'b' })];
    const g = gruposPorTitulo(lista);
    expect(g.get('x0')).toBeNull();
    expect(g.get('a')).toBe('t1');
    expect(g.get('b')).toBe('t2');
  });
});
