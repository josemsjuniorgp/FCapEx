import { useState } from 'react';
import { useSessao } from '../app/Sessao';
import { nf, useAcao } from '../app/ui';
import { excluirMoeda, excluirTributo, salvarMoeda, salvarTributo } from '../dados/api';
import { parseNum } from '../dominio/normalizacao';
import type { Tributo } from '../dominio/tipos';
import { Confirmar } from '../app/ui';

/** Parâmetros de cálculo da empresa: câmbio e tributos. */
export function Parametros() {
  const { empresa, parametros, moedas, ehAdmin, recarregarParametros } = useSessao();
  const acao = useAcao();
  const [nova, setNova] = useState({ codigo: '', nome: '', simbolo: '', cambio: '' });
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
          <div className="group-box stack" style={{ gap: 8, marginTop: 12 }}>
            <strong>Nova moeda</strong>
            <span className="note">Adicione quantas moedas precisar. Os itens nessa moeda são convertidos para R$ pelo câmbio informado.</span>
            <div className="row" style={{ alignItems: 'flex-end' }}>
              <label className="stack" style={{ gap: 3 }}><span className="note">Código (3 letras)</span>
                <input className="in mono" style={{ width: 90 }} placeholder="GBP" maxLength={3} value={nova.codigo} onChange={e => setNova({ ...nova, codigo: e.target.value.toUpperCase().replace(/[^A-Z]/g, '') })} /></label>
              <label className="stack" style={{ gap: 3 }}><span className="note">Nome</span>
                <input className="in" placeholder="Libra esterlina" value={nova.nome} onChange={e => setNova({ ...nova, nome: e.target.value })} /></label>
              <label className="stack" style={{ gap: 3 }}><span className="note">Símbolo</span>
                <input className="in" style={{ width: 80 }} placeholder="£" value={nova.simbolo} onChange={e => setNova({ ...nova, simbolo: e.target.value })} /></label>
              <label className="stack" style={{ gap: 3 }}><span className="note">Câmbio (R$ por 1 unidade)</span>
                <input className="in num" style={{ width: 150 }} placeholder="7,1000" value={nova.cambio} onChange={e => setNova({ ...nova, cambio: e.target.value })} /></label>
              <button className="btn primary" disabled={!/^[A-Z]{3}$/.test(nova.codigo) || !nova.nome.trim() || moedas.some(m => m.codigo === nova.codigo)}
                onClick={async () => { const v = parseNum(nova.cambio);
                  await exec(() => salvarMoeda(empresa.id, { codigo: nova.codigo, nome: nova.nome.trim(), simbolo: nova.simbolo.trim() || nova.codigo, cambio_brl: Number.isNaN(v) ? null : v }), `Moeda ${nova.codigo} adicionada.`);
                  setNova({ codigo: '', nome: '', simbolo: '', cambio: '' }); }}>Adicionar moeda</button>
            </div>
            {moedas.some(m => m.codigo === nova.codigo) && <span className="note">A moeda {nova.codigo} já está cadastrada: altere o câmbio dela na tabela acima.</span>}
          </div>
        )}
      </section>

      <Tributos />
    </div>
  );
}

const APLICA: [keyof Pick<Tributo, 'fornecimento' | 'servico' | 'nacional' | 'importado'>, string][] = [
  ['fornecimento', 'Fornecimento'], ['servico', 'Serviço'], ['nacional', 'Nacional'], ['importado', 'Importado'],
];
const novoTributo = (): Omit<Tributo, 'id'> => ({ nome: '', aliquota: 0, fornecimento: true, servico: true, nacional: true, importado: true });

/** Tributos da empresa: nome, alíquota e onde se aplicam. Personalizados entram no cálculo igual aos padrões. */
function Tributos() {
  const { empresa, parametros, ehAdmin, recarregarParametros } = useSessao();
  const acao = useAcao();
  const [novo, setNovo] = useState(novoTributo());
  const [aliqNovo, setAliqNovo] = useState('');
  const [perguntar, setPerguntar] = useState<string | null>(null);
  if (!empresa || !parametros) return null;
  const exec = async (fn: () => Promise<unknown>, msg?: string) => { if (await acao(fn, msg)) await recarregarParametros(); };
  const pctTxt = (v: number) => nf(v * 100, 2);

  return (
    <section className="card" style={{ padding: 16 }}>
      <h2>Tributos</h2>
      <p className="note">Cada tributo tem uma alíquota e se aplica conforme o Tipo de Trabalho (F = fornecimento; C, S, T, M = serviço) e a Natureza (N/I).
        Na grade, cada linha pode <b>ligar ou desligar</b> cada tributo; a regra abaixo define como ele começa.
        Cálculo: parcial = base ÷ (1 − soma das alíquotas ligadas); cada tributo = parcial × sua alíquota.</p>
      <table className="t">
        <thead><tr><th>Tributo</th><th className="num">Alíquota (%)</th>{APLICA.map(([, n]) => <th key={n} style={{ textAlign: 'center' }}>{n}</th>)}<th /></tr></thead>
        <tbody>
          {parametros.tributos.map(t => (
            <tr key={t.id}>
              <td><b>{t.nome}</b></td>
              <td className="num">{ehAdmin
                ? <input className="in num" style={{ width: 100 }} defaultValue={pctTxt(t.aliquota)} aria-label={`Alíquota de ${t.nome}`}
                    onBlur={e => { const v = parseNum(e.target.value); if (!Number.isNaN(v) && v >= 0 && v < 100 && v / 100 !== t.aliquota) exec(() => salvarTributo(empresa.id, { ...t, aliquota: v / 100 }), `Alíquota de ${t.nome} salva.`); }} />
                : pctTxt(t.aliquota)}</td>
              {APLICA.map(([k, n]) => (
                <td key={k} style={{ textAlign: 'center' }}>
                  <input type="checkbox" checked={t[k]} disabled={!ehAdmin} aria-label={`${t.nome} se aplica a ${n}`}
                    onChange={e => exec(() => salvarTributo(empresa.id, { ...t, [k]: e.target.checked }))} />
                </td>
              ))}
              <td>{ehAdmin && (perguntar === t.id
                ? <Confirmar msg={<>Excluir <b>{t.nome}</b>? Ele sai do cálculo de todas as PX.</>} sim="Excluir" onNao={() => setPerguntar(null)}
                    onSim={() => { setPerguntar(null); exec(() => excluirTributo(t.id), `${t.nome} excluído.`); }} />
                : <button className="btn small danger" onClick={() => setPerguntar(t.id)}>Excluir</button>)}</td>
            </tr>
          ))}
          {!parametros.tributos.length && <tr><td colSpan={7} className="note">Nenhum tributo cadastrado: as PX ficam sem tributos.</td></tr>}
        </tbody>
      </table>
      {ehAdmin && (
        <div className="group-box stack" style={{ gap: 8, marginTop: 12 }}>
          <strong>Novo tributo</strong>
          <span className="note">Crie tributos fora do padrão (ex.: CSLL, INSS, taxa municipal). Eles viram colunas disponíveis na grade e entram no cálculo.</span>
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <label className="stack" style={{ gap: 3 }}><span className="note">Nome</span>
              <input className="in" placeholder="ex.: CSLL" maxLength={60} value={novo.nome} onChange={e => setNovo({ ...novo, nome: e.target.value })} /></label>
            <label className="stack" style={{ gap: 3 }}><span className="note">Alíquota (%)</span>
              <input className="in num" style={{ width: 110 }} placeholder="1,00" value={aliqNovo} onChange={e => setAliqNovo(e.target.value)} /></label>
            {APLICA.map(([k, n]) => (
              <label key={k} className="row" style={{ gap: 4 }}><input type="checkbox" checked={novo[k]} onChange={e => setNovo({ ...novo, [k]: e.target.checked })} />{n}</label>
            ))}
            <button className="btn primary" disabled={!novo.nome.trim() || Number.isNaN(parseNum(aliqNovo)) || parseNum(aliqNovo) < 0 || parseNum(aliqNovo) >= 100}
              onClick={async () => { await exec(() => salvarTributo(empresa.id, { ...novo, aliquota: parseNum(aliqNovo) / 100 }), `Tributo ${novo.nome.trim()} criado.`); setNovo(novoTributo()); setAliqNovo(''); }}>
              Adicionar tributo</button>
          </div>
        </div>
      )}
    </section>
  );
}
