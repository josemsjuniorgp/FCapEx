import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSessao } from '../app/Sessao';
import { brlCurto, Confirmar, plural, useAcao, Vazio, dataHora } from '../app/ui';
import {
  criarCliente, criarProjeto, excluirCliente, excluirProjeto, excluirPx, listarClientes, listarItens,
  listarProjetos, listarPxs, revisoesDaEmpresa, type Cliente, type Projeto, type Px, type Revisao,
} from '../dados/api';
import { totais, type Totais } from '../dominio/calculo';
import { NovaPx } from './NovaPx';

export function Projetos() {
  const { empresa, podeEditar, ehAdmin, parametros } = useSessao();
  const acao = useAcao();
  const ir = useNavigate();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [pxs, setPxs] = useState<Px[]>([]);
  const [revs, setRevs] = useState<Revisao[]>([]);
  const [resumo, setResumo] = useState<Record<string, Totais>>({});
  const [cliente, setCliente] = useState<string | null>(null);
  const [novoCliente, setNovoCliente] = useState('');
  const [novoProjeto, setNovoProjeto] = useState<string | null>(null);
  const [perguntar, setPerguntar] = useState<string | null>(null);
  const [novaPx, setNovaPx] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!empresa) return;
    const [c, p, x, r] = await Promise.all([listarClientes(empresa.id), listarProjetos(empresa.id), listarPxs(empresa.id), revisoesDaEmpresa(empresa.id)]);
    setClientes(c); setProjetos(p); setPxs(x); setRevs(r);
    setCliente(atual => (atual && c.some(k => k.id === atual) ? atual : c[0]?.id ?? null));
  }, [empresa]);
  useEffect(() => { carregar(); }, [carregar]);

  const projsDoCliente = useMemo(() => projetos.filter(p => p.cliente_id === cliente), [projetos, cliente]);
  const pxsDoCliente = useMemo(() => pxs.filter(x => projsDoCliente.some(p => p.id === x.projeto_id)), [pxs, projsDoCliente]);

  // totais da revisão em edição das PX do cliente aberto
  useEffect(() => {
    if (!parametros) return;
    let vivo = true;
    Promise.all(pxsDoCliente.map(async x => {
      const r = revs.find(v => v.px_id === x.id && !v.emitida_em);
      return [x.id, r ? totais(await listarItens(r.id), parametros, new Set(x.colunas)) : null] as const;
    })).then(l => { if (vivo) setResumo(Object.fromEntries(l.filter(([, t]) => t)) as Record<string, Totais>); });
    return () => { vivo = false; };
  }, [pxsDoCliente, revs, parametros]);

  const revAtual = (pxId: string) => revs.filter(r => r.px_id === pxId).reduce((m, r) => Math.max(m, r.numero), 0);
  const nPx = (projIds: string[]) => pxs.filter(x => projIds.includes(x.projeto_id)).length;

  async function addCliente() {
    if (!empresa || !novoCliente.trim()) return;
    if (await acao(() => criarCliente(empresa.id, novoCliente), `Cliente "${novoCliente.trim()}" criado.`)) { setNovoCliente(''); carregar(); }
  }
  async function addProjeto() {
    if (!empresa || !cliente || !novoProjeto?.trim()) return;
    if (await acao(() => criarProjeto(empresa.id, cliente, novoProjeto), 'Projeto criado.')) { setNovoProjeto(null); carregar(); }
  }
  const apagar = async (fn: () => Promise<unknown>, msg: string) => { setPerguntar(null); if (await acao(fn, msg)) carregar(); };

  return (
    <div className="cols2">
      <aside className="card" style={{ padding: 10, alignSelf: 'start' }}>
        <h3 style={{ padding: '4px 8px 8px' }}>Clientes</h3>
        <div className="list">
          {clientes.map(c => {
            const ids = projetos.filter(p => p.cliente_id === c.id).map(p => p.id);
            return (
              <div key={c.id}>
                <div className="cl">
                  <button aria-pressed={cliente === c.id} onClick={() => setCliente(c.id)}>
                    {c.nome}<br /><small className="note">{plural(ids.length, 'projeto', 'projetos')} · {nPx(ids)} PX</small>
                  </button>
                  {ehAdmin && <button className="btn small danger" onClick={() => setPerguntar('c:' + c.id)}>Excluir</button>}
                </div>
                {perguntar === 'c:' + c.id && (
                  <Confirmar msg={<>Excluir <b>{c.nome}</b> com {plural(ids.length, 'projeto', 'projetos')} e {nPx(ids)} PX?</>}
                    sim="Excluir cliente" onNao={() => setPerguntar(null)} onSim={() => apagar(() => excluirCliente(c.id), 'Cliente excluído.')} />
                )}
              </div>
            );
          })}
          {!clientes.length && <span className="note" style={{ padding: 8 }}>Nenhum cliente ainda.</span>}
        </div>
        {ehAdmin && (
          <div className="row" style={{ padding: 8 }}>
            <input className="in" style={{ flex: 1, minWidth: 0 }} placeholder="Novo cliente" value={novoCliente}
              onChange={e => setNovoCliente(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCliente()} />
            <button className="btn small" onClick={addCliente} disabled={!novoCliente.trim()}>Criar</button>
          </div>
        )}
      </aside>

      <section className="stack">
        <div className="row">
          <h1>{clientes.find(c => c.id === cliente)?.nome ?? 'Projetos'}</h1><span className="spacer" />
          {podeEditar && cliente && <button className="btn" onClick={() => setNovoProjeto('')}>Novo projeto</button>}
        </div>
        {novoProjeto !== null && (
          <div className="card row" style={{ padding: 12 }}>
            <input className="in" autoFocus style={{ flex: 1 }} placeholder="Nome do projeto" value={novoProjeto}
              onChange={e => setNovoProjeto(e.target.value)} onKeyDown={e => e.key === 'Enter' && addProjeto()} />
            <button className="btn primary" onClick={addProjeto} disabled={!novoProjeto.trim()}>Criar projeto</button>
            <button className="btn" onClick={() => setNovoProjeto(null)}>Cancelar</button>
          </div>
        )}
        {!cliente && <Vazio>{ehAdmin ? 'Crie o primeiro cliente na lista à esquerda.' : 'Nenhum cliente cadastrado.'}</Vazio>}
        {cliente && !projsDoCliente.length && <Vazio>Este cliente ainda não tem projetos.</Vazio>}
        {projsDoCliente.map(p => {
          const lista = pxs.filter(x => x.projeto_id === p.id);
          return (
            <article className="card proj" key={p.id}>
              <div className="row">
                <h2>{p.nome}</h2><span className="note">{plural(lista.length, 'PX', 'PX')}</span><span className="spacer" />
                {podeEditar && <button className="btn small primary" onClick={() => setNovaPx(p.id)}>Nova PX</button>}
                {podeEditar && <button className="btn small danger" onClick={() => setPerguntar('p:' + p.id)}>Excluir projeto</button>}
              </div>
              {perguntar === 'p:' + p.id && (
                <Confirmar msg={<>Excluir o projeto <b>{p.nome}</b> e {plural(lista.length, 'PX', 'PX')}?</>} sim="Excluir projeto"
                  onNao={() => setPerguntar(null)} onSim={() => apagar(() => excluirProjeto(p.id), 'Projeto excluído.')} />
              )}
              <div className="cards">
                {lista.map(x => {
                  const t = resumo[x.id];
                  return (
                    <article className="card px-card" key={x.id}>
                      <div><strong>{x.nome}</strong><div className="note mono">{x.codigo} · Rev {revAtual(x.id)}</div></div>
                      <div className="tot">{t ? brlCurto(t.ger) : '—'}</div>
                      <div className="meta">
                        <span className="pill p-mut">{x.modelo_nome}</span>
                        {t && t.ok > 0 && <span className="pill p-ok"><i />{t.ok} ok</span>}
                        {t && t.inc > 0 && <span className="pill p-warn"><i />{t.inc} incompleta{t.inc === 1 ? '' : 's'}</span>}
                        {t && t.err > 0 && <span className="pill p-err"><i />{t.err} com erro</span>}
                        {t && !t.ok && !t.inc && !t.err && <span className="pill p-mut">Sem itens</span>}
                      </div>
                      {perguntar === 'x:' + x.id
                        ? <Confirmar msg={<>Excluir a <b>{x.codigo}</b> e todas as revisões dela?</>} sim="Excluir PX"
                            onNao={() => setPerguntar(null)} onSim={() => apagar(() => excluirPx(x.id), `${x.codigo} excluída.`)} />
                        : <div className="row"><span className="note">Atualizada {dataHora(x.atualizado_em)}</span><span className="spacer" />
                            {podeEditar && <button className="btn small danger" onClick={() => setPerguntar('x:' + x.id)}>Excluir</button>}
                            <button className="btn small primary" onClick={() => ir(`/px/${x.id}`)}>{podeEditar ? 'Editar' : 'Abrir'}</button></div>}
                    </article>
                  );
                })}
                {!lista.length && <span className="note">Nenhuma PX neste projeto.</span>}
              </div>
            </article>
          );
        })}
      </section>
      {novaPx && (
        <NovaPx projetos={projsDoCliente} pxs={pxs} projetoInicial={novaPx}
          onFechar={() => setNovaPx(null)} onCriada={id => ir(`/px/${id}`)} />
      )}
    </div>
  );
}
