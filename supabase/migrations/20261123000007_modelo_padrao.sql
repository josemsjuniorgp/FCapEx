-- Modelo do sistema passa a se chamar "PX Padrão" e o modelo "PX Simplificada" deixa de ser oferecido.
-- As PX existentes mantêm suas colunas (cópia própria); só o nome exibido do modelo é atualizado.
update public.modelos set nome = 'PX Padrão' where empresa_id is null and nome = 'PX Padrão v1';
update public.pxs set modelo_nome = 'PX Padrão' where modelo_nome = 'PX Padrão v1';
delete from public.modelos where empresa_id is null and nome = 'PX Simplificada';
