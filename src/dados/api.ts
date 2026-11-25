/** Acesso ao banco. Converte entre as colunas do banco (português) e o Item do domínio. */
import { supabase } from './supabase';
import type { Bdi, Frete, Item, Parametros, Tributo } from '../dominio/tipos';

export type Papel = 'admin' | 'orcamentista' | 'revisor' | 'leitura';
export const NOME_PAPEL: Record<Papel, string> = {
  admin: 'Administrador', orcamentista: 'Orçamentista', revisor: 'Revisor', leitura: 'Somente leitura',
};

export interface Empresa { id: string; nome: string; papel: Papel }
export interface Cliente { id: string; nome: string }
export interface Projeto { id: string; cliente_id: string; nome: string; fase: string; classe: number | null }
export interface Modelo { id: string; empresa_id: string | null; nome: string; colunas: string[] }
export interface Px {
  id: string; projeto_id: string; codigo: string; nome: string; modelo_nome: string;
  colunas: string[]; observacoes: string; atualizado_em: string;
}
export interface Revisao { id: string; px_id: string; numero: number; emitida_em: string | null; total: number | null; bdis_congelados?: Bdi[] | null }
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
  if (/pxs_empresa_id_codigo_key/i.test(msg)) return 'Já existe um Mapa com esse código.';
  // mensagens das funções do banco (escritas quando o documento se chamava "PX")
  { const m = msg.match(/Já existe uma PX com o código (.*)/); if (m) return `Já existe um Mapa com o código ${m[1]}`; }
  if (/Sem permissão para criar PX/i.test(msg)) return 'Sem permissão para criar Mapa neste projeto.';
  if (/PX sem revisão em edição/i.test(msg)) return 'Mapa sem revisão em edição.';
  if (/pxs_codigo_tamanho/i.test(msg)) return 'O código do Mapa precisa ter entre 1 e 250 caracteres.';
  if (/fretes_empresa_id_tipo_nome_key/i.test(msg)) return 'Já existe um frete com esse nome.';
  if (/bdis_empresa_id_nome_key/i.test(msg)) return 'Já existe um BDI com esse nome.';
  if (/tributos_empresa_id_nome_key/i.test(msg)) return 'Já existe um tributo com esse nome.';
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
interface TributoDb { id: string; nome: string; aliquota: number; aplica_fornecimento: boolean; aplica_servico: boolean; aplica_nacional: boolean; aplica_importado: boolean }
const tributoDoBanco = (t: TributoDb): Tributo => ({
  id: t.id, nome: t.nome, aliquota: Number(t.aliquota),
  fornecimento: t.aplica_fornecimento, servico: t.aplica_servico, nacional: t.aplica_nacional, importado: t.aplica_importado,
});

const CAMPOS_BDI = 'id, nome, administracao, seguros, garantias, riscos, financeiras, lucro, extras';
/** Converte um BDI vindo do banco (números chegam como texto). */
export const bdiDoBanco = (b: Bdi): Bdi => ({
  id: b.id, nome: b.nome,
  administracao: Number(b.administracao), seguros: Number(b.seguros), garantias: Number(b.garantias),
  riscos: Number(b.riscos), financeiras: Number(b.financeiras), lucro: Number(b.lucro),
  extras: (Array.isArray(b.extras) ? b.extras : []).map(e => ({ nome: String(e.nome ?? ''), pct: Number(e.pct) || 0 })),
});

export async function carregarParametros(emp: string): Promise<{ p: Parametros; moedas: Moeda[] }> {
  const [m, tr, fr, bd] = await Promise.all([
    supabase.from('moedas').select('codigo, nome, simbolo, cambio_brl').eq('empresa_id', emp).order('codigo'),
    supabase.from('tributos').select('id, nome, aliquota, aplica_fornecimento, aplica_servico, aplica_nacional, aplica_importado')
      .eq('empresa_id', emp).order('ordem').order('criado_em'),
    supabase.from('fretes').select('id, tipo, nome, local, criterio, valor, moeda').eq('empresa_id', emp).order('criado_em'),
    supabase.from('bdis').select(CAMPOS_BDI).eq('empresa_id', emp).order('nome'),
  ]);
  const moedas = (ok(m) as Moeda[]).map(x => ({ ...x, cambio_brl: x.cambio_brl === null ? null : Number(x.cambio_brl) }));
  return {
    moedas,
    p: {
      cambio: Object.fromEntries(moedas.map(x => [x.codigo, x.cambio_brl])),
      tributos: (ok(tr) as TributoDb[]).map(tributoDoBanco),
      fretes: (ok(fr) as Frete[]).map(f => ({ ...f, valor: Number(f.valor) })),
      bdis: (ok(bd) as Bdi[]).map(bdiDoBanco),
    },
  };
}
export const salvarMoeda = async (emp: string, m: Moeda) =>
  ok(await supabase.from('moedas').upsert({ empresa_id: emp, ...m }));
export const excluirMoeda = async (emp: string, codigo: string) =>
  ok(await supabase.from('moedas').delete().eq('empresa_id', emp).eq('codigo', codigo));
/** Cria ou altera um tributo da empresa. */
export async function salvarTributo(emp: string, t: Omit<Tributo, 'id'> & { id?: string }) {
  const linha = {
    empresa_id: emp, nome: t.nome.trim(), aliquota: t.aliquota,
    aplica_fornecimento: t.fornecimento, aplica_servico: t.servico, aplica_nacional: t.nacional, aplica_importado: t.importado,
  };
  if (t.id) ok(await supabase.from('tributos').update(linha).eq('id', t.id));
  else ok(await supabase.from('tributos').insert({ ...linha, ordem: 100 }));
}
/** Cria ou altera um frete da empresa. */
export async function salvarFrete(emp: string, f: Omit<Frete, 'id'> & { id?: string }) {
  const linha = { empresa_id: emp, tipo: f.tipo, nome: f.nome.trim(), local: f.local.trim(), criterio: f.criterio, valor: f.valor, moeda: f.tipo === 'nacional' ? 'BRL' : f.moeda };
  if (f.id) ok(await supabase.from('fretes').update(linha).eq('id', f.id));
  else ok(await supabase.from('fretes').insert(linha));
}
/** Cria ou altera um BDI da empresa (Administrador e Orçamentista). Devolve o id. */
export async function salvarBdi(emp: string, b: Omit<Bdi, 'id'> & { id?: string }): Promise<string> {
  const linha = {
    empresa_id: emp, nome: b.nome.trim(), administracao: b.administracao, seguros: b.seguros, garantias: b.garantias,
    riscos: b.riscos, financeiras: b.financeiras, lucro: b.lucro,
    extras: b.extras.filter(e => e.nome.trim() || e.pct).map(e => ({ nome: e.nome.trim(), pct: e.pct })),
  };
  if (b.id) { ok(await supabase.from('bdis').update(linha).eq('id', b.id)); return b.id; }
  return (ok(await supabase.from('bdis').insert(linha).select('id').single()) as { id: string }).id;
}
export const excluirBdi = async (id: string) => ok(await supabase.from('bdis').delete().eq('id', id));
/** Quantas linhas (de revisões em edição) usam cada BDI. */
export async function usoDosBdis(emp: string): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (let de = 0; ; de += 1000) {
    const lote = ok(await supabase.from('itens').select('bdi_id, revisoes!inner(emitida_em)').eq('empresa_id', emp)
      .not('bdi_id', 'is', null).is('revisoes.emitida_em', null).range(de, de + 999)) as unknown as { bdi_id: string }[];
    for (const r of lote) out[r.bdi_id] = (out[r.bdi_id] || 0) + 1;
    if (lote.length < 1000) return out;
  }
}
export const excluirFrete = async (id: string) => ok(await supabase.from('fretes').delete().eq('id', id));
export const excluirTributo = async (id: string) => ok(await supabase.from('tributos').delete().eq('id', id));

// ------------------------------------------------------------------ clientes, projetos, modelos, PX
export const listarClientes = async (emp: string) =>
  ok(await supabase.from('clientes').select('id, nome').eq('empresa_id', emp).order('nome')) as Cliente[];
export const criarCliente = async (emp: string, nome: string) =>
  ok(await supabase.from('clientes').insert({ empresa_id: emp, nome: nome.trim() }));
export const excluirCliente = async (id: string) => ok(await supabase.from('clientes').delete().eq('id', id));

export const listarProjetos = async (emp: string) =>
  ok(await supabase.from('projetos').select('id, cliente_id, nome, fase, classe').eq('empresa_id', emp).order('criado_em')) as Projeto[];
export const criarProjeto = async (emp: string, cliente_id: string, nome: string, fase = '', classe: number | null = null) =>
  ok(await supabase.from('projetos').insert({ empresa_id: emp, cliente_id, nome: nome.trim(), fase: fase.trim(), classe }));
/** Altera nome, fase e classe AACE do projeto. */
export const atualizarProjeto = async (id: string, campos: { nome?: string; fase?: string; classe?: number | null }) =>
  ok(await supabase.from('projetos').update({ ...campos, ...(campos.nome !== undefined ? { nome: campos.nome.trim() } : {}), ...(campos.fase !== undefined ? { fase: campos.fase.trim() } : {}) }).eq('id', id));
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
/** Cria a PX com o código digitado pelo usuário (texto livre, único na empresa). */
export const criarPx = async (projeto: string, codigo: string, nome: string, modelo_nome: string, colunas: string[]) =>
  ok(await supabase.rpc('criar_px', { projeto, nome, modelo_nome, colunas, observacoes: '', codigo_manual: codigo.trim() })) as string;
export const atualizarPx = async (id: string, campos: Partial<Pick<Px, 'nome' | 'observacoes' | 'projeto_id' | 'codigo' | 'colunas'>>) =>
  ok(await supabase.from('pxs').update({ ...campos, atualizado_em: new Date().toISOString() }).eq('id', id));
export const excluirPx = async (id: string) => ok(await supabase.from('pxs').delete().eq('id', id));

export const listarRevisoes = async (pxId: string) =>
  (ok(await supabase.from('revisoes').select('id, px_id, numero, emitida_em, total, bdis_congelados').eq('px_id', pxId).order('numero')) as Revisao[])
    .map(r => ({ ...r, total: r.total === null ? null : Number(r.total), bdis_congelados: r.bdis_congelados ? r.bdis_congelados.map(bdiDoBanco) : null }));
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
  tipo: string; natureza: string; moeda: string; preco: number | null; bdi_id: string | null;
  tributos_ligados: Record<string, boolean> | null;
  frete_nacional: string | null; frete_internacional: string | null; origem: string | null;
}
export interface ItemPos extends Item { posicao: number }

const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));
const doBanco = (r: ItemDb): ItemPos => ({
  id: r.id, posicao: r.posicao, seq: r.seq, titulo: r.titulo, pqdoc: r.pq_doc, item: r.pq_item,
  area: r.area, subarea: r.subarea, ativo: r.ativo, desc: r.descricao, un: r.unidade,
  qtd: num(r.quantidade), prov: num(r.provisao), hh: num(r.hh), pacote: r.pacote, tipo: r.tipo,
  orig: r.natureza, moeda: r.moeda, preco: num(r.preco), bdi: r.bdi_id ?? null, tribLigados: r.tributos_ligados ?? {},
  fnac: r.frete_nacional, fint: r.frete_internacional, origem: r.origem ?? '',
});
const MAPA_DB: Record<string, keyof ItemDb> = {
  seq: 'seq', titulo: 'titulo', pqdoc: 'pq_doc', item: 'pq_item', area: 'area', subarea: 'subarea', ativo: 'ativo',
  desc: 'descricao', un: 'unidade', qtd: 'quantidade', prov: 'provisao', hh: 'hh', pacote: 'pacote', tipo: 'tipo',
  orig: 'natureza', moeda: 'moeda', preco: 'preco', bdi: 'bdi_id', posicao: 'posicao', tribLigados: 'tributos_ligados',
  fnac: 'frete_nacional', fint: 'frete_internacional', origem: 'origem',
};
export function paraBanco(campos: Partial<ItemPos>): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(campos)) if (MAPA_DB[k]) o[MAPA_DB[k]] = v ?? (typeof v === 'string' ? '' : null);
  for (const k of ['pq_doc', 'pq_item', 'area', 'subarea', 'ativo', 'descricao', 'unidade', 'pacote', 'tipo', 'natureza', 'moeda', 'origem'])
    if (k in o && (o[k] === null || o[k] === undefined)) o[k] = '';
  if ('tributos_ligados' in o && !o.tributos_ligados) o.tributos_ligados = {};
  for (const k of ['frete_nacional', 'frete_internacional', 'bdi_id']) if (k in o && !o[k]) o[k] = null;
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
/** Exclui várias linhas de uma vez (usado pelo desfazer). */
export async function excluirItens(ids: string[]) {
  for (let i = 0; i < ids.length; i += 200) ok(await supabase.from('itens').delete().in('id', ids.slice(i, i + 200)));
}
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
