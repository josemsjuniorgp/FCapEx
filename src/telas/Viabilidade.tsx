import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSessao } from '../app/Sessao';
import { brlCurto, Dialogo, nf, useAcao, Vazio } from '../app/ui';
import {
  criarEstudo, listarClientes, listarEstudos, listarProjetos, listarPxs, revisoesDaEmpresa,
  type Cliente, type Estudo, type Projeto, type Px,
} from '../dados/api';
import { calcularEstudo, normalizarPremissas, PREMISSAS_PADRAO, CAPEX_PADRAO, type ResultadoEstudo, type TipoEstudo } from '../dominio/viabilidade';
import { entradaCompleta, totaisDosMapas } from './estudoDados';

/** Página Viabilidade: estudos de todos os projetos (VPL, TIR, payback) e criação de um estudo novo. */
export function Viabilidade() {
  const { empresa, parametros, podeEditar } = useSessao();
  const ir = useNavigate();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [pxs, setPxs] = useState<Px[]>([]);
  const [estudos, setEstudos] = useState<Estudo[]>([]);
  const [res, setRes] = useState<Record<string, ResultadoEstudo>>({});
  const [novo, setNovo] = useState(false);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    if (!empresa || !parametros) return;
    let vivo = true;
    (async () => {
      const [c, p, x, e, r] = await Promise.all([listarClientes(empresa.id), listarProjetos(empresa.id), listarPxs(empresa.id), listarEstudos(empresa.id), revisoesDaEmpresa(empresa.id)]);
      if (!vivo) return;
      setClientes(c); setProjetos(p); setPxs(x); setEstudos(e); setCarregando(false);
      const usados = x.filter(px => e.some(s => (s.capex?.mapas ?? []).includes(px.id)));
      const tot = await totaisDosMapas(usados, r, parametros);
      const pares = await Promise.all(e.map(async s => [s.id, calcularEstudo(await entradaCompleta(s, tot, parametros))] as const));
      if (vivo) setRes(Object.fromEntries(pares));
    })().catch(() => setCarregando(false));
    return () => { vivo = false; };
  }, [empresa, parametros]);

  const grupos = useMemo(() => clientes.map(c => ({
    c, projs: projetos.filter(p => p.cliente_id === c.id).map(p => ({ p, lista: estudos.filter(e => e.projeto_id === p.id) })).filter(g => g.lista.length),
  })).filter(g => g.projs.length), [clientes, projetos, estudos]);

  if (!empresa) return null;
  return (
    <div className="stack" style={{ maxWidth: 1180 }}>
      <div className="row"><h1>Viabilidade</h1><span className="spacer" />
        {podeEditar && <button className="btn primary" onClick={() => setNovo(true)} disabled={!projetos.length}
          title={projetos.length ? '' : 'Crie um projeto em Projetos primeiro'}>Novo estudo</button>}</div>
      <p className="note" style={{ maxWidth: 860 }}>
        Do orçamento à decisão de investimento: cada estudo junta o <b>CapEx</b> (dos Mapas de Preços do projeto), o <b>OpEx</b> detalhado e as
        <b> receitas</b> ou <b>economias</b>, e calcula o fluxo de caixa, <b>VPL</b>, <b>TIR</b>, <b>payback</b> e o custo do ciclo de vida. Crie mais de um estudo
        por projeto para comparar alternativas.
      </p>
      {carregando && <p className="note">Carregando…</p>}
      {!carregando && !grupos.length && <Vazio>Nenhum estudo ainda. {podeEditar ? 'Use "Novo estudo" para começar.' : ''}</Vazio>}
      {grupos.map(({ c, projs }) => (
        <section key={c.id} className="card estudo-bloco">
          <h3>{c.nome}</h3>
          {projs.map(({ p, lista }) => (
            <div key={p.id} className="mat-proj">
              <div className="mat-proj-cab"><b>{p.nome}</b><span className="note">{lista.length} {lista.length === 1 ? 'estudo' : 'estudos'}</span></div>
              <table className="t estudo-lista">
                <thead><tr><th>Estudo</th><th>Tipo</th><th className="num">CapEx</th><th className="num">VPL</th><th className="num">TIR</th><th className="num">Payback</th><th /></tr></thead>
                <tbody>
                  {lista.map(e => {
                    const r = res[e.id], taxa = normalizarPremissas(e.premissas).taxa;
                    return (
                      <tr key={e.id}>
                        <td><b>{e.nome}</b></td>
                        <td>{e.tipo === 'economia' ? 'Redução de custo' : 'Com receita'}</td>
                        <td className="num">{r ? brlCurto(r.capexTotal) : '…'}</td>
                        <td className={'num' + (r && r.vpl < 0 ? ' neg' : '')}><b>{r ? brlCurto(r.vpl) : '…'}</b></td>
                        <td className="num">{r ? (r.tir === null ? '—' : nf(r.tir * 100, 1) + '%') : '…'}{r?.tir != null && <span className="note"> {r.tir >= taxa ? '▲' : '▼'}</span>}</td>
                        <td className="num">{r ? (r.payback ? `ano ${r.payback}` : '—') : '…'}</td>
                        <td><button className="btn small primary" onClick={() => ir(`/estudo/${e.id}`)}>Abrir</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </section>
      ))}
      {novo && <NovoEstudo clientes={clientes} projetos={projetos} pxs={pxs} onFechar={() => setNovo(false)} onCriado={id => ir(`/estudo/${id}`)} />}
    </div>
  );
}

function NovoEstudo({ clientes, projetos, pxs, onFechar, onCriado }: {
  clientes: Cliente[]; projetos: Projeto[]; pxs: Px[]; onFechar: () => void; onCriado: (id: string) => void;
}) {
  const { empresa } = useSessao();
  const acao = useAcao();
  const [projeto, setProjeto] = useState(projetos[0]?.id ?? '');
  const [nome, setNome] = useState('Alternativa A');
  const [tipo, setTipo] = useState<TipoEstudo>('receita');
  const mapas = pxs.filter(x => x.projeto_id === projeto);
  async function criar() {
    if (!empresa || !projeto || !nome.trim()) return;
    let id = '';
    if (await acao(async () => { id = await criarEstudo(empresa.id, projeto, nome, tipo, { ...PREMISSAS_PADRAO, rampa: [] }, { ...CAPEX_PADRAO, mapas: mapas.map(m => m.id) }); }, 'Estudo criado.')) onCriado(id);
  }
  return (
    <Dialogo titulo="Novo estudo de viabilidade" onFechar={onFechar}>
      <label className="fld">Projeto
        <select value={projeto} onChange={e => setProjeto(e.target.value)} aria-label="Projeto">
          {clientes.map(c => (
            <optgroup key={c.id} label={c.nome}>
              {projetos.filter(p => p.cliente_id === c.id).map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </optgroup>
          ))}
        </select></label>
      <label className="fld">Nome da alternativa
        <input className="in" autoFocus value={nome} maxLength={120} onChange={e => setNome(e.target.value)} placeholder="ex.: Alternativa A — Britagem nova" /></label>
      <fieldset className="fld estudo-tipo">
        <legend>Tipo de projeto</legend>
        <label className="row"><input type="radio" checked={tipo === 'receita'} onChange={() => setTipo('receita')} />
          <span><b>Com receita</b> — o projeto vende um produto ou serviço (ex.: nova planta).</span></label>
        <label className="row"><input type="radio" checked={tipo === 'economia'} onChange={() => setTipo('economia')} />
          <span><b>Redução de custo</b> — o projeto se paga com economia (ex.: trocar equipamento, reformar).</span></label>
      </fieldset>
      <p className="note">O CapEx começa com {mapas.length ? `os ${mapas.length} Mapas de Preços deste projeto` : 'zero (este projeto ainda não tem Mapas)'}; dá para ajustar na aba CapEx.
        Premissas iniciais: 2 anos de obra, 20 de operação, taxa 10%, IR+CSLL 34%, depreciação linear em 10 anos.</p>
      <div className="row"><span className="spacer" /><button className="btn" onClick={onFechar}>Cancelar</button>
        <button className="btn primary" disabled={!projeto || !nome.trim()} onClick={criar}>Criar estudo</button></div>
    </Dialogo>
  );
}
