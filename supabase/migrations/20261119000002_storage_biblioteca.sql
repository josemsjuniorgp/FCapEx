-- Bucket privado da biblioteca. Caminho dos objetos: <empresa_id>/<arquivo>
insert into storage.buckets (id, name, public)
values ('biblioteca', 'biblioteca', false)
on conflict (id) do nothing;

create policy biblioteca_ler on storage.objects for select to authenticated
  using (bucket_id = 'biblioteca' and public.eh_membro(((storage.foldername(name))[1])::uuid));

create policy biblioteca_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'biblioteca' and public.pode_editar(((storage.foldername(name))[1])::uuid));

create policy biblioteca_excluir on storage.objects for delete to authenticated
  using (bucket_id = 'biblioteca' and public.pode_editar(((storage.foldername(name))[1])::uuid));
