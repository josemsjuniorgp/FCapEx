import { useEffect, useMemo, useState } from 'react';
import { useSessao } from '../app/Sessao';
import { Dialogo, plural, useAcao } from '../app/ui';
import { baixarArquivo, excluirItensDaRevisao, inserirItens, listarArquivos, type Arquivo, type ItemPos } from '../dados/api';
import { COLUNAS, coluna } from '../dominio/colunas';
import { lerExcel, type AbaLida } from '../dominio/excel';
import { avaliar, contarZerados, destinosIniciais, paraItens, type SituacaoColuna } from '../dominio/pq';

const TIPOS_PQ = ['Planilha de quantidades', 'PX anterior'];
const SIT: Record<SituacaoColuna, [string, string]> = {
  pertinente: ['p-ok', 'Pertinente ao modelo'],
  fora_modelo: ['p-warn', 'Fora do modelo desta PX: ignorada'],
  sem_correspondencia: ['p-mut', 'Sem correspondência: ignorada'],
  ignorada: ['p-mut', 'Ignorada por você'],
  calculada: ['p-info', 'Calculada no sistema: não importa'],
  duplicada: ['p-err', 'Duplicada: escolha só uma'],
};

export function ImportarPq({ empresaId, revisaoId, modelo, itens, onFechar, onImportado }: {
  empresaId: string; revisaoId: string; modelo: Set<string>; itens: ItemPos[];
  onFechar: () => void; onImportado: (novos: ItemPos[], anteriores: ItemPos[] | null) => void;
}) {
  const acao = useAcao();
  const [arquivos, setArquivos] = useState<Arquivo[]>([]);
  const [arq, setArq] = useState<Arquivo | null>(null);
  const [abas, setAbas] = useState<AbaLida[] | null>(null);
  const [aba, setAba] = useState(0);
  const [destinos, setDestinos] = useState<(string | null)[]>([]);
  const [titulos, setTitulos] = useState(true);
  const [zerados, setZerados] = useState(false);   // itens com quantidade zero ou vazia: não importar (padrão)
  const [numeroPq, setNumeroPq] = useState('');
  const [modo, setModo] = useState<'acrescentar' | 'substituir'>('acrescentar');
  const [lendo, setLendo] = useState(false);
  const [gravando, setGravando] = useState(false);

  useEffect(() => { listarArquivos(empresaId).then(setArquivos).catch(() => setArquivos([])); }, [empresaId]);
  const elegiveis = arquivos.filter(a => TIPOS_PQ.includes(a.tipo) && /\.xlsx$/i.test(a.nome));

  async function escolher(a: Arquivo) {
    setArq(a); setLendo(true); setAbas(null);
    await acao(async () => {
      const l = await lerExcel(await baixarArquivo(a));
      if (!l.length) throw new Error(`Não encontrei itens com numeração (1.1.1…) em ${a.nome}.`);
      setAbas(l); setAba(0); setDestinos(destinosIniciais(l[0].planilha));
      setNumeroPq(a.nome.replace(/\.xlsx$/i, ''));
    });
    setLendo(false);
  }
  const bdis = useSessao().parametros?.bdis ?? [];
  const planilha = abas?.[aba]?.planilha;
  const av = useMemo(() => (planilha ? avaliar(planilha, destinos, modelo) : null), [planilha, destinos, modelo]);
  const previa = useMemo(() => (planilha && av
    ? paraItens(planilha, destinos, av, { incluirTitulos: titulos, numeroPq, seqInicial: 1, novoId: () => '', bdis, incluirZerados: zerados })
    : []), [planilha, destinos, av, titulos, numeroPq, bdis, zerados]);
  const nZerados = useMemo(() => (planilha && av ? contarZerados(planilha, destinos, av) : 0), [planilha, destinos, av]);
  const entradas = COLUNAS.filter(c => c.t === 'in');

  async function importar() {
    if (!planilha || !av) return;
    setGravando(true);
    const substituir = modo === 'substituir';
    const seq0 = substituir ? 1 : Math.max(0, ...itens.map(i => i.seq)) + 1;
    const pos0 = substituir ? 0 : Math.max(0, ...itens.map(i => i.posicao));
    const novos = paraItens(planilha, destinos, av, { incluirTitulos: titulos, numeroPq, seqInicial: seq0, novoId: () => crypto.randomUUID(), bdis, incluirZerados: zerados })
      .map((it, i) => ({ ...it, posicao: pos0 + i + 1 }));
    const okk = await acao(async () => {
      if (substituir) await excluirItensDaRevisao(revisaoId);
      await inserirItens(empresaId, revisaoId, novos);
    }, `${plural(novos.filter(i => !i.titulo).length, 'item importado', 'itens importados')}${titulos ? ` e ${plural(novos.filter(i => i.titulo).length, 'título', 'títulos')}` : ''}.`);
    setGravando(false);
    if (okk) onImportado(novos, substituir ? itens : null);
  }

  return (
    <Dialogo titulo="Importar PQ" onFechar={onFechar}>
      {!arq && (
        <div className="stack">
          <span className="note">Escolha uma planilha de quantidades (.xlsx) da biblioteca.
            {arquivos.length > elegiveis.length && ` ${plural(arquivos.length - elegiveis.length, 'arquivo de outro tipo foi omitido', 'arquivos de outros tipos foram omitidos')}.`}</span>
          <div className="list">
            {elegiveis.map(a => (
              <button key={a.id} className="projcard" onClick={() => escolher(a)}>
                <strong>{a.nome}</strong><span className="note">{a.tipo}{a.itens_lidos ? ` · ${plural(a.itens_lidos, 'item', 'itens')}` : ''}</span>
              </button>
            ))}
            {!elegiveis.length && <span className="note">Nenhuma planilha na biblioteca. Envie a PQ em Biblioteca primeiro.</span>}
          </div>
        </div>
      )}
      {arq && lendo && <p className="note">Lendo {arq.nome}…</p>}
      {arq && !lendo && !abas && <button className="btn" onClick={() => setArq(null)}>← Escolher outro arquivo</button>}
      {arq && abas && planilha && av && (
        <div className="stack">
          <div className="row">
            <button className="linkbtn" onClick={() => { setArq(null); setAbas(null); }}>← Outro arquivo</button>
            <strong>{arq.nome}</strong>
            {abas.length > 1 && (
              <select value={aba} onChange={e => { const i = +e.target.value; setAba(i); setDestinos(destinosIniciais(abas[i].planilha)); }}>
                {abas.map((a, i) => <option key={a.nome} value={i}>Aba "{a.nome}" · {a.planilha.linhas.length} linhas</option>)}
              </select>
            )}
            <span className="note">{planilha.linhaCabecalho ? `Cabeçalho na linha ${planilha.linhaCabecalho}` : 'Sem cabeçalho: colunas deduzidas pelo conteúdo'}</span>
          </div>
          <div className="cover">
            <b className="pct">{av.compatibilidade}%</b>
            <span className={'pill ' + (av.compatibilidade >= 70 ? 'p-ok' : av.compatibilidade >= 40 ? 'p-warn' : 'p-err')}>
              {av.compatibilidade >= 70 ? 'Compatível' : av.compatibilidade >= 40 ? 'Parcialmente compatível' : 'Pouco compatível'}</span>
            <span className="note">das colunas de entrada do modelo desta PX são preenchidas pelo arquivo.</span>
          </div>
          {av.faltandoObrigatorias.length > 0 && (
            <div className="banner">Colunas obrigatórias que o arquivo não traz (entram em branco e aparecem como pendência):{' '}
              {av.faltandoObrigatorias.map(k => coluna(k)!.h).join(', ')}.</div>
          )}
          {av.bloqueios.map(b => <div key={b} className="confirm">{b}</div>)}
          <div className="scroll-x">
            <table className="t">
              <thead><tr><th>Coluna do arquivo</th><th>Destino na PX</th><th>Avaliação</th></tr></thead>
              <tbody>
                {planilha.colunas.map((sc, i) => (
                  <tr key={sc.i}>
                    <td>{sc.h}{sc.deduzida && <span className="note"> · deduzida pelo conteúdo</span>}</td>
                    <td>
                      <select value={destinos[i] ?? ''} onChange={e => { const d = [...destinos]; d[i] = e.target.value || null; setDestinos(d); }}>
                        <option value="">— ignorar —</option>
                        {destinos[i] === '__calc' && <option value="__calc">calculada no sistema</option>}
                        {entradas.map(c => <option key={c.k} value={c.k}>{c.h}</option>)}
                      </select>
                    </td>
                    <td><span className={'pill ' + SIT[av.situacao[i]][0]}>{SIT[av.situacao[i]][1]}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <label className="fld">Documento de Origem (vai para a coluna "Documento de Origem")
              <input className="in" value={numeroPq} onChange={e => setNumeroPq(e.target.value)} />
            </label>
            <label className="row"><input type="checkbox" checked={titulos} onChange={e => setTitulos(e.target.checked)} />
              Importar também as linhas de título ({av.titulos})</label>
            {nZerados > 0 && (
              <label className="row" title="Itens cuja quantidade é zero ou está vazia na planilha">
                <input type="checkbox" checked={zerados} onChange={e => setZerados(e.target.checked)} />
                Importar linhas com quantidade zero ou vazia ({nZerados})</label>
            )}
          </div>
          <div className="row">
            <label className="row"><input type="radio" checked={modo === 'acrescentar'} onChange={() => setModo('acrescentar')} />Acrescentar no fim, na ordem da PQ</label>
            <label className="row"><input type="radio" checked={modo === 'substituir'} onChange={() => setModo('substituir')} />Substituir todos os itens da PX ({itens.length})</label>
          </div>
          <strong>Prévia ({plural(previa.length, 'linha', 'linhas')})</strong>
          <div className="scroll-x">
            <table className="t">
              <thead><tr><th>Item PQ</th><th>Descrição</th><th>Unid</th><th className="num">Quantidade</th><th>Área</th><th>Subárea</th></tr></thead>
              <tbody>
                {previa.slice(0, 8).map((p, i) => (
                  <tr key={i} style={p.titulo ? { fontWeight: 600, background: 'var(--calc)' } : undefined}>
                    <td className="mono">{p.item}</td><td>{p.desc}</td><td>{p.un}</td>
                    <td className="num">{p.qtd ?? ''}</td><td>{p.area}</td><td>{p.subarea}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row">
            <span className="spacer" /><button className="btn" onClick={onFechar}>Cancelar</button>
            <button className="btn primary" disabled={!!av.bloqueios.length || !previa.length || gravando} onClick={importar}>
              {gravando ? 'Importando…' : `Importar ${plural(previa.length, 'linha', 'linhas')}`}</button>
          </div>
        </div>
      )}
    </Dialogo>
  );
}
