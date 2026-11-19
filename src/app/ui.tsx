import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

export const nf = (n: number, d = 2) => n.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
export const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const brlCurto = (n: number) => (Math.abs(n) >= 1e6 ? 'R$ ' + nf(n / 1e6, 2) + ' mi' : brl(n));
export const dataHora = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
export const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`;

// ------------------------------------------------------------------ aviso flutuante (toast)
const T = createContext<(msg: string) => void>(() => {});
export const useAviso = () => useContext(T);

export function ProvedorAviso({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const avisar = useCallback((m: string) => {
    setMsg(m); window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMsg(null), 4200);
  }, []);
  return (
    <T.Provider value={avisar}>
      {children}
      {msg && <div className="toast" role="status">{msg}</div>}
    </T.Provider>
  );
}

/** Executa uma ação assíncrona mostrando o erro no aviso. Retorna true se deu certo. */
export function useAcao() {
  const avisar = useAviso();
  return useCallback(async (fn: () => Promise<unknown>, sucesso?: string) => {
    try { await fn(); if (sucesso) avisar(sucesso); return true; }
    catch (e) { avisar(e instanceof Error ? e.message : String(e)); return false; }
  }, [avisar]);
}

// ------------------------------------------------------------------ confirmação na própria tela
export function Confirmar({ msg, sim, onSim, onNao, children }:
  { msg: ReactNode; sim: string; onSim: () => void; onNao: () => void; children?: ReactNode }) {
  return (
    <div className="confirm" role="alert">
      <span>{msg}</span>
      {children}
      <div className="row">
        <button className="btn small dz" onClick={onSim}>{sim}</button>
        <button className="btn small" onClick={onNao}>Cancelar</button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ diálogo modal
export function Dialogo({ titulo, onFechar, children }: { titulo: string; onFechar: () => void; children: ReactNode }) {
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar(); };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [onFechar]);
  return (
    <div className="dlg-back" onMouseDown={e => { if (e.target === e.currentTarget) onFechar(); }}>
      <section className="card dlg" role="dialog" aria-modal="true" aria-label={titulo}>
        <div className="panel-head"><h2>{titulo}</h2><button className="btn small" onClick={onFechar}>Fechar</button></div>
        {children}
      </section>
    </div>
  );
}

export function Vazio({ children }: { children: ReactNode }) {
  return <div className="card" style={{ padding: 24, textAlign: 'center' }}><span className="note">{children}</span></div>;
}
