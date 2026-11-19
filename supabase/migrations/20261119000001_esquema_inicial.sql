-- FCapEx — esquema inicial (multiempresa)
-- Toda tabela de negócio carrega org_id e é protegida por RLS:
-- um usuário só lê/escreve dados das empresas das quais é membro.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------
-- Empresas (tenants) e membros
-- ---------------------------------------------------------------
create type public.papel as enum ('admin', 'orcamentista', 'revisor', 'leitura');

create table public.empresas (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null check (length(trim(nome)) > 0),
  px_seq      integer not null default 0,           -- contador do código PX-0001…
  criado_em   timestamptz not null default now()
);

create table public.membros (
  empresa_id  uuid not null references public.empresas(id) on delete cascade,
  usuario_id  uuid not null references auth.users(id) on delete cascade,
  papel       public.papel not null default 'leitura',
  criado_em   timestamptz not null default now(),
  primary key (empresa_id, usuario_id)
);
create index on public.membros (usuario_id);

-- Funções auxiliares das políticas (security definer evita recursão de RLS em membros)
create or replace function public.eh_membro(emp uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.membros where empresa_id = emp and usuario_id = auth.uid());
$$;

create or replace function public.tem_papel(emp uuid, papeis public.papel[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.membros
                 where empresa_id = emp and usuario_id = auth.uid() and papel = any(papeis));
$$;

-- Atalhos legíveis
create or replace function public.pode_editar(emp uuid)
returns boolean language sql stable as $$
  select public.tem_papel(emp, array['admin','orcamentista']::public.papel[]);
$$;
create or replace function public.eh_admin(emp uuid)
returns boolean language sql stable as $$
  select public.tem_papel(emp, array['admin']::public.papel[]);
$$;

-- ---------------------------------------------------------------
-- Parâmetros por empresa: moedas/câmbio, alíquotas, pacotes de serviço
-- ---------------------------------------------------------------
create table public.moedas (
  empresa_id  uuid not null references public.empresas(id) on delete cascade,
  codigo      text not null check (codigo ~ '^[A-Z]{3}$'),
  nome        text not null,
  simbolo     text not null,
  cambio_brl  numeric(18,6) check (cambio_brl > 0),   -- nulo = sem câmbio cadastrado (gera erro no Check)
  primary key (empresa_id, codigo)
);

-- Regimes: NF nacional fornecimento, IF importado fornecimento, NS nacional serviço, IS importado serviço
create table public.aliquotas (
  empresa_id  uuid not null references public.empresas(id) on delete cascade,
  regime      text not null check (regime in ('NF','IF','NS','IS')),
  aliquota    numeric(9,6) not null check (aliquota >= 0 and aliquota < 1),
  primary key (empresa_id, regime)
);

-- Pacotes cujos itens são tributados como serviço nacional (ex.: SERV-CIV-1)
create table public.pacotes_servico (
  empresa_id  uuid not null references public.empresas(id) on delete cascade,
  codigo      text not null check (length(trim(codigo)) > 0),
  primary key (empresa_id, codigo)
);

-- ---------------------------------------------------------------
-- Clientes, projetos
-- ---------------------------------------------------------------
create table public.clientes (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas(id) on delete cascade,
  nome        text not null check (length(trim(nome)) > 0),
  criado_em   timestamptz not null default now(),
  unique (empresa_id, nome)
);

create table public.projetos (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas(id) on delete cascade,
  cliente_id  uuid not null references public.clientes(id) on delete cascade,
  nome        text not null check (length(trim(nome)) > 0),
  criado_em   timestamptz not null default now()
);
create index on public.projetos (cliente_id);

-- ---------------------------------------------------------------
-- Modelos de PX (colunas). empresa_id nulo = modelo do sistema, visível a todos.
-- ---------------------------------------------------------------
create table public.modelos (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid references public.empresas(id) on delete cascade,
  nome        text not null,
  colunas     text[] not null,
  criado_em   timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- PX, revisões e itens
-- ---------------------------------------------------------------
create table public.pxs (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas(id) on delete cascade,
  projeto_id  uuid not null references public.projetos(id) on delete cascade,
  codigo      text not null,                      -- PX-0001 (gerado pelo banco)
  nome        text not null check (length(trim(nome)) > 0),
  modelo_nome text not null,
  colunas     text[] not null,                    -- cópia das colunas do modelo no momento da criação
  observacoes text not null default '',
  criado_em   timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (empresa_id, codigo)
);
create index on public.pxs (projeto_id);

create table public.revisoes (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas(id) on delete cascade,
  px_id       uuid not null references public.pxs(id) on delete cascade,
  numero      integer not null check (numero >= 0),   -- Rev 0, Rev 1…
  emitida_em  timestamptz,                             -- nulo = revisão em edição
  total       numeric(20,2),                           -- total geral congelado na emissão
  unique (px_id, numero)
);
-- Só uma revisão em edição por PX
create unique index revisao_em_edicao on public.revisoes (px_id) where emitida_em is null;

create table public.itens (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas(id) on delete cascade,
  revisao_id  uuid not null references public.revisoes(id) on delete cascade,
  posicao     double precision not null,          -- ordem da grade (ordem de importação/inserção)
  seq         integer not null,                   -- Nº: fixo, ordem de entrada na PX
  titulo      boolean not null default false,     -- linha de título (agrupador)
  pq_doc      text not null default '',           -- Nº da PQ
  pq_item     text not null default '',           -- Item PQ (só visualização)
  area        text not null default '',
  subarea     text not null default '',
  ativo       text not null default '',
  descricao   text not null default '',
  unidade     text not null default '',
  quantidade  numeric(20,6),
  provisao    numeric(9,6),                       -- fração (0,10 = 10%)
  hh          numeric(20,2),
  pacote      text not null default '',
  tipo        text not null default '',           -- F C S T M
  natureza    text not null default '',           -- N I
  moeda       text not null default '',
  preco       numeric(20,6),
  bdi         numeric(9,6),                       -- fração
  extras      jsonb not null default '{}'::jsonb  -- colunas futuras / não mapeadas
);
create index on public.itens (revisao_id, posicao);

-- ---------------------------------------------------------------
-- Biblioteca de referência
-- ---------------------------------------------------------------
create table public.pastas (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas(id) on delete cascade,
  nome        text not null check (length(trim(nome)) > 0),
  unique (empresa_id, nome)
);

create table public.arquivos (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas(id) on delete cascade,
  pasta_id    uuid references public.pastas(id) on delete set null,  -- nulo = "Sem pasta"
  nome        text not null,
  tipo        text not null default 'Planilha de quantidades',
  disciplina  text not null default '',
  caminho     text not null,                      -- caminho no Storage: <empresa_id>/<uuid>-<nome>
  tamanho     bigint,
  itens_lidos integer,
  situacao    text not null default 'Pronto',
  enviado_por uuid references auth.users(id) on delete set null,
  enviado_em  timestamptz not null default now()
);
create index on public.arquivos (empresa_id, pasta_id);

-- ---------------------------------------------------------------
-- Integridade entre empresas: o pai precisa ser da mesma empresa
-- ---------------------------------------------------------------
create or replace function public.checa_mesma_empresa()
returns trigger language plpgsql as $$
declare pai uuid;
begin
  if tg_table_name = 'projetos' then select empresa_id into pai from public.clientes where id = new.cliente_id;
  elsif tg_table_name = 'pxs' then select empresa_id into pai from public.projetos where id = new.projeto_id;
  elsif tg_table_name = 'revisoes' then select empresa_id into pai from public.pxs where id = new.px_id;
  elsif tg_table_name = 'itens' then select empresa_id into pai from public.revisoes where id = new.revisao_id;
  elsif tg_table_name = 'arquivos' then
    if new.pasta_id is null then return new; end if;
    select empresa_id into pai from public.pastas where id = new.pasta_id;
  end if;
  if pai is distinct from new.empresa_id then
    raise exception 'Registro pai pertence a outra empresa';
  end if;
  return new;
end $$;

create trigger mesma_empresa before insert or update on public.projetos for each row execute function public.checa_mesma_empresa();
create trigger mesma_empresa before insert or update on public.pxs      for each row execute function public.checa_mesma_empresa();
create trigger mesma_empresa before insert or update on public.revisoes for each row execute function public.checa_mesma_empresa();
create trigger mesma_empresa before insert or update on public.itens    for each row execute function public.checa_mesma_empresa();
create trigger mesma_empresa before insert or update on public.arquivos for each row execute function public.checa_mesma_empresa();

-- Revisão emitida é imutável: itens dela não podem ser criados, alterados ou excluídos
create or replace function public.bloqueia_revisao_emitida()
returns trigger language plpgsql as $$
declare rid uuid := coalesce(new.revisao_id, old.revisao_id);
begin
  if exists (select 1 from public.revisoes where id = rid and emitida_em is not null) then
    raise exception 'Esta revisão já foi emitida e não pode ser alterada';
  end if;
  return coalesce(new, old);
end $$;
create trigger revisao_travada before insert or update or delete on public.itens
  for each row execute function public.bloqueia_revisao_emitida();

-- ---------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------
alter table public.empresas        enable row level security;
alter table public.membros         enable row level security;
alter table public.moedas          enable row level security;
alter table public.aliquotas       enable row level security;
alter table public.pacotes_servico enable row level security;
alter table public.clientes        enable row level security;
alter table public.projetos        enable row level security;
alter table public.modelos         enable row level security;
alter table public.pxs             enable row level security;
alter table public.revisoes        enable row level security;
alter table public.itens           enable row level security;
alter table public.pastas          enable row level security;
alter table public.arquivos        enable row level security;

-- Empresas: membro lê; admin renomeia. Criação só via função criar_empresa().
create policy empresas_ler on public.empresas for select using (public.eh_membro(id));
create policy empresas_editar on public.empresas for update using (public.eh_admin(id)) with check (public.eh_admin(id));

-- Membros: membro vê a equipe; admin gerencia.
create policy membros_ler on public.membros for select using (public.eh_membro(empresa_id));
create policy membros_admin on public.membros for all using (public.eh_admin(empresa_id)) with check (public.eh_admin(empresa_id));

-- Parâmetros: membro lê; admin altera.
create policy moedas_ler on public.moedas for select using (public.eh_membro(empresa_id));
create policy moedas_admin on public.moedas for all using (public.eh_admin(empresa_id)) with check (public.eh_admin(empresa_id));
create policy aliquotas_ler on public.aliquotas for select using (public.eh_membro(empresa_id));
create policy aliquotas_admin on public.aliquotas for all using (public.eh_admin(empresa_id)) with check (public.eh_admin(empresa_id));
create policy pacotes_ler on public.pacotes_servico for select using (public.eh_membro(empresa_id));
create policy pacotes_admin on public.pacotes_servico for all using (public.eh_admin(empresa_id)) with check (public.eh_admin(empresa_id));

-- Clientes: membro lê; só admin cria/exclui (regra do protótipo).
create policy clientes_ler on public.clientes for select using (public.eh_membro(empresa_id));
create policy clientes_admin on public.clientes for all using (public.eh_admin(empresa_id)) with check (public.eh_admin(empresa_id));

-- Projetos, PX, revisões, itens, pastas, arquivos: membro lê; admin e orçamentista escrevem.
create policy projetos_ler on public.projetos for select using (public.eh_membro(empresa_id));
create policy projetos_escrever on public.projetos for all using (public.pode_editar(empresa_id)) with check (public.pode_editar(empresa_id));
create policy pxs_ler on public.pxs for select using (public.eh_membro(empresa_id));
create policy pxs_escrever on public.pxs for all using (public.pode_editar(empresa_id)) with check (public.pode_editar(empresa_id));
create policy revisoes_ler on public.revisoes for select using (public.eh_membro(empresa_id));
create policy revisoes_escrever on public.revisoes for all using (public.pode_editar(empresa_id)) with check (public.pode_editar(empresa_id));
create policy itens_ler on public.itens for select using (public.eh_membro(empresa_id));
create policy itens_escrever on public.itens for all using (public.pode_editar(empresa_id)) with check (public.pode_editar(empresa_id));
create policy pastas_ler on public.pastas for select using (public.eh_membro(empresa_id));
create policy pastas_escrever on public.pastas for all using (public.pode_editar(empresa_id)) with check (public.pode_editar(empresa_id));
create policy arquivos_ler on public.arquivos for select using (public.eh_membro(empresa_id));
create policy arquivos_escrever on public.arquivos for all using (public.pode_editar(empresa_id)) with check (public.pode_editar(empresa_id));

-- Modelos: do sistema (empresa nula) todos leem; da empresa, membros leem e admin/orçamentista escrevem.
create policy modelos_ler on public.modelos for select using (empresa_id is null or public.eh_membro(empresa_id));
create policy modelos_escrever on public.modelos for all
  using (empresa_id is not null and public.pode_editar(empresa_id))
  with check (empresa_id is not null and public.pode_editar(empresa_id));

-- ---------------------------------------------------------------
-- Funções de negócio (atômicas)
-- ---------------------------------------------------------------

-- Cria a empresa, torna o usuário admin e carrega os parâmetros padrão.
create or replace function public.criar_empresa(nome text)
returns uuid language plpgsql security definer set search_path = public as $$
declare emp uuid;
begin
  if auth.uid() is null then raise exception 'É preciso estar logado'; end if;
  insert into empresas (nome) values (nome) returning id into emp;
  insert into membros (empresa_id, usuario_id, papel) values (emp, auth.uid(), 'admin');
  insert into moedas (empresa_id, codigo, nome, simbolo, cambio_brl) values
    (emp, 'BRL', 'Real', 'R$', 1), (emp, 'USD', 'Dólar', 'US$', 5.2), (emp, 'EUR', 'Euro', '€', 6.0);
  insert into aliquotas (empresa_id, regime, aliquota) values
    (emp, 'NF', 0.1865), (emp, 'IF', 0.312), (emp, 'NS', 0.1365), (emp, 'IS', 0.3315);
  insert into pacotes_servico (empresa_id, codigo) values
    (emp, 'SERV-CIV-1'), (emp, 'SERV-MEC-1'), (emp, 'TUK-ELE-2');
  return emp;
end $$;

-- Cria a PX com código sequencial da empresa e a Rev 0 em edição.
create or replace function public.criar_px(projeto uuid, nome text, modelo_nome text, colunas text[], observacoes text default '')
returns uuid language plpgsql security invoker set search_path = public as $$
declare emp uuid; n integer; nova uuid;
begin
  select empresa_id into emp from projetos where id = projeto;
  if emp is null or not public.pode_editar(emp) then raise exception 'Sem permissão para criar PX neste projeto'; end if;
  -- contador atômico (security definer não é necessário: admin/orçamentista atualizam via função dedicada)
  n := public.proximo_px_seq(emp);
  insert into pxs (empresa_id, projeto_id, codigo, nome, modelo_nome, colunas, observacoes)
    values (emp, projeto, 'PX-' || lpad(n::text, 4, '0'), nome, modelo_nome, colunas, coalesce(observacoes, ''))
    returning id into nova;
  insert into revisoes (empresa_id, px_id, numero) values (emp, nova, 0);
  return nova;
end $$;

create or replace function public.proximo_px_seq(emp uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not public.pode_editar(emp) then raise exception 'Sem permissão'; end if;
  update empresas set px_seq = px_seq + 1 where id = emp returning px_seq into n;
  return n;
end $$;

-- Emite a revisão em edição (congela itens e total) e abre a seguinte com cópia dos itens.
create or replace function public.emitir_revisao(px uuid, total_geral numeric)
returns uuid language plpgsql security invoker set search_path = public as $$
declare emp uuid; atual revisoes%rowtype; nova uuid;
begin
  select empresa_id into emp from pxs where id = px;
  if emp is null or not public.pode_editar(emp) then raise exception 'Sem permissão'; end if;
  select * into atual from revisoes where px_id = px and emitida_em is null for update;
  if not found then raise exception 'PX sem revisão em edição'; end if;
  -- trava a atual primeiro (só pode haver uma revisão em edição); a cópia lê dela e grava na nova
  update revisoes set emitida_em = now(), total = total_geral where id = atual.id;
  insert into revisoes (empresa_id, px_id, numero) values (emp, px, atual.numero + 1) returning id into nova;
  insert into itens (empresa_id, revisao_id, posicao, seq, titulo, pq_doc, pq_item, area, subarea, ativo, descricao,
                     unidade, quantidade, provisao, hh, pacote, tipo, natureza, moeda, preco, bdi, extras)
    select empresa_id, nova, posicao, seq, titulo, pq_doc, pq_item, area, subarea, ativo, descricao,
           unidade, quantidade, provisao, hh, pacote, tipo, natureza, moeda, preco, bdi, extras
      from itens where revisao_id = atual.id;
  update pxs set atualizado_em = now() where id = px;
  return nova;
end $$;

-- Revisão emitida não pode ser "desemitida" nem ter número trocado
create or replace function public.protege_revisao()
returns trigger language plpgsql as $$
begin
  if old.emitida_em is not null then
    raise exception 'Esta revisão já foi emitida e não pode ser alterada';
  end if;
  return new;
end $$;
create trigger protege_revisao before update on public.revisoes
  for each row execute function public.protege_revisao();

-- ---------------------------------------------------------------
-- Modelos do sistema
-- ---------------------------------------------------------------
insert into public.modelos (empresa_id, nome, colunas) values
  (null, 'PX Padrão v1', array['seq','pqdoc','item','area','subarea','ativo','desc','un','qtd','prov','hh','pacote','tipo','orig','moeda','preco','bdi','base','trib','parc','ger','chk']),
  (null, 'PX Simplificada', array['seq','pqdoc','item','area','subarea','ativo','desc','un','qtd','moeda','preco','bdi','base','parc','ger','chk']);

-- ---------------------------------------------------------------
-- Permissões de acesso pela API (papéis do Supabase)
-- ---------------------------------------------------------------
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke execute on all functions in schema public from public, anon;
grant execute on function public.criar_empresa(text), public.criar_px(uuid, text, text, text[], text),
  public.emitir_revisao(uuid, numeric), public.proximo_px_seq(uuid),
  public.eh_membro(uuid), public.tem_papel(uuid, public.papel[]), public.pode_editar(uuid), public.eh_admin(uuid)
  to authenticated;
