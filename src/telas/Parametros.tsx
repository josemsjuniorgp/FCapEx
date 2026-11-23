import { useState } from 'react';
import { useSessao } from '../app/Sessao';
import { nf, useAcao } from '../app/ui';
import { adicionarPacote, excluirMoeda, excluirPacote, salvarAliquota, salvarMoeda, salvarPadraoCodigo } from '../dados/api';
import { camposDoPadrao, montarCodigo, PADRAO_INICIAL, padraoParaPartes, partesParaPadrao, validarPadrao, type Parte } from '../dominio/codigo';
import { parseNum } from '../dominio/normalizacao';
import type { Regime } from '../dominio/tipos';

const REGIMES: [Regime, string][] = [['NF', 'Nacional · fornecimento'], ['IF', 'Importado · fornecimento'], ['NS', 'Nacional · serviço'], ['IS', 'Importado · serviço']];

/** Parâmetros de cálculo da empresa: câmbio, alíquotas e pacotes de serviço. */
export function Parametros() {
  const { empresa, parametros, moedas, ehAdmin, recarregarParametros, recarregarEmpresas } = useSessao();
  const acao = useAcao();
  const [nova, setNova] = useState({ codigo: '', nome: '', simbolo: '', cambio: '' });
  const [pacote, setPacote] = useState('');
  if (!empresa || !parametros) return <p className="note">Carregando…</p>;
  const exec = async (fn: () => Promise<unknown>, msg?: string) => { if (await acao(fn, msg)) await recarregarParametros(); };

  return (
    <div className="stack" style={{ maxWidth: 900 }}>
      <h1>Parâmetros de cálculo</h1>
      {!ehAdmin && <div className="banner">Só o administrador altera os parâmetros. Você pode consultar.</div>}

      <CodigoPx padraoAtual={empresa.padrao_codigo} editavel={ehAdmin}
        onSalvar={async padrao => { await exec(() => salvarPadraoCodigo(empresa.id, padrao), 'Padrão do código salvo.'); await recarregarEmpresas(); }} />

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

const EXEMPLO = 'PX-{campo:Área}-{campo:Projeto}-{campo:Disciplina}-{campo:Sigla}-{seq:4}';
const NOME_SEP: Record<string, string> = { '-': 'hífen  -', '_': 'sublinhado  _', '.': 'ponto  .', '/': 'barra  /', '': 'nenhum' };
const TIPOS_PARTE: [Parte['tipo'], string][] = [['texto', 'Texto fixo'], ['campo', 'Campo (perguntado ao criar)'], ['seq', 'Número sequencial'], ['ano', 'Ano']];

function novaParte(tipo: Parte['tipo']): Parte {
  if (tipo === 'texto') return { tipo, valor: 'PX' };
  if (tipo === 'campo') return { tipo, nome: 'Campo' };
  if (tipo === 'seq') return { tipo, digitos: 4 };
  return { tipo };
}

function CodigoPx({ padraoAtual, editavel, onSalvar }: { padraoAtual: string; editavel: boolean; onSalvar: (p: string) => Promise<void> }) {
  const inicial = padraoParaPartes(padraoAtual) ?? padraoParaPartes(PADRAO_INICIAL)!;
  const [partes, setPartes] = useState<Parte[]>(inicial.partes);
  const [sep, setSep] = useState(inicial.sep);
  const [avancado, setAvancado] = useState(!padraoParaPartes(padraoAtual));
  const [texto, setTexto] = useState(padraoAtual);
  const padrao = avancado ? texto : partesParaPadrao(partes, sep);
  const erros = validarPadrao(padrao);
  if (!avancado && partes.some(p => (p.tipo === 'texto' && !p.valor.trim()) || (p.tipo === 'campo' && !p.nome.trim())))
    erros.push('Preencha o texto ou o nome de todas as partes.');
  const nomes = camposDoPadrao(padrao);
  const exemplo = montarCodigo(padrao.replace(/\{campo:([^}]+)\}/g, '‹$1›'), 1, {});

  const mudar = (i: number, p: Parte) => setPartes(partes.map((x, j) => (j === i ? p : x)));
  const mover = (i: number, d: number) => { const l = [...partes]; [l[i], l[i + d]] = [l[i + d], l[i]]; setPartes(l); };
  const carregar = (pd: string) => { const r = padraoParaPartes(pd); if (r) { setPartes(r.partes); setSep(r.sep); setAvancado(false); } setTexto(pd); };

  return (
    <section className="card stack" style={{ padding: 16, gap: 12 }}>
      <h2>Código da PX</h2>
      <p className="note">O código de cada PX nova é montado juntando as partes abaixo, na ordem. Os <b>campos</b> são perguntados
        na hora de criar a PX (ex.: Área = A2). O <b>número sequencial</b> é gerado sozinho (0001, 0002…) e garante que o código nunca se repete.
        A revisão aparece separada (· Rev 0, Rev 1…).</p>

      <div className="cover" style={{ justifyContent: 'space-between' }}>
        <span className="note">Exemplo do código:</span>
        <b className="mono" style={{ fontSize: 18 }}>{erros.length ? '—' : exemplo}</b>
        {nomes.length > 0 && <span className="note">Ao criar a PX serão pedidos: {nomes.join(', ')}</span>}
      </div>

      {!avancado && (
        <>
          <table className="t">
            <thead><tr><th>#</th><th>Tipo da parte</th><th>Conteúdo</th><th /></tr></thead>
            <tbody>
              {partes.map((p, i) => (
                <tr key={i}>
                  <td className="mono">{i + 1}</td>
                  <td>
                    <select value={p.tipo} disabled={!editavel} onChange={e => mudar(i, novaParte(e.target.value as Parte['tipo']))}>
                      {TIPOS_PARTE.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
                    </select>
                  </td>
                  <td>
                    {p.tipo === 'texto' && <input className="in mono" disabled={!editavel} value={p.valor} placeholder="ex.: PX" onChange={e => mudar(i, { ...p, valor: e.target.value })} />}
                    {p.tipo === 'campo' && <input className="in" disabled={!editavel} value={p.nome} placeholder="nome do campo, ex.: Área" onChange={e => mudar(i, { ...p, nome: e.target.value })} />}
                    {p.tipo === 'seq' && (
                      <select value={p.digitos} disabled={!editavel} onChange={e => mudar(i, { ...p, digitos: +e.target.value })}>
                        {[2, 3, 4, 5, 6].map(d => <option key={d} value={d}>{d} dígitos ({'1'.padStart(d, '0')})</option>)}
                      </select>
                    )}
                    {p.tipo === 'ano' && <span className="note">ano atual ({new Date().getFullYear()})</span>}
                  </td>
                  <td>{editavel && (
                    <div className="row-actions">
                      <button className="btn small" disabled={i === 0} aria-label="Subir" onClick={() => mover(i, -1)}>↑</button>
                      <button className="btn small" disabled={i === partes.length - 1} aria-label="Descer" onClick={() => mover(i, 1)}>↓</button>
                      <button className="btn small danger" disabled={partes.length === 1} onClick={() => setPartes(partes.filter((_, j) => j !== i))}>Remover</button>
                    </div>)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {editavel && (
            <div className="row">
              <button className="btn" onClick={() => setPartes([...partes.filter(x => x.tipo !== 'seq'), { tipo: 'campo', nome: '' }, ...partes.filter(x => x.tipo === 'seq')])}>+ Adicionar campo</button>
              <button className="btn" onClick={() => setPartes([...partes, novaParte('texto')])}>+ Adicionar texto fixo</button>
              <span className="spacer" />
              <label className="row">Separador entre as partes
                <select value={sep} onChange={e => setSep(e.target.value)}>
                  {Object.entries(NOME_SEP).map(([v, n]) => <option key={n} value={v}>{n}</option>)}
                </select>
              </label>
            </div>
          )}
        </>
      )}

      {avancado && (
        <label className="stack" style={{ gap: 4 }}><span className="note">Padrão em texto (marcadores: {'{seq:4}'}, {'{campo:Nome}'}, {'{ano}'})</span>
          <input className="in mono" disabled={!editavel} value={texto} onChange={e => setTexto(e.target.value)} />
        </label>
      )}

      {erros.map(e => <div key={e} className="banner">{e}</div>)}

      {editavel && (
        <div className="row">
          <button className="linkbtn" onClick={() => carregar(EXEMPLO)}>Usar o exemplo PX-Área-Projeto-Disciplina-Sigla-0001</button>
          <button className="linkbtn" onClick={() => carregar(PADRAO_INICIAL)}>Voltar ao simples PX-0001</button>
          <button className="linkbtn" onClick={() => { if (avancado) carregar(texto); else { setTexto(padrao); setAvancado(true); } }}>
            {avancado ? 'Voltar ao montador visual' : 'Modo avançado (texto)'}</button>
          <span className="spacer" />
          <button className="btn primary" disabled={!!erros.length || padrao === padraoAtual} onClick={() => onSalvar(padrao.trim())}>Salvar padrão</button>
        </div>
      )}
      <span className="note">Mudar o padrão só afeta as PX criadas depois. As existentes mantêm o código.</span>
    </section>
  );
}
