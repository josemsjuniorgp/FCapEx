import { COLUNAS, PADROES } from './colunas';
import { chavePacote, vazio } from './normalizacao';
import type { Item, Parametros, Regime, Resultado } from './tipos';

const SERVICO = ['C', 'S', 'T', 'M'];
const TIPOS_PACOTE = ['F', 'C', 'S', 'T', 'M'];
const OBRIG_CALCULO = ['qtd', 'preco', 'pacote', 'moeda', 'orig', 'tipo'] as const;

/** Aplica os valores padrão às colunas que não fazem parte do modelo da PX. */
function comPadroes(item: Item, cols?: Set<string> | null): Item {
  if (!cols) return item;
  const r = { ...item } as Record<string, unknown>;
  for (const [k, v] of Object.entries(PADROES)) if (!cols.has(k)) r[k] = v;
  return r as unknown as Item;
}

export function calcular(item: Item, p: Parametros, cols?: Set<string> | null): Resultado {
  if (item.titulo) return { pacote: false, regime: '', chk: 'TITULO', liq: null, base: null, trib: null, parc: null, ger: null };
  const r = comPadroes(item, cols);
  const fx = p.cambio[String(r.moeda).toUpperCase()] ?? undefined;
  const pacotes = new Set(p.pacotesServico.map(chavePacote));
  const pacote = pacotes.has(chavePacote(r.pacote)) && TIPOS_PACOTE.includes(r.tipo);
  const isF = r.tipo === 'F', isSvc = SERVICO.includes(r.tipo);
  const valido = (r.orig === 'N' || r.orig === 'I') && (isF || isSvc);
  const regime = (pacote ? 'NS' : (r.orig === 'I' ? 'I' : 'N') + (isF ? 'F' : 'S')) as Regime;
  const faltando = OBRIG_CALCULO.some(k => vazio(r[k]));
  const semCambio = fx === undefined || fx === null;
  const out: Resultado = {
    pacote, regime,
    chk: faltando ? 'INCOMPLETO' : (!valido || semCambio) ? 'ERRO' : 'OK',
    liq: null, base: null, trib: null, parc: null, ger: null,
  };
  if (!vazio(r.qtd) && !vazio(r.preco) && !semCambio && (valido || pacote)) {
    out.liq = r.qtd! * r.preco! * fx!;
    out.base = out.liq * (1 + (r.bdi || 0));
    const aliq = p.aliquotas[regime] ?? 0;
    out.parc = out.base / (1 - aliq);
    out.trib = out.parc - out.base;
    out.ger = out.parc * (1 + (r.prov || 0));
  }
  return out;
}

const nomeCol = (k: string) => COLUNAS.find(c => c.k === k)?.h ?? k;

/** Mensagem detalhada do Check (mostrada ao passar o mouse). */
export function detalheCheck(item: Item, res: Resultado, p: Parametros, cols?: Set<string> | null): string {
  if (res.chk === 'TITULO') return 'Linha de título (agrupador): não tem quantidade nem preço e não entra nos totais.';
  if (res.chk === 'OK') return res.pacote
    ? 'Linha completa. Item de pacote de serviço: tributado como serviço nacional.'
    : 'Linha completa e classificada corretamente.';
  const r = comPadroes(item, cols);
  const msgs: string[] = [];
  const miss = OBRIG_CALCULO.filter(k => vazio(r[k]));
  if (miss.length) msgs.push(`Campos obrigatórios vazios: ${miss.map(nomeCol).join(', ')}. A linha só calcula depois de preenchidos.`);
  if (!vazio(r.orig) && !['N', 'I'].includes(r.orig)) msgs.push(`Natureza = "${r.orig}" não é válida. Escolha (N) Nacional ou (I) Importado.`);
  if (!vazio(r.tipo) && r.tipo !== 'F' && !SERVICO.includes(r.tipo))
    msgs.push(`Tipo de Trabalho = "${r.tipo}" não é válido. Escolha (F) Fornecimento, (C) Construção, (S) Serviços, (T) Turn-key ou (M) Montagem.`);
  if (!vazio(r.moeda) && (p.cambio[String(r.moeda).toUpperCase()] ?? null) === null)
    msgs.push(`Moeda "${r.moeda}" não tem câmbio cadastrado. Cadastre nos parâmetros da empresa ou escolha outra moeda.`);
  return msgs.join('\n') || 'Verifique os dados da linha.';
}

export interface Totais { ger: number; parc: number; liq: number; inc: number; err: number; tit: number; ok: number }

export function totais(itens: Item[], p: Parametros, cols?: Set<string> | null): Totais {
  const t: Totais = { ger: 0, parc: 0, liq: 0, inc: 0, err: 0, tit: 0, ok: 0 };
  for (const it of itens) {
    const c = calcular(it, p, cols);
    t.ger += c.ger || 0; t.parc += c.parc || 0; t.liq += c.liq || 0;
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
