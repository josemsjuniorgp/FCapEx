import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useSessao } from '../app/Sessao';
import { brl, nf, Vazio } from '../app/ui';
import { lerPx, listarItens, listarRevisoes, type ItemPos, type Px, type Revisao } from '../dados/api';
import { calcular } from '../dominio/calculo';

/** Compara duas revisões da PX. Os itens são casados pelo Nº (seq), que é copiado entre revisões. */
export function Comparar() {
  const { id = '' } = useParams();
  const [qs] = useSearchParams();
  const { parametros } = useSessao();
  const [px, setPx] = useState<Px | null>(null);
  const [revs, setRevs] = useState<Revisao[]>([]);
  const [de, setDe] = useState<number | null>(null);
  const [para, setPara] = useState<number | null>(null);
  const [itensDe, setItensDe] = useState<ItemPos[]>([]);
  const [itensPara, setItensPara] = useState<ItemPos[]>([]);
  const [soDif, setSoDif] = useState(true);

  useEffect(() => {
    Promise.all([lerPx(id), listarRevisoes(id)]).then(([x, r]) => {
      setPx(x); setRevs(r);
      const atual = r.find(v => !v.emitida_em) ?? r[r.length - 1];
      const pedida = qs.get('de');
      setPara(atual?.numero ?? null);
      setDe(pedida !== null ? +pedida : r.filter(v => v.emitida_em).at(-1)?.numero ?? null);
    });
  }, [id, qs]);

  useEffect(() => {
    const a = revs.find(r => r.numero === de), b = revs.find(r => r.numero === para);
    if (a) listarItens(a.id).then(setItensDe);
    if (b) listarItens(b.id).then(setItensPara);
  }, [de, para, revs]);

  const linhas = useMemo(() => {
    if (!parametros || !px) return [];
    const cols = new Set(px.colunas);
    const ger = (i?: ItemPos) => (i ? calcular(i, parametros, cols).ger || 0 : 0);
    const mapaDe = new Map(itensDe.filter(i => !i.titulo).map(i => [i.seq, i]));
    const mapaPara = new Map(itensPara.filter(i => !i.titulo).map(i => [i.seq, i]));
    const seqs = [...new Set([...mapaDe.keys(), ...mapaPara.keys()])].sort((a, b) => a - b);
    return seqs.map(s => {
      const a = mapaDe.get(s), b = mapaPara.get(s);
      const mudancas: string[] = [];
      if (a && b) {
        if (a.qtd !== b.qtd) mudancas.push(`quantidade ${a.qtd ?? '—'} → ${b.qtd ?? '—'}`);
        if (a.preco !== b.preco) mudancas.push(`preço ${a.preco ?? '—'} → ${b.preco ?? '—'}`);
        if (a.desc !== b.desc) mudancas.push('descrição');
        if (a.moeda !== b.moeda || a.tipo !== b.tipo || a.orig !== b.orig || a.pacote !== b.pacote) mudancas.push('classificação');
        if (a.bdi !== b.bdi || a.prov !== b.prov) mudancas.push('BDI/provisão');
      }
      const tipo = !a ? 'novo' : !b ? 'removido' : mudancas.length ? 'alterado' : 'igual';
      return { seq: s, it: (b ?? a)!, tipo, mudancas, va: ger(a), vb: ger(b) };
    });
  }, [itensDe, itensPara, parametros, px]);

  const totalA = linhas.reduce((s, l) => s + l.va, 0), totalB = linhas.reduce((s, l) => s + l.vb, 0);
  const porArea = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of linhas) m.set(l.it.area || '(sem área)', (m.get(l.it.area || '(sem área)') || 0) + l.vb - l.va);
    return [...m.entries()].filter(([, v]) => Math.abs(v) > 0.005).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  }, [linhas]);
  const maxArea = Math.max(1, ...porArea.map(([, v]) => Math.abs(v)));

  if (!px) return <p className="note">Carregando…</p>;
  const rot = (r: Revisao) => `Rev ${r.numero}${r.emitida_em ? '' : ' (em edição)'}`;

  return (
    <div className="stack">
      <div className="row">
        <Link to={`/px/${px.id}`} className="linkbtn">← Voltar à PX</Link>
        <h1>Comparar revisões · {px.codigo}</h1>
      </div>
      {revs.length < 2 ? <Vazio>{px.codigo} ainda está na primeira emissão. Use "Emitir nova revisão" na grade para congelar a revisão atual e começar a próxima.</Vazio> : (
        <>
          <div className="row">
            De <select value={de ?? ''} onChange={e => setDe(+e.target.value)}>{revs.map(r => <option key={r.id} value={r.numero}>{rot(r)}</option>)}</select>
            para <select value={para ?? ''} onChange={e => setPara(+e.target.value)}>{revs.map(r => <option key={r.id} value={r.numero}>{rot(r)}</option>)}</select>
            <label className="row"><input type="checkbox" checked={soDif} onChange={e => setSoDif(e.target.checked)} />Só diferenças</label>
          </div>
          <div className="kpis card">
            <div className="kpi"><small>Total Rev {de}</small><b>{brl(totalA)}</b></div>
            <div className="kpi"><small>Total Rev {para}</small><b>{brl(totalB)}</b></div>
            <div className="kpi"><small>Variação</small><b style={{ color: totalB - totalA > 0 ? 'var(--err)' : 'var(--ok)' }}>
              {brl(totalB - totalA)}{totalA ? ` (${nf(((totalB - totalA) / totalA) * 100, 1)}%)` : ''}</b></div>
            <div className="kpi"><small>Itens</small><b style={{ fontSize: 14 }}>
              {linhas.filter(l => l.tipo === 'novo').length} novos · {linhas.filter(l => l.tipo === 'removido').length} removidos · {linhas.filter(l => l.tipo === 'alterado').length} alterados</b></div>
          </div>
          {porArea.length > 0 && (
            <div className="card" style={{ padding: 14 }}>
              <h3>Variação por Área</h3>
              {porArea.map(([a, v]) => (
                <div className="row" key={a} style={{ padding: '4px 0' }}>
                  <span style={{ width: 160 }}>{a}</span>
                  <div className="bar" style={{ flex: 1 }}><i className={v > 0 ? 'pos' : 'neg'} style={{ left: 0, width: `${(Math.abs(v) / maxArea) * 100}%` }} /></div>
                  <span className="num" style={{ width: 140 }}>{brl(v)}</span>
                </div>
              ))}
            </div>
          )}
          <div className="card scroll-x">
            <table className="t">
              <thead><tr><th>Nº</th><th>Item PQ</th><th>Descrição</th><th>Mudança</th><th className="num">Rev {de}</th><th className="num">Rev {para}</th><th className="num">Variação</th></tr></thead>
              <tbody>
                {linhas.filter(l => !soDif || l.tipo !== 'igual').map(l => (
                  <tr key={l.seq}>
                    <td className="mono">{l.seq}</td><td className="mono">{l.it.item}</td><td>{l.it.desc}</td>
                    <td><span className={'pill ' + ({ novo: 'p-ok', removido: 'p-err', alterado: 'p-warn', igual: 'p-mut' } as const)[l.tipo as 'novo']}>{l.tipo}</span>
                      {l.mudancas.length > 0 && <span className="note"> {l.mudancas.join('; ')}</span>}</td>
                    <td className="num">{nf(l.va)}</td><td className="num">{nf(l.vb)}</td><td className="num">{nf(l.vb - l.va)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
