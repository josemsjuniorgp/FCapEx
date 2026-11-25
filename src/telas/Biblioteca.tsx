import { useCallback, useEffect, useState } from 'react';
import { useSessao } from '../app/Sessao';
import { Confirmar, dataHora, nf, plural, useAcao, useAviso } from '../app/ui';
import {
  criarPasta, enviarArquivo, excluirArquivo, excluirPasta, listarArquivos, listarPastas, moverArquivo,
  type Arquivo, type Pasta,
} from '../dados/api';
import { lerExcel } from '../dominio/excel';

const TIPOS = ['Planilha de quantidades', 'Mapa anterior', 'Cotação', 'Memorial', 'Cronograma', 'Outro'];
const ICONE = <svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>;
type Vista = '*' | '' | string; // * = todos, '' = sem pasta

export function Biblioteca() {
  const { empresa, podeEditar } = useSessao();
  const acao = useAcao();
  const avisar = useAviso();
  const [pastas, setPastas] = useState<Pasta[]>([]);
  const [arquivos, setArquivos] = useState<Arquivo[]>([]);
  const [vista, setVista] = useState<Vista>('*');
  const [nova, setNova] = useState('');
  const [perguntar, setPerguntar] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(0);
  const [sobre, setSobre] = useState(false);

  const carregar = useCallback(async () => {
    if (!empresa) return;
    const [p, a] = await Promise.all([listarPastas(empresa.id), listarArquivos(empresa.id)]);
    setPastas(p); setArquivos(a);
  }, [empresa]);
  useEffect(() => { carregar(); }, [carregar]);

  const conta = (v: Vista) => arquivos.filter(a => v === '*' || (a.pasta_id ?? '') === v).length;
  const lista = arquivos.filter(a => vista === '*' || (a.pasta_id ?? '') === vista);

  async function enviar(files: FileList | File[]) {
    if (!empresa) return;
    for (const f of Array.from(files)) {
      setEnviando(n => n + 1);
      let itens: number | null = null, tipo = 'Outro', situacao = 'Pronto';
      if (/\.xlsx$/i.test(f.name)) {
        tipo = 'Planilha de quantidades';
        try {
          const abas = await lerExcel(await f.arrayBuffer());
          itens = abas[0]?.planilha.linhas.filter(l => !l.titulo).length ?? 0;
          if (abas[0]?.planilha.colunas.some(c => ['trib', 'parc', 'ger'].includes(c.auto ?? ''))) tipo = 'Mapa anterior';
          if (!abas.length) situacao = 'Sem itens reconhecidos';
        } catch { situacao = 'Revisar extração'; }
      } else if (/\.xls$/i.test(f.name)) { situacao = 'Formato .xls antigo: salve como .xlsx para importar'; }
      await acao(() => enviarArquivo(empresa.id, vista === '*' || vista === '' ? null : vista, f, { tipo, itens, situacao }),
        `${f.name}: ${itens !== null ? plural(itens, 'item lido', 'itens lidos') : 'enviado'}.`);
      setEnviando(n => n - 1);
    }
    carregar();
  }

  async function addPasta() {
    if (!empresa || !nova.trim()) return;
    if (pastas.some(p => p.nome.toLowerCase() === nova.trim().toLowerCase())) { avisar('Já existe uma pasta com esse nome.'); return; }
    if (await acao(() => criarPasta(empresa.id, nova))) { setNova(''); carregar(); }
  }
  async function apagarPasta(p: Pasta, comArquivos: boolean) {
    setPerguntar(null);
    const ok = await acao(async () => {
      if (comArquivos) for (const a of arquivos.filter(x => x.pasta_id === p.id)) await excluirArquivo(a);
      await excluirPasta(p.id);
    }, `Pasta "${p.nome}" excluída.`);
    if (ok) { if (vista === p.id) setVista('*'); carregar(); }
  }

  return (
    <div className="stack">
      <h1>Biblioteca de referência</h1>
      <div className="libwrap">
        <aside className="card folders">
          <div className="f"><button className="nm" aria-pressed={vista === '*'} onClick={() => setVista('*')}><span>{ICONE}Todos os arquivos</span><span className="c">{conta('*')}</span></button></div>
          <div className="f"><button className="nm" aria-pressed={vista === ''} onClick={() => setVista('')}><span>{ICONE}Sem pasta</span><span className="c">{conta('')}</span></button></div>
          <hr />
          {pastas.map(p => (
            <div key={p.id}>
              <div className="f">
                <button className="nm" aria-pressed={vista === p.id} onClick={() => setVista(p.id)}><span>{ICONE}{p.nome}</span><span className="c">{conta(p.id)}</span></button>
                {podeEditar && <button className="btn small danger" aria-label={`Excluir pasta ${p.nome}`} onClick={() => setPerguntar('p:' + p.id)}>Excluir</button>}
              </div>
              {perguntar === 'p:' + p.id && (conta(p.id)
                ? <div className="confirm"><span>A pasta <b>{p.nome}</b> tem {plural(conta(p.id), 'arquivo', 'arquivos')}.</span>
                    <div className="row">
                      <button className="btn small" onClick={() => apagarPasta(p, false)}>Mover para "Sem pasta"</button>
                      <button className="btn small dz" onClick={() => apagarPasta(p, true)}>Excluir tudo</button>
                      <button className="btn small" onClick={() => setPerguntar(null)}>Cancelar</button>
                    </div></div>
                : <Confirmar msg={<>Excluir a pasta <b>{p.nome}</b>?</>} sim="Excluir" onSim={() => apagarPasta(p, false)} onNao={() => setPerguntar(null)} />)}
            </div>
          ))}
          {podeEditar && (
            <div className="row" style={{ padding: '8px 4px' }}>
              <input className="in" style={{ flex: 1, minWidth: 0 }} placeholder="Nova pasta" value={nova}
                onChange={e => setNova(e.target.value)} onKeyDown={e => e.key === 'Enter' && addPasta()} />
              <button className="btn small" onClick={addPasta} disabled={!nova.trim()}>Criar pasta</button>
            </div>
          )}
        </aside>
        <section className="stack">
          {podeEditar && (
            <div className={'drop' + (sobre ? ' over' : '')} onDragOver={e => { e.preventDefault(); setSobre(true); }}
              onDragLeave={() => setSobre(false)} onDrop={e => { e.preventDefault(); setSobre(false); enviar(e.dataTransfer.files); }}>
              Arraste arquivos aqui ou <label>escolha no computador<input type="file" multiple hidden onChange={e => e.target.files && enviar(e.target.files)} /></label>.
              {' '}Planilhas .xlsx são lidas para contar os itens.{enviando > 0 && <b> Enviando {enviando}…</b>}
            </div>
          )}
          <div className="card scroll-x">
            <table className="t">
              <thead><tr><th>Arquivo</th><th>Pasta</th><th>Tipo</th><th className="num">Itens</th><th>Situação</th><th>Enviado</th><th /></tr></thead>
              <tbody>
                {lista.map(a => (
                  <tr key={a.id}>
                    <td><strong>{a.nome}</strong></td>
                    <td>{podeEditar
                      ? <select value={a.pasta_id ?? ''} onChange={async e => { if (await acao(() => moverArquivo(a.id, e.target.value || null))) carregar(); }}>
                          <option value="">Sem pasta</option>{pastas.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}</select>
                      : pastas.find(p => p.id === a.pasta_id)?.nome ?? 'Sem pasta'}</td>
                    <td>{a.tipo}{!TIPOS.includes(a.tipo) && ''}</td>
                    <td className="num">{a.itens_lidos !== null ? nf(a.itens_lidos, 0) : '—'}</td>
                    <td><span className={'pill ' + (a.situacao === 'Pronto' ? 'p-ok' : 'p-warn')}>{a.situacao}</span></td>
                    <td className="note">{dataHora(a.enviado_em)}</td>
                    <td>{podeEditar && (perguntar === 'a:' + a.id
                      ? <Confirmar msg="Excluir este arquivo?" sim="Excluir" onNao={() => setPerguntar(null)}
                          onSim={async () => { setPerguntar(null); if (await acao(() => excluirArquivo(a), 'Arquivo excluído.')) carregar(); }} />
                      : <button className="btn small danger" onClick={() => setPerguntar('a:' + a.id)}>Excluir</button>)}</td>
                  </tr>
                ))}
                {!lista.length && <tr><td colSpan={7} className="note">Nenhum arquivo aqui.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
