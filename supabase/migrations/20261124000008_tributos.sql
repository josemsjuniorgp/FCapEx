-- Tributos detalhados por empresa (substituem as alíquotas por regime e a regra de pacotes).
-- Cada tributo: nome, alíquota e onde se aplica (fornecimento/serviço × nacional/importado).
-- Cada item pode ligar/desligar tributos manualmente (tributos_ligados: {"<id do tributo>": true|false}).

create table public.tributos (
  id                  uuid primary key default gen_random_uuid(),
  empresa_id          uuid not null references public.empresas(id) on delete cascade,
  nome                text not null check (length(trim(nome)) between 1 and 60),
  aliquota            numeric(9,6) not null default 0 check (aliquota >= 0 and aliquota < 1),
  aplica_fornecimento boolean not null default true,
  aplica_servico      boolean not null default true,
  aplica_nacional     boolean not null default true,
  aplica_importado    boolean not null default true,
  ordem               integer not null default 0,
  criado_em           timestamptz not null default now(),
  unique (empresa_id, nome)
);
create index on public.tributos (empresa_id, ordem);
alter table public.tributos enable row level security;
create policy tributos_ler on public.tributos for select using (public.eh_membro(empresa_id));
create policy tributos_admin on public.tributos for all using (public.eh_admin(empresa_id)) with check (public.eh_admin(empresa_id));
grant select, insert, update, delete on public.tributos to authenticated;

alter table public.itens add column tributos_ligados jsonb not null default '{}'::jsonb;

-- Tributos padrão de uma empresa
create or replace function public.semear_tributos(emp uuid)
returns void language sql security definer set search_path = public as $$
  insert into tributos (empresa_id, nome, aliquota, aplica_fornecimento, aplica_servico, aplica_nacional, aplica_importado, ordem) values
    (emp, 'II',     0,      true,  false, false, true, 1),
    (emp, 'IPI',    0,      true,  false, true,  true, 2),
    (emp, 'PIS',    0.0165, true,  true,  true,  true, 3),
    (emp, 'COFINS', 0.076,  true,  true,  true,  true, 4),
    (emp, 'ICMS',   0,      true,  false, true,  true, 5),
    (emp, 'ISS',    0.05,   false, true,  true,  true, 6),
    (emp, 'IRRF',   0.15,   false, true,  false, true, 7)
  on conflict (empresa_id, nome) do nothing;
$$;
revoke execute on function public.semear_tributos(uuid) from public, anon, authenticated;

select public.semear_tributos(id) from public.empresas;

-- Nova empresa: moedas + tributos padrão (sem alíquotas por regime nem pacotes)
create or replace function public.criar_empresa(nome text)
returns uuid language plpgsql security definer set search_path = public as $$
declare emp uuid;
begin
  if auth.uid() is null then raise exception 'É preciso estar logado'; end if;
  insert into empresas (nome) values (nome) returning id into emp;
  insert into membros (empresa_id, usuario_id, papel) values (emp, auth.uid(), 'admin');
  insert into moedas (empresa_id, codigo, nome, simbolo, cambio_brl) values
    (emp, 'BRL', 'Real', 'R$', 1), (emp, 'USD', 'Dólar', 'US$', 5.2), (emp, 'EUR', 'Euro', '€', 6.0);
  perform public.semear_tributos(emp);
  return emp;
end $$;

-- Emitir revisão passa a copiar também os tributos ligados/desligados de cada item
create or replace function public.emitir_revisao(px uuid, total_geral numeric)
returns uuid language plpgsql security invoker set search_path = public as $$
declare emp uuid; atual revisoes%rowtype; nova uuid;
begin
  select empresa_id into emp from pxs where id = px;
  if emp is null or not public.pode_editar(emp) then raise exception 'Sem permissão'; end if;
  select * into atual from revisoes where px_id = px and emitida_em is null for update;
  if not found then raise exception 'PX sem revisão em edição'; end if;
  update revisoes set emitida_em = now(), total = total_geral where id = atual.id;
  insert into revisoes (empresa_id, px_id, numero) values (emp, px, atual.numero + 1) returning id into nova;
  insert into itens (empresa_id, revisao_id, posicao, seq, titulo, pq_doc, pq_item, area, subarea, ativo, descricao,
                     unidade, quantidade, provisao, hh, pacote, tipo, natureza, moeda, preco, bdi, extras, tributos_ligados)
    select empresa_id, nova, posicao, seq, titulo, pq_doc, pq_item, area, subarea, ativo, descricao,
           unidade, quantidade, provisao, hh, pacote, tipo, natureza, moeda, preco, bdi, extras, tributos_ligados
      from itens where revisao_id = atual.id;
  update pxs set atualizado_em = now() where id = px;
  return nova;
end $$;

-- Alíquotas por regime e pacotes de serviço deixam de existir
drop table public.aliquotas;
drop table public.pacotes_servico;
