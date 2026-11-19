-- Gestão de equipe: listar membros com e-mail e adicionar por e-mail (usuário já cadastrado).

create or replace function public.listar_membros(emp uuid)
returns table (usuario_id uuid, email text, papel public.papel, criado_em timestamptz)
language sql stable security definer set search_path = public as $$
  select m.usuario_id, u.email::text, m.papel, m.criado_em
    from membros m join auth.users u on u.id = m.usuario_id
   where m.empresa_id = emp and public.eh_membro(emp)
   order by m.criado_em;
$$;

create or replace function public.adicionar_membro(emp uuid, email_usuario text, novo_papel public.papel)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if not public.eh_admin(emp) then raise exception 'Só o administrador da empresa adiciona membros'; end if;
  select id into uid from auth.users where lower(email) = lower(trim(email_usuario));
  if uid is null then
    raise exception 'Não existe conta com o e-mail %. Peça para a pessoa se cadastrar primeiro.', email_usuario;
  end if;
  insert into membros (empresa_id, usuario_id, papel) values (emp, uid, novo_papel)
    on conflict (empresa_id, usuario_id) do update set papel = excluded.papel;
end $$;

-- A empresa nunca pode ficar sem administrador
create or replace function public.protege_ultimo_admin()
returns trigger language plpgsql as $$
begin
  if old.papel = 'admin' and (tg_op = 'DELETE' or new.papel <> 'admin')
     and not exists (select 1 from public.membros where empresa_id = old.empresa_id and papel = 'admin' and usuario_id <> old.usuario_id)
     and exists (select 1 from public.empresas where id = old.empresa_id) then
    raise exception 'A empresa precisa ter pelo menos um administrador';
  end if;
  return coalesce(new, old);
end $$;
create trigger protege_ultimo_admin before update or delete on public.membros
  for each row execute function public.protege_ultimo_admin();

revoke execute on function public.listar_membros(uuid), public.adicionar_membro(uuid, text, public.papel) from public, anon;
grant execute on function public.listar_membros(uuid), public.adicionar_membro(uuid, text, public.papel) to authenticated;
