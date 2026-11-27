import { useEffect, useState } from 'react';
import { Confirmar, nf } from '../app/ui';
import { parseNum } from '../dominio/normalizacao';
import { ORIGENS } from '../dominio/maturidade';
import { problemaLinha, type LinhaEstudo, type Premissas, type Secao } from '../dominio/viabilidade';
import type { Moeda } from '../dados/api';

const ROTULO: Record<Secao, { desc: string; valor: string; vazio: string }> = {
  opex: { desc: 'Descrição do custo', valor: 'Custo anual base (R$)', vazio: 'Nenhum custo de operação ainda. Use "Inserir linha".' },
  receita: { desc: 'Produto ou serviço vendido', valor: 'Receita líquida anual base (R$)', vazio: 'Nenhuma receita ainda. Use "Inserir linha".' },
  economia: { desc: 'Custo atual evitado (sem o projeto)', valor: 'Economia anual base (R$)', vazio: 'Nenhuma economia ainda. Use "Inserir linha".' },
};

/** Valor anual "base" da linha: quantidade × preço × câmbio (− dedução), sem rampa nem reajuste. */
const valorBase = (l: LinhaEstudo, cambio: Record<string, number | null>) =>
  l.titulo || l.quantidade === null || l.preco === null ? null
    : l.quantidade * l.preco * (cambio[l.moeda] ?? (l.moeda === 'BRL' ? 1 : 0)) * (l.secao === 'receita' ? 1 - l.deducao : 1);

/** Grade de linhas de uma seção do estudo (OpEx, Receitas ou Economias). Grava ao sair do campo. */
export function GradeEstudo({ secao, linhas, premissas, moedas, cambio, editavel, onSalvar, onInserir, onExcluir }: {
  secao: Secao; linhas: LinhaEstudo[]; premissas: Premissas; moedas: Moeda[]; cambio: Record<string, number | null>; editavel: boolean;
  onSalvar: (id: string, campos: Partial<LinhaEstudo>) => void;
  onInserir: (depoisDe: string | null) => void;
  onExcluir: (id: string) => void;
}) {
  const [sel, setSel] = useState<string | null>(null);
  const [apagar, setApagar] = useState<string | null>(null);
  const r = ROTULO[secao];
  const primeiro = premissas.anosObra + 1, ultimo = premissas.anosObra + premissas.anosOperacao;
  const total = linhas.reduce((s, l) => s + (valorBase(l, cambio) ?? 0), 0);
  const fixo = linhas.filter(l => l.comportamento === 'fixo').reduce((s, l) => s + (valorBase(l, cambio) ?? 0), 0);
  let n = 0;
  // larguras (px): Nº, Item, Descrição, Fixo/Var, Unid, Qtd, Preço, Moeda, [Dedução], Início, Fim, Reajuste, Origem, Valor, [Ações]
  const larguras = [46, 50, 220, 100, 66, 104, 112, 72, ...(secao === 'receita' ? [86] : []), 66, 66, 84, 150, 140, ...(editavel ? [84] : [])];
  return (
    <div className="estudo-grade">
      {editavel && (
        <div className="tools" style={{ padding: '0 0 10px', border: 0, background: 'none' }}>
          <button className="btn" onClick={() => onInserir(sel)}>Inserir linha</button>
          {sel && <button className="btn" onClick={() => { const l = linhas.find(x => x.id === sel); if (l) onSalvar(l.id, { titulo: !l.titulo }); }}>
            {linhas.find(x => x.id === sel)?.titulo ? 'Virar linha' : 'Virar título'}</button>}
          <span className="note">Clique numa linha para escolher onde inserir. Títulos agrupam (ex.: PESSOAL, ENERGIA).</span>
        </div>
      )}
      <div className="gridwrap estudo-wrap">
        <table className="grid estudo-tab" style={{ tableLayout: 'fixed', width: larguras.reduce((x, y) => x + y, 0) }}>
          <colgroup>{larguras.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
          <thead>
            <tr className="g">
              <th colSpan={3}>Identificação</th><th colSpan={secao === 'receita' ? 6 : 5}>Valor</th><th colSpan={3}>Período e reajuste</th>
              <th>Cotação</th><th>Resultado</th>{editavel && <th />}
            </tr>
            <tr className="h">
              <th>Nº</th><th>Item</th><th>{r.desc}</th><th>Fixo / Variável</th><th>Unid</th><th>Quantidade por ano</th><th>Preço unit.</th><th>Moeda</th>
              {secao === 'receita' && <th title="Impostos e deduções sobre a venda (PIS, COFINS, ICMS…)">Dedução s/ venda</th>}
              <th>Ano inicial</th><th>Ano final</th><th title="Quanto sobe acima da inflação, por ano">Reajuste real a.a.</th>
              <th>Origem do preço</th><th>{r.valor}</th>{editavel && <th />}
            </tr>
          </thead>
          <tbody>
            {linhas.map(l => {
              n++;
              const prob = problemaLinha(l, cambio);
              const v = valorBase(l, cambio);
              const salvar = (c: Partial<LinhaEstudo>) => onSalvar(l.id, c);
              if (l.titulo) return (
                <tr key={l.id} className={'title nv1' + (sel === l.id ? ' sel' : '')} onClick={() => setSel(l.id)}>
                  <td className="centro">{n}</td>
                  <td className="in-c centro">{editavel ? <Texto valor={l.item} onSalvar={x => salvar({ item: x })} /> : l.item}</td>
                  <td className="in-c">{editavel ? <Texto valor={l.descricao} onSalvar={x => salvar({ descricao: x })} /> : l.descricao}</td>
                  <td colSpan={secao === 'receita' ? 11 : 10} />
                  {editavel && <Acoes id={l.id} apagar={apagar} setApagar={setApagar} onExcluir={onExcluir} />}
                </tr>
              );
              return (
                <tr key={l.id} className={sel === l.id ? 'sel' : ''} onClick={() => setSel(l.id)}>
                  <td className="centro mono">{n}</td>
                  <td className="in-c centro">{editavel ? <Texto valor={l.item} onSalvar={x => salvar({ item: x })} /> : l.item}</td>
                  <td className={'in-c' + (!l.descricao ? ' miss' : '')}>{editavel ? <Texto valor={l.descricao} onSalvar={x => salvar({ descricao: x })} /> : l.descricao}</td>
                  <td className="in-c">{editavel
                    ? <select value={l.comportamento} aria-label="Fixo ou variável" onChange={e => salvar({ comportamento: e.target.value as LinhaEstudo['comportamento'] })}>
                        <option value="fixo">Fixo</option><option value="variavel">Variável</option></select>
                    : l.comportamento === 'fixo' ? 'Fixo' : 'Variável'}</td>
                  <td className="in-c centro">{editavel ? <Texto valor={l.unidade} onSalvar={x => salvar({ unidade: x })} /> : l.unidade}</td>
                  <td className={'in-c' + (l.quantidade === null ? ' miss' : '')}><Numero valor={l.quantidade} dec={2} editavel={editavel} onSalvar={x => salvar({ quantidade: x })} /></td>
                  <td className={'in-c' + (l.preco === null ? ' miss' : '')}><Numero valor={l.preco} dec={2} editavel={editavel} onSalvar={x => salvar({ preco: x })} /></td>
                  <td className="in-c">{editavel
                    ? <select value={l.moeda} aria-label="Moeda" onChange={e => salvar({ moeda: e.target.value })}>
                        {moedas.map(m => <option key={m.codigo} value={m.codigo}>{m.codigo}</option>)}
                        {!moedas.some(m => m.codigo === l.moeda) && <option value={l.moeda}>{l.moeda}</option>}</select>
                    : l.moeda}</td>
                  {secao === 'receita' && <td className="in-c"><Numero valor={l.deducao} pct editavel={editavel} onSalvar={x => salvar({ deducao: x ?? 0 })} /></td>}
                  <td className="in-c"><Numero valor={l.anoInicio} dec={0} editavel={editavel} placeholder={String(primeiro)} onSalvar={x => salvar({ anoInicio: x === null ? null : Math.round(x) })} /></td>
                  <td className="in-c"><Numero valor={l.anoFim} dec={0} editavel={editavel} placeholder={String(ultimo)} onSalvar={x => salvar({ anoFim: x === null ? null : Math.round(x) })} /></td>
                  <td className="in-c"><Numero valor={l.reajuste} pct editavel={editavel} onSalvar={x => salvar({ reajuste: x ?? 0 })} /></td>
                  <td className="in-c">{editavel
                    ? <select value={l.origem} aria-label="Origem do preço" onChange={e => salvar({ origem: e.target.value })}>
                        <option value="">escolher</option>{ORIGENS.map(o => <option key={o.k} value={o.k}>{o.nome}</option>)}</select>
                    : ORIGENS.find(o => o.k === l.origem)?.nome ?? ''}</td>
                  <td className="calc" title={prob ?? undefined}>{prob ? <span className="pill p-warn"><i />{prob}</span> : v === null ? '—' : nf(v, 2)}</td>
                  {editavel && <Acoes id={l.id} apagar={apagar} setApagar={setApagar} onExcluir={onExcluir} />}
                </tr>
              );
            })}
            {!!linhas.length && (
              <tr className="estudo-total">
                <td /><td /><td>TOTAL (ano base)</td>
                <td colSpan={secao === 'receita' ? 10 : 9} className="note">
                  {secao === 'opex' ? `Fixo R$ ${nf(fixo, 2)} · Variável R$ ${nf(total - fixo, 2)}` : ''}
                  {' '}Valores sem rampa nem reajuste; o ano a ano está em Resultados.</td>
                <td className="num">{nf(total, 2)}</td>{editavel && <td />}
              </tr>
            )}
          </tbody>
        </table>
        {!linhas.length && <div className="note" style={{ padding: 20 }}>{r.vazio}</div>}
      </div>
    </div>
  );
}

function Acoes({ id, apagar, setApagar, onExcluir }: { id: string; apagar: string | null; setApagar: (x: string | null) => void; onExcluir: (id: string) => void }) {
  return (
    <td className="rowdel">
      {apagar === id
        ? <Confirmar msg="Excluir esta linha?" sim="Excluir" onSim={() => { setApagar(null); onExcluir(id); }} onNao={() => setApagar(null)} />
        : <button className="btn small danger" onClick={e => { e.stopPropagation(); setApagar(id); }}>Excluir</button>}
    </td>
  );
}

/** Texto que grava ao sair (ou Enter); Esc desfaz. */
function Texto({ valor, onSalvar }: { valor: string; onSalvar: (v: string) => void }) {
  const [v, setV] = useState(valor);
  useEffect(() => setV(valor), [valor]);
  return <input value={v} onChange={e => setV(e.target.value)} onBlur={() => { if (v !== valor) onSalvar(v.trim()); }}
    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLElement).blur(); if (e.key === 'Escape') { setV(valor); (e.target as HTMLElement).blur(); } }} />;
}

/** Número (ou % quando pct) que grava ao sair; vazio = null. */
function Numero({ valor, dec = 2, pct, editavel, placeholder, onSalvar }: {
  valor: number | null; dec?: number; pct?: boolean; editavel: boolean; placeholder?: string; onSalvar: (v: number | null) => void;
}) {
  const mostra = valor === null || valor === undefined ? '' : pct ? nf(valor * 100, 1) + '%' : nf(valor, dec);
  const [v, setV] = useState(mostra);
  useEffect(() => setV(mostra), [mostra]);
  if (!editavel) return <span className="num" style={{ display: 'block', padding: '0 8px' }}>{mostra}</span>;
  return <input className="numi" value={v} placeholder={placeholder} onChange={e => setV(e.target.value)}
    onBlur={() => {
      if (v === mostra) return;
      const x = parseNum(v.replace('%', ''));
      onSalvar(v.trim() === '' || Number.isNaN(x) ? null : pct ? x / 100 : x);
    }}
    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLElement).blur(); if (e.key === 'Escape') { setV(mostra); (e.target as HTMLElement).blur(); } }} />;
}
