/**
 * Interpretação de planilhas PQ, independente da biblioteca de Excel.
 * Entrada: matriz de células (texto exibido + valor bruto).
 */
import { COLUNAS, coluna } from './colunas';
import { normMoeda, normOrig, normTipo, normTxt, parseNum, vazio } from './normalizacao';
import type { Bdi, Item } from './tipos';
import { bdiFinal } from './calculo';
import { normOrigem } from './maturidade';

export interface Celula { txt: string; raw: unknown }
export type Matriz = Celula[][];

export interface ColunaFonte {
  i: number;          // índice da coluna na planilha
  h: string;          // cabeçalho lido (ou "Coluna X")
  auto: string | null; // destino reconhecido automaticamente
  deduzida: boolean;  // reconhecida pelo conteúdo, não pelo cabeçalho
}

export interface LinhaFonte { valores: Record<number, Celula>; titulo: boolean }

export interface Planilha { colunas: ColunaFonte[]; linhas: LinhaFonte[]; linhaCabecalho: number }

const MAPA: [string, RegExp][] = [
  ['subarea', /^sub.?area/],
  ['area', /^(area|cod\.? ?area|codigo da area)$/],
  ['ativo', /^(ativo|tag do ativo|cod\.? ?ativo|codigo do ativo)$/],
  ['item', /^(item|itens|item pq|cod|cod\.|codigo|n\.? ?item|no item|nº|n°)$/],
  ['desc', /descri|especifica|discrimina/],
  ['un', /^(un|und|unid|unidade|unidade de medida|um|u\.m\.?|un\.|unid\.)$/],
  ['qtd', /^(quant|qtde|qtd|qde|qt\.)/],
  ['hh', /^hh\b|homem.?hora|\bhh$/],
  ['preco', /(preco|valor|custo).*unit|^p\.? ?u\.?$/],
  ['moeda', /^moeda/],
  ['tipo', /^tipo( de trabalho)?$|forn.*mont/],
  ['origem', /^origem do preco|^fonte do preco|^tipo de cotacao|^origem da cotacao/],
  ['orig', /^n ?\/ ?i$|^nacional|^origem|^natureza/],
  ['pacote', /^pacote/],
  ['bdiv', /^bdi.*(r\$|valor)/],
  ['bdi', /^bdi/],
  ['prov', /^provis/],
  ['trib', /tribut/],
  ['parc', /total parcial/],
  ['ger', /total geral/],
  ['base', /(preco|valor) total/],
];

export function chaveDoCabecalho(rotulo: string): string | null {
  const n = normTxt(rotulo);
  if (!n || n.length > 45) return null;
  for (const [k, re] of MAPA) if (re.test(n)) return k;
  return null;
}

const NUM_ITEM = /^\d+(\.\d+)+\.?$/;
const UNIDADE = /^(un|und|unid|p[cç]|p[cç]s|m|ml|m2|m²|m3|m³|kg|g|t|ton|vb|verba|cj|conj|jg|h|hr|l|gl|km|m[eê]s|dia|lote)\.?$/i;

export function letraColuna(i: number): string {
  let s = ''; i++;
  while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); }
  return s;
}

export function interpretar(m: Matriz): Planilha {
  const T = (r: number, c: number) => (m[r]?.[c]?.txt ?? '').trim();
  const R = (r: number, c: number) => m[r]?.[c]?.raw;
  const largura = m.reduce((x, r) => Math.max(x, r.length), 0);

  // 1) cabeçalho: a linha (entre as 40 primeiras) com mais rótulos reconhecidos, mínimo 2
  let hRow = -1, melhor = 1;
  for (let i = 0; i < Math.min(40, m.length); i++) {
    const ks = new Set<string>();
    for (let c = 0; c < largura; c++) { const k = chaveDoCabecalho(T(i, c)); if (k) ks.add(k); }
    if (ks.size > melhor) { melhor = ks.size; hRow = i; }
  }
  const rotulo = (c: number) => (hRow < 0 ? '' : T(hRow, c) || (hRow > 0 ? T(hRow - 1, c) : ''));
  const key: (string | null)[] = Array(largura).fill(null);
  const ded: boolean[] = Array(largura).fill(false);
  const usadas = new Set<string>();
  for (let c = 0; c < largura; c++) {
    const k = chaveDoCabecalho(rotulo(c));
    if (k && !usadas.has(k)) { key[c] = k; usadas.add(k); }
  }
  const inicio = hRow + 1, fim = m.length;

  // 2) sem coluna de item: deduz pela numeração 1.1.1…
  if (!usadas.has('item')) {
    const cnt = Array(largura).fill(0);
    for (let r = inicio; r < Math.min(fim, inicio + 2000); r++) for (let c = 0; c < largura; c++) if (NUM_ITEM.test(T(r, c))) cnt[c]++;
    let bc = -1;
    cnt.forEach((v, c) => { if (!key[c] && v >= 2 && (bc < 0 || v > cnt[bc])) bc = c; });
    if (bc >= 0) { key[bc] = 'item'; ded[bc] = true; usadas.add('item'); }
  }
  const colItem = key.indexOf('item');

  // 3) linhas de dados: com numeração de item, ou com 3+ células preenchidas
  const dados: number[] = [];
  for (let r = inicio; r < fim; r++) {
    if (colItem >= 0) { if (NUM_ITEM.test(T(r, colItem))) dados.push(r); }
    else if ((m[r] || []).filter(x => x.txt.trim()).length >= 3) dados.push(r);
  }
  const vals = (c: number) => dados.map(r => T(r, c)).filter(Boolean);

  // 4) descrição: coluna de texto com maior comprimento médio (> 12)
  if (!usadas.has('desc')) {
    let bc = -1, bl = 12;
    for (let c = 0; c < largura; c++) {
      if (key[c]) continue;
      const v = vals(c).filter(s => !/^[\d.,\s%-]+$/.test(s));
      if (v.length < dados.length * 0.5) continue;
      const media = v.reduce((s, x) => s + x.length, 0) / v.length;
      if (media > bl) { bl = media; bc = c; }
    }
    if (bc >= 0) { key[bc] = 'desc'; ded[bc] = true; usadas.add('desc'); }
  }
  const colDesc = key.indexOf('desc');

  // 5) unidade: primeira coluna após a descrição com 60%+ de unidades conhecidas
  if (!usadas.has('un')) {
    for (let c = Math.max(0, colDesc + 1); c < largura; c++) {
      if (key[c]) continue;
      const v = vals(c);
      if (v.length && v.filter(s => UNIDADE.test(s)).length >= v.length * 0.6) { key[c] = 'un'; ded[c] = true; usadas.add('un'); break; }
    }
  }
  const colUn = key.indexOf('un');

  // 6) quantidade: coluna numérica após unidade/descrição, preferindo a que tem decimais
  if (!usadas.has('qtd')) {
    const cands: { c: number; dec: boolean }[] = [];
    for (let c = Math.max(colUn, colDesc) + 1; c < largura; c++) {
      if (key[c]) continue;
      const preenchidas = vals(c).length;
      if (!preenchidas || preenchidas < dados.length * 0.3) continue;
      const nums = dados.filter(r => typeof R(r, c) === 'number').length;
      if (nums < preenchidas * 0.8) continue;
      const dec = vals(c).filter(s => /[.,]\d{1,3}$/.test(s) && !/^\d{1,3}(\.\d{3})+$/.test(s)).length;
      cands.push({ c, dec: dec >= preenchidas * 0.5 });
    }
    const pick = cands.find(x => x.dec) || cands[0];
    if (pick) { key[pick.c] = 'qtd'; ded[pick.c] = true; usadas.add('qtd'); }
  }
  const colQtd = key.indexOf('qtd');

  const colunas: ColunaFonte[] = [];
  for (let c = 0; c < largura; c++) {
    if (!key[c] && !vals(c).length) continue;
    colunas.push({ i: c, h: rotulo(c) || `Coluna ${letraColuna(c)}`, auto: key[c], deduzida: ded[c] });
  }

  // título: quantidade vazia, "-", "0" ou "0,00" e sem unidade
  const linhas: LinhaFonte[] = dados.map(r => {
    const valores: Record<number, Celula> = {};
    for (const sc of colunas) valores[sc.i] = { txt: T(r, sc.i), raw: R(r, sc.i) };
    const titulo = colQtd >= 0 && /^(|-|–|0+([.,]0+)?)$/.test(T(r, colQtd)) && (colUn < 0 || !T(r, colUn));
    return { valores, titulo };
  });

  return { colunas, linhas, linhaCabecalho: hRow + 1 };
}

// ---------------------------------------------------------------------------
// Avaliação das colunas contra o modelo da PX e conversão em itens
// ---------------------------------------------------------------------------

export type SituacaoColuna = 'pertinente' | 'fora_modelo' | 'sem_correspondencia' | 'ignorada' | 'calculada' | 'duplicada';

export interface Avaliacao {
  situacao: SituacaoColuna[];
  faltandoObrigatorias: string[];   // chaves de colunas obrigatórias do modelo não fornecidas
  compatibilidade: number;          // % das colunas de entrada do modelo que o arquivo preenche
  bloqueios: string[];
  titulos: number;
}

/** Destino inicial de cada coluna: a coluna de entrada reconhecida, "__calc" se calculada, ou null. */
export function destinosIniciais(p: Planilha): (string | null)[] {
  return p.colunas.map(sc => {
    const c = sc.auto ? coluna(sc.auto) : undefined;
    return !c ? null : c.t === 'in' ? c.k : '__calc';
  });
}

export function avaliar(p: Planilha, destinos: (string | null)[], modelo: Set<string>): Avaliacao {
  const cnt: Record<string, number> = {};
  destinos.forEach(t => { if (t && t !== '__calc') cnt[t] = (cnt[t] || 0) + 1; });
  const dups = new Set(Object.keys(cnt).filter(k => cnt[k] > 1));
  const situacao: SituacaoColuna[] = p.colunas.map((sc, i) => {
    const t = destinos[i];
    if (t === '__calc') return 'calculada';
    if (!t) return sc.auto ? 'ignorada' : 'sem_correspondencia';
    if (dups.has(t)) return 'duplicada';
    if (!modelo.has(t)) return 'fora_modelo';
    return 'pertinente';
  });
  const fornecidas = new Set(destinos.filter((_, i) => situacao[i] === 'pertinente') as string[]);
  const entradas = COLUNAS.filter(c => c.t === 'in' && modelo.has(c.k));
  const faltandoObrigatorias = entradas.filter(c => c.req && !fornecidas.has(c.k)).map(c => c.k);
  const compatibilidade = entradas.length ? Math.round((fornecidas.size / entradas.length) * 100) : 0;
  const bloqueios: string[] = [];
  if (!fornecidas.has('desc')) bloqueios.push('Nenhuma coluna do arquivo foi ligada à Descrição.');
  if (dups.size) bloqueios.push('Há colunas do arquivo apontando para o mesmo destino.');
  return { situacao, faltandoObrigatorias, compatibilidade, bloqueios, titulos: p.linhas.filter(l => l.titulo).length };
}

function converter(cel: Celula | undefined, destino: string): string | number | null {
  const c = coluna(destino)!;
  if (c.num) {
    let v: unknown = cel?.raw;
    if (typeof v !== 'number') { const n = parseNum(cel?.txt ?? ''); v = Number.isNaN(n) ? null : n; }
    if (v !== null && c.pct && (v as number) > 1) v = (v as number) / 100;
    return v as number | null;
  }
  const s = vazio(cel?.txt) ? '' : String(cel!.txt).trim();
  if (destino === 'moeda') return normMoeda(s);
  if (destino === 'tipo') return normTipo(s);
  if (destino === 'orig') return normOrig(s);
  if (destino === 'origem') return normOrigem(s);
  if (destino === 'bdi') return typeof cel?.raw === 'number' ? cel.raw : s;
  return s;
}

/**
 * BDI vindo da planilha: liga ao BDI cadastrado com o mesmo nome ou com o mesmo percentual final.
 * Sem correspondência, a linha fica sem BDI ("-").
 */
export function bdiDaPlanilha(v: unknown, bdis: Bdi[]): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'string') {
    const nome = normTxt(v);
    const porNome = bdis.find(b => normTxt(b.nome) === nome);
    if (porNome) return porNome.id;
  }
  let n = typeof v === 'number' ? v : parseNum(String(v).replace('%', ''));
  if (Number.isNaN(n)) return null;
  if (Math.abs(n) > 1) n /= 100;
  const igual = bdis.find(b => Math.abs(bdiFinal(b) - n) < 0.00005);
  return igual?.id ?? null;
}

export const itemVazio = (id: string, seq: number): Item => ({
  id, seq, titulo: false, pqdoc: '', item: '', area: '', subarea: '', ativo: '', desc: '', un: '',
  qtd: null, prov: null, hh: null, pacote: '', tipo: '', orig: '', moeda: '', preco: null, bdi: null, tribLigados: {}, fnac: null, fint: null, origem: '',
});

export interface OpcoesImportacao {
  incluirTitulos: boolean;
  numeroPq: string;       // vai para a coluna Documento de Origem de todos os itens (menos títulos)
  seqInicial: number;     // próximo Nº da PX
  novoId: () => string;
  bdis?: Bdi[];           // BDIs cadastrados (para ligar a coluna BDI da planilha)
}

/**
 * Converte as linhas da planilha em itens, na ordem da planilha.
 * Títulos ficam só com Item PQ e Descrição; todo o resto vazio.
 */
export function paraItens(p: Planilha, destinos: (string | null)[], av: Avaliacao, o: OpcoesImportacao): Item[] {
  const out: Item[] = [];
  let seq = o.seqInicial;
  for (const l of p.linhas) {
    if (l.titulo && !o.incluirTitulos) continue;
    const it = itemVazio(o.novoId(), seq++) as unknown as Record<string, unknown>;
    p.colunas.forEach((sc, i) => {
      if (av.situacao[i] !== 'pertinente') return;
      const d = destinos[i]!;
      if (l.titulo && d !== 'item' && d !== 'desc') return;
      it[d] = converter(l.valores[sc.i], d);
    });
    if (l.titulo) it.titulo = true;
    else it.pqdoc = o.numeroPq;
    it.bdi = l.titulo ? null : bdiDaPlanilha(it.bdi, o.bdis ?? []);
    out.push(it as unknown as Item);
  }
  return out;
}
