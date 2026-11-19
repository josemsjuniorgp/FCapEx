import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../dados/supabase';
import { carregarParametros, minhasEmpresas, type Empresa, type Moeda } from '../dados/api';
import type { Parametros } from '../dominio/tipos';

interface Ctx {
  sessao: Session | null;
  carregando: boolean;
  empresas: Empresa[];
  empresa: Empresa | null;
  escolherEmpresa: (id: string | null) => void;
  recarregarEmpresas: () => Promise<void>;
  parametros: Parametros | null;
  moedas: Moeda[];
  recarregarParametros: () => Promise<void>;
  podeEditar: boolean;
  ehAdmin: boolean;
  sair: () => Promise<void>;
}

const C = createContext<Ctx | null>(null);
export const useSessao = () => {
  const c = useContext(C);
  if (!c) throw new Error('useSessao fora do provedor');
  return c;
};

const CHAVE = 'fcapex:empresa';

export function ProvedorSessao({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<Session | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [empresaId, setEmpresaId] = useState<string | null>(() => localStorage.getItem(CHAVE));
  const [parametros, setParametros] = useState<Parametros | null>(null);
  const [moedas, setMoedas] = useState<Moeda[]>([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSessao(data.session); if (!data.session) setCarregando(false); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSessao(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const recarregarEmpresas = useCallback(async () => {
    setEmpresas(await minhasEmpresas());
  }, []);

  useEffect(() => {
    if (!sessao) { setEmpresas([]); return; }
    recarregarEmpresas().finally(() => setCarregando(false));
  }, [sessao?.user.id, recarregarEmpresas]); // eslint-disable-line react-hooks/exhaustive-deps

  const empresa = empresas.find(e => e.id === empresaId) ?? (empresas.length === 1 ? empresas[0] : null);

  const recarregarParametros = useCallback(async () => {
    if (!empresa) { setParametros(null); return; }
    const r = await carregarParametros(empresa.id);
    setParametros(r.p); setMoedas(r.moedas);
  }, [empresa?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { recarregarParametros(); }, [recarregarParametros]);

  const escolherEmpresa = (id: string | null) => {
    if (id) localStorage.setItem(CHAVE, id); else localStorage.removeItem(CHAVE);
    setEmpresaId(id);
  };

  const sair = async () => { await supabase.auth.signOut(); escolherEmpresa(null); };

  return (
    <C.Provider value={{
      sessao, carregando, empresas, empresa, escolherEmpresa, recarregarEmpresas,
      parametros, moedas, recarregarParametros,
      podeEditar: empresa?.papel === 'admin' || empresa?.papel === 'orcamentista',
      ehAdmin: empresa?.papel === 'admin',
      sair,
    }}>{children}</C.Provider>
  );
}
