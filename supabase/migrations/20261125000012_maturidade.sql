-- Maturidade da PX.
-- Projeto: classe AACE (5 = conceitual … 1 = definitiva) e fase (texto livre, ex.: "FEL 2", "Projeto Básico").
-- Item: origem do preço. "Firme" = contrato/pedido emitido ou cotação firme de fornecedor.
-- Maturidade = % do Total geral com preço firme, comparado com a meta da classe (calculado no site).

alter table public.projetos
  add column fase   text not null default '' check (length(fase) <= 120),
  add column classe smallint check (classe between 1 and 5);

alter table public.itens
  add column origem text not null default ''
  check (origem in ('', 'contrato', 'firme', 'orcamentaria', 'cpu', 'historico', 'benchmark', 'parametrica'));

-- Emitir revisão copia também a origem do preço
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
                     unidade, quantidade, provisao, hh, pacote, tipo, natureza, moeda, preco, bdi_id, origem, extras, tributos_ligados,
                     frete_nacional, frete_internacional)
    select empresa_id, nova, posicao, seq, titulo, pq_doc, pq_item, area, subarea, ativo, descricao,
           unidade, quantidade, provisao, hh, pacote, tipo, natureza, moeda, preco, bdi_id, origem, extras, tributos_ligados,
           frete_nacional, frete_internacional
      from itens where revisao_id = atual.id;
  update pxs set atualizado_em = now() where id = px;
  return nova;
end $$;

-- Coluna "Origem do preço": no modelo PX Padrão e nas PX que já têm Preço unit.
update public.modelos set colunas = colunas || array['origem']
 where empresa_id is null and nome = 'PX Padrão' and not ('origem' = any(colunas));
update public.pxs set colunas = colunas || array['origem']
 where 'preco' = any(colunas) and not ('origem' = any(colunas));
