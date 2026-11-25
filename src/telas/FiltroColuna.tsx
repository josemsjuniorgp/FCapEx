import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { parseNum } from '../dominio/normalizacao';
import type { Coluna } from '../dominio/colunas';
import { NOME_OP_NUMERO, NOME_OP_TEXTO, type FiltroColuna as Filtro, type OpNumero, type OpTexto } from '../dominio/filtros';

const LIMITE_LISTA = 400;
const nf = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 6 });

/** Botão de funil no cabeçalho da coluna + janela de filtro (lista de valores ou condição), como no Excel. */
export function FiltroColuna({ c, numerica, ativo, valores, onAplicar }: {
  c: Coluna; numerica: boolean; ativo?: Filtro;
  /** valores distintos da coluna (já considerando os filtros das outras colunas), calculados ao abrir */
  valores: () => { valor: string; n: number }[];
  onAplicar: (f: Filtro | null) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={btn} type="button" className={'filtro-btn' + (ativo ? ' on' : '')} aria-label={`Filtrar ${c.h}`} aria-pressed={!!ativo}
        title={ativo ? `Filtro ativo em ${c.h}` : `Filtrar ${c.h}`} aria-expanded={aberto}
        onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); setAberto(!aberto); }}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18l-7 8v6l-4 2v-8z" /></svg>
      </button>
      {aberto && <Janela c={c} numerica={numerica} ativo={ativo} valores={valores} ancora={btn.current!}
        onFechar={() => setAberto(false)} onAplicar={f => { setAberto(false); onAplicar(f); }} />}
    </>
  );
}

function Janela({ c, numerica, ativo, valores, ancora, onFechar, onAplicar }: {
  c: Coluna; numerica: boolean; ativo?: Filtro; valores: () => { valor: string; n: number }[]; ancora: HTMLElement;
  onFechar: () => void; onAplicar: (f: Filtro | null) => void;
}) {
  const lista = useMemo(valores, []); // eslint-disable-line react-hooks/exhaustive-deps
  const todos = lista.map(v => v.valor);
  const [marcados, setMarcados] = useState<Set<string>>(() => new Set(ativo?.tipo === 'valores' ? ativo.valores : todos));
  const [busca, setBusca] = useState('');
  const [op, setOp] = useState<string>(ativo && ativo.tipo !== 'valores' ? ativo.op : '');
  const [txt, setTxt] = useState(ativo?.tipo === 'texto' ? ativo.valor : '');
  const [a, setA] = useState(ativo?.tipo === 'numero' && ativo.a !== undefined ? nf(ativo.a) : '');
  const [b, setB] = useState(ativo?.tipo === 'numero' && ativo.b !== undefined ? nf(ativo.b) : '');
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });

  // posição junto ao funil; acompanha quando a grade rola
  const posicionar = useCallback(() => {
    const r = ancora.getBoundingClientRect(), w = ref.current?.offsetWidth ?? 300, h = ref.current?.offsetHeight ?? 400;
    if (r.right < 0 || r.left > innerWidth || r.bottom < 0 || r.top > innerHeight) return false;
    setPos({ left: Math.max(8, Math.min(r.right - w, innerWidth - w - 8)), top: Math.max(8, Math.min(r.bottom + 6, innerHeight - h - 8)) });
    return true;
  }, [ancora]);
  useLayoutEffect(() => { posicionar(); }, [posicionar]);
  useEffect(() => {
    const fora = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node) && !ancora.contains(e.target as Node)) onFechar(); };
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar(); };
    const rolar = (e: Event) => { if (!ref.current?.contains(e.target as Node) && !posicionar()) onFechar(); };
    document.addEventListener('pointerdown', fora); document.addEventListener('keydown', tecla);
    window.addEventListener('scroll', rolar, true); window.addEventListener('resize', onFechar);
    return () => {
      document.removeEventListener('pointerdown', fora); document.removeEventListener('keydown', tecla);
      window.removeEventListener('scroll', rolar, true); window.removeEventListener('resize', onFechar);
    };
  }, [ancora, onFechar, posicionar]);

  const q = busca.trim().toLowerCase();
  const filtrada = q ? lista.filter(v => (v.valor || '(vazias)').toLowerCase().includes(q)) : lista;
  const tudoMarcado = filtrada.every(v => marcados.has(v.valor));
  const marcar = (vs: string[], sim: boolean) => setMarcados(m => { const n = new Set(m); vs.forEach(v => (sim ? n.add(v) : n.delete(v))); return n; });

  // condição escolhida substitui a lista de valores
  const numA = parseNum(a), numB = parseNum(b);
  const semValor = op === 'top10' || op === 'acimaMedia';
  const condicao: Filtro | null | 'invalida' = !op ? null
    : numerica
      ? (semValor ? { tipo: 'numero', op: op as OpNumero }
        : Number.isNaN(numA) || (op === 'entre' && Number.isNaN(numB)) ? 'invalida'
        : { tipo: 'numero', op: op as OpNumero, a: numA, ...(op === 'entre' ? { b: numB } : {}) })
      : (txt.trim() ? { tipo: 'texto', op: op as OpTexto, valor: txt.trim() } : 'invalida');
  const nenhum = !op && marcados.size === 0;

  function ok() {
    if (condicao === 'invalida' || nenhum) return;
    if (condicao) return onAplicar(condicao);
    const sel = todos.filter(v => marcados.has(v));
    onAplicar(sel.length === todos.length ? null : { tipo: 'valores', valores: sel });
  }

  return createPortal(
    <div ref={ref} className="filtro-pop" role="dialog" aria-label={`Filtro de ${c.h}`} style={{ left: pos.left, top: pos.top }}
      onKeyDown={e => { if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT' && (e.target as HTMLInputElement).type !== 'checkbox') ok(); }}>
      <div className="filtro-cab"><b>{c.h}</b><span className="note">ordem da PQ mantida</span></div>
      <label className="filtro-cond">
        <span>{numerica ? 'Filtros de número' : 'Filtros de texto'}</span>
        <select value={op} aria-label="Condição" onChange={e => setOp(e.target.value)}>
          <option value="">— nenhuma condição —</option>
          {Object.entries(numerica ? NOME_OP_NUMERO : NOME_OP_TEXTO).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
        </select>
      </label>
      {op && !numerica && <input className="in" autoFocus aria-label="Texto da condição" placeholder={op === 'comeca' && c.k === 'item' ? 'ex.: 1.1 (grupo inteiro)' : 'texto'}
        value={txt} onChange={e => setTxt(e.target.value)} />}
      {op && numerica && !semValor && (
        <div className="row" style={{ gap: 6 }}>
          <input className="in num" autoFocus aria-label={op === 'entre' ? 'De' : 'Valor'} placeholder="0,00" value={a} onChange={e => setA(e.target.value)} />
          {op === 'entre' && <><span className="note">e</span><input className="in num" aria-label="Até" placeholder="0,00" value={b} onChange={e => setB(e.target.value)} /></>}
        </div>
      )}
      <div className={'filtro-lista-box' + (op ? ' off' : '')}>
        <input className="in" type="search" placeholder="Pesquisar" aria-label="Pesquisar valores" value={busca} disabled={!!op} onChange={e => setBusca(e.target.value)} />
        <div className="filtro-lista" role="group" aria-label="Valores">
          <label><input type="checkbox" disabled={!!op} checked={tudoMarcado && filtrada.length > 0} onChange={e => marcar(filtrada.map(v => v.valor), e.target.checked)} />
            {q ? '(Selecionar todos os resultados)' : '(Selecionar tudo)'}</label>
          {filtrada.slice(0, LIMITE_LISTA).map(v => (
            <label key={v.valor}><input type="checkbox" disabled={!!op} checked={marcados.has(v.valor)} onChange={e => marcar([v.valor], e.target.checked)} />
              <span className="filtro-val">{v.valor || '(Vazias)'}</span><small>{v.n}</small></label>
          ))}
          {filtrada.length > LIMITE_LISTA && <span className="note">… mais {filtrada.length - LIMITE_LISTA} valores: use Pesquisar.</span>}
          {!filtrada.length && <span className="note">Nenhum valor encontrado.</span>}
        </div>
        {op && <span className="note">A condição acima substitui a lista de valores.</span>}
      </div>
      <div className="filtro-rod">
        <button className="btn small" onClick={() => onAplicar(null)} disabled={!ativo}>Limpar filtro</button>
        <span className="spacer" />
        <button className="btn small" onClick={onFechar}>Cancelar</button>
        <button className="btn small primary" disabled={condicao === 'invalida' || nenhum} onClick={ok}>OK</button>
      </div>
    </div>,
    document.body,
  );
}
