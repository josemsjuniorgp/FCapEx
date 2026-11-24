-- Fretes nacionais e internacionais por empresa.
-- Critério: 'valor' (valor único por linha, na moeda do frete, convertido pelo câmbio)
--           'percentual' (fração do valor líquido do item: quantidade × preço × câmbio).
-- O frete soma à base, antes dos tributos.

create table public.fretes (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas(id) on delete cascade,
  tipo        text not null check (tipo in ('nacional', 'internacional')),
  nome        text not null check (length(trim(nome)) between 1 and 80),
  local       text not null default '',            -- UF (nacional) ou país de origem (internacional)
  criterio    text not null default 'valor' check (criterio in ('valor', 'percentual')),
  valor       numeric(20,6) not null default 0 check (valor >= 0),
  moeda       text not null default 'BRL',
  ordem       integer not null default 0,
  criado_em   timestamptz not null default now(),
  unique (empresa_id, tipo, nome),
  check (criterio = 'valor' or valor < 1)           -- percentual guardado como fração (0,03 = 3%)
);
create index on public.fretes (empresa_id, tipo);
alter table public.fretes enable row level security;
create policy fretes_ler on public.fretes for select using (public.eh_membro(empresa_id));
create policy fretes_admin on public.fretes for all using (public.eh_admin(empresa_id)) with check (public.eh_admin(empresa_id));
grant select, insert, update, delete on public.fretes to authenticated;

-- Frete escolhido em cada item (sem chave estrangeira: excluir um frete não pode alterar revisões emitidas)
alter table public.itens add column frete_nacional uuid, add column frete_internacional uuid;

-- O frete escolhido precisa ser da mesma empresa do item
create or replace function public.checa_frete_do_item()
returns trigger language plpgsql as $$
declare f record;
begin
  -- frete de outra empresa ou do tipo errado: recusa; frete que não existe mais (excluído): fica sem frete
  if new.frete_nacional is not null then
    select empresa_id, tipo into f from public.fretes where id = new.frete_nacional;
    if not found then new.frete_nacional := null;
    elsif f.empresa_id <> new.empresa_id or f.tipo <> 'nacional' then raise exception 'Frete nacional inválido para este item';
    end if;
  end if;
  if new.frete_internacional is not null then
    select empresa_id, tipo into f from public.fretes where id = new.frete_internacional;
    if not found then new.frete_internacional := null;
    elsif f.empresa_id <> new.empresa_id or f.tipo <> 'internacional' then raise exception 'Frete internacional inválido para este item';
    end if;
  end if;
  return new;
end $$;
create trigger frete_do_item before insert or update on public.itens
  for each row execute function public.checa_frete_do_item();

-- Emitir revisão copia também os fretes escolhidos
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
                     unidade, quantidade, provisao, hh, pacote, tipo, natureza, moeda, preco, bdi, extras, tributos_ligados,
                     frete_nacional, frete_internacional)
    select empresa_id, nova, posicao, seq, titulo, pq_doc, pq_item, area, subarea, ativo, descricao,
           unidade, quantidade, provisao, hh, pacote, tipo, natureza, moeda, preco, bdi, extras, tributos_ligados,
           frete_nacional, frete_internacional
      from itens where revisao_id = atual.id;
  update pxs set atualizado_em = now() where id = px;
  return nova;
end $$;

-- PX novas pelo modelo "PX Padrão" já trazem as colunas de frete
update public.modelos set colunas = colunas || array['fnac','fnacv','fint','fintv']
 where empresa_id is null and nome = 'PX Padrão' and not ('fnac' = any(colunas));
