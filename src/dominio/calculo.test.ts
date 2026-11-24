import { describe, expect, it } from 'vitest';
import { bdiFinal, calcular, detalheCheck, gruposPorTitulo, totais, tributoSeAplica } from './calculo';
import { itemVazio } from './pq';
import type { Bdi, Item, Parametros, Tributo } from './tipos';

const T = (id: string, aliquota: number, o: Partial<Tributo> = {}): Tributo =>
  ({ id, nome: id.toUpperCase(), aliquota, fornecimento: true, servico: true, nacional: true, importado: true, ...o });
// Tributos padrão de uma empresa nova
const TRIB: Tributo[] = [
  T('ii', 0.10, { servico: false, nacional: false }),
  T('ipi', 0.05, { servico: false }),
  T('pis', 0.0165),
  T('cofins', 0.076),
  T('icms', 0.18, { servico: false }),
  T('iss', 0.05, { fornecimento: false }),
  T('irrf', 0.15, { fornecimento: false, nacional: false }),
];
const B = (id: string, o: Partial<Bdi> = {}): Bdi =>
  ({ id, nome: id, administracao: 0, seguros: 0, garantias: 0, riscos: 0, financeiras: 0, lucro: 0, extras: [], ...o });
// BDIs simples (todo o percentual em Lucro)
const BDIS = [B('b25', { lucro: 0.25 }), B('b10', { lucro: 0.1 })];
const P: Parametros = { cambio: { BRL: 1, USD: 5.2, EUR: null }, tributos: TRIB, fretes: [], bdis: BDIS };
const item = (o: Partial<Item>): Item => ({
  ...itemVazio('x', 1), desc: 'Item', qtd: 10, preco: 100, pacote: 'P-1', tipo: 'C', orig: 'N', moeda: 'BRL', ...o,
});

describe('regra de aplicação dos tributos', () => {
  it('fornecimento nacional: IPI, PIS, COFINS, ICMS', () => {
    expect(TRIB.filter(t => tributoSeAplica(t, 'F', 'N')).map(t => t.id)).toEqual(['ipi', 'pis', 'cofins', 'icms']);
  });
  it('fornecimento importado: II, IPI, PIS, COFINS, ICMS', () => {
    expect(TRIB.filter(t => tributoSeAplica(t, 'F', 'I')).map(t => t.id)).toEqual(['ii', 'ipi', 'pis', 'cofins', 'icms']);
  });
  it('serviço nacional (C, S, T, M): PIS, COFINS, ISS', () => {
    for (const tipo of ['C', 'S', 'T', 'M']) expect(TRIB.filter(t => tributoSeAplica(t, tipo, 'N')).map(t => t.id)).toEqual(['pis', 'cofins', 'iss']);
  });
  it('serviço importado: PIS, COFINS, ISS, IRRF', () => {
    expect(TRIB.filter(t => tributoSeAplica(t, 'S', 'I')).map(t => t.id)).toEqual(['pis', 'cofins', 'iss', 'irrf']);
  });
});

describe('calcular', () => {
  it('serviço nacional com BDI e provisão: tributos por dentro', () => {
    const r = calcular(item({ bdi: 'b25', prov: 0.1 }), P);
    const aliq = 0.0165 + 0.076 + 0.05;
    expect(r.chk).toBe('OK');
    expect(r.aliquota).toBeCloseTo(aliq, 10);
    expect(r.liq).toBeCloseTo(1000, 6);
    expect(r.base).toBeCloseTo(1250, 6);
    expect(r.parc).toBeCloseTo(1250 / (1 - aliq), 6);
    expect(r.trib).toBeCloseTo(r.parc! - 1250, 6);
    expect(r.tribs.iss).toBeCloseTo(r.parc! * 0.05, 6);
    expect(r.tribs.pis + r.tribs.cofins + r.tribs.iss).toBeCloseTo(r.trib!, 6);
    expect(r.ger).toBeCloseTo(r.parc! * 1.1, 6);
    expect(r.tribs.icms).toBeUndefined();
  });

  it('fornecimento importado em dólar converte pelo câmbio e usa os tributos de importação', () => {
    const r = calcular(item({ tipo: 'F', orig: 'I', moeda: 'USD' }), P);
    const aliq = 0.10 + 0.05 + 0.0165 + 0.076 + 0.18;
    expect(r.base).toBeCloseTo(10 * 100 * 5.2, 6);
    expect(r.parc).toBeCloseTo(5200 / (1 - aliq), 6);
    expect(Object.keys(r.tribs).sort()).toEqual(['cofins', 'icms', 'ii', 'ipi', 'pis']);
  });

  it('desligar um tributo na linha tira ele do cálculo', () => {
    const r = calcular(item({ tribLigados: { iss: false } }), P);
    expect(r.ligados.iss).toBe(false);
    expect(r.tribs.iss).toBeUndefined();
    expect(r.parc).toBeCloseTo(1000 / (1 - 0.0165 - 0.076), 6);
  });

  it('ligar na linha um tributo que a regra não aplica', () => {
    const r = calcular(item({ tribLigados: { icms: true } }), P);
    expect(r.ligados.icms).toBe(true);
    expect(r.tribs.icms).toBeCloseTo(r.parc! * 0.18, 6);
  });

  it('tributo personalizado da empresa entra no cálculo', () => {
    const p2 = { ...P, tributos: [...TRIB, T('taxa', 0.02, { fornecimento: false })] };
    const r = calcular(item({}), p2);
    expect(r.tribs.taxa).toBeCloseTo(r.parc! * 0.02, 6);
    expect(r.aliquota).toBeCloseTo(0.0165 + 0.076 + 0.05 + 0.02, 10);
  });

  it('sem tributos ligados, parcial = base', () => {
    const r = calcular(item({}), { ...P, tributos: [] });
    expect(r.trib).toBeCloseTo(0, 10);
    expect(r.parc).toBeCloseTo(r.base!, 10);
  });

  it('pacote é só texto: não influencia o cálculo e não é obrigatório', () => {
    const a = calcular(item({ pacote: 'SERV-CIV-1', tipo: 'F' }), P);
    const b = calcular(item({ pacote: '', tipo: 'F' }), P);
    expect(b.chk).toBe('OK');
    expect(a.ger).toBeCloseTo(b.ger!, 10);
  });

  it('soma de alíquotas de 100% ou mais é erro', () => {
    const r = calcular(item({}), { ...P, tributos: [T('a', 0.6), T('b', 0.5)] });
    expect(r.chk).toBe('ERRO');
    expect(r.ger).toBeNull();
    expect(detalheCheck(item({}), r, { ...P, tributos: [T('a', 0.6), T('b', 0.5)] })).toContain('menor que 100%');
  });

  it('líquido = quantidade × preço × câmbio, sem BDI, tributos e provisão', () => {
    const r = calcular(item({ bdi: 'b25', prov: 0.1, moeda: 'USD' }), P);
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
    expect(Object.keys(r.tribs).sort()).toEqual(['cofins', 'icms', 'ipi', 'pis']);
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
  it('linha OK lista os tributos ligados', () => {
    const it1 = item({});
    expect(detalheCheck(it1, calcular(it1, P), P)).toContain('Tributos ligados: PIS 1,65%, COFINS 7,6%, ISS 5%');
  });
});

describe('totais e grupos', () => {
  it('soma só itens válidos, conta pendências e totaliza por tributo', () => {
    const lista = [item({ id: 'a' }), item({ id: 'b', qtd: null }), item({ id: 'c', tipo: 'Z' }), item({ id: 't', titulo: true })];
    const t = totais(lista, P);
    const r0 = calcular(lista[0], P);
    expect(t).toMatchObject({ ok: 1, inc: 1, err: 1, tit: 1 });
    expect(t.ger).toBeCloseTo(r0.ger!, 6);
    expect(t.liq).toBeCloseTo(r0.liq!, 6);
    expect(t.porTributo.iss).toBeCloseTo(r0.tribs.iss, 6);
    expect(t.trib).toBeCloseTo(r0.trib!, 6);
  });
  it('cada item pertence ao título imediatamente acima', () => {
    const lista = [item({ id: 'x0' }), item({ id: 't1', titulo: true }), item({ id: 'a' }), item({ id: 't2', titulo: true }), item({ id: 'b' })];
    const g = gruposPorTitulo(lista);
    expect(g.get('x0')).toBeNull();
    expect(g.get('a')).toBe('t1');
    expect(g.get('b')).toBe('t2');
  });
});

describe('fretes', () => {
  const FR = [
    { id: 'fn', tipo: 'nacional' as const, nome: 'Rodoviário SP-MG', local: 'MG', criterio: 'valor' as const, valor: 500, moeda: 'BRL' },
    { id: 'fp', tipo: 'nacional' as const, nome: '3% do líquido', local: 'SP', criterio: 'percentual' as const, valor: 0.03, moeda: 'BRL' },
    { id: 'fi', tipo: 'internacional' as const, nome: 'Marítimo China', local: 'China', criterio: 'valor' as const, valor: 200, moeda: 'USD' },
    { id: 'fe', tipo: 'internacional' as const, nome: 'Aéreo Alemanha', local: 'Alemanha', criterio: 'valor' as const, valor: 100, moeda: 'EUR' },
  ];
  const PF: Parametros = { ...P, fretes: FR };
  const aliqSvc = 0.0165 + 0.076 + 0.05;

  it('frete nacional por valor: único por linha, soma à base antes dos tributos', () => {
    const r = calcular(item({ fnac: 'fn', bdi: 'b10' }), PF);
    expect(r.fnacv).toBe(500);
    expect(r.base).toBeCloseTo(1000 * 1.1 + 500, 6);
    expect(r.parc).toBeCloseTo((1100 + 500) / (1 - aliqSvc), 6);
    expect(r.liq).toBeCloseTo(1000, 6);               // líquido não inclui frete
    const dobro = calcular(item({ fnac: 'fn', qtd: 20 }), PF);
    expect(dobro.fnacv).toBe(500);                    // não multiplica pela quantidade
  });

  it('frete por percentual do valor líquido', () => {
    const r = calcular(item({ fnac: 'fp', moeda: 'USD' }), PF);
    expect(r.fnacv).toBeCloseTo(5200 * 0.03, 6);
  });

  it('frete internacional em dólar convertido pelo câmbio; nacional + internacional somam', () => {
    const r = calcular(item({ fnac: 'fn', fint: 'fi' }), PF);
    expect(r.fintv).toBeCloseTo(200 * 5.2, 6);
    expect(r.base).toBeCloseTo(1000 + 500 + 1040, 6);
  });

  it('frete em moeda sem câmbio = erro explicado no Check', () => {
    const it1 = item({ fint: 'fe' });
    const r = calcular(it1, PF);
    expect(r.chk).toBe('ERRO');
    expect(r.ger).toBeNull();
    expect(detalheCheck(it1, r, PF)).toContain('Aéreo Alemanha');
  });

  it('sem frete ou frete excluído: valor nulo, não altera o cálculo', () => {
    const sem = calcular(item({}), PF), excl = calcular(item({ fnac: 'nao-existe' }), PF);
    expect(sem.fnacv).toBeNull();
    expect(excl.fnacv).toBeNull();
    expect(excl.ger).toBeCloseTo(sem.ger!, 10);
  });

  it('Check da linha OK cita o frete', () => {
    const it1 = item({ fnac: 'fn' });
    expect(detalheCheck(it1, calcular(it1, PF), PF)).toContain('Frete: Rodoviário SP-MG');
  });

  it('colunas de frete fora do modelo da PX: sem frete', () => {
    const cols = new Set(['seq', 'desc', 'qtd', 'preco', 'ger', 'chk', 'tipo', 'orig', 'moeda']);
    expect(calcular(item({ fnac: 'fn' }), PF, cols).fnacv).toBeNull();
  });
});

describe('BDI cadastrado', () => {
  // exemplo de composição usual: AC 4%, S 0,4%, G 0,4%, R 1,27%, DF 1,23%, L 7,4%
  const civil = B('civil', { nome: 'BDI Obras Civis', administracao: 0.04, seguros: 0.004, garantias: 0.004, riscos: 0.0127, financeiras: 0.0123, lucro: 0.074 });
  const PB: Parametros = { ...P, bdis: [civil] };

  it('BDI final pela fórmula sem tributos: (1+AC+S+G+R)(1+DF)(1+L) − 1', () => {
    expect(bdiFinal(civil)).toBeCloseTo((1 + 0.04 + 0.004 + 0.004 + 0.0127) * 1.0123 * 1.074 - 1, 12);
    expect(bdiFinal(civil)).toBeCloseTo(0.1532, 4);
  });

  it('parcelas personalizadas somam-se a AC + S + G + R', () => {
    const b = { ...civil, extras: [{ nome: 'Mobilização', pct: 0.02 }] };
    expect(bdiFinal(b)).toBeCloseTo((1 + 0.0607 + 0.02) * 1.0123 * 1.074 - 1, 12);
  });

  it('só lucro: BDI final = lucro (BDIs convertidos)', () => {
    expect(bdiFinal(B('x', { lucro: 0.155 }))).toBeCloseTo(0.155, 12);
  });

  it('incide só sobre o líquido; fretes entram depois, sem BDI', () => {
    const PF: Parametros = { ...PB, fretes: [{ id: 'fn', tipo: 'nacional', nome: 'F', local: 'SP', criterio: 'valor', valor: 500, moeda: 'BRL' }] };
    const r = calcular(item({ bdi: 'civil', fnac: 'fn' }), PF);
    expect(r.bdiv).toBeCloseTo(1000 * bdiFinal(civil), 8);
    expect(r.base).toBeCloseTo(1000 + r.bdiv! + 500, 8);
    expect(r.liq).toBeCloseTo(1000, 8);
  });

  it('"-" (sem BDI) ou BDI excluído: BDI (R$) nulo e base = líquido', () => {
    const sem = calcular(item({}), PB), excl = calcular(item({ bdi: 'nao-existe' }), PB);
    expect(sem.bdiv).toBeNull();
    expect(sem.base).toBeCloseTo(1000, 8);
    expect(excl.ger).toBeCloseTo(sem.ger!, 10);
  });

  it('totais somam o BDI e o Check cita o BDI da linha', () => {
    const it1 = item({ bdi: 'civil' });
    expect(totais([it1, item({ id: 'y' })], PB).bdiv).toBeCloseTo(1000 * bdiFinal(civil), 8);
    expect(detalheCheck(it1, calcular(it1, PB), PB)).toContain('BDI: BDI Obras Civis');
  });
});
