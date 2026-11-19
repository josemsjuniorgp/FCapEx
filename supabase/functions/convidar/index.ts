// Função de servidor: o administrador convida alguém para a empresa por e-mail.
// - Conta já existente e ativa: entra direto na equipe (sem e-mail).
// - Conta nova ou que nunca entrou: recebe (ou recebe de novo) o e-mail de convite.
// Usa a chave service_role, que só existe no servidor. Sem dependências externas:
// conversa direto com as APIs de autenticação e de dados do Supabase.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const PAPEIS = ['admin', 'orcamentista', 'revisor', 'leitura'];
const resposta = (status: number, corpo: Record<string, unknown>) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const URL_BASE = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const comoServico = { apikey: SERVICO, Authorization: `Bearer ${SERVICO}`, 'Content-Type': 'application/json' };

async function api(caminho: string, init: RequestInit = {}) {
  const r = await fetch(URL_BASE + caminho, { ...init, headers: { ...comoServico, ...(init.headers ?? {}) } });
  const texto = await r.text();
  let corpo: unknown = null;
  try { corpo = texto ? JSON.parse(texto) : null; } catch { corpo = texto; }
  return { ok: r.ok, status: r.status, corpo };
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return resposta(405, { erro: 'Método não permitido' });

  // quem está chamando (valida o token da sessão no serviço de autenticação)
  const eu = await fetch(`${URL_BASE}/auth/v1/user`, {
    headers: { apikey: ANON, Authorization: req.headers.get('Authorization') ?? '' },
  });
  if (!eu.ok) return resposta(401, { erro: 'É preciso estar logado.' });
  const meuId = (await eu.json()).id as string;

  let corpo: { empresa_id?: string; email?: string; papel?: string; redirect?: string };
  try { corpo = await req.json(); } catch { return resposta(400, { erro: 'Pedido inválido.' }); }
  const email = String(corpo.email ?? '').trim().toLowerCase();
  const papel = String(corpo.papel ?? '');
  const empresa = String(corpo.empresa_id ?? '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return resposta(400, { erro: 'E-mail inválido.' });
  if (!PAPEIS.includes(papel)) return resposta(400, { erro: 'Papel inválido.' });
  if (!/^[0-9a-f-]{36}$/i.test(empresa)) return resposta(400, { erro: 'Empresa inválida.' });

  const meu = await api(`/rest/v1/membros?select=papel&empresa_id=eq.${empresa}&usuario_id=eq.${meuId}`);
  if (!(meu.corpo as { papel: string }[] | null)?.some(m => m.papel === 'admin'))
    return resposta(403, { erro: 'Só o administrador da empresa convida pessoas.' });

  const contas = await api('/rest/v1/rpc/conta_por_email', { method: 'POST', body: JSON.stringify({ email_busca: email }) });
  if (!contas.ok) return resposta(500, { erro: 'Falha ao consultar contas.' });
  const conta = (contas.corpo as { id: string; ja_entrou: boolean }[])[0];

  let usuarioId: string;
  let situacao: 'adicionado' | 'convidado';
  if (conta?.ja_entrou) {
    usuarioId = conta.id; situacao = 'adicionado';
  } else {
    const destino = corpo.redirect ? `?redirect_to=${encodeURIComponent(corpo.redirect)}` : '';
    const conv = await api(`/auth/v1/invite${destino}`, { method: 'POST', body: JSON.stringify({ email }) });
    if (!conv.ok) {
      const msg = JSON.stringify(conv.corpo);
      if (conv.status === 429 || /rate limit/i.test(msg))
        return resposta(429, { erro: 'Limite de e-mails por hora atingido. Tente mais tarde ou configure o serviço de e-mail próprio.' });
      return resposta(500, { erro: `Não foi possível enviar o convite: ${msg}` });
    }
    usuarioId = (conv.corpo as { id: string }).id; situacao = 'convidado';
  }

  const ins = await api('/rest/v1/membros?on_conflict=empresa_id,usuario_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ empresa_id: empresa, usuario_id: usuarioId, papel }),
  });
  if (!ins.ok) return resposta(500, { erro: `Não foi possível adicionar à equipe: ${JSON.stringify(ins.corpo)}` });
  return resposta(200, { situacao });
});
