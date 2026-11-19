/** Acesso ao banco. Converte entre as colunas do banco (português) e o Item do domínio. */
import { supabase } from './supabase';
import type { Item, Parametros, Regime } from '../dominio/tipos';

export type Papel = 'admin' | 'orcamentista' | 'revisor' | 'leitura';
export const NOME_PAPEL: Record<Papel, string> = {
  admin: 'Administrador', orcamentista: 'Orçamentista', revisor: 'Revisor', leitura: 'Somente leitura',
};

export interface Empresa { id: string; nome: string; papel: Papel }
export interface Cliente { id: string; nome: string }
export interface Projeto { id: string; cliente_id: string; nome: string }
export interface Modelo { id: string; empresa_id: string | null; nome: string; colunas: string[] }
export interface Px {
  id: string; projeto_id: string; codigo: string; nome: string; modelo_nome: string;
  colunas: string[]; observacoes: string; atualizado_em: string;
}
export interface Revisao { id: string; px_id: string; numero: number; emitida_em: string | null; total: number | null }
export interface Pasta { id: string; nome: string }
export interface Arquivo {
  id: string; pasta_id: string | null; nome: string; tipo: string; disciplina: string;
  caminho: string; tamanho: number | null; itens_lidos: number | null; situacao: string; enviado_em: string;
}
export interface Moeda { codigo: string; nome: string; simbolo: string; cambio_brl: number | null }

function ok<T>(r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(traduzErro(r.error.message));
  return r.data;
}

export function traduzErro(msg: string): string {
  if (/row-level security|permission denied/i.test(msg)) return 'Você não tem permissão para esta ação.';
  if (/duplicate key|unique/i.test(msg)) return 'Já existe um registro com esse nome.';
  if (/Invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos.';
  return msg;
}

// ------------------------------------------------------------------ empresas e equipe
export async function minhasEmpresas(): Promise<Empresa[]> {
  const { data: u } = await supabase.auth.getUser();
  const rows = ok(await supabase.from('membros').select('papel, empresas(id, nome)').eq('usuario_id', u.user?.id ?? ''));
  return (rows as unknown as { papel: Papel; empresas: { id: string; nome: string } }[])
    .map(r => ({ id: r.empresas.id, nome: r.empresas.nome, papel: r.papel }))
    .sort((a, b) => a.nome.localeCompare(b.nome));
}
export const criarEmpresa = async (nome: string) => ok(await supabase.rpc('criar_empresa', { nome })) as string;

export interface Membro { usuario_id: string; email: string; papel: Papel; pendente: boolean }
export const listarMembros = async (emp: string) => ok(await supabase.rpc('listar_membros', { emp })) as Membro[];
export const adicionarMembro = async (emp: string, email: string, papel: Papel) =>
  ok(await supabase.rpc('adicionar_membro', { emp, email_usuario: email, novo_papel: papel }));
/** Convida por e-mail (função de servidor). Conta ativa entra direto; nova recebe o e-mail de convite. */
export async function convidarMembro(emp: string, email: string, papel: Papel): Promise<'adicionado' | 'convidado'> {
  const { data, error } = await supabase.functions.invoke('convidar', {
    body: { empresa_id: emp, email, papel, redirect: window.location.origin },
  });
  if (error) {
    let msg = error.message;
    try { const corpo = await (error as { context?: Response }).context?.json(); if (corpo?.erro) msg = corpo.erro; } catch { /* sem corpo */ }
    throw new Error(traduzErro(msg));
  }
  return (data as { situacao: 'adicionado' | 'convidado' }).situacao;
}
export const mudarPapel = async (emp: string, uid: string, papel: Papel) =>
  ok(await supabase.from('membros').update({ papel }).eq('empresa_id', emp).eq('usuario_id', uid));
export const removerMembro = async (emp: string, uid: string) =>
  ok(await supabase.from('membros').delete().eq('empresa_id', emp).eq('usuario_id', uid));

// ------------------------------------------------------------------ parâmetros
export async function carregarParametros(emp: string): Promise<{ p: Parametros; moedas: Moeda[] }> {
  const [m, a, pk] = await Promise.all([
    supabase.from('moedas').select('codigo, nome, simbolo, cambio_brl').eq('empresa_id', emp).order('codigo'),
    supabase.from('aliquotas').select('regime, aliquota').eq('empresa_id', emp),
    supabase.from('pacotes_servico').select('codigo').eq('empresa_id', emp).order('codigo'),
  ]);
  const moedas = (ok(m) as Moeda[]).map(x => ({ ...x, cambio_brl: x.cambio_brl === null ? null : Number(x.cambio_brl) }));
  const aliquotas = { NF: 0, IF: 0, NS: 0, IS: 0 } as Record<Regime, number>;
  for (const r of ok(a) as { regime: Regime; aliquota: number }[]) aliquotas[r.regime] = Number(r.aliquota);
  return {
    moedas,
    p: {
      cambio: Object.fromEntries(moedas.map(x => [x.codigo, x.cambio_brl])),
      aliquotas,
      pacotesServico: (ok(pk) as { codigo: string }[]).map(x => x.codigo),
    },
  };
}
export const salvarMoeda = async (emp: string, m: Moeda) =>
  ok(await supabase.from('moedas').upsert({ empresa_id: emp, ...m }));
export const excluirMoeda = async (emp: string, codigo: string) =>
  ok(await supabase.from('moedas').delete().eq('empresa_id', emp).eq('codigo', codigo));
export const salvarAliquota = async (emp: string, regime: Regime, aliquota: number) =>
  ok(await supabase.from('aliquotas').upsert({ empresa_id: emp, regime, aliquota }));
export const adicionarPacote = async (emp: string, codigo: string) =>
  ok(await supabase.from('pacotes_servico').insert({ empresa_id: emp, codigo }));
export const excluirPacote = async (emp: string, codigo: string) =>
  ok(await supabase.from('pacotes_servico').delete().eq('empresa_id', emp).eq('codigo', codigo));

// ------------------------------------------------------------------ clientes, projetos, modelos, PX
export const listarClientes = async (emp: string) =>
  ok(await supabase.from('clientes').select('id, nome').eq('empresa_id', emp).order('nome')) as Cliente[];
export const criarCliente = async (emp: string, nome: string) =>
  ok(await supabase.from('clientes').insert({ empresa_id: emp, nome: nome.trim() }));
export const excluirCliente = async (id: string) => ok(await supabase.from('clientes').delete().eq('id', id));

export const listarProjetos = async (emp: string) =>
  ok(await supabase.from('projetos').select('id, cliente_id, nome').eq('empresa_id', emp).order('criado_em')) as Projeto[];
export const criarProjeto = async (emp: string, cliente_id: string, nome: string) =>
  ok(await supabase.from('projetos').insert({ empresa_id: emp, cliente_id, nome: nome.trim() }));
export const excluirProjeto = async (id: string) => ok(await supabase.from('projetos').delete().eq('id', id));

export const listarModelos = async () =>
  ok(await supabase.from('modelos').select('id, empresa_id, nome, colunas').order('criado_em')) as Modelo[];
export const salvarModelo = async (emp: string, nome: string, colunas: string[]) =>
  ok(await supabase.from('modelos').insert({ empresa_id: emp, nome, colunas }));
export const excluirModelo = async (id: string) => ok(await supabase.from('modelos').delete().eq('id', id));

const CAMPOS_PX = 'id, projeto_id, codigo, nome, modelo_nome, colunas, observacoes, atualizado_em';
export const listarPxs = async (emp: string) =>
  ok(await supabase.from('pxs').select(CAMPOS_PX).eq('empresa_id', emp).order('codigo')) as Px[];
export const lerPx = async (id: string) => ok(await supabase.from('pxs').select(CAMPOS_PX).eq('id', id).single()) as Px;
export const criarPx = async (projeto: string, nome: string, modelo_nome: string, colunas: string[], observacoes = '') =>
  ok(await supabase.rpc('criar_px', { projeto, nome, modelo_nome, colunas, observacoes })) as string;
export const atualizarPx = async (id: string, campos: Partial<Pick<Px, 'nome' | 'observacoes' | 'projeto_id'>>) =>
  ok(await supabase.from('pxs').update({ ...campos, atualizado_em: new Date().toISOString() }).eq('id', id));
export const excluirPx = async (id: string) => ok(await supabase.from('pxs').delete().eq('id', id));

export const listarRevisoes = async (pxId: string) =>
  (ok(await supabase.from('revisoes').select('id, px_id, numero, emitida_em, total').eq('px_id', pxId).order('numero')) as Revisao[])
    .map(r => ({ ...r, total: r.total === null ? null : Number(r.total) }));
/** Revisões de todas as PX da empresa (para os cartões). */
export const revisoesDaEmpresa = async (emp: string) =>
  ok(await supabase.from('revisoes').select('id, px_id, numero, emitida_em, total').eq('empresa_id', emp)) as Revisao[];
export const emitirRevisao = async (px: string, total: number) =>
  ok(await supabase.rpc('emitir_revisao', { px, total_geral: Math.round(total * 100) / 100 })) as string;

// ------------------------------------------------------------------ itens
interface ItemDb {
  id: string; posicao: number; seq: number; titulo: boolean; pq_doc: string; pq_item: string;
  area: string; subarea: string; ativo: string; descricao: string; unidade: string;
  quantidade: number | null; provisao: number | null; hh: number | null; pacote: string;
  tipo: string; natureza: string; moeda: string; preco: number | null; bdi: number | null;
}
export interface ItemPos extends Item { posicao: number }

const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));
const doBanco = (r: ItemDb): ItemPos => ({
  id: r.id, posicao: r.posicao, seq: r.seq, titulo: r.titulo, pqdoc: r.pq_doc, item: r.pq_item,
  area: r.area, subarea: r.subarea, ativo: r.ativo, desc: r.descricao, un: r.unidade,
  qtd: num(r.quantidade), prov: num(r.provisao), hh: num(r.hh), pacote: r.pacote, tipo: r.tipo,
  orig: r.natureza, moeda: r.moeda, preco: num(r.preco), bdi: num(r.bdi),
});
const MAPA_DB: Record<string, keyof ItemDb> = {
  seq: 'seq', titulo: 'titulo', pqdoc: 'pq_doc', item: 'pq_item', area: 'area', subarea: 'subarea', ativo: 'ativo',
  desc: 'descricao', un: 'unidade', qtd: 'quantidade', prov: 'provisao', hh: 'hh', pacote: 'pacote', tipo: 'tipo',
  orig: 'natureza', moeda: 'moeda', preco: 'preco', bdi: 'bdi', posicao: 'posicao',
};
export function paraBanco(campos: Partial<ItemPos>): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(campos)) if (MAPA_DB[k]) o[MAPA_DB[k]] = v ?? (typeof v === 'string' ? '' : null);
  for (const k of ['pq_doc', 'pq_item', 'area', 'subarea', 'ativo', 'descricao', 'unidade', 'pacote', 'tipo', 'natureza', 'moeda'])
    if (k in o && (o[k] === null || o[k] === undefined)) o[k] = '';
  return o;
}

export async function listarItens(revisao: string): Promise<ItemPos[]> {
  const todos: ItemPos[] = [];
  for (let de = 0; ; de += 1000) {
    const lote = ok(await supabase.from('itens').select('*').eq('revisao_id', revisao).order('posicao').range(de, de + 999)) as ItemDb[];
    todos.push(...lote.map(doBanco));
    if (lote.length < 1000) return todos;
  }
}

export async function inserirItens(emp: string, revisao: string, itens: ItemPos[]) {
  for (let i = 0; i < itens.length; i += 500) {
    const lote = itens.slice(i, i + 500).map(it => ({ id: it.id, empresa_id: emp, revisao_id: revisao, ...paraBanco(it) }));
    ok(await supabase.from('itens').insert(lote));
  }
}
export const atualizarItem = async (id: string, campos: Partial<ItemPos>) =>
  ok(await supabase.from('itens').update(paraBanco(campos)).eq('id', id));
export const excluirItem = async (id: string) => ok(await supabase.from('itens').delete().eq('id', id));
export const excluirItensDaRevisao = async (revisao: string) => ok(await supabase.from('itens').delete().eq('revisao_id', revisao));

// ------------------------------------------------------------------ biblioteca
export const listarPastas = async (emp: string) =>
  ok(await supabase.from('pastas').select('id, nome').eq('empresa_id', emp).order('nome')) as Pasta[];
export const criarPasta = async (emp: string, nome: string) =>
  ok(await supabase.from('pastas').insert({ empresa_id: emp, nome: nome.trim() }));
export const excluirPasta = async (id: string) => ok(await supabase.from('pastas').delete().eq('id', id));

export const listarArquivos = async (emp: string) =>
  ok(await supabase.from('arquivos').select('id, pasta_id, nome, tipo, disciplina, caminho, tamanho, itens_lidos, situacao, enviado_em')
    .eq('empresa_id', emp).order('enviado_em', { ascending: false })) as Arquivo[];

export async function enviarArquivo(emp: string, pasta: string | null, file: File, info: { tipo: string; itens: number | null; situacao: string }) {
  const caminho = `${emp}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]+/g, '_')}`;
  const up = await supabase.storage.from('biblioteca').upload(caminho, file);
  if (up.error) throw new Error(traduzErro(up.error.message));
  const { data: u } = await supabase.auth.getUser();
  ok(await supabase.from('arquivos').insert({
    empresa_id: emp, pasta_id: pasta, nome: file.name, tipo: info.tipo, caminho, tamanho: file.size,
    itens_lidos: info.itens, situacao: info.situacao, enviado_por: u.user?.id,
  }));
}
export const moverArquivo = async (id: string, pasta: string | null) =>
  ok(await supabase.from('arquivos').update({ pasta_id: pasta }).eq('id', id));
export async function excluirArquivo(a: Arquivo) {
  await supabase.storage.from('biblioteca').remove([a.caminho]);
  ok(await supabase.from('arquivos').delete().eq('id', a.id));
}
export async function baixarArquivo(a: Arquivo): Promise<ArrayBuffer> {
  const r = await supabase.storage.from('biblioteca').download(a.caminho);
  if (r.error) throw new Error(traduzErro(r.error.message));
  return r.data.arrayBuffer();
}
