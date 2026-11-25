/**
 * Largura automática das colunas da grade da PX, medida pelo texto real (cabeçalho e células).
 * Números nunca são cortados; textos curtos ficam justos; a Descrição tem largura máxima e quebra linha.
 */
import { idDoTributo, OPCOES, type Coluna } from '../dominio/colunas';
import type { Bdi, Frete, Item, Resultado } from '../dominio/tipos';
import { bdiFinal } from '../dominio/calculo';
import { nomeOrigem } from '../dominio/maturidade';

const FONTE = '13px "IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif';
const FONTE_CAB = '600 12px "IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif';
const PADDING = 18;        // padding horizontal da célula + folga
const FUNIL = 26;          // botão de filtro no cabeçalho
const SETA_SELECT = 30;    // seta da caixa de escolha
const CAIXINHA = 26;       // caixinha de ligar/desligar tributo

export const LIMITES = { min: 52, maxDesc: 440, maxTexto: 280, maxEscolha: 260, maxNumero: 320 };

let ctx: CanvasRenderingContext2D | null = null;
function medir(texto: string, fonte = FONTE): number {
  if (typeof document === 'undefined') return texto.length * 7.2;
  ctx ??= document.createElement('canvas').getContext('2d');
  if (!ctx) return texto.length * 7.2;
  ctx.font = fonte;
  return ctx.measureText(texto).width;
}

const nf = (n: number, d: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const ROT_CHK = { OK: 'OK', INCOMPLETO: 'Incompleto', ERRO: 'Erro de classificação', TITULO: 'Título' };

export interface ContextoLargura {
  itens: Item[];
  res: Map<string, Resultado>;
  moedas: { codigo: string; nome: string; simbolo: string }[];
  fretes: Frete[];
  bdis?: Bdi[];
}

/** Texto que a célula mostra (para medir). */
function textoDaCelula(c: Coluna, it: Item, r: Resultado | undefined, cx: ContextoLargura): string {
  const v = (it as unknown as Record<string, unknown>)[c.k];
  if (c.k === 'seq') return String(it.seq);
  if (it.titulo) return c.k === 'item' || c.k === 'desc' ? String(v ?? '') : '';
  if (c.t === 'tax') { const id = idDoTributo(c.k)!; const x = r?.tribs[id]; return x === undefined ? '0,00' : nf(x, 2); }
  if (c.t === 'calc') {
    if (c.k === 'chk') return r ? ROT_CHK[r.chk] : '';
    const x = r ? (r as unknown as Record<string, number | null>)[c.k] : null;
    return x === null || x === undefined ? '—' : nf(x, 2);
  }
  if (c.k === 'tipo' || c.k === 'orig') {
    const o = OPCOES[c.k].find(([k]) => k === v);
    return o ? `(${o[0]}) ${o[1]}` : v ? `(${v}) inválido` : 'escolher';
  }
  if (c.k === 'moeda') { const m = cx.moedas.find(x => x.codigo === v); return m ? `${m.nome} (${m.simbolo})` : 'escolher'; }
  if (c.k === 'origem') return nomeOrigem(String(v ?? '')) || 'escolher';
  if (c.k === 'bdi') { const b = cx.bdis?.find(x => x.id === v); return b ? `${b.nome} (${nf(bdiFinal(b) * 100, 2)}%)` : '-'; }
  if (c.k === 'fnac' || c.k === 'fint') { const f = cx.fretes.find(x => x.id === v); return f ? `${f.nome}${f.local ? ` · ${f.local}` : ''}` : 'sem frete'; }
  if (c.num) {
    if (v === null || v === undefined || v === '') return '';
    const n = Number(v);
    if (c.pct) return nf(n * 100, 1);
    const s = nf(n, c.dec ?? 2);
    if (c.k === 'preco') { const m = cx.moedas.find(x => x.codigo === it.moeda); return `${m?.simbolo ?? ''} ${s}`; }
    return s;
  }
  return String(v ?? '');
}

/** Largura automática (px) de cada coluna. */
export function largurasAutomaticas(colunas: Coluna[], cx: ContextoLargura): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of colunas) {
    if (c.k === 'seq') { out[c.k] = 56; continue; }
    const cab = medir(c.h, FONTE_CAB) + PADDING + (c.t === 'calc' || c.t === 'tax' ? 22 : 0) + FUNIL;
    let maior = 0;
    for (const it of cx.itens) {
      const t = textoDaCelula(c, it, cx.res.get(it.id), cx);
      if (!t) continue;
      const w = medir(t, it.titulo ? `600 ${FONTE}` : FONTE);
      if (w > maior) maior = w;
    }
    const escolha = ['tipo', 'orig', 'moeda', 'fnac', 'fint', 'bdi', 'origem'].includes(c.k);
    const numerica = c.num || c.t === 'calc' || c.t === 'tax';
    // números usam dígitos de largura igual (tabular), um pouco mais largos que os medidos: folga proporcional
    if (numerica) maior = maior * 1.1 + 6;
    let w = maior + PADDING + (escolha ? SETA_SELECT : 0) + (c.t === 'tax' ? CAIXINHA : 0) + (c.k === 'chk' ? 26 : 0);
    const max = c.k === 'desc' ? LIMITES.maxDesc : escolha ? LIMITES.maxEscolha : c.num || c.t === 'calc' || c.t === 'tax' ? LIMITES.maxNumero : LIMITES.maxTexto;
    w = Math.min(Math.max(w, cab, LIMITES.min), Math.max(max, cab));
    if (c.k === 'desc') w = Math.max(w, 220);
    out[c.k] = Math.ceil(w);
  }
  return out;
}
