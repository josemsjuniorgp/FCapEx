import { describe, expect, it } from 'vitest';
import {
  calcularEstudo, cenario, normalizarCapex, normalizarPremissas, problemaLinha, tirDe, tornado, valorLinha,
  type EntradaEstudo, type LinhaEstudo,
} from './viabilidade';

let k = 0;
const L = (o: Partial<LinhaEstudo>): LinhaEstudo => ({
  id: 'l' + k++, secao: 'opex', posicao: k, titulo: false, item: '', descricao: 'x', comportamento: 'fixo', unidade: '',
  quantidade: 1, preco: 0, moeda: 'BRL', anoInicio: null, anoFim: null, reajuste: 0, deducao: 0, origem: '', ...o,
});
// Exemplo do modelo: unidade de britagem (valores em R$)
const britagem = (): EntradaEstudo => ({
  tipo: 'receita',
  premissas: normalizarPremissas({ anosObra: 2, anosOperacao: 20, taxa: 0.10, ir: 0.34, depreciacaoAnos: 10, valorResidual: 0.05, rampa: [0.7, 0.9] }),
  capexMapas: 48_000_000,
  capex: normalizarCapex({ desembolso: [0.3, 0.7] }),
  cambio: { BRL: 1, USD: 5.5 },
  linhas: [
    L({ secao: 'receita', comportamento: 'variavel', descricao: 'Brita', quantidade: 400_000, preco: 65 }),
    L({ titulo: true, descricao: 'PESSOAL' }),
    L({ descricao: 'Equipe de operação', quantidade: 24, preco: 145_000 }),
    L({ descricao: 'Manutenção preventiva', quantidade: 1, preco: 1_450_000 }),
    L({ descricao: 'Seguro', quantidade: 1, preco: 480_000 }),
    L({ descricao: 'Administração', quantidade: 1, preco: 790_000 }),
    L({ comportamento: 'variavel', descricao: 'Peças de desgaste', quantidade: 400_000, preco: 6.1 }),
    L({ comportamento: 'variavel', descricao: 'Energia', quantidade: 400_000, preco: 4.8 }),
    L({ comportamento: 'variavel', descricao: 'Insumos', quantidade: 400_000, preco: 2.2 }),
    L({ comportamento: 'variavel', descricao: 'Transporte interno', quantidade: 400_000, preco: 1.4 }),
  ],
});

describe('estudo de viabilidade', () => {
  it('britagem do modelo: VPL R$ 28,8 mi, TIR 18,7%, payback no ano 7, ciclo de vida R$ 286 mi', () => {
    const r = calcularEstudo(britagem());
    expect(r.vpl / 1e6).toBeCloseTo(28.8, 1);
    expect(r.tir! * 100).toBeCloseTo(18.7, 1);
    expect(r.payback).toBe(7);
    expect(r.capexTotal).toBe(48_000_000);
    expect(r.opexAnoCheio).toBeCloseTo(12_000_000, 0);
    expect(Math.round(r.lcc / 1e6)).toBe(286);
    expect(r.anos[0].capex).toBeCloseTo(14_400_000, 0);           // 30% no ano 1
    expect(r.anos[2].receita).toBeCloseTo(18_200_000, 0);         // rampa 70%
    expect(r.anos[2].depreciacao).toBeCloseTo(4_800_000, 0);      // 48 mi ÷ 10 anos
    expect(r.anos[12].depreciacao).toBe(0);                       // depreciação acaba no ano 12
  });

  it('IR só sobre lucro positivo; residual no último ano', () => {
    const r = calcularEstudo(britagem());
    for (const a of r.anos) expect(a.ir).toBeGreaterThanOrEqual(0);
    const ult = r.anos[r.anos.length - 1];
    expect(ult.caixa).toBeCloseTo(ult.ebitda - ult.ir + 48_000_000 * 0.05, 0);
  });

  it('linha: reajuste real composto, câmbio, anos de início e fim, dedução sobre receita', () => {
    const p = normalizarPremissas({ anosObra: 1, anosOperacao: 5 });
    const c = { BRL: 1, USD: 5 };
    const e = L({ quantidade: 10, preco: 100, reajuste: 0.1, anoInicio: 2 });
    expect(valorLinha(e, 2, p, c)).toBeCloseTo(1000, 6);
    expect(valorLinha(e, 4, p, c)).toBeCloseTo(1210, 6);
    expect(valorLinha(L({ quantidade: 1, preco: 10, moeda: 'USD' }), 3, p, c)).toBe(50);
    expect(valorLinha(L({ quantidade: 1, preco: 10, anoFim: 3 }), 4, p, c)).toBe(0);
    expect(valorLinha(L({ quantidade: 1, preco: 10 }), 1, p, c)).toBe(0);                     // ano de obra
    expect(valorLinha(L({ secao: 'receita', quantidade: 1, preco: 100, deducao: 0.0925 }), 2, p, c)).toBeCloseTo(90.75, 6);
    expect(problemaLinha(L({ moeda: 'EUR', quantidade: 1, preco: 1 }), c)).toContain('EUR');
    expect(problemaLinha(L({ quantidade: null }), c)).toContain('Falta');
  });

  it('projeto de redução de custo: economia paga o investimento', () => {
    const e: EntradaEstudo = {
      tipo: 'economia', premissas: normalizarPremissas({ anosObra: 1, anosOperacao: 10, taxa: 0.1, ir: 0.34, depreciacaoAnos: 10 }),
      capexMapas: 1_000_000, capex: normalizarCapex({ desembolso: [1] }), cambio: { BRL: 1 },
      linhas: [L({ secao: 'economia', descricao: 'Energia evitada', quantidade: 1, preco: 300_000 }),
        L({ descricao: 'Manutenção do novo equipamento', quantidade: 1, preco: 50_000 }),
        L({ secao: 'receita', quantidade: 1, preco: 999_999 })],   // ignorada num estudo de economia
    };
    const r = calcularEstudo(e);
    expect(r.anos[1].economia).toBe(300_000);
    expect(r.anos[1].receita).toBe(0);
    expect(r.anos[1].ebitda).toBe(250_000);
    expect(r.vpl).toBeGreaterThan(0);
    expect(r.payback).toBeGreaterThan(1);
  });

  it('reinvestimento entra no CapEx do ano e deprecia a partir do ano seguinte', () => {
    const e = britagem();
    e.capex.reinvestimentos = [{ ano: 12, descricao: 'Troca do britador', valor: 5_000_000 }];
    const r = calcularEstudo(e);
    expect(r.anos[11].capex).toBe(5_000_000);
    expect(r.anos[12].depreciacao).toBeCloseTo(500_000, 0);
    expect(r.vpl).toBeLessThan(calcularEstudo(britagem()).vpl);
  });

  it('estudo vazio (sem investimento): sem payback, VPL zero', () => {
    const e = britagem(); e.capexMapas = 0; e.linhas = [];
    const r = calcularEstudo(e);
    expect(r.payback).toBeNull();
    expect(r.paybackDescontado).toBeNull();
    expect(r.vpl).toBe(0);
    expect(r.tir).toBeNull();
  });

  it('TIR inexistente quando o fluxo não muda de sinal', () => {
    expect(tirDe([100, 100])).toBeNull();
    expect(tirDe([-100, -10])).toBeNull();
    expect(tirDe([-100, 110])!).toBeCloseTo(0.1, 6);
  });

  it('tornado ordenado pela amplitude e cenários pessimista < base < otimista', () => {
    const e = britagem();
    const t = tornado(e);
    expect(t.itens[0].nome).toMatch(/Preço/);
    expect(t.itens[0].baixo / 1e6).toBeCloseTo(5.6, 1);
    expect(t.itens[0].alto / 1e6).toBeCloseTo(52.0, 1);
    const amp = t.itens.map(i => i.alto - i.baixo);
    expect(amp).toEqual([...amp].sort((a, b) => b - a));
    const p = e.premissas.cenarios;
    expect(cenario(e, p.pessimista).vpl).toBeLessThan(t.base);
    expect(cenario(e, p.otimista).vpl).toBeGreaterThan(t.base);
  });

  it('premissas e CapEx vindos do banco: campos ausentes recebem o padrão', () => {
    const p = normalizarPremissas({ taxa: 0.12 } as never);
    expect(p.taxa).toBe(0.12);
    expect(p.ir).toBe(0.34);
    expect(p.cenarios.pessimista.capex).toBeGreaterThan(0);
    expect(normalizarCapex(null).desembolso).toEqual([0.5, 0.5]);
  });
});
