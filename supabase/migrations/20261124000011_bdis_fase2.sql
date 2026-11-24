-- BDIs, fase 2 (aplicar depois que o site novo estiver publicado): remove o BDI digitado (itens.bdi).
-- Antes, converte o que o site antigo ainda tenha gravado entre a fase 1 e a publicação.

insert into public.bdis (empresa_id, nome, lucro)
select distinct empresa_id,
       'BDI ' || replace(trim(trailing '.' from trim(trailing '0' from to_char(round(bdi * 100, 4), 'FM999999990.0000'))), '.', ',') || '% (convertido)',
       round(bdi * 100, 4) / 100
  from public.itens
 where bdi_id is null and bdi is not null and bdi <> 0 and bdi > -1
on conflict (empresa_id, nome) do nothing;

alter table public.itens disable trigger revisao_travada;
update public.itens i set bdi_id = b.id
  from public.bdis b
 where i.bdi_id is null and b.empresa_id = i.empresa_id and b.nome like '% (convertido)'
   and i.bdi is not null and i.bdi <> 0 and b.lucro = round(i.bdi * 100, 4) / 100
   and b.administracao = 0 and b.seguros = 0 and b.garantias = 0 and b.riscos = 0 and b.financeiras = 0;
alter table public.itens enable trigger revisao_travada;

-- revisões emitidas nesse intervalo: refaz a foto dos BDIs
alter table public.revisoes disable trigger protege_revisao;
update public.revisoes r set bdis_congelados = public.bdis_da_revisao(r.id)
 where r.emitida_em is not null and coalesce(jsonb_array_length(r.bdis_congelados), 0) = 0;
alter table public.revisoes enable trigger protege_revisao;

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
                     unidade, quantidade, provisao, hh, pacote, tipo, natureza, moeda, preco, bdi_id, extras, tributos_ligados,
                     frete_nacional, frete_internacional)
    select empresa_id, nova, posicao, seq, titulo, pq_doc, pq_item, area, subarea, ativo, descricao,
           unidade, quantidade, provisao, hh, pacote, tipo, natureza, moeda, preco, bdi_id, extras, tributos_ligados,
           frete_nacional, frete_internacional
      from itens where revisao_id = atual.id;
  update pxs set atualizado_em = now() where id = px;
  return nova;
end $$;

alter table public.itens drop column bdi;
