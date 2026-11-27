-- Estudos de Viabilidade (CapEx + OpEx + Receitas/Economias → fluxo de caixa, VPL, TIR, payback).
-- Um projeto pode ter vários estudos (alternativas). Valores em termos reais (moeda de hoje).
--   premissas: horizonte, taxa, IR+CSLL, depreciação, rampa, valor residual, cenários (jsonb, ver src/dominio/viabilidade.ts)
--   capex:     Mapas de Preços usados, CapEx adicional, desembolso por ano de obra, reinvestimentos (jsonb)
-- Linhas detalhadas (OpEx, Receitas, Economias) ficam em estudo_linhas.

create table public.estudos (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references public.empresas(id) on delete cascade,
  projeto_id    uuid not null references public.projetos(id) on delete cascade,
  nome          text not null check (length(trim(nome)) between 1 and 120),
  tipo          text not null default 'receita' check (tipo in ('receita', 'economia')),
  premissas     jsonb not null default '{}'::jsonb,
  capex         jsonb not null default '{}'::jsonb,
  observacoes   text not null default '',
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index on public.estudos (empresa_id, projeto_id);

create table public.estudo_linhas (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references public.empresas(id) on delete cascade,
  estudo_id     uuid not null references public.estudos(id) on delete cascade,
  secao         text not null check (secao in ('opex', 'receita', 'economia')),
  posicao       double precision not null default 0,
  titulo        boolean not null default false,
  item          text not null default '',
  descricao     text not null default '',
  comportamento text not null default 'fixo' check (comportamento in ('fixo', 'variavel')),
  unidade       text not null default '',
  quantidade    numeric(20,6),
  preco         numeric(20,6),
  moeda         text not null default 'BRL',
  ano_inicio    integer check (ano_inicio between 1 and 100),
  ano_fim       integer check (ano_fim between 1 and 100),
  reajuste      numeric(9,6) not null default 0 check (reajuste > -1 and reajuste < 1),
  deducao       numeric(9,6) not null default 0 check (deducao >= 0 and deducao < 1),
  origem        text not null default ''
    check (origem in ('', 'contrato', 'firme', 'orcamentaria', 'cpu', 'historico', 'benchmark', 'parametrica')),
  criado_em     timestamptz not null default now()
);
create index on public.estudo_linhas (estudo_id, secao, posicao);

-- Estudo e linhas sempre da mesma empresa do projeto/estudo
create or replace function public.checa_empresa_estudo()
returns trigger language plpgsql as $$
declare pai uuid;
begin
  if tg_table_name = 'estudos' then select empresa_id into pai from public.projetos where id = new.projeto_id;
  else select empresa_id into pai from public.estudos where id = new.estudo_id;
  end if;
  if pai is null or pai <> new.empresa_id then raise exception 'Registro de outra empresa'; end if;
  return new;
end $$;
create trigger mesma_empresa before insert or update on public.estudos for each row execute function public.checa_empresa_estudo();
create trigger mesma_empresa before insert or update on public.estudo_linhas for each row execute function public.checa_empresa_estudo();

alter table public.estudos enable row level security;
alter table public.estudo_linhas enable row level security;
create policy estudos_ler on public.estudos for select using (public.eh_membro(empresa_id));
create policy estudos_escrever on public.estudos for all using (public.pode_editar(empresa_id)) with check (public.pode_editar(empresa_id));
create policy estudo_linhas_ler on public.estudo_linhas for select using (public.eh_membro(empresa_id));
create policy estudo_linhas_escrever on public.estudo_linhas for all using (public.pode_editar(empresa_id)) with check (public.pode_editar(empresa_id));
grant select, insert, update, delete on public.estudos, public.estudo_linhas to authenticated;
