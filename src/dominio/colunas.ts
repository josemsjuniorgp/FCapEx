export type TipoColuna = 'seq' | 'in' | 'calc';

export interface Coluna {
  k: string;
  h: string;          // cabeçalho
  g: string;          // grupo
  t: TipoColuna;
  req?: boolean;      // obrigatória para o cálculo
  lock?: boolean;     // não pode ser ocultada
  num?: boolean;
  pct?: boolean;
  dec?: number;
  w?: number;         // largura mínima (px)
  f?: string;         // fórmula (texto de ajuda)
}

export const COLUNAS: Coluna[] = [
  { k: 'seq', h: 'Nº', g: 'Identificação', t: 'seq', lock: true },
  { k: 'pqdoc', h: 'Nº da PQ', g: 'Identificação', t: 'in', w: 160 },
  { k: 'item', h: 'Item PQ', g: 'Identificação', t: 'in', w: 96 },
  { k: 'area', h: 'Área', g: 'Código EAP', t: 'in', w: 70 },
  { k: 'subarea', h: 'Subárea', g: 'Código EAP', t: 'in', w: 80 },
  { k: 'ativo', h: 'Ativo', g: 'Código EAP', t: 'in', w: 110 },
  { k: 'desc', h: 'Descrição', g: 'Item', t: 'in', req: true, lock: true, w: 340 },
  { k: 'un', h: 'Unid', g: 'Item', t: 'in', w: 60 },
  { k: 'qtd', h: 'Quantidade', g: 'Quantidades', t: 'in', num: true, req: true, dec: 2 },
  { k: 'prov', h: 'Provisão eng.', g: 'Quantidades', t: 'in', num: true, pct: true },
  { k: 'hh', h: 'HH', g: 'Quantidades', t: 'in', num: true, dec: 0 },
  { k: 'pacote', h: 'Pacote', g: 'Contratação', t: 'in', req: true },
  { k: 'tipo', h: 'Tipo de Trabalho', g: 'Contratação', t: 'in', req: true, w: 160 },
  { k: 'orig', h: 'Natureza', g: 'Contratação', t: 'in', req: true, w: 130 },
  { k: 'moeda', h: 'Moeda', g: 'Contratação', t: 'in', req: true, w: 130 },
  { k: 'preco', h: 'Preço unit.', g: 'Preço', t: 'in', num: true, req: true, dec: 2 },
  { k: 'bdi', h: 'BDI', g: 'Preço', t: 'in', num: true, pct: true },
  { k: 'base', h: 'Preço total s/ trib. (R$)', g: 'Preço', t: 'calc', f: 'qtd × preço × (1 + BDI) × câmbio' },
  { k: 'trib', h: 'Tributos (R$)', g: 'Tributos', t: 'calc', f: 'total ÷ (1 − alíquota) − base, conforme regime Natureza × Tipo' },
  { k: 'parc', h: 'Total parcial (R$)', g: 'Totais', t: 'calc', f: 'base + tributos' },
  { k: 'ger', h: 'Total geral (R$)', g: 'Totais', t: 'calc', f: 'parcial × (1 + provisão)', lock: true },
  { k: 'chk', h: 'Check', g: 'Totais', t: 'calc', lock: true },
];

export const coluna = (k: string) => COLUNAS.find(c => c.k === k);

/** Colunas que todo modelo precisa ter. */
export const OBRIGATORIAS = ['seq', 'desc', 'qtd', 'preco', 'ger', 'chk'];

export const OPCOES = {
  tipo: [['F', 'Fornecimento'], ['C', 'Construção'], ['S', 'Serviços'], ['T', 'Turn-key'], ['M', 'Montagem']],
  orig: [['N', 'Nacional'], ['I', 'Importado']],
} as const;

/** Valor usado no cálculo quando a coluna não faz parte do modelo da PX. */
export const PADROES = { un: '', prov: 0, hh: 0, pacote: 'N/A', tipo: 'F', orig: 'N', moeda: 'BRL', bdi: 0 } as const;
