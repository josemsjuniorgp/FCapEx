/**
 * Estudo de Viabilidade: CapEx + OpEx + Receitas (ou Economias) → fluxo de caixa anual, VPL, TIR, payback, custo do
 * ciclo de vida, sensibilidade (tornado) e cenários. Valores em termos reais (moeda de hoje), fim de ano.
 *
 * Anos do projeto: 1..anosObra = obra (CapEx); anosObra+1..anosObra+anosOperacao = operação.
 * Linha (OpEx/receita/economia): quantidade × preço × câmbio da moeda, por ano, entre ano_inicio e ano_fim,
 *   × rampa (só linhas variáveis, nos primeiros anos de operação) × (1 + reajuste real)^(anos desde o início);
 *   receita: menos a dedução sobre a venda (impostos sobre receita).
 * Caixa do ano = receita líquida + economia − OpEx − IR/CSLL − CapEx − reinvestimentos (+ valor residual no último ano).
 * IR/CSLL = alíquota × máx(0, EBITDA − depreciação); depreciação linear do CapEx (e de cada reinvestimento).
 */
export type TipoEstudo = 'receita' | 'economia';
export type Secao = 'opex' | 'receita' | 'economia';

export interface AjusteCenario { preco: number; volume: number; capex: number; opex: number }

export interface Premissas {
  anosObra: number;
  anosOperacao: number;
  anoBase: number;           // ano-calendário do ano 1 (só para exibir)
  taxa: number;              // taxa de desconto real (0,10 = 10% a.a.)
  ir: number;                // IR + CSLL sobre o lucro (0,34)
  depreciacaoAnos: number;   // depreciação linear
  valorResidual: number;     // fração do CapEx recuperada no último ano
  rampa: number[];           // fração da capacidade nos primeiros anos de operação (ex.: [0,7; 0,9])
  cenarios: { pessimista: AjusteCenario; otimista: AjusteCenario };
}

export interface Reinvestimento { ano: number; descricao: string; valor: number }
export interface CapexEstudo {
  mapas: string[];           // Mapas de Preços do projeto que compõem o CapEx
  adicional: number;         // CapEx fora dos Mapas (R$)
  adicionalDescricao: string;
  desembolso: number[];      // fração do CapEx em cada ano de obra (normalizada)
  reinvestimentos: Reinvestimento[];
}

export interface LinhaEstudo {
  id: string;
  secao: Secao;
  posicao: number;
  titulo: boolean;
  item: string;
  descricao: string;
  comportamento: 'fixo' | 'variavel';
  unidade: string;
  quantidade: number | null;
  preco: number | null;
  moeda: string;
  anoInicio: number | null;  // vazio = primeiro ano de operação
  anoFim: number | null;     // vazio = último ano
  reajuste: number;          // real a.a.
  deducao: number;           // receitas: impostos sobre a venda (fração)
  origem: string;
}

export const AJUSTE_NEUTRO: AjusteCenario = { preco: 0, volume: 0, capex: 0, opex: 0 };
export const PREMISSAS_PADRAO: Premissas = {
  anosObra: 2, anosOperacao: 20, anoBase: new Date().getFullYear() + 1, taxa: 0.10, ir: 0.34, depreciacaoAnos: 10,
  valorResidual: 0, rampa: [], cenarios: {
    pessimista: { preco: -0.10, volume: -0.10, capex: 0.15, opex: 0.10 },
    otimista: { preco: 0.10, volume: 0.05, capex: -0.05, opex: -0.05 },
  },
};
export const CAPEX_PADRAO: CapexEstudo = { mapas: [], adicional: 0, adicionalDescricao: '', desembolso: [0.5, 0.5], reinvestimentos: [] };

const num = (v: unknown, padrao: number) => (typeof v === 'number' && Number.isFinite(v) ? v : padrao);
/** Completa premissas vindas do banco (campos ausentes = padrão). */
export function normalizarPremissas(p: Partial<Premissas> | null | undefined): Premissas {
  const q = p ?? {};
  const aj = (a: Partial<AjusteCenario> | undefined, b: AjusteCenario): AjusteCenario =>
    ({ preco: num(a?.preco, b.preco), volume: num(a?.volume, b.volume), capex: num(a?.capex, b.capex), opex: num(a?.opex, b.opex) });
  return {
    anosObra: Math.max(0, Math.round(num(q.anosObra, PREMISSAS_PADRAO.anosObra))),
    anosOperacao: Math.max(1, Math.round(num(q.anosOperacao, PREMISSAS_PADRAO.anosOperacao))),
    anoBase: Math.round(num(q.anoBase, PREMISSAS_PADRAO.anoBase)),
    taxa: num(q.taxa, PREMISSAS_PADRAO.taxa),
    ir: num(q.ir, PREMISSAS_PADRAO.ir),
    depreciacaoAnos: Math.max(1, Math.round(num(q.depreciacaoAnos, PREMISSAS_PADRAO.depreciacaoAnos))),
    valorResidual: num(q.valorResidual, PREMISSAS_PADRAO.valorResidual),
    rampa: Array.isArray(q.rampa) ? q.rampa.map(x => num(x, 1)) : [],
    cenarios: {
      pessimista: aj(q.cenarios?.pessimista, PREMISSAS_PADRAO.cenarios.pessimista),
      otimista: aj(q.cenarios?.otimista, PREMISSAS_PADRAO.cenarios.otimista),
    },
  };
}
export function normalizarCapex(c: Partial<CapexEstudo> | null | undefined): CapexEstudo {
  const q = c ?? {};
  return {
    mapas: Array.isArray(q.mapas) ? q.mapas.filter(x => typeof x === 'string') : [],
    adicional: num(q.adicional, 0),
    adicionalDescricao: typeof q.adicionalDescricao === 'string' ? q.adicionalDescricao : '',
    desembolso: Array.isArray(q.desembolso) ? q.desembolso.map(x => num(x, 0)) : CAPEX_PADRAO.desembolso,
    reinvestimentos: Array.isArray(q.reinvestimentos)
      ? q.reinvestimentos.map(r => ({ ano: Math.round(num(r?.ano, 1)), descricao: String(r?.descricao ?? ''), valor: num(r?.valor, 0) })) : [],
  };
}

export interface AnoFluxo {
  ano: number; fase: 'obra' | 'operacao';
  receita: number; economia: number; opex: number; ebitda: number; depreciacao: number; ir: number;
  capex: number; caixa: number; acumulado: number; descontado: number; acumuladoDescontado: number;
}
export interface ResultadoEstudo {
  anos: AnoFluxo[];
  vpl: number;
  tir: number | null;
  payback: number | null;            // ano do projeto em que o acumulado fica ≥ 0
  paybackDescontado: number | null;
  capexTotal: number;                 // CapEx inicial (Mapas + adicional), já com o ajuste do cenário
  reinvestimentos: number;
  opexAnoCheio: number;               // OpEx de um ano com produção plena
  receitaAnoCheio: number;            // receita líquida (ou economia) de um ano pleno
  lcc: number;                        // custo do ciclo de vida: CapEx + reinvestimentos + Σ OpEx
}

export interface EntradaEstudo {
  tipo: TipoEstudo;
  premissas: Premissas;
  capexMapas: number;                 // soma do Total geral dos Mapas escolhidos (R$)
  capex: CapexEstudo;
  linhas: LinhaEstudo[];
  cambio: Record<string, number | null>;
}

export interface Sensibilidade { preco?: number; volume?: number; capex?: number; opexFixo?: number; opexVariavel?: number; taxa?: number }

/** Fração da capacidade no ano t (1 = plena). Obra = 0. */
function fatorRampa(t: number, p: Premissas) {
  const k = t - p.anosObra;           // 1 = primeiro ano de operação
  if (k < 1) return 0;
  return k <= p.rampa.length ? p.rampa[k - 1] : 1;
}

/** Valor de uma linha no ano t (R$, termos reais), sem ajustes de sensibilidade. */
export function valorLinha(l: LinhaEstudo, t: number, p: Premissas, cambio: Record<string, number | null>): number {
  if (l.titulo || l.quantidade === null || l.preco === null) return 0;
  const n = p.anosObra + p.anosOperacao;
  const ini = l.anoInicio ?? p.anosObra + 1, fim = l.anoFim ?? n;
  if (t < ini || t > fim || t < 1 || t > n) return 0;
  const fx = cambio[l.moeda] ?? (l.moeda === 'BRL' ? 1 : 0);
  let v = l.quantidade * l.preco * (fx ?? 0) * Math.pow(1 + (l.reajuste || 0), t - ini);
  if (l.comportamento === 'variavel') v *= fatorRampa(t, p);
  if (l.secao === 'receita') v *= 1 - (l.deducao || 0);
  return v;
}

/** Linhas que têm algum problema para o cálculo (sem quantidade/preço, moeda sem câmbio, anos invertidos). */
export function problemaLinha(l: LinhaEstudo, cambio: Record<string, number | null>): string | null {
  if (l.titulo) return null;
  if (l.quantidade === null || l.preco === null) return 'Falta quantidade ou preço';
  if (l.moeda !== 'BRL' && !cambio[l.moeda]) return `Moeda ${l.moeda} sem câmbio`;
  if (l.anoInicio !== null && l.anoFim !== null && l.anoFim < l.anoInicio) return 'Ano final antes do inicial';
  return null;
}

/** Ano em que o acumulado volta a ficar ≥ 0 depois de ter ficado negativo (sem investimento a recuperar = null). */
function recupera(anos: AnoFluxo[], v: (a: AnoFluxo) => number): number | null {
  let negativo = false;
  for (const a of anos) {
    if (v(a) < -1e-6) negativo = true;
    else if (negativo && v(a) >= 0) return a.ano;
  }
  return null;
}

const vplDe = (caixas: number[], taxa: number) => caixas.reduce((s, c, i) => s + c / Math.pow(1 + taxa, i + 1), 0);

/** TIR por bisseção. Null quando o fluxo não muda de sinal (não há TIR). */
export function tirDe(caixas: number[]): number | null {
  if (!caixas.some(c => c < 0) || !caixas.some(c => c > 0)) return null;
  let lo = -0.99, hi = 10;
  const flo = vplDe(caixas, lo), fhi = vplDe(caixas, hi);
  if (Math.sign(flo) === Math.sign(fhi)) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2, f = vplDe(caixas, mid);
    if (Math.abs(f) < 1e-9) return mid;
    if (Math.sign(f) === Math.sign(flo)) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

export function calcularEstudo(e: EntradaEstudo, s: Sensibilidade = {}): ResultadoEstudo {
  const p = e.premissas;
  const n = p.anosObra + p.anosOperacao;
  const taxa = p.taxa + (s.taxa ?? 0);
  const fPreco = 1 + (s.preco ?? 0), fVol = 1 + (s.volume ?? 0), fCapex = 1 + (s.capex ?? 0);
  const fOpFixo = 1 + (s.opexFixo ?? 0), fOpVar = 1 + (s.opexVariavel ?? 0);
  const capexTotal = (e.capexMapas + e.capex.adicional) * fCapex;
  // desembolso: frações normalizadas nos anos de obra (sem obra → tudo no ano 1)
  const fr = p.anosObra > 0 ? Array.from({ length: p.anosObra }, (_, i) => Math.max(0, e.capex.desembolso[i] ?? 0)) : [1];
  const somaFr = fr.reduce((a, b) => a + b, 0) || 1;
  const reinv = e.capex.reinvestimentos.filter(r => r.ano >= 1 && r.ano <= n).map(r => ({ ...r, valor: r.valor * fCapex }));
  const inicioDep = p.anosObra + 1;
  const linhas = e.linhas.filter(l => !l.titulo);
  const anos: AnoFluxo[] = [];
  let acum = 0, acumDesc = 0;
  for (let t = 1; t <= n; t++) {
    let receita = 0, economia = 0, opex = 0;
    for (const l of linhas) {
      const v = valorLinha(l, t, p, e.cambio);
      if (!v) continue;
      if (l.secao === 'receita') receita += v * fPreco * (l.comportamento === 'variavel' ? fVol : 1);
      else if (l.secao === 'economia') economia += v * fPreco * (l.comportamento === 'variavel' ? fVol : 1);
      else opex += v * (l.comportamento === 'variavel' ? fOpVar * fVol : fOpFixo);
    }
    if (e.tipo === 'economia') receita = 0; else economia = 0;
    const capexAno = (t <= fr.length ? capexTotal * fr[t - 1] / somaFr : 0) + reinv.filter(r => r.ano === t).reduce((a, r) => a + r.valor, 0);
    let dep = 0;
    if (t >= inicioDep && t < inicioDep + p.depreciacaoAnos) dep += capexTotal / p.depreciacaoAnos;
    for (const r of reinv) { const i0 = Math.max(r.ano + 1, inicioDep); if (t >= i0 && t < i0 + p.depreciacaoAnos) dep += r.valor / p.depreciacaoAnos; }
    const ebitda = receita + economia - opex;
    const ir = Math.max(0, ebitda - dep) * p.ir;
    const residual = t === n ? capexTotal * p.valorResidual : 0;
    const caixa = ebitda - ir - capexAno + residual;
    acum += caixa;
    const descontado = caixa / Math.pow(1 + taxa, t);
    acumDesc += descontado;
    anos.push({ ano: t, fase: t <= p.anosObra ? 'obra' : 'operacao', receita, economia, opex, ebitda, depreciacao: dep, ir,
      capex: capexAno, caixa, acumulado: acum, descontado, acumuladoDescontado: acumDesc });
  }
  const caixas = anos.map(a => a.caixa);
  const primeiroPleno = anos.find(a => a.fase === 'operacao' && fatorRampa(a.ano, p) >= 1) ?? anos[anos.length - 1];
  return {
    anos,
    vpl: vplDe(caixas, taxa),
    tir: tirDe(caixas),
    payback: recupera(anos, x => x.acumulado),
    paybackDescontado: recupera(anos, x => x.acumuladoDescontado),
    capexTotal,
    reinvestimentos: reinv.reduce((a, r) => a + r.valor, 0),
    opexAnoCheio: primeiroPleno?.opex ?? 0,
    receitaAnoCheio: (primeiroPleno?.receita ?? 0) + (primeiroPleno?.economia ?? 0),
    lcc: capexTotal + reinv.reduce((a, r) => a + r.valor, 0) + anos.reduce((a, x) => a + x.opex, 0),
  };
}

/** Gráfico tornado: VPL com cada premissa variando sozinha (−/+), ordenado pela amplitude. */
export function tornado(e: EntradaEstudo, delta = 0.2, deltaTaxa = 0.02) {
  const precoNome = e.tipo === 'economia' ? 'Economia gerada' : 'Preço do produto';
  const casos: [string, Sensibilidade, Sensibilidade][] = [
    [`${precoNome} (±${delta * 100}%)`, { preco: -delta }, { preco: delta }],
    [`Volume (±${delta * 100}%)`, { volume: -delta }, { volume: delta }],
    [`CapEx (±${delta * 100}%)`, { capex: delta }, { capex: -delta }],
    [`OpEx fixo (±${delta * 100}%)`, { opexFixo: delta }, { opexFixo: -delta }],
    [`OpEx variável (±${delta * 100}%)`, { opexVariavel: delta }, { opexVariavel: -delta }],
    [`Taxa de desconto (±${deltaTaxa * 100} p.p.)`, { taxa: deltaTaxa }, { taxa: -deltaTaxa }],
  ];
  const base = calcularEstudo(e).vpl;
  return {
    base,
    itens: casos.map(([nome, ruim, bom]) => ({ nome, baixo: calcularEstudo(e, ruim).vpl, alto: calcularEstudo(e, bom).vpl }))
      .sort((a, b) => Math.abs(b.alto - b.baixo) - Math.abs(a.alto - a.baixo)),
  };
}

/** Resultado de um cenário (pessimista/otimista) aplicando os ajustes das premissas. */
export function cenario(e: EntradaEstudo, aj: AjusteCenario): ResultadoEstudo {
  return calcularEstudo(e, { preco: aj.preco, volume: aj.volume, capex: aj.capex, opexFixo: aj.opex, opexVariavel: aj.opex });
}
