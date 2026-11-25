import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { lerExcel } from './excel';
import { avaliar, bdiDaPlanilha, contarZerados, destinosIniciais, paraItens } from './pq';

const PADRAO = new Set(['seq', 'pqdoc', 'item', 'area', 'subarea', 'ativo', 'desc', 'un', 'qtd', 'prov', 'hh', 'pacote', 'tipo', 'orig', 'moeda', 'preco', 'bdi', 'bdiv', 'base', 'trib', 'parc', 'ger', 'chk']);
const SIMPLES = new Set(['seq', 'pqdoc', 'item', 'area', 'subarea', 'ativo', 'desc', 'un', 'qtd', 'moeda', 'preco', 'bdi', 'base', 'parc', 'ger', 'chk']);

// Formato da PQ real do usuário: títulos 1.1.1 / 1.1.1.1, colunas de código (22, 2200, C, 75, 15…)
const LINHAS: (string | number | null)[][] = [
  ['1.1', 22, 2200, 'C', 75, 15, 'CONSTRUÇÃO DE INSTALAÇÕES PROVISÓRIAS DO CANTEIRO DE OBRAS', '', null],
  ['1.1.1', 22, 2200, 'C', 75, 15, 'EDIFICAÇÕES DE APOIO', '', '-'],
  ['1.1.1.1.1', 22, 2200, 'C', 75, 15, 'FORNECIMENTO E MONTAGEM DE PORTARIA EM CONTAINER – 13,69 m2', 'vb', 1],
  ['1.1.1.1.2', 22, 2200, 'C', 75, 15, 'FORNECIMENTO E MONTAGEM DE REFEITÓRIO EM ESTRUTURA METÁLICA', 'vb', 1],
  ['1.1.1.1.2', 22, 2200, 'C', 75, 6, 'ITEM COM NÚMERO REPETIDO NA PQ, QUE NÃO PODE SER DESCARTADO', 'm2', 12.5],
  ['1.1.1.1.0', 22, 2200, 'C', 75, 5, 'ITEM FORA DA ORDEM NUMÉRICA, QUE DEVE FICAR NA ORDEM DA PLANILHA', 'un', 3],
];

async function xlsx(cabecalho: string[] | null, linhas = LINHAS): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet('Capa').addRow(['Planilha de quantidades — capa sem itens']);
  const ws = wb.addWorksheet('PQ');
  ws.addRow(['PLANILHA DE QUANTIDADES']);
  if (cabecalho) ws.addRow(cabecalho);
  linhas.forEach(l => ws.addRow(l));
  ws.getColumn(9).numFmt = '0.00';
  const b = await wb.xlsx.writeBuffer();
  return b as ArrayBuffer;
}

let n = 0;
const novoId = () => `id${++n}`;

describe('leitura de PQ com cabeçalho', async () => {
  const buf = await xlsx(['ITEM', 'Área', 'Subárea', 'TIPO', 'X', 'Y', 'DESCRIÇÃO', 'UNID', 'QUANTIDADE']);
  const abas = await lerExcel(buf);
  const p = abas[0].planilha;
  const dest = destinosIniciais(p);

  it('escolhe a aba com itens e acha o cabeçalho', () => {
    expect(abas.map(a => a.nome)).toEqual(['PQ']);
    expect(p.linhaCabecalho).toBe(2);
  });

  it('reconhece as colunas pelo cabeçalho', () => {
    const auto = p.colunas.map(c => c.auto);
    expect(auto).toEqual(expect.arrayContaining(['item', 'area', 'subarea', 'tipo', 'desc', 'un', 'qtd']));
  });

  it('marca colunas fora do modelo e calcula compatibilidade', () => {
    const av = avaliar(p, dest, SIMPLES);
    const tipo = p.colunas.findIndex(c => c.auto === 'tipo');
    expect(av.situacao[tipo]).toBe('fora_modelo');
    expect(av.faltandoObrigatorias).toContain('preco');
    expect(av.bloqueios).toEqual([]);
  });

  it('mantém a ordem da planilha, não junta números repetidos e títulos ficam vazios', () => {
    const av = avaliar(p, dest, PADRAO);
    const itens = paraItens(p, dest, av, { incluirTitulos: true, numeroPq: 'PQ-001', seqInicial: 1, novoId });
    expect(itens.map(i => i.item)).toEqual(['1.1', '1.1.1', '1.1.1.1.1', '1.1.1.1.2', '1.1.1.1.2', '1.1.1.1.0']);
    expect(itens.map(i => i.seq)).toEqual([1, 2, 3, 4, 5, 6]);
    const [t1, t2, a] = itens;
    expect(t1.titulo && t2.titulo).toBe(true);
    for (const t of [t1, t2]) {
      expect(t).toMatchObject({ qtd: null, un: '', area: '', subarea: '', tipo: '', pqdoc: '', preco: null });
    }
    expect(a).toMatchObject({ titulo: false, qtd: 1, un: 'vb', area: '22', subarea: '2200', tipo: 'C', pqdoc: 'PQ-001' });
    expect(itens[4].qtd).toBe(12.5);
    expect(JSON.stringify(itens)).not.toContain('undefined');
  });

  it('quantidade zero ou vazia: opção de não importar (Nº continua sem buracos)', () => {
    const q = { ...p, linhas: p.linhas.map((l, i) => (i === 2 ? { ...l, valores: { ...l.valores, [p.colunas.find(c => c.auto === 'qtd')!.i]: { txt: '0', raw: 0 } } } : l)) };
    const av = avaliar(q, dest, PADRAO);
    expect(contarZerados(q, dest, av)).toBe(1);
    const com = paraItens(q, dest, av, { incluirTitulos: true, numeroPq: '', seqInicial: 1, novoId });
    const sem = paraItens(q, dest, av, { incluirTitulos: true, numeroPq: '', seqInicial: 1, novoId, incluirZerados: false });
    expect(sem).toHaveLength(com.length - 1);
    expect(sem.every(i => i.titulo || i.qtd)).toBe(true);
    expect(sem.map(i => i.seq)).toEqual(sem.map((_, k) => k + 1));
  });

  it('sem incluir títulos, só os itens entram', () => {
    const av = avaliar(p, dest, PADRAO);
    const itens = paraItens(p, dest, av, { incluirTitulos: false, numeroPq: '', seqInicial: 10, novoId });
    expect(itens).toHaveLength(4);
    expect(itens[0].seq).toBe(10);
  });
});

describe('leitura de PQ sem cabeçalho', async () => {
  const p = (await lerExcel(await xlsx(null)))[0].planilha;

  it('deduz item, descrição, unidade e quantidade pelo conteúdo, sem confundir colunas de código', () => {
    const porChave = Object.fromEntries(p.colunas.filter(c => c.auto).map(c => [c.auto, c.i]));
    expect(porChave).toMatchObject({ item: 0, desc: 6, un: 7, qtd: 8 });
    expect(p.colunas.filter(c => c.auto).every(c => c.deduzida)).toBe(true);
  });

  it('Área/Subárea ficam vazias quando a PQ não as identifica', () => {
    const dest = destinosIniciais(p);
    const av = avaliar(p, dest, PADRAO);
    const itens = paraItens(p, dest, av, { incluirTitulos: false, numeroPq: '', seqInicial: 1, novoId });
    expect(itens.every(i => i.area === '' && i.subarea === '' && i.ativo === '')).toBe(true);
  });
});

describe('bloqueios da importação', async () => {
  const p = (await lerExcel(await xlsx(['ITEM', 'Área', 'Subárea', 'TIPO', 'X', 'Y', 'DESCRIÇÃO', 'UNID', 'QUANTIDADE'])))[0].planilha;
  it('duas colunas no mesmo destino bloqueiam', () => {
    const dest = destinosIniciais(p);
    dest[1] = 'subarea';
    expect(avaliar(p, dest, PADRAO).bloqueios.join()).toContain('mesmo destino');
  });
  it('sem descrição bloqueia', () => {
    const dest = destinosIniciais(p).map(d => (d === 'desc' ? null : d));
    expect(avaliar(p, dest, PADRAO).bloqueios.join()).toContain('Descrição');
  });
  it('textos de tipo, natureza e moeda são normalizados', async () => {
    const linhas = [['1.1.1', 'Fornecimento', 'Importado', 'Dólar', 'Bomba centrífuga de 150 kW', 'un', 2]];
    const q = (await lerExcel(await xlsx(['Item', 'Tipo de Trabalho', 'Natureza', 'Moeda', 'Descrição', 'Un', 'Qtde'], linhas)))[0].planilha;
    const dest = destinosIniciais(q);
    const [it1] = paraItens(q, dest, avaliar(q, dest, PADRAO), { incluirTitulos: false, numeroPq: '', seqInicial: 1, novoId });
    expect(it1).toMatchObject({ tipo: 'F', orig: 'I', moeda: 'USD', qtd: 2 });
  });
});

describe('BDI vindo da planilha', () => {
  const bdis = [
    { id: 'civ', nome: 'BDI Obras Civis', administracao: 0.04, seguros: 0, garantias: 0, riscos: 0, financeiras: 0, lucro: 0.1, extras: [] },
    { id: 'f', nome: 'Fornecimento', administracao: 0, seguros: 0, garantias: 0, riscos: 0, financeiras: 0, lucro: 0.12, extras: [] },
  ];
  it('liga pelo nome (sem diferenciar maiúsculas/acentos) ou pelo percentual final', () => {
    expect(bdiDaPlanilha('bdi obras civis', bdis)).toBe('civ');
    expect(bdiDaPlanilha(0.12, bdis)).toBe('f');
    expect(bdiDaPlanilha('12%', bdis)).toBe('f');
    expect(bdiDaPlanilha('14,4', bdis)).toBe('civ');           // (1,04)(1,10) − 1 = 14,4%
  });
  it('sem correspondência ou vazio: sem BDI', () => {
    expect(bdiDaPlanilha(0.33, bdis)).toBeNull();
    expect(bdiDaPlanilha('', bdis)).toBeNull();
    expect(bdiDaPlanilha('Outro', bdis)).toBeNull();
  });
});
