-- Testes de segurança e regras do banco. Cada bloco falha com exceção se a regra não for respeitada.
\set QUIET on
\o /dev/null
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@a'),   -- admin da empresa A
  ('00000000-0000-0000-0000-00000000000b', 'bob@b'),     -- admin da empresa B
  ('00000000-0000-0000-0000-00000000000c', 'carol@a'),   -- leitura na empresa A
  ('00000000-0000-0000-0000-00000000000d', 'davi@a');    -- orçamentista na empresa A

create function pg_temp.como(u text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', u, false);
  execute 'set role authenticated';
end $$;
create function pg_temp.deve_falhar(sql text, rotulo text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then return; end;
  raise exception 'FALHOU: % (deveria ter sido bloqueado)', rotulo;
end $$;
create function pg_temp.confere(cond boolean, rotulo text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'FALHOU: %', rotulo; end if; end $$;
create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated;

-- 1) Cada admin cria sua empresa
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
insert into ids values ('A', public.criar_empresa('Empresa A'));
reset role;
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
insert into ids values ('B', public.criar_empresa('Empresa B'));
insert into public.clientes (empresa_id, nome) select v, 'Cliente secreto B' from ids where k = 'B';
reset role;

-- 2) Alice só enxerga a própria empresa e seus parâmetros padrão
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select pg_temp.confere((select count(*) from public.empresas) = 1, 'Alice vê só 1 empresa');
select pg_temp.confere((select count(*) from public.clientes) = 0, 'Alice não vê clientes da B');
select pg_temp.confere((select count(*) from public.moedas) = 3, 'parâmetros padrão: 3 moedas');
select pg_temp.confere((select count(*) from public.pacotes_servico) = 3, 'parâmetros padrão: 3 pacotes');
select pg_temp.confere((select count(*) from public.modelos where empresa_id is null) = 2, 'modelos do sistema visíveis');

-- 3) Alice não escreve na empresa B
select pg_temp.deve_falhar(format($q$insert into public.clientes (empresa_id, nome) values (%L, 'invasor')$q$, (select v from ids where k='B')), 'Alice criar cliente na B');
select pg_temp.deve_falhar(format($q$insert into public.membros (empresa_id, usuario_id, papel) values (%L, '00000000-0000-0000-0000-00000000000a', 'admin')$q$, (select v from ids where k='B')), 'Alice se colocar como admin da B');
update public.empresas set nome = 'hack' where id = (select v from ids where k = 'B');
reset role;
select pg_temp.confere((select nome from public.empresas where id = (select v from ids where k='B')) = 'Empresa B', 'Alice não renomeia a B');

-- 4) Alice monta a equipe da A
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
insert into public.membros (empresa_id, usuario_id, papel) select v, '00000000-0000-0000-0000-00000000000c', 'leitura' from ids where k='A';
insert into public.membros (empresa_id, usuario_id, papel) select v, '00000000-0000-0000-0000-00000000000d', 'orcamentista' from ids where k='A';
with x as (insert into public.clientes (empresa_id, nome) select v, 'Cliente A1' from ids where k='A' returning id) insert into ids select 'cliA', id from x;
reset role;

-- 5) Orçamentista: não cria cliente, cria projeto e PX
select pg_temp.como('00000000-0000-0000-0000-00000000000d');
select pg_temp.deve_falhar(format($q$insert into public.clientes (empresa_id, nome) values (%L, 'x')$q$, (select v from ids where k='A')), 'orçamentista criar cliente');
with x as (insert into public.projetos (empresa_id, cliente_id, nome)
  select (select v from ids where k='A'), (select v from ids where k='cliA'), 'Planta Piloto' returning id) insert into ids select 'projA', id from x;
insert into ids values ('px1', public.criar_px((select v from ids where k='projA'), 'Estimativa', 'PX Padrão v1', array['seq','desc','qtd','preco','ger','chk']));
insert into ids values ('px2', public.criar_px((select v from ids where k='projA'), 'Segunda', 'PX Padrão v1', array['seq','desc']));
select pg_temp.confere((select codigo from public.pxs where id = (select v from ids where k='px1')) = 'PX-0001', 'primeira PX = PX-0001');
select pg_temp.confere((select codigo from public.pxs where id = (select v from ids where k='px2')) = 'PX-0002', 'segunda PX = PX-0002');
select pg_temp.confere((select count(*) from public.revisoes where px_id = (select v from ids where k='px1') and numero = 0 and emitida_em is null) = 1, 'PX nasce com Rev 0 em edição');
reset role;

-- 6) Leitura: lê, mas não escreve
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select pg_temp.confere((select count(*) from public.pxs) = 2, 'leitura vê as PX');
select pg_temp.deve_falhar(format($q$insert into public.projetos (empresa_id, cliente_id, nome) values (%L, %L, 'x')$q$, (select v from ids where k='A'), (select v from ids where k='cliA')), 'leitura criar projeto');
select pg_temp.deve_falhar(format($q$select public.criar_px(%L, 'x', 'm', array['seq'])$q$, (select v from ids where k='projA')), 'leitura criar PX');
reset role;

-- 7) Numeração é por empresa: a B começa em PX-0001
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
with x as (insert into public.projetos (empresa_id, cliente_id, nome)
  select (select v from ids where k='B'), (select id from public.clientes limit 1), 'Projeto B' returning id) insert into ids select 'projB', id from x;
insert into ids values ('pxB', public.criar_px((select v from ids where k='projB'), 'B1', 'PX Padrão v1', array['seq']));
select pg_temp.confere((select codigo from public.pxs where id = (select v from ids where k='pxB')) = 'PX-0001', 'B começa em PX-0001');
-- B não consegue criar projeto apontando para cliente da A
select pg_temp.deve_falhar(format($q$insert into public.projetos (empresa_id, cliente_id, nome) values (%L, %L, 'x')$q$, (select v from ids where k='B'), (select v from ids where k='cliA')), 'projeto da B com cliente da A');
-- nem criar PX em projeto da A
select pg_temp.deve_falhar(format($q$select public.criar_px(%L, 'x', 'm', array['seq'])$q$, (select v from ids where k='projA')), 'B criar PX no projeto da A');
reset role;

-- 8) Revisões: emitir congela itens; a revisão nova é editável
select pg_temp.como('00000000-0000-0000-0000-00000000000d');
insert into ids select 'rev0', id from public.revisoes where px_id = (select v from ids where k='px1');
insert into public.itens (empresa_id, revisao_id, posicao, seq, titulo, descricao)
  select (select v from ids where k='A'), (select v from ids where k='rev0'), 1, 1, true, 'OBRAS CIVIS';
insert into public.itens (empresa_id, revisao_id, posicao, seq, descricao, quantidade, preco, pacote, tipo, natureza, moeda)
  select (select v from ids where k='A'), (select v from ids where k='rev0'), 2, 2, 'Concreto', 10, 100, 'SERV-CIV-1', 'C', 'N', 'BRL';
insert into ids values ('rev1', public.emitir_revisao((select v from ids where k='px1'), 1234.56));
select pg_temp.confere((select count(*) from public.itens where revisao_id = (select v from ids where k='rev1')) = 2, 'Rev 1 recebe cópia dos itens');
select pg_temp.confere((select numero from public.revisoes where id = (select v from ids where k='rev1')) = 1, 'nova revisão = Rev 1');
select pg_temp.confere((select total from public.revisoes where id = (select v from ids where k='rev0')) = 1234.56, 'total congelado na Rev 0');
select pg_temp.deve_falhar(format($q$update public.itens set quantidade = 99 where revisao_id = %L$q$, (select v from ids where k='rev0')), 'editar item de revisão emitida');
select pg_temp.deve_falhar(format($q$delete from public.itens where revisao_id = %L$q$, (select v from ids where k='rev0')), 'excluir item de revisão emitida');
select pg_temp.deve_falhar(format($q$update public.revisoes set emitida_em = null where id = %L$q$, (select v from ids where k='rev0')), 'reabrir revisão emitida');
update public.itens set quantidade = 20 where revisao_id = (select v from ids where k='rev1') and not titulo;
select pg_temp.confere((select quantidade from public.itens where revisao_id = (select v from ids where k='rev0') and not titulo) = 10, 'Rev 0 mantém valor original');
reset role;

-- 9) Excluir PX com revisão emitida apaga tudo em cascata
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
delete from public.pxs where id = (select v from ids where k='px1');
reset role;
select pg_temp.confere((select count(*) from public.itens where revisao_id in (select v from ids where k in ('rev0','rev1'))) = 0, 'itens removidos em cascata');

-- 10) Storage: só a pasta da própria empresa
select pg_temp.como('00000000-0000-0000-0000-00000000000d');
insert into storage.objects (bucket_id, name) select 'biblioteca', v || '/pq.xlsx' from ids where k='A';
select pg_temp.deve_falhar(format($q$insert into storage.objects (bucket_id, name) values ('biblioteca', %L)$q$, (select v from ids where k='B') || '/x.xlsx'), 'enviar arquivo na pasta da B');
reset role;
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
select pg_temp.confere((select count(*) from storage.objects) = 0, 'B não vê arquivos da A');
reset role;

-- 11) Anônimo não lê nada
set role anon;
select pg_temp.deve_falhar('select * from public.empresas', 'anônimo ler empresas');
select pg_temp.deve_falhar('select public.criar_empresa(''x'')', 'anônimo criar empresa');
reset role;

-- 12) Usuário sem empresa não vê nada
insert into auth.users values ('00000000-0000-0000-0000-0000000000ee', 'eve@x');
select pg_temp.como('00000000-0000-0000-0000-0000000000ee');
select pg_temp.confere((select count(*) from public.pxs) + (select count(*) from public.itens) + (select count(*) from public.membros) = 0, 'estranho não vê nada');
reset role;
