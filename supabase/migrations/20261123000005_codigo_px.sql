-- Código da PX no padrão de cada empresa.
-- Padrão com marcadores: {seq} ou {seq:N} (sequencial com N dígitos), {ano}, {campo:Nome} (pedido na criação).
-- Ex.: 'PX-{campo:Área}-{campo:Projeto}-{campo:Disciplina}-{campo:Sigla}-{seq:4}'  ->  PX-A2-1000-G-PB-0001

alter table public.empresas
  add column padrao_codigo text not null default 'PX-{seq:4}'
  check (length(padrao_codigo) between 1 and 120 and padrao_codigo ~ '\{seq(:\d)?\}');

-- Monta o código a partir do padrão, do sequencial e dos campos informados.
create or replace function public.montar_codigo_px(padrao text, seq integer, campos jsonb)
returns text language plpgsql immutable as $$
declare
  r text := padrao; m text[]; valor text;
begin
  -- {seq:N}
  loop
    m := regexp_match(r, '\{seq(?::(\d))?\}');
    exit when m is null;
    r := regexp_replace(r, '\{seq(?::\d)?\}', lpad(seq::text, greatest(coalesce(m[1]::int, 4), length(seq::text)), '0'));
  end loop;
  r := replace(r, '{ano}', to_char(now(), 'YYYY'));
  -- {campo:Nome}: valor informado, só letras, números, ponto, hífen e sublinhado; vazio vira "X"
  loop
    m := regexp_match(r, '\{campo:([^}]+)\}');
    exit when m is null;
    valor := upper(regexp_replace(coalesce(campos ->> m[1], ''), '[^A-Za-z0-9._-]', '', 'g'));
    r := replace(r, '{campo:' || m[1] || '}', coalesce(nullif(valor, ''), 'X'));
  end loop;
  return r;
end $$;

-- criar_px passa a aceitar os campos do padrão ou um código digitado manualmente.
drop function if exists public.criar_px(uuid, text, text, text[], text);
create function public.criar_px(projeto uuid, nome text, modelo_nome text, colunas text[], observacoes text default '',
                                campos jsonb default '{}'::jsonb, codigo_manual text default null)
returns uuid language plpgsql security invoker set search_path = public as $$
declare emp uuid; n integer; nova uuid; cod text; padrao text;
begin
  select empresa_id into emp from projetos where id = projeto;
  if emp is null or not public.pode_editar(emp) then raise exception 'Sem permissão para criar PX neste projeto'; end if;
  if nullif(trim(codigo_manual), '') is not null then
    cod := trim(codigo_manual);
    if length(cod) > 120 then raise exception 'Código muito longo'; end if;
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

-- Próximo sequencial (só para mostrar a prévia; o número definitivo é reservado em criar_px).
create or replace function public.proximo_px_previsto(emp uuid)
returns integer language sql stable security definer set search_path = public as $$
  select px_seq + 1 from empresas where id = emp and public.eh_membro(emp);
$$;

revoke execute on function public.criar_px(uuid, text, text, text[], text, jsonb, text), public.proximo_px_previsto(uuid),
  public.montar_codigo_px(text, integer, jsonb) from public, anon;
grant execute on function public.criar_px(uuid, text, text, text[], text, jsonb, text), public.proximo_px_previsto(uuid),
  public.montar_codigo_px(text, integer, jsonb) to authenticated;
