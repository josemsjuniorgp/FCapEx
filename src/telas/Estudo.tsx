import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useSessao } from '../app/Sessao';
import { brl, brlCurto, Confirmar, nf, useAcao } from '../app/ui';
import { GraficoFluxo, GraficoTornado } from '../app/graficos';
import {
  atualizarEstudo, atualizarLinhaEstudo, excluirEstudo, excluirLinhasEstudo, inserirLinhasEstudo, lerEstudo, listarClientes,
  listarEstudos, listarLinhasEstudo, listarProjetos, listarPxs, revisoesDaEmpresa,
  type Cliente, type Estudo as EstudoDb, type Projeto, type Px,
} from '../dados/api';
import { parseNum } from '../dominio/normalizacao';
import {
  calcularEstudo, cenario, normalizarCapex, normalizarPremissas, tornado,
  type AjusteCenario, type CapexEstudo, type LinhaEstudo, type Premissas, type ResultadoEstudo, type Secao,
} from '../dominio/viabilidade';
import { GradeEstudo } from './GradeEstudo';
import { entradaCompleta, entradaDoEstudo, totaisDosMapas } from './estudoDados';

type Aba = 'premissas' | 'capex' | 'opex' | 'receitas' | 'resultados' | 'risco' | 'relatorio';
const pct = (f: number | null | undefined, d = 1) => (f === null || f === undefined ? '—' : nf(f * 100, d) + '%');

/** Tela de um Estudo de Viabilidade: premissas, CapEx, OpEx, Receitas/Economias, Resultados, Risco e Relatório. */
export function Estudo() {
  const { id = '' } = useParams();
  const { empresa, parametros, moedas, podeEditar } = useSessao();
  const acao = useAcao();
  const ir = useNavigate();
  const [estudo, setEstudo] = useState<EstudoDb | null>(null);
  const [linhas, setLinhas] = useState<LinhaEstudo[]>([]);
  const [projeto, setProjeto] = useState<Projeto | null>(null);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [mapas, setMapas] = useState<Px[]>([]);
  const [totaisMapas, setTotaisMapas] = useState<Record<string, number>>({});
  const [outros, setOutros] = useState<EstudoDb[]>([]);
  const [aba, setAba] = useState<Aba>('resultados');
  const [erro, setErro] = useState<string | null>(null);
  const [apagar, setApagar] = useState(false);

  const carregar = useCallback(async () => {
    if (!empresa || !parametros) return;
    try {
      const e = await lerEstudo(id);
      const [l, pj, cl, px, revs, est] = await Promise.all([listarLinhasEstudo(id), listarProjetos(empresa.id), listarClientes(empresa.id),
        listarPxs(empresa.id), revisoesDaEmpresa(empresa.id), listarEstudos(empresa.id)]);
      const p = pj.find(x => x.id === e.projeto_id) ?? null;
      const doProjeto = px.filter(x => x.projeto_id === e.projeto_id);
      setEstudo(e); setLinhas(l); setProjeto(p); setCliente(cl.find(c => c.id === p?.cliente_id) ?? null);
      setMapas(doProjeto); setOutros(est.filter(x => x.projeto_id === e.projeto_id && x.id !== e.id));
      setTotaisMapas(await totaisDosMapas(doProjeto, revs, parametros));
    } catch (x) { setErro(x instanceof Error ? x.message : String(x)); }
  }, [id, empresa, parametros]);
  useEffect(() => { carregar(); }, [carregar]);

  const premissas = useMemo(() => normalizarPremissas(estudo?.premissas), [estudo]);
  const capex = useMemo(() => normalizarCapex(estudo?.capex), [estudo]);
  const entrada = useMemo(() => (estudo && parametros ? entradaDoEstudo(estudo, linhas, totaisMapas, parametros) : null), [estudo, linhas, totaisMapas, parametros]);
  const r = useMemo(() => (entrada ? calcularEstudo(entrada) : null), [entrada]);

  if (erro) return <div className="banner">Não foi possível abrir o estudo: {erro}</div>;
  if (!estudo || !entrada || !r || !parametros) return <p className="note">Carregando…</p>;
  const editavel = podeEditar;
  const secaoReceita: Secao = estudo.tipo === 'economia' ? 'economia' : 'receita';

  // --------------------------------------------------------------- gravação
  async function salvarEstudo(campos: Partial<Pick<EstudoDb, 'nome' | 'tipo' | 'premissas' | 'capex' | 'observacoes'>>) {
    const antes = estudo!;
    setEstudo({ ...antes, ...campos });
    if (!(await acao(() => atualizarEstudo(antes.id, campos)))) setEstudo(antes);
  }
  const salvarPremissas = (m: Partial<Premissas>) => salvarEstudo({ premissas: { ...premissas, ...m } });
  const salvarCapex = (m: Partial<CapexEstudo>) => salvarEstudo({ capex: { ...capex, ...m } });

  async function salvarLinha(lid: string, c: Partial<LinhaEstudo>) {
    const antes = linhas.find(l => l.id === lid);
    if (!antes) return;
    setLinhas(ls => ls.map(l => (l.id === lid ? { ...l, ...c } : l)));
    if (!(await acao(() => atualizarLinhaEstudo(lid, c)))) setLinhas(ls => ls.map(l => (l.id === lid ? antes : l)));
  }
  async function inserirLinha(secao: Secao, depoisDe: string | null) {
    if (!empresa) return;
    const daSecao = linhas.filter(l => l.secao === secao);
    const idx = depoisDe ? daSecao.findIndex(l => l.id === depoisDe) : daSecao.length - 1;
    const a = daSecao[idx]?.posicao ?? 0, b = daSecao[idx + 1]?.posicao;
    const nova: LinhaEstudo = {
      id: crypto.randomUUID(), secao, posicao: b === undefined ? a + 1 : (a + b) / 2, titulo: false, item: '', descricao: '',
      comportamento: secao === 'opex' ? 'fixo' : 'variavel', unidade: '', quantidade: null, preco: null, moeda: 'BRL',
      anoInicio: null, anoFim: null, reajuste: 0, deducao: 0, origem: '',
    };
    if (await acao(() => inserirLinhasEstudo(empresa.id, estudo!.id, [nova]))) setLinhas(ls => [...ls, nova].sort((x, y) => x.posicao - y.posicao));
  }
  async function excluirLinha(lid: string) {
    if (await acao(() => excluirLinhasEstudo([lid]))) setLinhas(ls => ls.filter(l => l.id !== lid));
  }

  const opNoAno = r.payback ? r.payback - premissas.anosObra : null;
  const ABAS: [Aba, string][] = [['premissas', 'Premissas'], ['capex', 'CapEx'], ['opex', 'OpEx'],
    ['receitas', estudo.tipo === 'economia' ? 'Economias' : 'Receitas'], ['resultados', 'Resultados'], ['risco', 'Risco e cenários'], ['relatorio', 'Relatório']];

  return (
    <div className="estudo">
      <header className="px-cab">
        <button className="voltar" title="Voltar para Viabilidade" aria-label="Voltar para Viabilidade" onClick={() => ir('/viabilidade')}>
          <svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6" /></svg>
        </button>
        <div className="px-cab-txt">
          <nav className="trilha" aria-label="Trilha">
            <Link to="/viabilidade">Viabilidade</Link>
            {cliente && <><span className="sep">›</span><span>{cliente.nome}</span></>}
            {projeto && <><span className="sep">›</span><span className="atual">{projeto.nome}</span></>}
          </nav>
          <div className="px-cab-linha"><h1>Estudo de Viabilidade · {estudo.nome}</h1></div>
          <div className="estudo-chips">
            <span className="chip estudo-tipo-chip">{estudo.tipo === 'economia' ? 'Redução de custo' : 'Com receita'}</span>
            <span className="chip">Horizonte {premissas.anosObra + premissas.anosOperacao} anos ({premissas.anosObra} obra + {premissas.anosOperacao} operação)</span>
            <span className="chip">Valores reais · R$</span>
            <span className="chip">Taxa {pct(premissas.taxa)} a.a.</span>
            <span className="chip">IR+CSLL {pct(premissas.ir, 0)} · depreciação linear {premissas.depreciacaoAnos} anos</span>
          </div>
        </div>
      </header>

      <div className="kpis estudo-kpis">
        <Kpi rot="VPL" val={`R$ ${nf(r.vpl / 1e6, 1)} mi`} sub={r.vpl >= 0 ? '▲ cria valor (VPL > 0)' : '▼ destrói valor (VPL < 0)'} tom={r.vpl >= 0 ? 'bom' : 'ruim'} />
        <Kpi rot="TIR" val={r.tir === null ? '—' : `${pct(r.tir)} a.a.`} sub={r.tir === null ? 'fluxo sem TIR' : r.tir >= premissas.taxa ? `▲ acima da taxa de ${pct(premissas.taxa)}` : `▼ abaixo da taxa de ${pct(premissas.taxa)}`} tom={r.tir !== null && r.tir >= premissas.taxa ? 'bom' : 'ruim'} />
        <Kpi rot="Payback" val={r.payback ? `ano ${r.payback}` : 'não paga'} sub={opNoAno ? `${opNoAno} anos após a partida` : 'no horizonte do estudo'} tom={r.payback ? 'bom' : 'ruim'} />
        <Kpi rot="CapEx" val={`R$ ${nf(r.capexTotal / 1e6, 1)} mi`} sub={`${capex.mapas.length} ${capex.mapas.length === 1 ? 'Mapa de Preços' : 'Mapas de Preços'}${capex.adicional ? ' + adicional' : ''}`} />
        <Kpi rot="OpEx anual (ano cheio)" val={`R$ ${nf(r.opexAnoCheio / 1e6, 1)} mi`} sub={estudo.tipo === 'economia' ? `economia R$ ${nf(r.receitaAnoCheio / 1e6, 1)} mi/ano` : `receita R$ ${nf(r.receitaAnoCheio / 1e6, 1)} mi/ano`} />
        <Kpi rot="Custo do ciclo de vida" val={`R$ ${nf(r.lcc / 1e6, 0)} mi`} sub={`CapEx + OpEx em ${premissas.anosObra + premissas.anosOperacao} anos`} />
      </div>

      <nav className="estudo-abas" role="tablist">
        {ABAS.map(([k, n]) => <button key={k} role="tab" aria-selected={aba === k} className={aba === k ? 'on' : ''} onClick={() => setAba(k)}>{n}</button>)}
      </nav>

      <div className="estudo-corpo">
        {aba === 'premissas' && (
          <AbaPremissas estudo={estudo} p={premissas} editavel={editavel} onEstudo={salvarEstudo} onPremissas={salvarPremissas}
            apagar={apagar} setApagar={setApagar}
            onExcluir={async () => { if (await acao(() => excluirEstudo(estudo.id), 'Estudo excluído.')) ir('/viabilidade'); }} />
        )}
        {aba === 'capex' && <AbaCapex c={capex} p={premissas} mapas={mapas} totais={totaisMapas} r={r} editavel={editavel} onCapex={salvarCapex} />}
        {aba === 'opex' && (
          <GradeEstudo secao="opex" linhas={linhas.filter(l => l.secao === 'opex')} premissas={premissas} moedas={moedas} cambio={parametros.cambio}
            editavel={editavel} onSalvar={salvarLinha} onInserir={d => inserirLinha('opex', d)} onExcluir={excluirLinha} />
        )}
        {aba === 'receitas' && (
          <>
            <p className="note" style={{ marginTop: 0 }}>{estudo.tipo === 'economia'
              ? 'Projeto de redução de custo: liste aqui os custos de hoje que deixam de existir com o projeto (sem o projeto). Os custos novos, com o projeto, ficam na aba OpEx.'
              : 'Projeto com receita: liste os produtos ou serviços vendidos. "Variável" acompanha a rampa de partida; a dedução é o imposto sobre a venda.'}</p>
            <GradeEstudo secao={secaoReceita} linhas={linhas.filter(l => l.secao === secaoReceita)} premissas={premissas} moedas={moedas} cambio={parametros.cambio}
              editavel={editavel} onSalvar={salvarLinha} onInserir={d => inserirLinha(secaoReceita, d)} onExcluir={excluirLinha} />
          </>
        )}
        {aba === 'resultados' && <AbaResultados r={r} p={premissas} tipo={estudo.tipo} torn={tornado(entrada)} />}
        {aba === 'risco' && (
          <AbaRisco base={r} entrada={entrada} p={premissas} editavel={editavel} nome={estudo.nome} outros={outros} totaisMapas={totaisMapas}
            onCenarios={c => salvarPremissas({ cenarios: c })} />
        )}
        {aba === 'relatorio' && (
          <AbaRelatorio onExportar={() => acao(async () => {
            const { gerarExcelEstudo, nomeArquivoEstudo } = await import('../dominio/exportarEstudo');
            const buf = await gerarExcelEstudo({
              empresa: empresa?.nome ?? '', cliente: cliente?.nome ?? '', projeto: projeto?.nome ?? '', nome: estudo.nome, tipo: estudo.tipo,
              entrada, mapas: mapas.filter(m => capex.mapas.includes(m.id)).map(m => ({ codigo: m.codigo, nome: m.nome, total: totaisMapas[m.id] ?? 0 })),
            });
            const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
            const a = document.createElement('a'); a.href = url; a.download = nomeArquivoEstudo(estudo.nome);
            document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
          }, 'Estudo exportado.')} />
        )}
      </div>
    </div>
  );
}

function Kpi({ rot, val, sub, tom }: { rot: string; val: string; sub: string; tom?: 'bom' | 'ruim' }) {
  return <div className={'kpi moldura estudo-kpi ' + (tom ?? '')}><small>{rot}</small><b>{val}</b><span className="kpi-sub">{sub}</span></div>;
}

// ------------------------------------------------------------------ campos de formulário que gravam ao sair
function CampoNum({ rot, valor, pct: emPct, dec = 0, editavel, ajuda, onSalvar }: {
  rot: string; valor: number; pct?: boolean; dec?: number; editavel: boolean; ajuda?: string; onSalvar: (v: number) => void;
}) {
  const mostra = emPct ? nf(valor * 100, dec || 1) : nf(valor, dec);
  const [v, setV] = useState(mostra);
  useEffect(() => setV(mostra), [mostra]);
  return (
    <label className="fld estudo-fld">{rot}
      <span className="row" style={{ gap: 4 }}>
        <input className="in num" value={v} disabled={!editavel} aria-label={rot} onChange={e => setV(e.target.value)}
          onBlur={() => { const x = parseNum(v.replace('%', '')); if (!Number.isNaN(x) && v !== mostra) onSalvar(emPct ? x / 100 : x); else setV(mostra); }}
          onKeyDown={e => e.key === 'Enter' && (e.target as HTMLElement).blur()} />
        {emPct && <span className="note">%</span>}
      </span>
      {ajuda && <span className="note">{ajuda}</span>}
    </label>
  );
}

function AbaPremissas({ estudo, p, editavel, onEstudo, onPremissas, apagar, setApagar, onExcluir }: {
  estudo: EstudoDb; p: Premissas; editavel: boolean;
  onEstudo: (c: Partial<Pick<EstudoDb, 'nome' | 'tipo' | 'observacoes'>>) => void; onPremissas: (m: Partial<Premissas>) => void;
  apagar: boolean; setApagar: (b: boolean) => void; onExcluir: () => void;
}) {
  const [nome, setNome] = useState(estudo.nome);
  const [obs, setObs] = useState(estudo.observacoes);
  const rampaTxt = p.rampa.map(x => nf(x * 100, 0)).join('; ');
  const [rampa, setRampa] = useState(rampaTxt);
  useEffect(() => setRampa(rampaTxt), [rampaTxt]);
  return (
    <div className="estudo-premissas">
      <section className="card estudo-bloco">
        <h2>Estudo</h2>
        <label className="fld">Nome da alternativa
          <input className="in" value={nome} disabled={!editavel} maxLength={120} onChange={e => setNome(e.target.value)}
            onBlur={() => { if (nome.trim() && nome !== estudo.nome) onEstudo({ nome: nome.trim() }); }} /></label>
        <label className="fld">Tipo de projeto
          <select value={estudo.tipo} disabled={!editavel} onChange={e => onEstudo({ tipo: e.target.value as EstudoDb['tipo'] })}>
            <option value="receita">Com receita (vende produto ou serviço)</option>
            <option value="economia">Redução de custo (economia sem × com o projeto)</option>
          </select></label>
        <label className="fld">Observações
          <textarea className="in" value={obs} disabled={!editavel} onChange={e => setObs(e.target.value)} onBlur={() => { if (obs !== estudo.observacoes) onEstudo({ observacoes: obs }); }} /></label>
      </section>
      <section className="card estudo-bloco">
        <h2>Horizonte</h2>
        <div className="estudo-campos">
          <CampoNum rot="Ano 1 do projeto (calendário)" valor={p.anoBase} editavel={editavel} onSalvar={v => onPremissas({ anoBase: Math.round(v) })} />
          <CampoNum rot="Anos de obra" valor={p.anosObra} editavel={editavel} onSalvar={v => onPremissas({ anosObra: Math.max(0, Math.min(15, Math.round(v))) })} />
          <CampoNum rot="Anos de operação" valor={p.anosOperacao} editavel={editavel} onSalvar={v => onPremissas({ anosOperacao: Math.max(1, Math.min(60, Math.round(v))) })} />
        </div>
        <label className="fld">Rampa de partida (% da capacidade nos primeiros anos de operação)
          <input className="in" value={rampa} disabled={!editavel} placeholder="ex.: 70; 90" onChange={e => setRampa(e.target.value)}
            onBlur={() => {
              const lista = rampa.split(/[;\s]+/).map(x => parseNum(x)).filter(x => !Number.isNaN(x)).map(x => Math.max(0, Math.min(100, x)) / 100);
              if (lista.join() !== p.rampa.join()) onPremissas({ rampa: lista });
            }} />
          <span className="note">Só afeta linhas "Variável". Vazio = produção plena desde o primeiro ano.</span></label>
      </section>
      <section className="card estudo-bloco">
        <h2>Finanças</h2>
        <div className="estudo-campos">
          <CampoNum rot="Taxa de desconto real" pct dec={1} valor={p.taxa} editavel={editavel} ajuda="TMA ou WACC, a.a." onSalvar={v => onPremissas({ taxa: v })} />
          <CampoNum rot="IR + CSLL" pct dec={1} valor={p.ir} editavel={editavel} ajuda="sobre o lucro; 0 = antes dos impostos" onSalvar={v => onPremissas({ ir: v })} />
          <CampoNum rot="Depreciação (anos)" valor={p.depreciacaoAnos} editavel={editavel} ajuda="linear, a partir da operação" onSalvar={v => onPremissas({ depreciacaoAnos: Math.max(1, Math.round(v)) })} />
          <CampoNum rot="Valor residual" pct dec={1} valor={p.valorResidual} editavel={editavel} ajuda="% do CapEx no último ano" onSalvar={v => onPremissas({ valorResidual: v })} />
        </div>
        <span className="note">Valores reais (moeda de hoje, sem inflação geral). Use o reajuste real de cada linha para custos que sobem acima da inflação.</span>
      </section>
      {editavel && (apagar
        ? <Confirmar msg={<>Excluir o estudo <b>{estudo.nome}</b> e todas as linhas dele? Os Mapas de Preços não são afetados.</>} sim="Excluir estudo" onSim={onExcluir} onNao={() => setApagar(false)} />
        : <div><button className="btn danger" onClick={() => setApagar(true)}>Excluir estudo</button></div>)}
    </div>
  );
}

function AbaCapex({ c, p, mapas, totais, r, editavel, onCapex }: {
  c: CapexEstudo; p: Premissas; mapas: Px[]; totais: Record<string, number>; r: ResultadoEstudo; editavel: boolean; onCapex: (m: Partial<CapexEstudo>) => void;
}) {
  const [adicional, setAdicional] = useState(nf(c.adicional, 2));
  const [desc, setDesc] = useState(c.adicionalDescricao);
  const [novo, setNovo] = useState({ ano: '', descricao: '', valor: '' });
  useEffect(() => { setAdicional(nf(c.adicional, 2)); setDesc(c.adicionalDescricao); }, [c.adicional, c.adicionalDescricao]);
  const fr = Array.from({ length: p.anosObra }, (_, i) => c.desembolso[i] ?? 0);
  const soma = fr.reduce((a, b) => a + b, 0);
  const marcar = (id: string, sim: boolean) => onCapex({ mapas: sim ? [...c.mapas, id] : c.mapas.filter(x => x !== id) });
  return (
    <div className="estudo-premissas">
      <section className="card estudo-bloco">
        <h2>Mapas de Preços do projeto</h2>
        <p className="note">Marque os Mapas que formam o CapEx deste estudo. Vale o Total geral da revisão em edição de cada Mapa.</p>
        <table className="t">
          <thead><tr><th /><th>Código</th><th>Nome</th><th className="num">Total geral</th></tr></thead>
          <tbody>
            {mapas.map(m => (
              <tr key={m.id}>
                <td><input type="checkbox" checked={c.mapas.includes(m.id)} disabled={!editavel} aria-label={`Usar ${m.codigo}`} onChange={e => marcar(m.id, e.target.checked)} /></td>
                <td className="mono">{m.codigo}</td><td>{m.nome}</td><td className="num">{brl(totais[m.id] ?? 0)}</td>
              </tr>
            ))}
            {!mapas.length && <tr><td colSpan={4} className="note">Este projeto ainda não tem Mapas de Preços. Use o CapEx adicional abaixo ou crie um Mapa em Projetos.</td></tr>}
          </tbody>
        </table>
        <div className="estudo-campos" style={{ marginTop: 10 }}>
          <label className="fld">CapEx adicional (R$, fora dos Mapas)
            <input className="in num" value={adicional} disabled={!editavel} aria-label="CapEx adicional"
              onChange={e => setAdicional(e.target.value)} onBlur={() => { const x = parseNum(adicional); if (!Number.isNaN(x) && x !== c.adicional) onCapex({ adicional: x }); }} /></label>
          <label className="fld" style={{ flex: 2 }}>Descrição do adicional
            <input className="in" value={desc} disabled={!editavel} placeholder="ex.: contingência, licenças, terreno"
              onChange={e => setDesc(e.target.value)} onBlur={() => { if (desc !== c.adicionalDescricao) onCapex({ adicionalDescricao: desc }); }} /></label>
        </div>
        <div className="estudo-total-capex">CapEx total: <b>{brl(r.capexTotal)}</b></div>
      </section>
      <section className="card estudo-bloco">
        <h2>Cronograma de desembolso</h2>
        {p.anosObra === 0
          ? <p className="note">Sem anos de obra: o CapEx sai todo no ano 1. Ajuste em Premissas.</p>
          : (
            <>
              <p className="note">Quanto do CapEx sai em cada ano de obra. Se a soma não der 100%, o sistema proporcionaliza.</p>
              <div className="estudo-campos">
                {fr.map((f, i) => (
                  <CampoNum key={i} rot={`Ano ${i + 1} (${p.anoBase + i})`} pct dec={0} valor={f} editavel={editavel}
                    onSalvar={v => { const n = [...fr]; n[i] = v; onCapex({ desembolso: n }); }} />
                ))}
              </div>
              <span className={'note' + (Math.abs(soma - 1) > 0.001 ? ' estudo-aviso' : '')}>Soma: {pct(soma, 0)}</span>
            </>
          )}
      </section>
      <section className="card estudo-bloco">
        <h2>Reinvestimentos ao longo da vida</h2>
        <p className="note">Trocas e reformas previstas (CapEx de manutenção). Entram no caixa do ano e depreciam a partir do ano seguinte.</p>
        <table className="t">
          <thead><tr><th>Ano</th><th>Descrição</th><th className="num">Valor (R$)</th><th /></tr></thead>
          <tbody>
            {c.reinvestimentos.map((x, i) => (
              <tr key={i}><td>{x.ano} ({p.anoBase + x.ano - 1})</td><td>{x.descricao}</td><td className="num">{brl(x.valor)}</td>
                <td>{editavel && <button className="btn small danger" onClick={() => onCapex({ reinvestimentos: c.reinvestimentos.filter((_, j) => j !== i) })}>Excluir</button>}</td></tr>
            ))}
            {!c.reinvestimentos.length && <tr><td colSpan={4} className="note">Nenhum reinvestimento previsto.</td></tr>}
          </tbody>
        </table>
        {editavel && (
          <div className="row" style={{ marginTop: 8, alignItems: 'flex-end' }}>
            <label className="fld" style={{ width: 90 }}>Ano<input className="in num" value={novo.ano} onChange={e => setNovo({ ...novo, ano: e.target.value })} /></label>
            <label className="fld" style={{ flex: 1 }}>Descrição<input className="in" value={novo.descricao} onChange={e => setNovo({ ...novo, descricao: e.target.value })} /></label>
            <label className="fld" style={{ width: 160 }}>Valor (R$)<input className="in num" value={novo.valor} onChange={e => setNovo({ ...novo, valor: e.target.value })} /></label>
            <button className="btn" disabled={!(parseNum(novo.ano) >= 1) || Number.isNaN(parseNum(novo.valor))}
              onClick={() => { onCapex({ reinvestimentos: [...c.reinvestimentos, { ano: Math.round(parseNum(novo.ano)), descricao: novo.descricao.trim(), valor: parseNum(novo.valor) }].sort((a, b) => a.ano - b.ano) }); setNovo({ ano: '', descricao: '', valor: '' }); }}>
              Adicionar</button>
          </div>
        )}
      </section>
    </div>
  );
}

function AbaResultados({ r, p, tipo, torn }: { r: ResultadoEstudo; p: Premissas; tipo: string; torn: ReturnType<typeof tornado> }) {
  const m = (v: number) => (Math.abs(v) < 0.5 ? '' : nf(v / 1e6, 2));
  return (
    <div className="estudo-resultados">
      <section className="card estudo-bloco">
        <h2>Fluxo de caixa do projeto</h2>
        <p className="note">Barras = caixa de cada ano (vermelho = investimento) · linha = caixa acumulado. Valores reais, R$ milhões.</p>
        <GraficoFluxo anos={r.anos} payback={r.payback} />
      </section>
      <section className="card estudo-bloco">
        <h2>O que mais mexe no VPL</h2>
        <p className="note">Cada premissa variando sozinha (gráfico tornado). VPL em R$ milhões.</p>
        <GraficoTornado base={torn.base} itens={torn.itens} />
      </section>
      <section className="card estudo-bloco estudo-largo">
        <h2>Fluxo ano a ano</h2>
        <p className="note">R$ milhões. VPL {brlCurto(r.vpl)} · payback descontado {r.paybackDescontado ? `ano ${r.paybackDescontado}` : 'fora do horizonte'}.</p>
        <div className="scroll-x">
          <table className="t estudo-fluxo">
            <thead><tr><th>Ano</th><th>Fase</th><th className="num">{tipo === 'economia' ? 'Economia' : 'Receita líquida'}</th><th className="num">OpEx</th>
              <th className="num">EBITDA</th><th className="num">Depreciação</th><th className="num">IR+CSLL</th><th className="num">CapEx</th>
              <th className="num">Caixa do ano</th><th className="num">Acumulado</th><th className="num">Acum. descontado</th></tr></thead>
            <tbody>
              {r.anos.map(a => (
                <tr key={a.ano} className={a.ano === r.payback ? 'sel' : ''}>
                  <td>{a.ano} <span className="note">({p.anoBase + a.ano - 1})</span></td><td>{a.fase === 'obra' ? 'Obra' : 'Operação'}</td>
                  <td className="num">{m(a.receita + a.economia)}</td><td className="num">{m(-a.opex)}</td><td className="num">{m(a.ebitda)}</td>
                  <td className="num">{m(a.depreciacao)}</td><td className="num">{m(-a.ir)}</td><td className="num">{m(-a.capex)}</td>
                  <td className={'num' + (a.caixa < 0 ? ' neg' : '')}><b>{m(a.caixa)}</b></td><td className="num">{m(a.acumulado)}</td><td className="num">{m(a.acumuladoDescontado)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function AbaRisco({ base, entrada, p, editavel, nome, outros, totaisMapas, onCenarios }: {
  base: ResultadoEstudo; entrada: ReturnType<typeof entradaDoEstudo>; p: Premissas; editavel: boolean; nome: string;
  outros: EstudoDb[]; totaisMapas: Record<string, number>; onCenarios: (c: Premissas['cenarios']) => void;
}) {
  const { parametros } = useSessao();
  const pess = cenario(entrada, p.cenarios.pessimista), otim = cenario(entrada, p.cenarios.otimista);
  const [comp, setComp] = useState<{ nome: string; r: ResultadoEstudo }[]>([]);
  useEffect(() => {
    if (!parametros) return;
    Promise.all(outros.map(async e => ({ nome: e.nome, r: calcularEstudo(await entradaCompleta(e, totaisMapas, parametros)) }))).then(setComp).catch(() => setComp([]));
  }, [outros, totaisMapas, parametros]);
  const ajuste = (qual: 'pessimista' | 'otimista', k: keyof AjusteCenario, v: number) =>
    onCenarios({ ...p.cenarios, [qual]: { ...p.cenarios[qual], [k]: v } });
  const card = (rot: string, r: ResultadoEstudo, cls = '') => (
    <div className={'estudo-cenario ' + cls}><small>{rot}</small><b>R$ {nf(r.vpl / 1e6, 1)} mi</b>
      <span>TIR {pct(r.tir)} · payback {r.payback ? `ano ${r.payback}` : '—'}</span></div>
  );
  const linhasComp = [{ nome, r: base }, ...comp];
  return (
    <div className="estudo-resultados">
      <section className="card estudo-bloco">
        <h2>Cenários</h2>
        <p className="note">Mesma estrutura, premissas diferentes. Ajuste as variações de cada cenário (em % sobre o caso base).</p>
        <div className="estudo-cenarios">{card('Pessimista', pess)}{card('Base', base, 'base')}{card('Otimista', otim)}</div>
        <table className="t" style={{ marginTop: 10 }}>
          <thead><tr><th>Variação</th><th className="num">Pessimista</th><th className="num">Otimista</th></tr></thead>
          <tbody>
            {([['preco', entrada.tipo === 'economia' ? 'Economia gerada' : 'Preço do produto'], ['volume', 'Volume'], ['capex', 'CapEx'], ['opex', 'OpEx']] as [keyof AjusteCenario, string][]).map(([k, n]) => (
              <tr key={k}><td>{n}</td>
                {(['pessimista', 'otimista'] as const).map(q => (
                  <td key={q} className="num"><Pct valor={p.cenarios[q][k]} editavel={editavel} rot={`${n} no cenário ${q}`} onSalvar={v => ajuste(q, k, v)} /></td>
                ))}</tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="card estudo-bloco">
        <h2>Comparar alternativas</h2>
        <p className="note">Os outros estudos do mesmo projeto, lado a lado. Crie outra alternativa em Viabilidade → Novo estudo.</p>
        <div className="scroll-x">
          <table className="t">
            <thead><tr><th /> {linhasComp.map(c => <th key={c.nome} className="num">{c.nome}</th>)}</tr></thead>
            <tbody>
              <tr><td>CapEx</td>{linhasComp.map(c => <td key={c.nome} className="num">{brlCurto(c.r.capexTotal)}</td>)}</tr>
              <tr><td>OpEx anual</td>{linhasComp.map(c => <td key={c.nome} className="num">{brlCurto(c.r.opexAnoCheio)}</td>)}</tr>
              <tr><td>VPL</td>{linhasComp.map(c => <td key={c.nome} className="num"><b>{brlCurto(c.r.vpl)}</b></td>)}</tr>
              <tr><td>TIR</td>{linhasComp.map(c => <td key={c.nome} className="num">{pct(c.r.tir)}</td>)}</tr>
              <tr><td>Payback</td>{linhasComp.map(c => <td key={c.nome} className="num">{c.r.payback ? `ano ${c.r.payback}` : '—'}</td>)}</tr>
              <tr><td>Custo do ciclo de vida</td>{linhasComp.map(c => <td key={c.nome} className="num">{brlCurto(c.r.lcc)}</td>)}</tr>
            </tbody>
          </table>
        </div>
        {!comp.length && <p className="note">Ainda não há outra alternativa neste projeto.</p>}
      </section>
    </div>
  );
}

function Pct({ valor, editavel, rot, onSalvar }: { valor: number; editavel: boolean; rot: string; onSalvar: (v: number) => void }) {
  const mostra = (valor > 0 ? '+' : '') + nf(valor * 100, 0) + '%';
  const [v, setV] = useState(mostra);
  useEffect(() => setV(mostra), [mostra]);
  if (!editavel) return <>{mostra}</>;
  return <input className="in num" style={{ width: 80 }} aria-label={rot} value={v} onChange={e => setV(e.target.value)}
    onBlur={() => { const x = parseNum(v.replace(/[%+]/g, '')); if (!Number.isNaN(x) && v !== mostra) onSalvar(x / 100); else setV(mostra); }}
    onKeyDown={e => e.key === 'Enter' && (e.target as HTMLElement).blur()} />;
}

function AbaRelatorio({ onExportar }: { onExportar: () => void }) {
  return (
    <section className="card estudo-bloco" style={{ maxWidth: 720 }}>
      <h2>Relatório de viabilidade</h2>
      <p className="note">Planilha Excel com resumo e indicadores, premissas, CapEx, OpEx, receitas ou economias, fluxo de caixa ano a ano, sensibilidade e cenários — pronta para o comitê de investimento.</p>
      <div><button className="btn primary" onClick={onExportar}>Exportar Excel</button></div>
      <p className="note">Relatório em PDF: próxima etapa.</p>
    </section>
  );
}
