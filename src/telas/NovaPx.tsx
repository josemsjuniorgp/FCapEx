import { useEffect, useMemo, useState } from 'react';
import { useSessao } from '../app/Sessao';
import { Dialogo, useAcao, useAviso } from '../app/ui';
import {
  criarPx, inserirItens, listarItens, listarModelos, listarRevisoes, salvarModelo,
  type Modelo, type Projeto, type Px,
} from '../dados/api';
import { COLUNAS, OBRIGATORIAS } from '../dominio/colunas';
import { colunasDoModelo } from '../dominio/excel';

type Modo = { tipo: 'modelo'; id: string } | { tipo: 'montar' } | { tipo: 'importar' };
const GRUPOS = [...new Set(COLUNAS.map(c => c.g))];

export function NovaPx({ projetos, pxs, projetoInicial, onFechar, onCriada }: {
  projetos: Projeto[]; pxs: Px[]; projetoInicial?: string; onFechar: () => void; onCriada: (id: string) => void;
}) {
  const { empresa, podeEditar } = useSessao();
  const acao = useAcao();
  const avisar = useAviso();
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [nome, setNome] = useState('');
  const [projeto, setProjeto] = useState(projetoInicial ?? projetos[0]?.id ?? '');
  const [modo, setModo] = useState<Modo | null>(null);
  const [cols, setCols] = useState<Set<string>>(new Set(COLUNAS.map(c => c.k)));
  const [arquivo, setArquivo] = useState('');
  const [salvar, setSalvar] = useState(false);
  const [nomeModelo, setNomeModelo] = useState('');
  const [copiarDe, setCopiarDe] = useState('');
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    listarModelos().then(m => { setModelos(m); if (m[0]) setModo({ tipo: 'modelo', id: m[0].id }); });
  }, []);

  const colunasFinais = useMemo(() => {
    if (modo?.tipo === 'modelo') return modelos.find(m => m.id === modo.id)?.colunas ?? [];
    return COLUNAS.map(c => c.k).filter(k => cols.has(k) || OBRIGATORIAS.includes(k));
  }, [modo, modelos, cols]);

  async function importarModelo(f: File) {
    try {
      const achadas = new Set<string>([...OBRIGATORIAS, ...await colunasDoModelo(await f.arrayBuffer())]);
      if (achadas.size === OBRIGATORIAS.length) { avisar('Não encontrei cabeçalhos reconhecíveis no arquivo.'); return; }
      setCols(achadas); setArquivo(f.name); setNomeModelo(f.name.replace(/\.xlsx$/i, ''));
      avisar(`${achadas.size} colunas reconhecidas em ${f.name}. Ajuste a seleção se precisar.`);
    } catch { avisar(`Não consegui ler ${f.name}. Use um arquivo .xlsx sem senha.`); }
  }

  async function criar() {
    if (!empresa || !nome.trim() || !projeto || !modo) return;
    setOcupado(true);
    let id = '';
    const nomeMod = modo.tipo === 'modelo' ? modelos.find(m => m.id === modo.id)!.nome
      : (salvar && nomeModelo.trim()) ? nomeModelo.trim() : modo.tipo === 'importar' ? `Importado de ${arquivo}` : 'Montado no sistema';
    const okk = await acao(async () => {
      if (modo.tipo !== 'modelo' && salvar && nomeModelo.trim()) await salvarModelo(empresa.id, nomeModelo.trim(), colunasFinais);
      id = await criarPx(projeto, nome.trim(), nomeMod, colunasFinais);
      if (copiarDe) {
        const origem = (await listarRevisoes(copiarDe)).find(r => !r.emitida_em)!;
        const destino = (await listarRevisoes(id))[0];
        const itens = (await listarItens(origem.id)).map(it => ({ ...it, id: crypto.randomUUID() }));
        await inserirItens(empresa.id, destino.id, itens);
      }
    });
    setOcupado(false);
    if (okk) onCriada(id);
  }

  if (!podeEditar) return null;
  const opt = (chave: string, ativo: boolean, onEscolher: () => void, titulo: string, desc: string) => (
    <label className="mopt" key={chave}>
      <input type="radio" name="modelo" checked={ativo} onChange={onEscolher} />
      <span><b>{titulo}</b><small>{desc}</small></span>
    </label>
  );

  return (
    <Dialogo titulo="Nova PX" onFechar={onFechar}>
      <div className="pxform stack">
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <label className="fld" style={{ flex: 2, minWidth: 220 }}>Nome da PX (obrigatório)
            <input className="in" autoFocus value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex.: Estimativa classe 3" />
          </label>
          <label className="fld" style={{ flex: 1, minWidth: 200 }}>Projeto
            <select value={projeto} onChange={e => setProjeto(e.target.value)}>
              {projetos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </label>
        </div>
        <span className="note">O código (PX-0001, PX-0002…) é gerado automaticamente e nasce na Rev 0.</span>

        <strong>Modelo</strong>
        <div className="mopts">
          {modelos.map(m => opt(m.id, modo?.tipo === 'modelo' && modo.id === m.id, () => setModo({ tipo: 'modelo', id: m.id }),
            m.nome, `${m.colunas.length} colunas${m.empresa_id ? ' · modelo da empresa' : ''}`))}
          {opt('importar', modo?.tipo === 'importar', () => setModo({ tipo: 'importar' }), 'Importar modelo', 'Lê as colunas de um Excel')}
          {opt('montar', modo?.tipo === 'montar', () => setModo({ tipo: 'montar' }), 'Montar no sistema', 'Escolha as colunas')}
        </div>

        {modo?.tipo === 'importar' && (
          <label className="fld">Arquivo do modelo (.xlsx){arquivo && <span> — {arquivo}</span>}
            <input type="file" accept=".xlsx" onChange={e => e.target.files?.[0] && importarModelo(e.target.files[0])} />
          </label>
        )}
        {modo && modo.tipo !== 'modelo' && (
          <>
            <div className="colpick">
              {GRUPOS.map(g => (
                <div className="group-box" key={g}><strong>{g}</strong>
                  {COLUNAS.filter(c => c.g === g).map(c => {
                    const fixa = OBRIGATORIAS.includes(c.k);
                    return (
                      <label key={c.k}>
                        <input type="checkbox" disabled={fixa} checked={fixa || cols.has(c.k)}
                          onChange={e => { const s = new Set(cols); if (e.target.checked) s.add(c.k); else s.delete(c.k); setCols(s); }} />
                        {c.h}{fixa && <span className="k">sempre</span>}
                      </label>
                    );
                  })}
                </div>
              ))}
            </div>
            <label className="row"><input type="checkbox" checked={salvar} onChange={e => setSalvar(e.target.checked)} />
              Salvar como modelo da empresa
              {salvar && <input className="in" value={nomeModelo} onChange={e => setNomeModelo(e.target.value)} placeholder="Nome do modelo" />}
            </label>
          </>
        )}

        <label className="fld">Começar de
          <select value={copiarDe} onChange={e => setCopiarDe(e.target.value)}>
            <option value="">PX vazia (importe a PQ depois)</option>
            {pxs.map(x => <option key={x.id} value={x.id}>Copiar itens de {x.codigo} · {x.nome}</option>)}
          </select>
        </label>

        <div className="row">
          <span className="note">{colunasFinais.length} colunas</span><span className="spacer" />
          <button className="btn" onClick={onFechar}>Cancelar</button>
          <button className="btn primary" disabled={!nome.trim() || !projeto || !modo || ocupado || (modo.tipo === 'importar' && !arquivo)} onClick={criar}>
            Criar PX
          </button>
        </div>
      </div>
    </Dialogo>
  );
}
