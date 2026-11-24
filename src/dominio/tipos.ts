/** Item da grade da PX. As chaves seguem as colunas do modelo (ver colunas.ts). */
export interface Item {
  id: string;
  seq: number;          // Nº: ordem de entrada na PX, nunca muda
  titulo: boolean;      // linha de título (agrupador)
  pqdoc: string;        // Documento de Origem
  item: string;         // Item PQ (só visualização)
  area: string;
  subarea: string;
  ativo: string;
  desc: string;
  un: string;
  qtd: number | null;
  prov: number | null;  // fração: 0,10 = 10%
  hh: number | null;
  pacote: string;
  tipo: string;         // F C S T M
  orig: string;         // Natureza: N I
  moeda: string;        // código ISO: BRL, USD, EUR…
  preco: number | null;
  bdi: number | null;   // fração
  /** escolha manual por tributo nesta linha (id do tributo → ligado/desligado); ausente = regra do tributo */
  tribLigados: Record<string, boolean>;
}

/** Tributo da empresa: alíquota e onde se aplica. */
export interface Tributo {
  id: string;
  nome: string;
  aliquota: number;      // fração: 0,0165 = 1,65%
  fornecimento: boolean; // aplica-se a Tipo F
  servico: boolean;      // aplica-se a Tipos C, S, T, M
  nacional: boolean;     // aplica-se a Natureza N
  importado: boolean;    // aplica-se a Natureza I
}

/** Parâmetros de cálculo de cada empresa (vêm do banco). */
export interface Parametros {
  /** câmbio para R$ por código de moeda; moeda ausente ou nula = sem câmbio */
  cambio: Record<string, number | null>;
  tributos: Tributo[];
}

export type Check = 'OK' | 'INCOMPLETO' | 'ERRO' | 'TITULO';

export interface Resultado {
  chk: Check;
  liq: number | null;   // líquido: quantidade × preço × câmbio (R$), sem BDI, tributos e provisão
  base: number | null;  // preço total s/ tributos (R$)
  trib: number | null;  // soma dos tributos ligados (R$)
  parc: number | null;
  ger: number | null;
  /** tributos ligados nesta linha (id → ligado) */
  ligados: Record<string, boolean>;
  /** valor de cada tributo ligado (R$) */
  tribs: Record<string, number>;
  /** soma das alíquotas ligadas */
  aliquota: number;
}
