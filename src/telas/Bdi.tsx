import { useCallback, useEffect, useState } from 'react';
import { useSessao } from '../app/Sessao';
import { brl, Confirmar, nf, plural, useAcao } from '../app/ui';
import { excluirBdi, salvarBdi, usoDosBdis } from '../dados/api';
import { bdiFinal } from '../dominio/calculo';
import { parseNum } from '../dominio/normalizacao';
import type { Bdi } from '../dominio/tipos';

/** Parcelas fixas da composição, na ordem da fórmula. */
const PARCELAS = [
  ['administracao', 'Administração central', 'AC'],
  ['seguros', 'Seguros', 'S'],
  ['garantias', 'Garantias', 'G'],
  ['riscos', 'Riscos', 'R'],
  ['financeiras', 'Despesas financeiras', 'DF'],
  ['lucro', 'Lucro', 'L'],
] as const;
type Chave = typeof PARCELAS[number][0];

/** Rascunho em edição: percentuais como texto digitado ("4,00"). */
interface Rascunho { id?: string; nome: string; v: Record<Chave, string>; extras: { nome: string; pct: string }[] }

const pctTxt = (f: number) => nf(f * 100, 2);
const lerPct = (s: string) => { const n = parseNum(s.replace('%', '')); return Number.isNaN(n) ? null : n / 100; };
const doBdi = (b: Bdi): Rascunho => ({
  id: b.id, nome: b.nome,
  v: Object.fromEntries(PARCELAS.map(([k]) => [k, pctTxt(b[k])])) as Record<Chave, string>,
  extras: b.extras.map(e => ({ nome: e.nome, pct: pctTxt(e.pct) })),
});
const VAZIO: Rascunho = { nome: '', v: { administracao: '', seguros: '', garantias: '', riscos: '', financeiras: '', lucro: '' }, extras: [] };

/** Converte o rascunho em BDI; devolve a mensagem do primeiro problema, se houver. */
function paraBdi(r: Rascunho): { bdi?: Omit<Bdi, 'id'>; erro?: string } {
  if (!r.nome.trim()) return { erro: 'Dê um nome ao BDI.' };
  const out: Record<string, number> = {};
  for (const [k, nome] of PARCELAS) {
    const v = r.v[k].trim() ? lerPct(r.v[k]) : 0;
    if (v === null) return { erro: `${nome}: percentual inválido.` };
    if (v < 0 || v >= 1) return { erro: `${nome}: use um percentual entre 0 e 99,99%.` };
    out[k] = v;
  }
  const extras = [];
  for (const e of r.extras) {
    if (!e.nome.trim() && !e.pct.trim()) continue;
    const v = e.pct.trim() ? lerPct(e.pct) : 0;
    if (!e.nome.trim()) return { erro: 'Dê um nome à parcela personalizada.' };
    if (v === null || v < 0 || v >= 1) return { erro: `${e.nome}: percentual inválido.` };
    extras.push({ nome: e.nome.trim(), pct: v });
  }
  return { bdi: { nome: r.nome.trim(), ...(out as Record<Chave, number>), extras } };
}

/** Página BDI: cadastro dos BDIs da empresa (composição e BDI final). */
export function PaginaBdi() {
  const { empresa, parametros, podeEditar, recarregarParametros } = useSessao();
  const acao = useAcao();
  const [novo, setNovo] = useState<Rascunho | null>(null);
  const [uso, setUso] = useState<Record<string, number>>({});
  const carregarUso = useCallback(() => { if (empresa) usoDosBdis(empresa.id).then(setUso).catch(() => {}); }, [empresa]);
  useEffect(() => { carregarUso(); }, [carregarUso, parametros]);
  if (!empresa || !parametros) return <p className="note">Carregando…</p>;
  const bdis = parametros.bdis;

  async function salvar(r: Rascunho, msg: string): Promise<boolean> {
    const { bdi, erro } = paraBdi(r);
    if (!bdi) { await acao(async () => { throw new Error(erro); }); return false; }
    const okk = await acao(() => salvarBdi(empresa!.id, { ...bdi, id: r.id }), msg);
    if (okk) await recarregarParametros();
    return okk;
  }
  async function duplicar(b: Bdi) {
    let nome = `${b.nome} (cópia)`;
    for (let i = 2; bdis.some(x => x.nome === nome); i++) nome = `${b.nome} (cópia ${i})`;
    if (await acao(() => salvarBdi(empresa!.id, { ...b, id: undefined, nome }), `${nome} criado.`)) await recarregarParametros();
  }
  async function excluir(b: Bdi) {
    if (await acao(() => excluirBdi(b.id), `${b.nome} excluído.`)) await recarregarParametros();
  }

  return (
    <div className="stack" style={{ maxWidth: 1180 }}>
      <div className="row">
        <h1>BDI</h1>
        <span className="spacer" />
        {podeEditar && !novo && <button className="btn primary" onClick={() => setNovo({ ...VAZIO, v: { ...VAZIO.v }, extras: [] })}>Novo BDI</button>}
      </div>
      <p className="note bdi-intro">
        Cadastre os BDIs da empresa e escolha um deles em cada linha do Mapa (coluna <b>BDI</b>). O BDI incide sobre o valor líquido
        da linha (quantidade × preço × câmbio). Os tributos <b>não</b> entram aqui: eles são calculados à parte, linha a linha.
        <br /><span className="bdi-formula">BDI = (1 + AC + S + G + R + parcelas personalizadas) × (1 + DF) × (1 + L) − 1</span>
      </p>
      {!podeEditar && <div className="banner">Só o Administrador e o Orçamentista alteram os BDIs. Você pode consultar.</div>}

      <div className="bdi-lista">
        {novo && (
          <CartaoBdi r={novo} editavel novo onMudar={setNovo} onCancelar={() => setNovo(null)}
            onSalvar={async r => { if (await salvar(r, `${r.nome.trim()} criado.`)) setNovo(null); }} />
        )}
        {bdis.map(b => (
          <CartaoSalvo key={b.id + JSON.stringify(b)} b={b} uso={uso[b.id] ?? 0} editavel={podeEditar}
            onSalvar={r => salvar(r, `${r.nome.trim()} salvo.`)} onDuplicar={() => duplicar(b)} onExcluir={() => excluir(b)} />
        ))}
        {!bdis.length && !novo && (
          <div className="card bdi-vazio">
            <b>Nenhum BDI cadastrado.</b>
            <span className="note">{podeEditar ? 'Clique em "Novo BDI" para montar a primeira composição.' : 'Peça a um Administrador ou Orçamentista para cadastrar.'}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function CartaoSalvo({ b, uso, editavel, onSalvar, onDuplicar, onExcluir }: {
  b: Bdi; uso: number; editavel: boolean; onSalvar: (r: Rascunho) => Promise<boolean>; onDuplicar: () => void; onExcluir: () => void;
}) {
  const [r, setR] = useState(() => doBdi(b));
  const mudou = JSON.stringify(r) !== JSON.stringify(doBdi(b));
  return <CartaoBdi r={r} editavel={editavel} uso={uso} mudou={mudou} onMudar={setR} onCancelar={() => setR(doBdi(b))}
    onSalvar={onSalvar} onDuplicar={onDuplicar} onExcluir={onExcluir} />;
}

function CartaoBdi({ r, editavel, novo, uso, mudou, onMudar, onSalvar, onCancelar, onDuplicar, onExcluir }: {
  r: Rascunho; editavel: boolean; novo?: boolean; uso?: number; mudou?: boolean;
  onMudar: (r: Rascunho) => void; onSalvar: (r: Rascunho) => void; onCancelar: () => void; onDuplicar?: () => void; onExcluir?: () => void;
}) {
  const [apagar, setApagar] = useState(false);
  const { bdi, erro } = paraBdi({ ...r, nome: r.nome || 'x' });
  const final = bdi ? bdiFinal(bdi) : null;
  const campo = (k: Chave, rot: string, sigla: string) => (
    <tr key={k}>
      <td><span className="bdi-sigla">{sigla}</span>{rot}</td>
      <td className="num">{editavel
        ? <span className="bdi-pct"><input className="in num" inputMode="decimal" placeholder="0,00" aria-label={`${rot} (%)`} value={r.v[k]}
            onChange={e => onMudar({ ...r, v: { ...r.v, [k]: e.target.value } })} /><span>%</span></span>
        : `${r.v[k] || '0,00'} %`}</td>
    </tr>
  );
  return (
    <section className={'card bdi-card' + (novo ? ' novo' : '')} aria-label={novo ? 'Novo BDI' : `BDI ${r.nome}`}>
      <header className="bdi-cab">
        {editavel
          ? <input className="in bdi-nome" maxLength={80} placeholder="Nome do BDI (ex.: BDI Obras Civis)" aria-label="Nome do BDI" value={r.nome}
              autoFocus={novo} onChange={e => onMudar({ ...r, nome: e.target.value })} />
          : <h2>{r.nome}</h2>}
        <div className="bdi-final" title="BDI final pela composição">
          <small>BDI final</small><b>{final === null ? '—' : `${nf(final * 100, 2)}%`}</b>
        </div>
      </header>
      <table className="t bdi-tab">
        <tbody>
          {PARCELAS.slice(0, 4).map(([k, rot, s]) => campo(k, rot, s))}
          {r.extras.map((e, i) => (
            <tr key={'x' + i} className="bdi-extra">
              <td>{editavel
                ? <span className="row" style={{ gap: 6 }}><span className="bdi-sigla">+</span>
                    <input className="in" placeholder="Nome da parcela" aria-label="Nome da parcela personalizada" value={e.nome}
                      onChange={ev => onMudar({ ...r, extras: r.extras.map((x, j) => (j === i ? { ...x, nome: ev.target.value } : x)) })} />
                    <button className="linkbtn" aria-label={`Remover parcela ${e.nome}`} title="Remover parcela"
                      onClick={() => onMudar({ ...r, extras: r.extras.filter((_, j) => j !== i) })}>remover</button></span>
                : <><span className="bdi-sigla">+</span>{e.nome}</>}</td>
              <td className="num">{editavel
                ? <span className="bdi-pct"><input className="in num" inputMode="decimal" placeholder="0,00" aria-label={`${e.nome || 'Parcela'} (%)`} value={e.pct}
                    onChange={ev => onMudar({ ...r, extras: r.extras.map((x, j) => (j === i ? { ...x, pct: ev.target.value } : x)) })} /><span>%</span></span>
                : `${e.pct} %`}</td>
            </tr>
          ))}
          {editavel && (
            <tr><td colSpan={2}><button className="linkbtn" onClick={() => onMudar({ ...r, extras: [...r.extras, { nome: '', pct: '' }] })}>
              + parcela personalizada</button><span className="note"> (soma-se a AC + S + G + R)</span></td></tr>
          )}
          {PARCELAS.slice(4).map(([k, rot, s]) => campo(k, rot, s))}
        </tbody>
      </table>
      <div className="bdi-exemplo note">
        {final === null ? <span className="bdi-erro">{erro}</span>
          : <>Exemplo: valor líquido de {brl(100000)} → <b>{brl(100000 * (1 + final))}</b> com BDI</>}
      </div>
      <footer className="bdi-rodape">
        {!novo && <span className="note">{uso ? `Usado em ${plural(uso, 'linha', 'linhas')} de Mapa em edição` : 'Não usado em Mapa em edição'}</span>}
        <span className="spacer" />
        {editavel && (novo || mudou) && <>
          <button className="btn" onClick={onCancelar}>{novo ? 'Cancelar' : 'Desfazer'}</button>
          <button className="btn primary" disabled={!r.nome.trim() || final === null} onClick={() => onSalvar(r)}>{novo ? 'Criar BDI' : 'Salvar'}</button>
        </>}
        {editavel && !novo && !mudou && (apagar
          ? <Confirmar msg={<>Excluir <b>{r.nome}</b>?{uso ? ` As ${uso} linhas que o usam ficam sem BDI ("-").` : ''} Revisões já emitidas não mudam.</>}
              sim="Excluir" onNao={() => setApagar(false)} onSim={() => { setApagar(false); onExcluir?.(); }} />
          : <>
              <button className="btn" onClick={onDuplicar}>Duplicar</button>
              <button className="btn danger" onClick={() => setApagar(true)}>Excluir</button>
            </>)}
      </footer>
    </section>
  );
}
