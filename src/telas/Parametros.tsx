import { useState } from 'react';
import { useSessao } from '../app/Sessao';
import { nf, useAcao } from '../app/ui';
import { adicionarPacote, excluirMoeda, excluirPacote, salvarAliquota, salvarMoeda } from '../dados/api';
import { parseNum } from '../dominio/normalizacao';
import type { Regime } from '../dominio/tipos';

const REGIMES: [Regime, string][] = [['NF', 'Nacional · fornecimento'], ['IF', 'Importado · fornecimento'], ['NS', 'Nacional · serviço'], ['IS', 'Importado · serviço']];

/** Parâmetros de cálculo da empresa: câmbio, alíquotas e pacotes de serviço. */
export function Parametros() {
  const { empresa, parametros, moedas, ehAdmin, recarregarParametros } = useSessao();
  const acao = useAcao();
  const [nova, setNova] = useState({ codigo: '', nome: '', simbolo: '', cambio: '' });
  const [pacote, setPacote] = useState('');
  if (!empresa || !parametros) return <p className="note">Carregando…</p>;
  const exec = async (fn: () => Promise<unknown>, msg?: string) => { if (await acao(fn, msg)) await recarregarParametros(); };

  return (
    <div className="stack" style={{ maxWidth: 900 }}>
      <h1>Parâmetros de cálculo</h1>
      {!ehAdmin && <div className="banner">Só o administrador altera os parâmetros. Você pode consultar.</div>}

      <section className="card" style={{ padding: 16 }}>
        <h2>Moedas e câmbio</h2>
        <p className="note">Valor de 1 unidade da moeda em R$. Moeda sem câmbio deixa os itens com erro no Check.</p>
        <table className="t">
          <thead><tr><th>Código</th><th>Nome</th><th>Símbolo</th><th className="num">Câmbio (R$)</th><th /></tr></thead>
          <tbody>
            {moedas.map(m => (
              <tr key={m.codigo}>
                <td className="mono">{m.codigo}</td><td>{m.nome}</td><td>{m.simbolo}</td>
                <td className="num">{ehAdmin && m.codigo !== 'BRL'
                  ? <input className="in num" style={{ width: 120 }} defaultValue={m.cambio_brl === null ? '' : nf(m.cambio_brl, 4)}
                      onBlur={e => { const v = parseNum(e.target.value); exec(() => salvarMoeda(empresa.id, { ...m, cambio_brl: Number.isNaN(v) ? null : v }), `Câmbio de ${m.codigo} salvo.`); }} />
                  : m.cambio_brl === null ? '—' : nf(m.cambio_brl, 4)}</td>
                <td>{ehAdmin && m.codigo !== 'BRL' && <button className="btn small danger" onClick={() => exec(() => excluirMoeda(empresa.id, m.codigo))}>Excluir</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {ehAdmin && (
          <div className="row" style={{ marginTop: 10 }}>
            <input className="in mono" style={{ width: 80 }} placeholder="GBP" maxLength={3} value={nova.codigo} onChange={e => setNova({ ...nova, codigo: e.target.value.toUpperCase() })} />
            <input className="in" placeholder="Libra" value={nova.nome} onChange={e => setNova({ ...nova, nome: e.target.value })} />
            <input className="in" style={{ width: 70 }} placeholder="£" value={nova.simbolo} onChange={e => setNova({ ...nova, simbolo: e.target.value })} />
            <input className="in" style={{ width: 110 }} placeholder="Câmbio" value={nova.cambio} onChange={e => setNova({ ...nova, cambio: e.target.value })} />
            <button className="btn" disabled={!/^[A-Z]{3}$/.test(nova.codigo) || !nova.nome.trim()}
              onClick={async () => { const v = parseNum(nova.cambio);
                await exec(() => salvarMoeda(empresa.id, { codigo: nova.codigo, nome: nova.nome.trim(), simbolo: nova.simbolo.trim() || nova.codigo, cambio_brl: Number.isNaN(v) ? null : v }), 'Moeda adicionada.');
                setNova({ codigo: '', nome: '', simbolo: '', cambio: '' }); }}>Adicionar moeda</button>
          </div>
        )}
      </section>

      <section className="card" style={{ padding: 16 }}>
        <h2>Alíquotas por regime</h2>
        <p className="note">Tributos = total ÷ (1 − alíquota) − base. O regime vem da Natureza (N/I) e do Tipo de Trabalho (F = fornecimento; C, S, T, M = serviço).</p>
        <table className="t"><tbody>
          {REGIMES.map(([r, n]) => (
            <tr key={r}><td className="mono">{r}</td><td>{n}</td>
              <td className="num">{ehAdmin
                ? <input className="in num" style={{ width: 100 }} defaultValue={nf(parametros.aliquotas[r] * 100, 2)}
                    onBlur={e => { const v = parseNum(e.target.value); if (!Number.isNaN(v) && v >= 0 && v < 100) exec(() => salvarAliquota(empresa.id, r, v / 100), `Alíquota ${r} salva.`); }} />
                : nf(parametros.aliquotas[r] * 100, 2)} %</td></tr>
          ))}
        </tbody></table>
      </section>

      <section className="card" style={{ padding: 16 }}>
        <h2>Pacotes de serviço</h2>
        <p className="note">Itens destes pacotes são tributados como serviço nacional, para os 5 tipos de trabalho e qualquer natureza. A comparação ignora zeros à esquerda, caixa e símbolos (SERV-CIV-01 = serv civ 1).</p>
        <div className="row">
          {parametros.pacotesServico.map(p => (
            <span key={p} className="pill p-info mono">{p}
              {ehAdmin && <button className="linkbtn" aria-label={`Remover ${p}`} onClick={() => exec(() => excluirPacote(empresa.id, p))}>×</button>}</span>
          ))}
        </div>
        {ehAdmin && (
          <div className="row" style={{ marginTop: 10 }}>
            <input className="in mono" placeholder="SERV-ELE-1" value={pacote} onChange={e => setPacote(e.target.value)} />
            <button className="btn" disabled={!pacote.trim()} onClick={async () => { await exec(() => adicionarPacote(empresa.id, pacote.trim().toUpperCase()), 'Pacote adicionado.'); setPacote(''); }}>Adicionar pacote</button>
          </div>
        )}
      </section>
    </div>
  );
}
