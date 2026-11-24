import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useSessao } from '../app/Sessao';
import { brl, brlCurto, Confirmar, dataHora, nf, plural, useAcao, useAviso, usdCurto } from '../app/ui';
import {
  atualizarItem, atualizarPx, emitirRevisao, excluirItem, excluirPx, inserirItens, lerPx, listarItens,
  listarClientes, listarProjetos, listarRevisoes, type Cliente, type ItemPos, type Projeto, type Px, type Revisao,
} from '../dados/api';
import { calcular, detalheCheck, gruposPorTitulo, totais } from '../dominio/calculo';
import { colunasCompletas, idDoTributo, OBRIGATORIAS, OPCOES, type Coluna } from '../dominio/colunas';
import { parseNum } from '../dominio/normalizacao';
import { itemVazio } from '../dominio/pq';
import type { Resultado } from '../dominio/tipos';
import { ImportarPq } from './ImportarPq';
import { RenomearPx } from './RenomearPx';
import { FiltroGrupo } from './FiltroGrupo';

const ROTULO_CHK = { OK: ['p-ok', 'OK'], INCOMPLETO: ['p-warn', 'Incompleto'], ERRO: ['p-err', 'Erro de classificação'], TITULO: ['p-mut', 'Título'] } as const;
type Filtro = null | 'OK' | 'INCOMPLETO' | 'ERRO';

export function EditorPx() {
  const { id = '' } = useParams();
  const { empresa, parametros, moedas, podeEditar, ehAdmin } = useSessao();
  const acao = useAcao();
  const avisar = useAviso();
  const ir = useNavigate();
  const [px, setPx] = useState<Px | null>(null);
  const [revs, setRevs] = useState<Revisao[]>([]);
  const [itens, setItens] = useState<ItemPos[]>([]);
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [ocultas, setOcultas] = useState<Set<string>>(new Set());
  const [grupo, setGrupo] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>(null);
  const [busca, setBusca] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const [painel, setPainel] = useState<'dados' | 'colunas' | null>(null);
  const [importar, setImportar] = useState(false);
  const [editandoCab, setEditandoCab] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [perguntar, setPerguntar] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const revAtual = revs.find(r => !r.emitida_em);
  const emitidas = revs.filter(r => r.emitida_em);

  const carregar = useCallback(async () => {
    if (!empresa) return;
    try {
      const [x, r, pj, cl] = await Promise.all([lerPx(id), listarRevisoes(id), listarProjetos(empresa.id), listarClientes(empresa.id)]);
      setPx(x); setRevs(r); setProjetos(pj); setClientes(cl);
      const atual = r.find(v => !v.emitida_em);
      setItens(atual ? await listarItens(atual.id) : []);
      setOcultas(new Set(JSON.parse(localStorage.getItem('fcapex:ocultas:' + id) || '[]')));
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)); }
  }, [id, empresa]);
  useEffect(() => { carregar(); }, [carregar]);

  const modelo = useMemo(() => new Set(px?.colunas ?? []), [px]);
  const todas = useMemo(() => colunasCompletas(parametros?.tributos ?? []), [parametros]);
  const colunas = todas.filter(c => c.k === 'seq' || (modelo.has(c.k) && !ocultas.has(c.k)));
  const res = useMemo(() => {
    const m = new Map<string, Resultado>();
    if (parametros) for (const it of itens) m.set(it.id, calcular(it, parametros, modelo));
    return m;
  }, [itens, parametros, modelo]);
  const t = useMemo(() => (parametros ? totais(itens, parametros, modelo) : null), [itens, parametros, modelo]);
  const grupos = useMemo(() => gruposPorTitulo(itens), [itens]);
  const titulos = itens.filter(i => i.titulo);
  /** O título e seus subníveis pela numeração do Item PQ (1.1 inclui 1.1.1, 1.1.1.1…). */
  const ramo = useCallback((id: string) => {
    const t0 = titulos.find(t => t.id === id);
    const pref = t0?.item.replace(/\.$/, '');
    return new Set([id, ...(pref ? titulos.filter(t => t.item.replace(/\.$/, '').startsWith(pref + '.')).map(t => t.id) : [])]);
  }, [titulos]);
  const alvo = useMemo(() => (grupo ? ramo(grupo) : null), [grupo, ramo]);

  const visiveis = itens.filter(it => {
    if (alvo && !alvo.has(grupos.get(it.id) ?? '')) return false;
    if (filtro && !it.titulo && res.get(it.id)?.chk !== filtro) return false;
    if (filtro && it.titulo) return false;
    if (busca) {
      const q = busca.toLowerCase();
      return [it.desc, it.item, it.area, it.subarea, it.ativo, it.pacote, it.pqdoc].some(v => v.toLowerCase().includes(q));
    }
    return true;
  });

  // --------------------------------------------------------------- edição
  async function salvarCampo(itemId: string, k: string, v: unknown) {
    const antes = itens.find(i => i.id === itemId);
    if (!antes || (antes as unknown as Record<string, unknown>)[k] === v) return;
    setItens(l => l.map(i => (i.id === itemId ? { ...i, [k]: v } : i)));
    const okk = await acao(() => atualizarItem(itemId, { [k]: v }));
    if (!okk) setItens(l => l.map(i => (i.id === itemId ? antes : i)));
    else if (px) atualizarPx(px.id, {}).catch(() => {});
  }

  async function inserirItem() {
    if (!empresa || !revAtual) return;
    const idx = sel ? itens.findIndex(i => i.id === sel) : itens.length - 1;
    const a = itens[idx]?.posicao ?? 0, b = itens[idx + 1]?.posicao;
    const novo: ItemPos = { ...itemVazio(crypto.randomUUID(), Math.max(0, ...itens.map(i => i.seq)) + 1), posicao: b === undefined ? a + 1 : (a + b) / 2 };
    if (await acao(() => inserirItens(empresa.id, revAtual.id, [novo]))) {
      setItens(l => [...l.slice(0, idx + 1), novo, ...l.slice(idx + 1)]); setSel(novo.id);
    }
  }

  async function apagarItem(itemId: string) {
    setPerguntar(null);
    if (await acao(() => excluirItem(itemId))) setItens(l => l.filter(i => i.id !== itemId));
  }

  async function emitir() {
    if (!px || !t) return;
    setPerguntar(null);
    if (await acao(() => emitirRevisao(px.id, t.ger), `Rev ${revAtual?.numero} emitida. A edição continua na Rev ${(revAtual?.numero ?? 0) + 1}.`)) carregar();
  }

  /** Insere ou exclui uma coluna desta PX (para todos). Os valores dos itens ficam guardados. */
  async function mudarColuna(k: string, incluir: boolean) {
    if (!px) return;
    const nova = todas.map(c => c.k).filter(c => (c === k ? incluir : modelo.has(c)) || OBRIGATORIAS.includes(c));
    const antes = px;
    setPx({ ...px, colunas: nova });
    if (!(await acao(() => atualizarPx(px.id, { colunas: nova }), incluir ? 'Coluna inserida.' : 'Coluna excluída.'))) setPx(antes);
  }

  async function exportar() {
    if (!px || !parametros || !empresa) return;
    setExportando(true);
    await acao(async () => {
      const projeto = projetos.find(p => p.id === px.projeto_id);
      const cliente = clientes.find(c => c.id === projeto?.cliente_id);
      const { gerarExcel, nomeArquivo } = await import('../dominio/exportar');
      const buf = await gerarExcel({
        empresa: empresa.nome, cliente: cliente?.nome ?? '', projeto: projeto?.nome ?? '',
        px: { codigo: px.codigo, nome: px.nome, modelo_nome: px.modelo_nome, colunas: px.colunas },
        revisao: revAtual?.numero ?? 0, emEdicao: !!revAtual, itens, parametros, moedas,
      });
      const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const a = document.createElement('a');
      a.href = url; a.download = nomeArquivo(px.codigo, revAtual?.numero ?? 0);
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }, 'Planilha exportada.');
    setExportando(false);
  }

  function ocultar(k: string, sim: boolean) {
    const s = new Set(ocultas); if (sim) s.add(k); else s.delete(k);
    setOcultas(s); localStorage.setItem('fcapex:ocultas:' + id, JSON.stringify([...s]));
  }

  if (erro) return <div className="banner">Não foi possível abrir a PX: {erro}</div>;
  if (!px || !parametros || !t) return <p className="note">Carregando…</p>;
  const editavel = podeEditar && !!revAtual;
  const usd = parametros.cambio.USD;
  const projeto = projetos.find(p => p.id === px.projeto_id);
  const cliente = clientes.find(c => c.id === projeto?.cliente_id);

  return (
    <div id="pxEdit">
      <header className="px-cab">
        <button className="voltar" title="Voltar para Projetos" aria-label="Voltar para Projetos" onClick={() => ir(cliente ? `/?cliente=${cliente.id}` : '/')}>
          <svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6" /></svg>
        </button>
        <div className="px-cab-txt">
          <nav className="trilha" aria-label="Trilha">
            <Link to="/">Projetos</Link>
            {cliente && <><span className="sep">›</span><Link to={`/?cliente=${cliente.id}`}>{cliente.nome}</Link></>}
            {projeto && <><span className="sep">›</span><span className="atual">{projeto.nome}</span></>}
          </nav>
          {editandoCab ? (
            <RenomearPx px={px} onCancelar={() => setEditandoCab(false)} onSalvo={() => { setEditandoCab(false); carregar(); }} />
          ) : (
          <div className="px-cab-linha">
            <h1>{px.nome}</h1>
            {podeEditar && (
              <button className="lapis" title="Corrigir código e nome" aria-label="Corrigir código e nome" onClick={() => setEditandoCab(true)}>
                <svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" /></svg>
              </button>
            )}
            <span className="chip codigo" title="Código da PX">{px.codigo}
              <button aria-label="Copiar código" title="Copiar código"
                onClick={() => navigator.clipboard?.writeText(px.codigo).then(() => avisar('Código copiado.'), () => avisar('Não foi possível copiar.'))}>
                <svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" /></svg>
              </button>
            </span>
            <span className="chip rev"><i />Rev {revAtual?.numero ?? '—'}{revAtual ? ' · em edição' : ''}</span>
            <span className="chip">{px.modelo_nome}</span>
          </div>
          )}
        </div>
        <div className="px-cab-data">Atualizada em<b>{dataHora(px.atualizado_em)}</b></div>
      </header>
      <div className="kpis">
        <div className="kpi moldura brl" title="Com BDI, tributos e provisão, convertido para R$"><small>Total Geral Bruto (R$)</small><b>{brlCurto(t.ger)}</b></div>
        <div className="kpi moldura brl" title="Somente quantidade × preço unitário, convertido para R$"><small>Total Geral Líquido (R$)</small><b>{brlCurto(t.liq)}</b></div>
        <div className="kpi moldura usd" title={usd ? `Total Geral Bruto ÷ câmbio do dólar (R$ ${nf(usd, 4)})` : 'Cadastre o câmbio do dólar em Parâmetros'}>
          <small>Total Geral Bruto (US$)</small><b>{usd ? usdCurto(t.ger / usd) : '—'}</b></div>
        <div className="kpi moldura usd" title={usd ? `Total Geral Líquido ÷ câmbio do dólar (R$ ${nf(usd, 4)})` : 'Cadastre o câmbio do dólar em Parâmetros'}>
          <small>Total Geral Líquido (US$)</small><b>{usd ? usdCurto(t.liq / usd) : '—'}</b></div>
        <div className="kpi moldura neutro"><small>Itens</small><b>{itens.length - t.tit}</b></div>
        <div className="row">
          <button className="pill p-ok" aria-pressed={filtro === 'OK'} onClick={() => setFiltro(filtro === 'OK' ? null : 'OK')}><i />{t.ok} ok</button>
          <button className="pill p-warn" onClick={() => setFiltro(filtro === 'INCOMPLETO' ? null : 'INCOMPLETO')}><i />{t.inc} incompletas</button>
          <button className="pill p-err" onClick={() => setFiltro(filtro === 'ERRO' ? null : 'ERRO')}><i />{t.err} com erro</button>
          {filtro && <button className="linkbtn" onClick={() => setFiltro(null)}>limpar filtro</button>}
        </div>
        <span className="spacer" />
        <div className="cambio" aria-label="Câmbio">
          <span className="cambio-rot">Câmbio</span>
          {moedas.filter(m => m.codigo !== 'BRL').map(m => (
            <span key={m.codigo} className={'cambio-moeda' + (m.cambio_brl ? '' : ' sem')}
              title={m.cambio_brl ? `1 ${m.nome} = R$ ${nf(m.cambio_brl, 4)}` : `${m.nome} sem câmbio cadastrado: itens nessa moeda ficam com erro no Check`}>
              <b>{m.simbolo}</b><span className="cod">{m.codigo}</span><span className="val">{m.cambio_brl ? nf(m.cambio_brl, 4) : 'sem câmbio'}</span>
            </span>
          ))}
          {!moedas.some(m => m.codigo !== 'BRL') && <span className="note">só Real (R$)</span>}
          {ehAdmin && (
            <Link to="/parametros" className="cambio-editar" title="Editar câmbio em Parâmetros">
              <svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" /></svg>Editar câmbio
            </Link>
          )}
        </div>
      </div>
      <div className="tools">
        <FiltroGrupo valor={grupo} onEscolher={setGrupo} total={t.ger} totalItens={itens.length - t.tit}
          opcoes={titulos.map(ti => {
            const r = ramo(ti.id);
            const membros = itens.filter(i => !i.titulo && r.has(grupos.get(i.id) ?? ''));
            return { id: ti.id, item: ti.item, desc: ti.desc, n: membros.length, soma: membros.reduce((s2, i) => s2 + (res.get(i.id)?.ger || 0), 0) };
          })} />
        <input className="in" type="search" placeholder="Buscar descrição, item, área, pacote…" value={busca} onChange={e => setBusca(e.target.value)} />
        {editavel && <button className="btn" onClick={inserirItem}>Inserir item</button>}
        {editavel && <button className="btn" onClick={() => setImportar(true)}>Importar PQ</button>}
        <span className="spacer" />
        <button className="btn" aria-pressed={painel === 'colunas'} onClick={() => setPainel(painel === 'colunas' ? null : 'colunas')}>Colunas</button>
        <button className="btn" aria-pressed={painel === 'dados'} onClick={() => setPainel(painel === 'dados' ? null : 'dados')}>Dados da PX</button>
        <button className="btn" onClick={() => ir(`/px/${px.id}/comparar`)}>Comparar</button>
        <button className="btn" onClick={exportar} disabled={exportando} title="Baixar a PX em Excel (.xlsx) com resumo e parâmetros">
          {exportando ? 'Gerando…' : 'Exportar Excel'}</button>
        {editavel && <button className="btn primary" onClick={() => setPerguntar('emitir')}>Emitir nova revisão</button>}
      </div>
      {perguntar === 'emitir' && revAtual && (
        <div style={{ padding: '0 20px' }}>
          <Confirmar sim={`Emitir Rev ${revAtual.numero}`} onNao={() => setPerguntar(null)} onSim={emitir}
            msg={<>Emitir a <b>Rev {revAtual.numero}</b> ({plural(itens.length - t.tit, 'item', 'itens')}, total {brl(t.ger)}
              {t.inc + t.err ? `, ${t.inc + t.err} com pendência` : ''})? Ela fica congelada e a edição continua na Rev {revAtual.numero + 1}.</>} />
        </div>
      )}

      <div className="workspace">

        <div className="gridwrap">
          <table className="grid">
            <thead>
              <tr className="g">{agruparCabecalho(colunas, editavel)}</tr>
              <tr className="h">
                {colunas.map(c => (
                  <th key={c.k} className={c.k === 'seq' ? 'sticky c1' : ''} style={c.w ? { minWidth: c.w } : undefined}
                    title={(c.t === 'calc' || c.t === 'tax') && c.f ? 'Fórmula: ' + c.f : ''}>
                    {c.h}{(c.t === 'calc' || c.t === 'tax') && <span className="fx">fx</span>}
                  </th>
                ))}
                {editavel && <th />}
              </tr>
            </thead>
            <tbody>
              {visiveis.map(it => {
                const r = res.get(it.id)!;
                return (
                  <tr key={it.id} className={(it.titulo ? 'title ' : '') + (sel === it.id ? 'sel' : '')} onClick={() => setSel(it.id)}>
                    {colunas.map(c => (
                      <Celula key={c.k} c={c} it={it} r={r} editavel={editavel}
                        moedas={moedas.map(m => [m.codigo, `${m.nome} (${m.simbolo})`] as [string, string])}
                        simbolo={moedas.find(m => m.codigo === it.moeda)?.simbolo ?? ''}
                        dica={c.k === 'chk' ? detalheCheck(it, r, parametros, modelo) : undefined}
                        onSalvar={v => salvarCampo(it.id, c.t === 'tax' ? 'tribLigados' : c.k, v)} />
                    ))}
                    {editavel && (
                      <td className="rowdel">
                        {perguntar === 'del:' + it.id
                          ? <Confirmar msg="Excluir este item?" sim="Excluir" onSim={() => apagarItem(it.id)} onNao={() => setPerguntar(null)} />
                          : <div className="row-actions">
                              <button className="btn small" title={it.titulo ? 'Voltar a ser item: os valores guardados reaparecem' : 'Transformar em linha de título (agrupador)'}
                                onClick={e => { e.stopPropagation(); salvarCampo(it.id, 'titulo', !it.titulo); }}>{it.titulo ? 'Virar item' : 'Virar título'}</button>
                              <button className="btn small danger" onClick={e => { e.stopPropagation(); setPerguntar('del:' + it.id); }}>Excluir</button>
                            </div>}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!itens.length && <div style={{ padding: 24 }} className="note">Esta PX ainda não tem itens. Use <b>Importar PQ</b> ou <b>Inserir item</b>.</div>}
        </div>

        <aside className={'side-panel' + (painel ? ' on' : '')}>
          {painel === 'colunas' && (
            <>
              <div className="panel-head"><h2>Colunas</h2><button className="btn small" onClick={() => setPainel(null)}>Fechar</button></div>
              {podeEditar && (
                <>
                  <h3>Colunas desta PX</h3>
                  <span className="note">Inserir ou excluir colunas vale para todos que abrem esta PX. Excluir não apaga os valores: ao inserir de novo, eles voltam.</span>
                  {[...new Set(todas.map(c => c.g))].map(g => (
                    <div className="group-box" key={'px-' + g}><strong>{g}</strong>
                      {todas.filter(c => c.g === g).map(c => {
                        const fixa = OBRIGATORIAS.includes(c.k);
                        return (
                          <label key={c.k}>
                            <input type="checkbox" disabled={fixa} checked={fixa || modelo.has(c.k)} onChange={e => mudarColuna(c.k, e.target.checked)} />
                            {c.h}{fixa && <span className="k">sempre</span>}
                          </label>
                        );
                      })}
                    </div>
                  ))}
                  <h3>Ocultar só na minha tela</h3>
                </>
              )}
              <span className="note">Ocultar uma coluna só muda a sua visualização, não a PX.</span>
              {[...new Set(todas.filter(c => modelo.has(c.k)).map(c => c.g))].map(g => (
                <div className="group-box" key={g}><strong>{g}</strong>
                  {todas.filter(c => c.g === g && modelo.has(c.k)).map(c => (
                    <label key={c.k}><input type="checkbox" disabled={c.lock} checked={!ocultas.has(c.k)} onChange={e => ocultar(c.k, !e.target.checked)} />{c.h}</label>
                  ))}
                </div>
              ))}
            </>
          )}
          {painel === 'dados' && (
            <DadosPx px={px} projetos={projetos} emitidas={emitidas} revAtual={revAtual} podeEditar={podeEditar}
              onSalvo={carregar} onComparar={i => ir(`/px/${px.id}/comparar?de=${i}`)}
              onExcluir={async () => { if (await acao(() => excluirPx(px.id), `${px.codigo} excluída.`)) ir('/'); }} />
          )}
        </aside>
      </div>

      {importar && revAtual && empresa && (
        <ImportarPq empresaId={empresa.id} revisaoId={revAtual.id} modelo={modelo} itens={itens}
          onFechar={() => setImportar(false)} onImportado={() => { setImportar(false); carregar(); }} />
      )}
    </div>
  );
}

function agruparCabecalho(cols: Coluna[], extra: boolean): ReactNode[] {
  const out: ReactNode[] = [];
  for (let i = 0; i < cols.length;) {
    let j = i; while (j < cols.length && cols[j].g === cols[i].g) j++;
    out.push(<th key={i} colSpan={j - i} className={i === 0 ? 'sticky c1' : ''}>{cols[i].g}</th>);
    i = j;
  }
  if (extra) out.push(<th key="x" />);
  return out;
}

// ------------------------------------------------------------------ célula da grade
function Celula({ c, it, r, editavel, moedas, simbolo, dica, onSalvar }: {
  c: Coluna; it: ItemPos; r: Resultado; editavel: boolean; moedas: [string, string][]; simbolo: string;
  dica?: string; onSalvar: (v: unknown) => void;
}) {
  if (c.k === 'seq') return <td className="sticky c1 mono">{it.seq}</td>;
  // linha de título: só Item PQ e Descrição, sem campo para preencher
  if (it.titulo) {
    if (c.k === 'item' || c.k === 'desc') {
      return editavel
        ? <td className="in-c"><Entrada valor={(it as unknown as Record<string, string>)[c.k]} onSalvar={onSalvar} /></td>
        : <td className="txt">{(it as unknown as Record<string, string>)[c.k]}</td>;
    }
    return <td />;
  }
  if (c.t === 'tax') {
    const id = idDoTributo(c.k)!;
    const ligado = !!r.ligados[id];
    const manual = it.tribLigados?.[id] !== undefined;
    const v = r.tribs[id];
    const dicaTrib = `${ligado ? 'Ligado' : 'Desligado'} ${manual ? 'manualmente nesta linha' : 'pela regra do tributo'}`;
    return (
      <td className={'calc trib-cel' + (ligado ? '' : ' off')} title={dicaTrib}>
        <label className="trib-lig">
          <input type="checkbox" checked={ligado} disabled={!editavel} aria-label={`${c.h.replace(' (R$)', '')} ligado nesta linha`}
            onChange={e => onSalvar({ ...(it.tribLigados ?? {}), [id]: e.target.checked })} onClick={e => e.stopPropagation()} />
          {manual && <span className="trib-manual" aria-hidden="true">•</span>}
        </label>
        <span>{ligado ? (v === undefined ? '—' : nf(v, 2)) : '0,00'}</span>
      </td>
    );
  }
  if (c.t === 'calc') {
    if (c.k === 'chk') {
      const [cls, txt] = ROTULO_CHK[r.chk];
      return <td className="calc chk" title={dica}><span className={'pill ' + cls}><i />{txt}</span></td>;
    }
    const v = r[c.k as 'base' | 'trib' | 'parc' | 'ger'];
    return (
      <td className="calc" title={c.f}>
        {v === null ? '—' : nf(v, 2)}
      </td>
    );
  }
  const valor = (it as unknown as Record<string, unknown>)[c.k];
  if (c.k === 'tipo' || c.k === 'orig' || c.k === 'moeda') {
    const ops: readonly (readonly [string, string])[] = c.k === 'moeda' ? moedas : OPCOES[c.k];
    const s = String(valor ?? '');
    const invalido = s && !ops.some(([v]) => v === s);
    if (!editavel) return <td className="txt">{s ? (ops.find(([v]) => v === s)?.[1] ?? s) : ''}</td>;
    return (
      <td className="in-c">
        <select value={s} onChange={e => onSalvar(e.target.value)}
          style={{ boxShadow: !s ? 'inset 0 0 0 2px var(--warn)' : invalido ? 'inset 0 0 0 2px var(--err)' : undefined }}>
          <option value="">escolher</option>
          {invalido && <option value={s}>({s}) inválido</option>}
          {ops.map(([v, n]) => <option key={v} value={v}>{c.k === 'moeda' ? n : `(${v}) ${n}`}</option>)}
        </select>
      </td>
    );
  }
  if (c.num) {
    const n = valor as number | null;
    const mostra = n === null ? '' : c.pct ? nf(n * 100, 1) : nf(n, c.dec ?? 2);
    if (!editavel) return <td className="calc" style={{ background: 'transparent' }}>{mostra}{c.pct && n !== null ? '%' : ''}</td>;
    const salvarNum = (s: string) => {
      const x = parseNum(s.replace('%', ''));
      onSalvar(Number.isNaN(x) ? null : c.pct ? x / 100 : x);
    };
    return (
      <td className={'in-c' + (c.req && n === null ? ' miss' : '')}>
        {c.k === 'preco'
          ? <div className="cur">{simbolo && <span>{simbolo}</span>}<Entrada num valor={mostra} onSalvar={salvarNum} /></div>
          : <Entrada num valor={mostra} onSalvar={salvarNum} />}
      </td>
    );
  }
  if (!editavel) return <td className="txt">{String(valor ?? '')}</td>;
  return (
    <td className={'in-c' + (c.req && !valor ? ' miss' : '')} title={c.k === 'desc' ? String(valor) : undefined}>
      <Entrada valor={String(valor ?? '')} onSalvar={onSalvar} />
    </td>
  );
}

/** Campo que salva ao sair (blur) ou com Enter; Esc desfaz. */
function Entrada({ valor, num, onSalvar }: { valor: string; num?: boolean; onSalvar: (v: string) => void }) {
  const [v, setV] = useState(valor);
  useEffect(() => setV(valor), [valor]);
  return (
    <input className={num ? 'numi' : ''} value={v} onChange={e => setV(e.target.value)}
      onBlur={() => { if (v !== valor) onSalvar(v.trim()); }}
      onKeyDown={e => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') { setV(valor); (e.target as HTMLInputElement).blur(); }
      }} />
  );
}

// ------------------------------------------------------------------ painel Dados da PX
function DadosPx({ px, projetos, emitidas, revAtual, podeEditar, onSalvo, onComparar, onExcluir }: {
  px: Px; projetos: Projeto[]; emitidas: Revisao[]; revAtual?: Revisao; podeEditar: boolean;
  onSalvo: () => void; onComparar: (i: number) => void; onExcluir: () => void;
}) {
  const acao = useAcao();
  const [nome, setNome] = useState(px.nome);
  const [codigo, setCodigo] = useState(px.codigo);
  const [obs, setObs] = useState(px.observacoes);
  const [proj, setProj] = useState(px.projeto_id);
  const [apagar, setApagar] = useState(false);
  useEffect(() => { setNome(px.nome); setCodigo(px.codigo); setObs(px.observacoes); setProj(px.projeto_id); }, [px]);
  const mudou = nome !== px.nome || codigo !== px.codigo || obs !== px.observacoes || proj !== px.projeto_id;

  return (
    <>
      <div className="panel-head"><h2>Dados da PX</h2></div>
      <label className="fld">Código<input className="in mono" value={codigo} disabled={!podeEditar} onChange={e => setCodigo(e.target.value)} /></label>
      <label className="fld">Nome<input className="in" value={nome} disabled={!podeEditar} onChange={e => setNome(e.target.value)} /></label>
      <label className="fld">Projeto
        <select value={proj} disabled={!podeEditar} onChange={e => setProj(e.target.value)}>
          {projetos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
      </label>
      <label className="fld">Modelo<input className="in" value={`${px.modelo_nome} (${px.colunas.length} colunas)`} disabled /></label>
      <label className="fld">Observações<textarea className="in" value={obs} disabled={!podeEditar} onChange={e => setObs(e.target.value)} /></label>
      {podeEditar && <button className="btn primary" disabled={!mudou || !nome.trim() || !codigo.trim()}
        onClick={async () => { if (await acao(() => atualizarPx(px.id, { nome: nome.trim(), codigo: codigo.trim(), observacoes: obs, projeto_id: proj }), 'Dados salvos.')) onSalvo(); }}>Salvar</button>}
      <div className="group-box stack" style={{ gap: 8 }}>
        <strong>Revisões</strong>
        {emitidas.map(r => (
          <div className="row" key={r.id}>
            <span className="mono">Rev {r.numero}</span>
            <span className="note">{dataHora(r.emitida_em!)} · {r.total !== null ? brlCurto(r.total) : '—'}</span>
            <span className="spacer" /><button className="btn small" onClick={() => onComparar(r.numero)}>Comparar com a atual</button>
          </div>
        ))}
        {!emitidas.length && <span className="note">Nenhuma revisão emitida ainda.</span>}
        {revAtual && <div className="row"><span className="mono">Rev {revAtual.numero}</span><span className="pill p-info">em edição</span></div>}
      </div>
      {podeEditar && (apagar
        ? <Confirmar msg={<>Excluir a <b>{px.codigo}</b> e todas as revisões dela?</>} sim="Excluir PX" onSim={onExcluir} onNao={() => setApagar(false)} />
        : <button className="btn danger" onClick={() => setApagar(true)}>Excluir PX</button>)}
    </>
  );
}
