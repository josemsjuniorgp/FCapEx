import { COLUNAS, PADROES } from './colunas';
import { vazio } from './normalizacao';
import type { Bdi, Frete, Item, Parametros, Resultado, Tributo } from './tipos';

const SERVICO = ['C', 'S', 'T', 'M'];
const OBRIG_CALCULO = ['qtd', 'preco', 'moeda', 'orig', 'tipo'] as const;

/** Aplica os valores padrão às colunas que não fazem parte do modelo da PX. */
function comPadroes(item: Item, cols?: Set<string> | null): Item {
  if (!cols) return item;
  const r = { ...item } as Record<string, unknown>;
  for (const [k, v] of Object.entries(PADROES)) if (!cols.has(k)) r[k] = v;
  return r as unknown as Item;
}

/** O tributo se aplica a esta linha pela regra (tipo × natureza)? */
export function tributoSeAplica(t: Tributo, tipo: string, orig: string): boolean {
  const porTipo = tipo === 'F' ? t.fornecimento : SERVICO.includes(tipo) ? t.servico : false;
  const porNatureza = orig === 'I' ? t.importado : orig === 'N' ? t.nacional : false;
  return porTipo && porNatureza;
}

/** Tributo ligado nesta linha: escolha manual da linha ou, sem escolha, a regra do tributo. */
export const tributoLigado = (t: Tributo, it: Item, tipo: string, orig: string) =>
  it.tribLigados?.[t.id] ?? tributoSeAplica(t, tipo, orig);

/**
 * BDI final pela composição, sem tributos (os tributos são calculados à parte em cada linha):
 * (1 + AC + S + G + R + parcelas personalizadas) × (1 + DF) × (1 + L) − 1
 */
export function bdiFinal(b: Pick<Bdi, 'administracao' | 'seguros' | 'garantias' | 'riscos' | 'financeiras' | 'lucro' | 'extras'>): number {
  const extras = (b.extras ?? []).reduce((s, e) => s + (Number(e.pct) || 0), 0);
  return (1 + b.administracao + b.seguros + b.garantias + b.riscos + extras) * (1 + b.financeiras) * (1 + b.lucro) - 1;
}

export const bdiDe = (p: Parametros, id: string | null | undefined): Bdi | null =>
  (id ? p.bdis?.find(b => b.id === id) ?? null : null);

const freteDe = (p: Parametros, id: string | null | undefined): Frete | null =>
  (id ? p.fretes.find(f => f.id === id) ?? null : null);

/** Valor do frete em R$: valor único por linha (convertido pela moeda do frete) ou % do valor líquido. */
function valorFrete(f: Frete | null, liq: number, p: Parametros): number | null {
  if (!f) return null;
  if (f.criterio === 'percentual') return liq * f.valor;
  return f.valor * (p.cambio[f.moeda] ?? 0);
}

export function calcular(item: Item, p: Parametros, cols?: Set<string> | null): Resultado {
  const vazioRes = { liq: null, fnacv: null, fintv: null, bdiv: null, base: null, trib: null, parc: null, ger: null, ligados: {}, tribs: {}, aliquota: 0 };
  if (item.titulo) return { chk: 'TITULO', ...vazioRes };
  const r = comPadroes(item, cols);
  const fx = p.cambio[String(r.moeda).toUpperCase()] ?? undefined;
  const isF = r.tipo === 'F', isSvc = SERVICO.includes(r.tipo);
  const valido = (r.orig === 'N' || r.orig === 'I') && (isF || isSvc);
  const faltando = OBRIG_CALCULO.some(k => vazio(r[k]));
  const semCambio = fx === undefined || fx === null;

  const ligados: Record<string, boolean> = {};
  let aliquota = 0;
  for (const t of p.tributos) {
    const on = tributoLigado(t, item, r.tipo, r.orig);
    ligados[t.id] = on;
    if (on) aliquota += t.aliquota;
  }
  const aliqInvalida = aliquota >= 1;
  const fretes = [freteDe(p, r.fnac), freteDe(p, r.fint)];
  const freteSemCambio = fretes.some(f => f && f.criterio === 'valor' && (p.cambio[f.moeda] ?? null) === null);
  const out: Resultado = {
    chk: faltando ? 'INCOMPLETO' : (!valido || semCambio || aliqInvalida || freteSemCambio) ? 'ERRO' : 'OK',
    ...vazioRes, ligados, aliquota,
  };
  if (!vazio(r.qtd) && !vazio(r.preco) && !semCambio && valido && !aliqInvalida && !freteSemCambio) {
    out.liq = r.qtd! * r.preco! * fx!;
    out.fnacv = valorFrete(fretes[0], out.liq, p);
    out.fintv = valorFrete(fretes[1], out.liq, p);
    const b = bdiDe(p, r.bdi);
    out.bdiv = b ? out.liq * bdiFinal(b) : null;
    out.base = out.liq + (out.bdiv || 0) + (out.fnacv || 0) + (out.fintv || 0);
    out.parc = out.base / (1 - aliquota);
    out.trib = out.parc - out.base;
    out.tribs = {};
    for (const t of p.tributos) if (ligados[t.id]) out.tribs[t.id] = out.parc * t.aliquota;
    out.ger = out.parc * (1 + (r.prov || 0));
  }
  return out;
}

const nomeCol = (k: string) => COLUNAS.find(c => c.k === k)?.h ?? k;
const pct = (v: number) => (v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 4 }) + '%';

/** Mensagem detalhada do Check (mostrada ao passar o mouse). */
export function detalheCheck(item: Item, res: Resultado, p: Parametros, cols?: Set<string> | null): string {
  if (res.chk === 'TITULO') return 'Linha de título (agrupador): não tem quantidade nem preço e não entra nos totais.';
  const nomes = p.tributos.filter(t => res.ligados[t.id]).map(t => `${t.nome} ${pct(t.aliquota)}`);
  const trib = nomes.length ? `Tributos ligados: ${nomes.join(', ')} (total ${pct(res.aliquota)}).` : 'Nenhum tributo ligado nesta linha.';
  const fr = [freteDe(p, item.fnac), freteDe(p, item.fint)].filter(Boolean).map(f => f!.nome);
  const b = bdiDe(p, item.bdi);
  const bdi = b ? ` BDI: ${b.nome} (${pct(bdiFinal(b))}).` : '';
  if (res.chk === 'OK') return `Linha completa e classificada corretamente. ${trib}${fr.length ? ` Frete: ${fr.join(' + ')}.` : ''}${bdi}`;
  const r = comPadroes(item, cols);
  const msgs: string[] = [];
  const miss = OBRIG_CALCULO.filter(k => vazio(r[k]));
  if (miss.length) msgs.push(`Campos obrigatórios vazios: ${miss.map(nomeCol).join(', ')}. A linha só calcula depois de preenchidos.`);
  if (!vazio(r.orig) && !['N', 'I'].includes(r.orig)) msgs.push(`Natureza = "${r.orig}" não é válida. Escolha (N) Nacional ou (I) Importado.`);
  if (!vazio(r.tipo) && r.tipo !== 'F' && !SERVICO.includes(r.tipo))
    msgs.push(`Tipo de Trabalho = "${r.tipo}" não é válido. Escolha (F) Fornecimento, (C) Construção, (S) Serviços, (T) Turn-key ou (M) Montagem.`);
  if (!vazio(r.moeda) && (p.cambio[String(r.moeda).toUpperCase()] ?? null) === null)
    msgs.push(`Moeda "${r.moeda}" não tem câmbio cadastrado. Cadastre nos parâmetros da empresa ou escolha outra moeda.`);
  for (const id of [r.fnac, r.fint]) {
    const f = freteDe(p, id);
    if (f && f.criterio === 'valor' && (p.cambio[f.moeda] ?? null) === null)
      msgs.push(`O frete "${f.nome}" está em ${f.moeda}, que não tem câmbio cadastrado. Cadastre o câmbio em Parâmetros.`);
  }
  if (res.aliquota >= 1) msgs.push(`A soma dos tributos ligados é ${pct(res.aliquota)}: precisa ser menor que 100%. Desligue algum tributo nesta linha.`);
  return msgs.join('\n') || 'Verifique os dados da linha.';
}

export interface Totais { ger: number; parc: number; liq: number; trib: number; bdiv: number; inc: number; err: number; tit: number; ok: number; porTributo: Record<string, number> }

export function totais(itens: Item[], p: Parametros, cols?: Set<string> | null): Totais {
  const t: Totais = { ger: 0, parc: 0, liq: 0, trib: 0, bdiv: 0, inc: 0, err: 0, tit: 0, ok: 0, porTributo: {} };
  for (const it of itens) {
    const c = calcular(it, p, cols);
    t.ger += c.ger || 0; t.parc += c.parc || 0; t.liq += c.liq || 0; t.trib += c.trib || 0; t.bdiv += c.bdiv || 0;
    for (const [id, v] of Object.entries(c.tribs)) t.porTributo[id] = (t.porTributo[id] || 0) + v;
    if (c.chk === 'INCOMPLETO') t.inc++; else if (c.chk === 'ERRO') t.err++; else if (c.chk === 'TITULO') t.tit++; else t.ok++;
  }
  return t;
}

/** Agrupa itens pelo título imediatamente acima (ordem da planilha). Retorna id do item → id do título. */
export function gruposPorTitulo(itens: Item[]): Map<string, string | null> {
  const g = new Map<string, string | null>();
  let atual: string | null = null;
  for (const it of itens) { if (it.titulo) atual = it.id; g.set(it.id, atual); }
  return g;
}

/** Cores das linhas de título por nível (1º = laranja escuro … 4º = laranja bem claro). Hex sem "#". */
export const CORES_TITULO = [
  { fundo: '9A3412', letra: 'FFFFFF' },
  { fundo: 'C2570C', letra: 'FFFFFF' },
  { fundo: 'F6B27A', letra: '431407' },
  { fundo: 'FCE1C7', letra: '431407' },
] as const;

/**
 * Nível de cada título (1 a 4) pela numeração do Item PQ: o nível mais alto da PX é o 1º título,
 * cada ponto a mais desce um nível; do 5º para baixo fica no 4º. Título sem número = 1º.
 */
export function niveisTitulos(itens: Item[]): Map<string, number> {
  const partes = (s: string) => s.trim().replace(/\.+$/, '').split('.').filter(Boolean).length;
  const titulos = itens.filter(i => i.titulo);
  const comNumero = titulos.map(t => partes(t.item)).filter(n => n > 0);
  const topo = comNumero.length ? Math.min(...comNumero) : 1;
  return new Map(titulos.map(t => {
    const n = partes(t.item);
    return [t.id, n ? Math.min(4, Math.max(1, n - topo + 1)) : 1];
  }));
}
