-- "PX" passa a se chamar "Mapa de Preços" na interface.
-- Renomeia o modelo do sistema e o tipo de arquivo da Biblioteca nos registros existentes.
update public.modelos set nome = 'Mapa Padrão' where empresa_id is null and nome = 'PX Padrão';
update public.pxs set modelo_nome = 'Mapa Padrão' where modelo_nome = 'PX Padrão';
update public.arquivos set tipo = 'Mapa anterior' where tipo = 'PX anterior';
