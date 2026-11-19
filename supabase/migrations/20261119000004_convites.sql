-- Convites por e-mail: a lista da equipe mostra quem ainda não entrou (convite pendente)
-- e o servidor (função "convidar") consulta contas por e-mail.

drop function if exists public.listar_membros(uuid);
create function public.listar_membros(emp uuid)
returns table (usuario_id uuid, email text, papel public.papel, pendente boolean, criado_em timestamptz)
language sql stable security definer set search_path = public as $$
  select m.usuario_id, u.email::text, m.papel, u.last_sign_in_at is null, m.criado_em
    from membros m join auth.users u on u.id = m.usuario_id
   where m.empresa_id = emp and public.eh_membro(emp)
   order by m.criado_em;
$$;
revoke execute on function public.listar_membros(uuid) from public, anon;
grant execute on function public.listar_membros(uuid) to authenticated;

-- Só o servidor (service_role) usa: devolve o id da conta com esse e-mail e se ela já entrou alguma vez.
create or replace function public.conta_por_email(email_busca text)
returns table (id uuid, ja_entrou boolean)
language sql stable security definer set search_path = public as $$
  select u.id, u.last_sign_in_at is not null from auth.users u where lower(u.email) = lower(trim(email_busca)) limit 1;
$$;
revoke execute on function public.conta_por_email(text) from public, anon, authenticated;
grant execute on function public.conta_por_email(text) to service_role;
