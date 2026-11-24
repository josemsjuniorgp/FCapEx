import { useEffect, useMemo, useRef, useState } from 'react';
import { brlCurto } from '../app/ui';
import { normTxt } from '../dominio/normalizacao';

export interface OpcaoGrupo { id: string; item: string; desc: string; n: number; soma: number }

/** Caixa suspensa com busca para escolher o grupo (linha de título) a filtrar na grade. */
export function FiltroGrupo({ opcoes, valor, total, totalItens, onEscolher }: {
  opcoes: OpcaoGrupo[]; valor: string | null; total: number; totalItens: number; onEscolher: (id: string | null) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const caixa = useRef<HTMLDivElement>(null);
  const atual = opcoes.find(o => o.id === valor);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (!caixa.current?.contains(e.target as Node)) setAberto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false); };
    document.addEventListener('mousedown', fora); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc); };
  }, [aberto]);

  const nivelBase = useMemo(() => Math.min(...opcoes.map(o => (o.item.match(/\./g) ?? []).length), 9), [opcoes]);
  const filtradas = opcoes.filter(o => !busca || normTxt(`${o.item} ${o.desc}`).includes(normTxt(busca)));
  const escolher = (id: string | null) => { onEscolher(id); setAberto(false); setBusca(''); };

  return (
    <div className="grupo-filtro" ref={caixa}>
      <button className={'grupo-botao' + (valor ? ' ativo' : '')} aria-haspopup="listbox" aria-expanded={aberto} onClick={() => setAberto(!aberto)}>
        <span className="grupo-rot">Grupo</span>
        <span className="grupo-valor">{atual ? <>{atual.item && <span className="mono">{atual.item} </span>}{atual.desc || 'Título sem nome'}</> : 'Todos os itens'}</span>
        <span className="grupo-n">{atual ? atual.n : totalItens}</span>
        <svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {valor && <button className="grupo-limpar" title="Mostrar todos os itens" aria-label="Mostrar todos os itens" onClick={() => escolher(null)}>×</button>}
      {aberto && (
        <div className="grupo-menu" role="listbox">
          <input className="in" autoFocus placeholder="Buscar grupo por número ou nome…" value={busca} onChange={e => setBusca(e.target.value)} />
          <div className="grupo-lista">
            {!busca && (
              <button role="option" aria-selected={!valor} className={'grupo-op' + (!valor ? ' sel' : '')} onClick={() => escolher(null)}>
                <span className="grupo-op-txt"><b>Todos os itens</b></span><span className="grupo-op-num">{totalItens} · {brlCurto(total)}</span>
              </button>
            )}
            {filtradas.map(o => {
              const nivel = Math.max(0, (o.item.match(/\./g) ?? []).length - nivelBase);
              return (
                <button key={o.id} role="option" aria-selected={valor === o.id} className={'grupo-op' + (valor === o.id ? ' sel' : '')}
                  style={{ paddingLeft: 10 + (busca ? 0 : nivel * 16) }} title={o.desc} onClick={() => escolher(o.id)}>
                  <span className="grupo-op-txt">{o.item && <span className="mono">{o.item}</span>}{o.desc || 'Título sem nome'}</span>
                  <span className="grupo-op-num">{o.n} · {brlCurto(o.soma)}</span>
                </button>
              );
            })}
            {!filtradas.length && <span className="note" style={{ padding: 10 }}>Nenhum grupo encontrado.</span>}
            {!opcoes.length && <span className="note" style={{ padding: 10 }}>Os grupos aparecem a partir das linhas de título importadas da PQ.</span>}
          </div>
        </div>
      )}
    </div>
  );
}
