/** Item da grade da PX. As chaves seguem as colunas do modelo (ver colunas.ts). */
export interface Item {
  id: string;
  seq: number;          // Nº: ordem de entrada na PX, nunca muda
  titulo: boolean;      // linha de título (agrupador)
  pqdoc: string;        // Nº da PQ
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
}

export type Regime = 'NF' | 'IF' | 'NS' | 'IS';

/** Parâmetros de cálculo de cada empresa (vêm do banco). */
export interface Parametros {
  /** câmbio para R$ por código de moeda; moeda ausente ou nula = sem câmbio */
  cambio: Record<string, number | null>;
  aliquotas: Record<Regime, number>;
  /** códigos de pacote tributados como serviço nacional */
  pacotesServico: string[];
}

export type Check = 'OK' | 'INCOMPLETO' | 'ERRO' | 'TITULO';

export interface Resultado {
  pacote: boolean;      // item de pacote de serviço
  regime: Regime | '';
  chk: Check;
  base: number | null;  // preço total s/ tributos (R$)
  trib: number | null;
  parc: number | null;
  ger: number | null;
}
