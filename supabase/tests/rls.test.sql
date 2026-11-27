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
select pg_temp.confere((select count(*) from public.tributos) = 7, 'tributos padrão: 7');
select pg_temp.confere((select aliquota from public.tributos where nome = 'COFINS') = 0.076, 'COFINS padrão 7,6%');
select pg_temp.confere((select string_agg(nome, ',') from public.modelos where empresa_id is null) = 'Mapa Padrão', 'só o modelo Mapa Padrão do sistema');

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

-- 13) Equipe: admin adiciona por e-mail; orçamentista não; empresa não fica sem admin
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select public.adicionar_membro((select v from ids where k='A'), 'EVE@X', 'revisor');
select pg_temp.confere((select papel::text from public.listar_membros((select v from ids where k='A')) where email = 'eve@x') = 'revisor', 'admin adiciona membro por e-mail');
select pg_temp.confere((select count(*) from public.listar_membros((select v from ids where k='B'))) = 0, 'não lista membros de outra empresa');
select pg_temp.deve_falhar(format($q$select public.adicionar_membro(%L, 'ninguem@x', 'leitura')$q$, (select v from ids where k='A')), 'e-mail inexistente');
select pg_temp.deve_falhar(format($q$delete from public.membros where empresa_id = %L and usuario_id = '00000000-0000-0000-0000-00000000000a'$q$, (select v from ids where k='A')), 'remover o único admin');
reset role;
select pg_temp.como('00000000-0000-0000-0000-00000000000d');
select pg_temp.deve_falhar(format($q$select public.adicionar_membro(%L, 'eve@x', 'admin')$q$, (select v from ids where k='A')), 'orçamentista adicionar membro');
reset role;
-- excluir a empresa inteira continua possível (cascata)
delete from public.empresas where id = (select v from ids where k='B');
select pg_temp.confere((select count(*) from public.membros where empresa_id = (select v from ids where k='B')) = 0, 'excluir empresa remove membros');

-- 14) Convites: lista mostra pendentes; consulta de contas por e-mail é só do servidor
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select pg_temp.confere((select pendente from public.listar_membros((select v from ids where k='A')) where email = 'eve@x'), 'membro que nunca entrou aparece como pendente');
select pg_temp.deve_falhar('select * from public.conta_por_email(''eve@x'')', 'usuário logado consultar contas por e-mail');
reset role;
set role service_role;
select pg_temp.confere((select not ja_entrou from public.conta_por_email('EVE@X')), 'servidor encontra a conta pelo e-mail');
reset role;

-- 15) Código da PX no padrão da empresa
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
update public.empresas set padrao_codigo = 'PX-{campo:Área}-{campo:Projeto}-{campo:Disciplina}-{campo:Sigla}-{seq:4}' where id = (select v from ids where k='A');
insert into ids values ('pxc', public.criar_px((select v from ids where k='projA'), 'Com padrão', 'PX Padrão v1', array['seq'], '',
  '{"Área":"a2","Projeto":"1000","Disciplina":"G","Sigla":"PB"}'::jsonb));
select pg_temp.confere((select codigo from public.pxs where id = (select v from ids where k='pxc')) = 'PX-A2-1000-G-PB-0003', 'código montado pelo padrão (3ª PX da empresa)');
insert into ids values ('pxm', public.criar_px((select v from ids where k='projA'), 'Manual', 'PX Padrão v1', array['seq'], '', '{}'::jsonb, 'PX-ESPECIAL-01'));
select pg_temp.confere((select codigo from public.pxs where id = (select v from ids where k='pxm')) = 'PX-ESPECIAL-01', 'código digitado manualmente');
select pg_temp.deve_falhar(format($q$select public.criar_px(%L, 'x', 'm', array['seq'], '', '{}'::jsonb, 'PX-ESPECIAL-01')$q$, (select v from ids where k='projA')), 'código repetido');
select pg_temp.deve_falhar(format($q$update public.empresas set padrao_codigo = 'PX-{campo:A}' where id = %L$q$, (select v from ids where k='A')), 'padrão sem sequencial');
select pg_temp.confere(public.proximo_px_previsto((select v from ids where k='A')) = 4, 'prévia do próximo sequencial');
reset role;
select pg_temp.como('00000000-0000-0000-0000-00000000000d');
update public.empresas set padrao_codigo = 'X-{seq}' where id = (select v from ids where k='A');
reset role;
select pg_temp.confere((select padrao_codigo from public.empresas where id = (select v from ids where k='A')) like 'PX-{campo:Área}%', 'orçamentista não altera o padrão');

-- 16) Código livre: qualquer texto até 250 caracteres, sem repetir na empresa
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
insert into ids values ('pxl', public.criar_px((select v from ids where k='projA'), 'Livre', 'PX Padrão v1', array['seq'], '', '{}'::jsonb, 'ORÇ 2026/15 – rev. cliente'));
select pg_temp.confere((select codigo from public.pxs where id = (select v from ids where k='pxl')) = 'ORÇ 2026/15 – rev. cliente', 'código livre com espaços e símbolos');
select pg_temp.deve_falhar(format($q$select public.criar_px(%L, 'x', 'm', array['seq'], '', '{}'::jsonb, %L)$q$, (select v from ids where k='projA'), repeat('A', 251)), 'código com mais de 250 caracteres');
select pg_temp.deve_falhar(format($q$update public.pxs set codigo = '' where id = %L$q$, (select v from ids where k='pxl')), 'código vazio na edição');
reset role;

-- 17) Tributos detalhados: isolamento, só admin altera, revisão copia ligados/desligados
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
insert into public.tributos (empresa_id, nome, aliquota) select v, 'Taxa municipal X', 0.02 from ids where k='A';
select pg_temp.confere((select count(*) from public.tributos) = 8, 'admin cria tributo personalizado');
reset role;
select pg_temp.como('00000000-0000-0000-0000-00000000000d');
select pg_temp.deve_falhar(format($q$insert into public.tributos (empresa_id, nome, aliquota) values (%L, 'y', 0.1)$q$, (select v from ids where k='A')), 'orçamentista criar tributo');
update public.tributos set aliquota = 0.5 where nome = 'PIS';
reset role;
select pg_temp.confere((select aliquota from public.tributos where nome = 'PIS' and empresa_id = (select v from ids where k='A')) = 0.0165, 'orçamentista não altera alíquota');
insert into auth.users values ('00000000-0000-0000-0000-0000000000ff', 'zed@x');
select pg_temp.como('00000000-0000-0000-0000-0000000000ff');
select pg_temp.confere((select count(*) from public.tributos) = 0, 'estranho não vê tributos');
reset role;
select pg_temp.como('00000000-0000-0000-0000-00000000000d');
insert into ids values ('pxt', public.criar_px((select v from ids where k='projA'), 'Tributos', 'PX Padrão', array['seq'], '', '{}'::jsonb, 'PX-TRIB-01'));
insert into ids select 'revt', id from public.revisoes where px_id = (select v from ids where k='pxt');
insert into public.itens (empresa_id, revisao_id, posicao, seq, descricao, tributos_ligados)
  select (select v from ids where k='A'), (select v from ids where k='revt'), 1, 1, 'Com ISS desligado', '{"abc": false}'::jsonb;
select public.emitir_revisao((select v from ids where k='pxt'), 0);
select pg_temp.confere((select tributos_ligados ->> 'abc' from public.itens i join public.revisoes r on r.id = i.revisao_id
  where r.px_id = (select v from ids where k='pxt') and r.emitida_em is null) = 'false', 'revisão nova copia tributos ligados/desligados');
reset role;

-- 18) Fretes: só admin cadastra, isolados por empresa, item só usa frete da própria empresa, revisão copia
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
with f as (insert into public.fretes (empresa_id, tipo, nome, local, criterio, valor)
  values ((select v from ids where k='A'), 'nacional', 'Rodoviário SP-MG', 'MG', 'valor', 500) returning id)
insert into ids select 'frA', id from f;
reset role;
select pg_temp.como('00000000-0000-0000-0000-00000000000d');
select pg_temp.deve_falhar(format($q$insert into public.fretes (empresa_id, tipo, nome) values (%L, 'nacional', 'x')$q$, (select v from ids where k='A')), 'orçamentista cadastrar frete');
insert into public.itens (empresa_id, revisao_id, posicao, seq, descricao, frete_nacional)
  select (select v from ids where k='A'), r.id, 2, 2, 'Com frete', (select v from ids where k='frA')
    from public.revisoes r where r.px_id = (select v from ids where k='pxt') and r.emitida_em is null;
select pg_temp.deve_falhar(format($q$insert into public.itens (empresa_id, revisao_id, posicao, seq, descricao, frete_internacional) select %L, r.id, 3, 3, 'x', %L from public.revisoes r where r.px_id = %L and r.emitida_em is null$q$,
  (select v from ids where k='A'), (select v from ids where k='frA'), (select v from ids where k='pxt')), 'frete nacional usado como internacional');
select public.emitir_revisao((select v from ids where k='pxt'), 0);
select pg_temp.confere((select count(*) from public.itens i join public.revisoes r on r.id = i.revisao_id
  where r.px_id = (select v from ids where k='pxt') and r.emitida_em is null and i.frete_nacional = (select v from ids where k='frA')) = 1, 'revisão copia o frete escolhido');
reset role;
select pg_temp.como('00000000-0000-0000-0000-0000000000ff');
select pg_temp.confere((select count(*) from public.fretes) = 0, 'estranho não vê fretes');
reset role;
-- excluir o frete não impede emitir a próxima revisão (o item fica sem frete)
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
delete from public.fretes where id = (select v from ids where k='frA');
select public.emitir_revisao((select v from ids where k='pxt'), 0);
select pg_temp.confere((select count(*) from public.itens i join public.revisoes r on r.id = i.revisao_id
  where r.px_id = (select v from ids where k='pxt') and r.emitida_em is null and i.descricao = 'Com frete' and i.frete_nacional is null) = 1, 'frete excluído: item copiado sem frete');
reset role;

-- 19) BDIs: Administrador e Orçamentista cadastram, leitura não; isolados por empresa;
--     item só usa BDI da própria empresa; emitir guarda a foto dos BDIs e a revisão nova copia o BDI
select pg_temp.como('00000000-0000-0000-0000-00000000000d');
with b as (insert into public.bdis (empresa_id, nome, administracao, lucro)
  values ((select v from ids where k='A'), 'BDI Obras Civis', 0.04, 0.074) returning id)
insert into ids select 'bdiA', id from b;
update public.bdis set riscos = 0.0127 where id = (select v from ids where k='bdiA');
select pg_temp.confere((select riscos from public.bdis where id = (select v from ids where k='bdiA')) = 0.0127, 'orçamentista altera BDI');
insert into public.itens (empresa_id, revisao_id, posicao, seq, descricao, bdi_id)
  select (select v from ids where k='A'), r.id, 4, 4, 'Com BDI', (select v from ids where k='bdiA')
    from public.revisoes r where r.px_id = (select v from ids where k='pxt') and r.emitida_em is null;
reset role;
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select pg_temp.deve_falhar(format($q$insert into public.bdis (empresa_id, nome) values (%L, 'x')$q$, (select v from ids where k='A')), 'leitura cadastrar BDI');
update public.bdis set lucro = 0.5 where id = (select v from ids where k='bdiA');
reset role;
select pg_temp.confere((select lucro from public.bdis where id = (select v from ids where k='bdiA')) = 0.074, 'leitura não altera BDI');
select pg_temp.como('00000000-0000-0000-0000-0000000000ff');
select pg_temp.confere((select count(*) from public.bdis) = 0, 'estranho não vê BDIs da A');
reset role;
with e as (insert into public.empresas (nome) values ('Empresa C') returning id) insert into ids select 'C', id from e;
with b as (insert into public.bdis (empresa_id, nome) values ((select v from ids where k='C'), 'BDI da C') returning id)
insert into ids select 'bdiB', id from b;
select pg_temp.como('00000000-0000-0000-0000-00000000000d');
-- BDI de outra empresa: invisível para quem edita, então o item não fica ligado a ele
insert into public.itens (empresa_id, revisao_id, posicao, seq, descricao, bdi_id)
  select (select v from ids where k='A'), r.id, 5, 5, 'BDI alheio', (select v from ids where k='bdiB')
    from public.revisoes r where r.px_id = (select v from ids where k='pxt') and r.emitida_em is null;
select pg_temp.confere((select bdi_id from public.itens where descricao = 'BDI alheio') is null, 'item não usa BDI de outra empresa');
delete from public.itens where descricao = 'BDI alheio';
select public.emitir_revisao((select v from ids where k='pxt'), 0);
select pg_temp.confere((select count(*) from public.itens i join public.revisoes r on r.id = i.revisao_id
  where r.px_id = (select v from ids where k='pxt') and r.emitida_em is null and i.bdi_id = (select v from ids where k='bdiA')) = 1, 'revisão nova copia o BDI escolhido');
select pg_temp.confere((select bdis_congelados -> 0 ->> 'nome' from public.revisoes r where r.px_id = (select v from ids where k='pxt')
  and r.emitida_em is not null order by numero desc limit 1) = 'BDI Obras Civis', 'emissão guarda a foto do BDI usado');
-- alterar o BDI depois não muda a foto da revisão emitida
update public.bdis set lucro = 0.2 where id = (select v from ids where k='bdiA');
select pg_temp.confere((select (bdis_congelados -> 0 ->> 'lucro')::numeric from public.revisoes r where r.px_id = (select v from ids where k='pxt')
  and r.emitida_em is not null order by numero desc limit 1) = 0.074, 'foto da revisão emitida não muda');
-- excluir o BDI: a revisão em edição continua emitindo (item fica sem BDI)
delete from public.bdis where id = (select v from ids where k='bdiA');
select public.emitir_revisao((select v from ids where k='pxt'), 0);
select pg_temp.confere((select count(*) from public.itens i join public.revisoes r on r.id = i.revisao_id
  where r.px_id = (select v from ids where k='pxt') and r.emitida_em is null and i.descricao = 'Com BDI' and i.bdi_id is null) = 1, 'BDI excluído: item copiado sem BDI');
reset role;

-- 20) Maturidade: classe e fase no projeto (orçamentista edita), origem do preço validada e copiada na revisão
select pg_temp.como('00000000-0000-0000-0000-00000000000d');
update public.projetos set fase = 'Projeto Básico', classe = 3 where id = (select v from ids where k='projA');
select pg_temp.confere((select classe from public.projetos where id = (select v from ids where k='projA')) = 3, 'orçamentista define classe e fase');
select pg_temp.deve_falhar(format($q$update public.projetos set classe = 6 where id = %L$q$, (select v from ids where k='projA')), 'classe AACE fora de 1 a 5');
select pg_temp.deve_falhar(format($q$update public.itens set origem = 'chute' where revisao_id in (select id from public.revisoes where px_id = %L and emitida_em is null)$q$, (select v from ids where k='pxt')), 'origem do preço inválida');
update public.itens set origem = 'firme' where descricao = 'Com frete' and revisao_id in (select id from public.revisoes where px_id = (select v from ids where k='pxt') and emitida_em is null);
select public.emitir_revisao((select v from ids where k='pxt'), 0);
select pg_temp.confere((select origem from public.itens i join public.revisoes r on r.id = i.revisao_id
  where r.px_id = (select v from ids where k='pxt') and r.emitida_em is null and i.descricao = 'Com frete') = 'firme', 'revisão nova copia a origem do preço');
reset role;

-- 21) Viabilidade: orçamentista cria estudo e linhas; leitura só consulta; isolamento entre empresas
select pg_temp.como('00000000-0000-0000-0000-00000000000d');
with e as (insert into public.estudos (empresa_id, projeto_id, nome, tipo) values ((select v from ids where k='A'), (select v from ids where k='projA'), 'Alternativa A', 'receita') returning id)
insert into ids select 'estA', id from e;
insert into public.estudo_linhas (empresa_id, estudo_id, secao, descricao, quantidade, preco) values
  ((select v from ids where k='A'), (select v from ids where k='estA'), 'opex', 'Energia', 1, 1000);
select pg_temp.deve_falhar(format($q$insert into public.estudo_linhas (empresa_id, estudo_id, secao, descricao) values (%L, %L, 'capex', 'x')$q$,
  (select v from ids where k='A'), (select v from ids where k='estA')), 'seção inválida na linha do estudo');
reset role;
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select pg_temp.confere((select count(*) from public.estudos) = 1, 'leitura vê o estudo');
select pg_temp.deve_falhar(format($q$insert into public.estudos (empresa_id, projeto_id, nome) values (%L, %L, 'x')$q$,
  (select v from ids where k='A'), (select v from ids where k='projA')), 'leitura criar estudo');
update public.estudos set nome = 'hack' where id = (select v from ids where k='estA');
reset role;
select pg_temp.confere((select nome from public.estudos where id = (select v from ids where k='estA')) = 'Alternativa A', 'leitura não altera estudo');
select pg_temp.como('00000000-0000-0000-0000-0000000000ff');
select pg_temp.confere((select count(*) from public.estudos) = 0 and (select count(*) from public.estudo_linhas) = 0, 'estranho não vê estudos');
reset role;
select pg_temp.deve_falhar(format($q$insert into public.estudos (empresa_id, projeto_id, nome) values (%L, %L, 'x')$q$,
  (select v from ids where k='C'), (select v from ids where k='projA')), 'estudo de outra empresa no projeto da A');
