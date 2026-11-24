-- BDIs cadastrados por empresa (fase 1: acrescenta e converte; a coluna antiga itens.bdi sai na fase 2).
-- Composição (frações: 0,04 = 4%): administração central (AC), seguros (S), garantias (G), riscos (R),
-- despesas financeiras (DF), lucro (L) e parcelas personalizadas (somam-se a AC+S+G+R).
-- BDI final, sem tributos (os tributos são calculados à parte em cada linha):
--   BDI = (1 + AC + S + G + R + personalizadas) × (1 + DF) × (1 + L) − 1
-- O BDI incide só sobre o valor líquido da linha (quantidade × preço × câmbio).

create table public.bdis (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references public.empresas(id) on delete cascade,
  nome          text not null check (length(trim(nome)) between 1 and 80),
  administracao numeric(9,6) not null default 0 check (administracao >= 0 and administracao < 1),
  seguros       numeric(9,6) not null default 0 check (seguros >= 0 and seguros < 1),
  garantias     numeric(9,6) not null default 0 check (garantias >= 0 and garantias < 1),
  riscos        numeric(9,6) not null default 0 check (riscos >= 0 and riscos < 1),
  financeiras   numeric(9,6) not null default 0 check (financeiras >= 0 and financeiras < 1),
  lucro         numeric(9,6) not null default 0 check (lucro > -1 and lucro < 10),
  extras        jsonb not null default '[]'::jsonb check (jsonb_typeof(extras) = 'array'),  -- [{"nome": "...", "pct": 0.01}]
  criado_em     timestamptz not null default now(),
  unique (empresa_id, nome)
);
create index on public.bdis (empresa_id);
alter table public.bdis enable row level security;
create policy bdis_ler on public.bdis for select using (public.eh_membro(empresa_id));
-- Administrador e Orçamentista criam e alteram BDIs
create policy bdis_escrever on public.bdis for all using (public.pode_editar(empresa_id)) with check (public.pode_editar(empresa_id));
grant select, insert, update, delete on public.bdis to authenticated;

-- BDI escolhido em cada item (sem chave estrangeira: excluir um BDI não pode alterar revisões emitidas)
alter table public.itens add column bdi_id uuid;
-- Foto dos BDIs usados, guardada ao emitir a revisão (a revisão emitida não muda se o BDI for alterado depois)
alter table public.revisoes add column bdis_congelados jsonb;

-- O BDI escolhido precisa ser da mesma empresa do item; BDI que não existe mais: fica sem BDI
create or replace function public.checa_bdi_do_item()
returns trigger language plpgsql as $$
declare emp uuid;
begin
  if new.bdi_id is not null then
    select empresa_id into emp from public.bdis where id = new.bdi_id;
    if not found then new.bdi_id := null;
    elsif emp <> new.empresa_id then raise exception 'BDI inválido para este item';
    end if;
  end if;
  return new;
end $$;

-- Foto dos BDIs usados pelos itens de uma revisão
create or replace function public.bdis_da_revisao(rev uuid)
returns jsonb language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(b) - 'empresa_id' - 'criado_em' order by b.nome), '[]'::jsonb)
    from bdis b where b.id in (select bdi_id from itens where revisao_id = rev and bdi_id is not null);
$$;
revoke execute on function public.bdis_da_revisao(uuid) from public, anon;
grant execute on function public.bdis_da_revisao(uuid) to authenticated;

-- ------------------------------------------------------------------ conversão dos BDIs já digitados
-- Cada percentual diferente vira um cadastro "BDI x% (convertido)" com o valor todo em Lucro (BDI final = x).
insert into public.bdis (empresa_id, nome, lucro)
select distinct empresa_id,
       'BDI ' || replace(trim(trailing '.' from trim(trailing '0' from to_char(round(bdi * 100, 4), 'FM999999990.0000'))), '.', ',') || '% (convertido)',
       round(bdi * 100, 4) / 100
  from public.itens
 where bdi is not null and bdi <> 0 and bdi > -1
on conflict (empresa_id, nome) do nothing;

-- Itens de revisões emitidas também são ligados ao cadastro (com a trava desligada só nesta migração)
alter table public.itens disable trigger revisao_travada;
update public.itens i set bdi_id = b.id
  from public.bdis b
 where b.empresa_id = i.empresa_id and b.nome like '% (convertido)'
   and i.bdi is not null and i.bdi <> 0 and b.lucro = round(i.bdi * 100, 4) / 100
   and b.administracao = 0 and b.seguros = 0 and b.garantias = 0 and b.riscos = 0 and b.financeiras = 0;
alter table public.itens enable trigger revisao_travada;

alter table public.revisoes disable trigger protege_revisao;
update public.revisoes set bdis_congelados = public.bdis_da_revisao(id) where emitida_em is not null;
alter table public.revisoes enable trigger protege_revisao;

create trigger bdi_do_item before insert or update on public.itens
  for each row execute function public.checa_bdi_do_item();

-- Emitir revisão: guarda a foto dos BDIs e copia o BDI escolhido de cada item
create or replace function public.emitir_revisao(px uuid, total_geral numeric)
returns uuid language plpgsql security invoker set search_path = public as $$
declare emp uuid; atual revisoes%rowtype; nova uuid;
begin
  select empresa_id into emp from pxs where id = px;
  if emp is null or not public.pode_editar(emp) then raise exception 'Sem permissão'; end if;
  select * into atual from revisoes where px_id = px and emitida_em is null for update;
  if not found then raise exception 'PX sem revisão em edição'; end if;
  update revisoes set emitida_em = now(), total = total_geral, bdis_congelados = public.bdis_da_revisao(atual.id) where id = atual.id;
  insert into revisoes (empresa_id, px_id, numero) values (emp, px, atual.numero + 1) returning id into nova;
  insert into itens (empresa_id, revisao_id, posicao, seq, titulo, pq_doc, pq_item, area, subarea, ativo, descricao,
                     unidade, quantidade, provisao, hh, pacote, tipo, natureza, moeda, preco, bdi, bdi_id, extras, tributos_ligados,
                     frete_nacional, frete_internacional)
    select empresa_id, nova, posicao, seq, titulo, pq_doc, pq_item, area, subarea, ativo, descricao,
           unidade, quantidade, provisao, hh, pacote, tipo, natureza, moeda, preco, bdi, bdi_id, extras, tributos_ligados,
           frete_nacional, frete_internacional
      from itens where revisao_id = atual.id;
  update pxs set atualizado_em = now() where id = px;
  return nova;
end $$;

-- Coluna "BDI (R$)" ao lado do BDI: no modelo PX Padrão e nas PX que já têm a coluna BDI
update public.modelos set colunas = colunas || array['bdiv']
 where 'bdi' = any(colunas) and not ('bdiv' = any(colunas));
update public.pxs set colunas = colunas || array['bdiv']
 where 'bdi' = any(colunas) and not ('bdiv' = any(colunas));
