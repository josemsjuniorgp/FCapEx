import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useSessao } from '../app/Sessao';
import { brl, Vazio } from '../app/ui';
import {
  listarClientes, listarItens, listarProjetos, listarPxs, revisoesDaEmpresa, type Cliente, type Projeto, type Px,
} from '../dados/api';
import { calcular } from '../dominio/calculo';
import {
  aderencia, calcularMaturidade, CLASSES, faixaTxt, ORIGENS, pctTxt, ROTULO_ADERENCIA, SEM_ORIGEM, type Maturidade,
} from '../dominio/maturidade';

/** Página Maturidade: todas as PX com % de preço firme × meta da classe AACE, e o detalhe da PX escolhida. */
export function PaginaMaturidade() {
  const { empresa, parametros } = useSessao();
  const [qs, setQs] = useSearchParams();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [pxs, setPxs] = useState<Px[]>([]);
  const [mats, setMats] = useState<Record<string, Maturidade>>({});
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    if (!empresa || !parametros) return;
    let vivo = true;
    (async () => {
      const [c, p, x, r] = await Promise.all([listarClientes(empresa.id), listarProjetos(empresa.id), listarPxs(empresa.id), revisoesDaEmpresa(empresa.id)]);
      if (!vivo) return;
      setClientes(c); setProjetos(p); setPxs(x);
      const pares = await Promise.all(x.map(async px => {
        const rev = r.find(v => v.px_id === px.id && !v.emitida_em);
        const itens = rev ? await listarItens(rev.id) : [];
        const cols = new Set(px.colunas);
        const res = new Map(itens.map(i => [i.id, calcular(i, parametros, cols)]));
        return [px.id, calcularMaturidade(itens, res)] as const;
      }));
      if (vivo) { setMats(Object.fromEntries(pares)); setCarregando(false); }
    })().catch(() => setCarregando(false));
    return () => { vivo = false; };
  }, [empresa, parametros]);

  const sel = qs.get('px');
  const pxSel = pxs.find(x => x.id === sel);
  const projSel = projetos.find(p => p.id === pxSel?.projeto_id);
  const grupos = useMemo(() => clientes.map(c => ({
    c, projs: projetos.filter(p => p.cliente_id === c.id).map(p => ({ p, lista: pxs.filter(x => x.projeto_id === p.id) })).filter(g => g.lista.length),
  })).filter(g => g.projs.length), [clientes, projetos, pxs]);

  if (!empresa) return null;
  return (
    <div className="stack" style={{ maxWidth: 1180 }}>
      <h1>Maturidade</h1>
      <p className="note" style={{ maxWidth: 860 }}>
        Maturidade = parte do <b>Total geral</b> do Mapa com <b>preço firme</b> (contrato ou pedido de compra emitido, ou cotação firme
        de fornecedor), comparada com a meta de cotações firmes da <b>classe AACE</b> do projeto. A origem do preço é escolhida em cada
        linha do Mapa (coluna "Origem do preço"); a classe e a fase ficam no cadastro do projeto ("Editar projeto").
      </p>

      {pxSel && mats[pxSel.id] && <CartaoMaturidade px={pxSel} projeto={projSel} m={mats[pxSel.id]} onFechar={() => setQs({})} />}

      <div className="mat-lado">
        <section className="card mat-lista">
          <h2>Mapas de Preços da empresa</h2>
          {carregando && <p className="note">Calculando…</p>}
          {!carregando && !grupos.length && <Vazio>Nenhum Mapa de Preços cadastrado ainda.</Vazio>}
          {grupos.map(({ c, projs }) => (
            <div key={c.id} className="mat-cli">
              <h3>{c.nome}</h3>
              {projs.map(({ p, lista }) => (
                <div key={p.id} className="mat-proj">
                  <div className="mat-proj-cab"><b>{p.nome}</b>
                    <span className="note">{p.fase || 'fase não informada'}{p.classe ? ` · Classe ${p.classe} · meta ${faixaTxt(CLASSES[p.classe].meta)}` : ' · sem classe'}</span></div>
                  {lista.map(x => {
                    const m = mats[x.id], ad = m ? aderencia(m.pct, p.classe) : null;
                    return (
                      <button key={x.id} className={'mat-linha' + (sel === x.id ? ' sel' : '')} onClick={() => setQs({ px: x.id })} aria-label={`Maturidade de ${x.codigo}`}>
                        <span className="mono">{x.codigo}</span>
                        <span className="mat-nome">{x.nome}</span>
                        <span className="mat-mini"><Barra m={m} classe={p.classe} /></span>
                        <span className="mat-pct">{m?.pct == null ? '—' : pctTxt(m.pct)}</span>
                        <span className={'mat-st ' + (ad ?? '')}>{ad ? ROTULO_ADERENCIA[ad] : p.classe ? 'sem valores' : 'informe a classe'}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          ))}
        </section>
        <aside className="card mat-ref">
          <h2>Referência AACE</h2>
          <table className="t">
            <thead><tr><th>Classe</th><th className="num">Maturidade do projeto</th><th className="num">Meta de cotações firmes</th></tr></thead>
            <tbody>{[5, 4, 3, 2, 1].map(c => (
              <tr key={c} className={projSel?.classe === c ? 'sel' : ''}><td>Classe {c}</td><td className="num">{faixaTxt(CLASSES[c].maturidade)}</td><td className="num">{faixaTxt(CLASSES[c].meta)}</td></tr>
            ))}</tbody>
          </table>
          <p className="note">A maturidade do projeto é informativa (grau de definição da engenharia). A aderência compara só as cotações firmes com a meta.</p>
        </aside>
      </div>
    </div>
  );
}

/** Barra 0–100% com a faixa da meta tracejada e o valor atual. */
function Barra({ m, classe }: { m?: Maturidade; classe: number | null }) {
  const meta = classe ? CLASSES[classe].meta : null;
  const ad = m ? aderencia(m.pct, classe) : null;
  return (
    <span className={'mat-barra ' + (ad ?? '')}>
      {meta && <i className="meta" style={{ left: `${meta[0] * 100}%`, width: `${Math.max(1, (meta[1] - meta[0]) * 100)}%` }} />}
      <i className="val" style={{ width: `${(m?.pct ?? 0) * 100}%` }} />
    </span>
  );
}

function CartaoMaturidade({ px, projeto, m, onFechar }: { px: Px; projeto?: Projeto; m: Maturidade; onFechar: () => void }) {
  const classe = projeto?.classe ?? null;
  const ad = aderencia(m.pct, classe);
  const origens = [...ORIGENS, SEM_ORIGEM].map(o => ({ ...o, v: m.porOrigem[o.k] || 0 })).filter(o => o.v > 0);
  return (
    <section className={'card mat-card mat-st-borda ' + (ad ?? '')} aria-label={`Maturidade de ${px.codigo}`}>
      <div className="mat-card-cab">
        <div>
          <small className="note">MATURIDADE DO MAPA · <span className="mono">{px.codigo}</span> · {px.nome}</small>
          <h2>{projeto?.fase || 'Fase não informada'}{classe ? ` · Classe ${classe} (AACE)` : ''}</h2>
          <span className="note">{classe
            ? <>maturidade do projeto {faixaTxt(CLASSES[classe].maturidade)} · meta de cotações firmes <b>{faixaTxt(CLASSES[classe].meta)}</b></>
            : <>Informe a classe AACE do projeto em Projetos → "Editar projeto" para comparar com a meta.</>}</span>
        </div>
        <span className={'mat-st ' + (ad ?? '')}>{ad ? ROTULO_ADERENCIA[ad] : classe ? 'sem valores' : 'sem classe'}</span>
      </div>
      <div className="mat-big">{m.pct === null ? '—' : pctTxt(m.pct, 1)} <span>do valor com preço firme ({brl(m.firme)} de {brl(m.total)})</span></div>
      <div className="mat-barra-g"><Barra m={m} classe={classe} /></div>
      <div className="mat-escala"><span>0%</span>{classe && <span>meta {faixaTxt(CLASSES[classe].meta)}</span>}<span>100%</span></div>
      {m.total > 0 && (
        <>
          <div className="mat-mix" aria-label="Valor por origem do preço">
            {origens.map(o => <i key={o.k} style={{ width: `${(o.v / m.total) * 100}%`, background: o.cor }} title={`${o.nome}: ${brl(o.v)}`} />)}
          </div>
          <div className="mat-leg">
            {origens.map(o => <span key={o.k}><i style={{ background: o.cor }} />{o.curto} <b>{pctTxt(o.v / m.total)}</b> <span className="note">{brl(o.v)}</span></span>)}
          </div>
        </>
      )}
      <div className="row">
        <span className="note">{m.linhas} linhas com valor{m.semOrigem ? ` · ${m.semOrigem} sem origem do preço informada` : ''}. Linhas incompletas (sem total) não entram.</span>
        <span className="spacer" />
        <button className="btn small" onClick={onFechar}>Fechar</button>
        <Link className="btn small primary" to={`/px/${px.id}`}>Abrir Mapa</Link>
      </div>
    </section>
  );
}
