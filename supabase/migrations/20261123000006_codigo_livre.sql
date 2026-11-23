-- Código da PX passa a ser digitado livremente na criação (até 250 caracteres).
-- Continua único dentro da empresa. O padrão configurável deixa de ser usado pela tela;
-- sem código informado, o banco ainda gera PX-0001, PX-0002… (compatibilidade).

create or replace function public.criar_px(projeto uuid, nome text, modelo_nome text, colunas text[], observacoes text default '',
                                           campos jsonb default '{}'::jsonb, codigo_manual text default null)
returns uuid language plpgsql security invoker set search_path = public as $$
declare emp uuid; n integer; nova uuid; cod text; padrao text;
begin
  select empresa_id into emp from projetos where id = projeto;
  if emp is null or not public.pode_editar(emp) then raise exception 'Sem permissão para criar PX neste projeto'; end if;
  if nullif(trim(codigo_manual), '') is not null then
    cod := trim(codigo_manual);
    if length(cod) > 250 then raise exception 'O código pode ter no máximo 250 caracteres'; end if;
  else
    select padrao_codigo into padrao from empresas where id = emp;
    n := public.proximo_px_seq(emp);
    cod := public.montar_codigo_px(padrao, n, coalesce(campos, '{}'::jsonb));
  end if;
  if exists (select 1 from pxs where empresa_id = emp and codigo = cod) then
    raise exception 'Já existe uma PX com o código %', cod;
  end if;
  insert into pxs (empresa_id, projeto_id, codigo, nome, modelo_nome, colunas, observacoes)
    values (emp, projeto, cod, nome, modelo_nome, colunas, coalesce(observacoes, ''))
    returning id into nova;
  insert into revisoes (empresa_id, px_id, numero) values (emp, nova, 0);
  return nova;
end $$;

-- Edição do código em "Dados da PX": mesmo limite
alter table public.pxs add constraint pxs_codigo_tamanho check (length(trim(codigo)) between 1 and 250);
