import { BrowserRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { ProvedorSessao, useSessao } from './app/Sessao';
import { ProvedorAviso } from './app/ui';
import { NOME_PAPEL } from './dados/api';
import { Biblioteca } from './telas/Biblioteca';
import { Comparar } from './telas/Comparar';
import { EditorPx } from './telas/EditorPx';
import { Empresas } from './telas/Empresas';
import { Entrar } from './telas/Entrar';
import { Equipe } from './telas/Equipe';
import { Parametros } from './telas/Parametros';
import { Projetos } from './telas/Projetos';

const I = (d: string) => <svg viewBox="0 0 24 24"><path d={d} /></svg>;
const MENU: [string, string, string][] = [
  ['/', 'Projetos', 'M3 7h18M3 12h18M3 17h12'],
  ['/biblioteca', 'Biblioteca', 'M4 4h6l2 2h8v14H4z'],
  ['/parametros', 'Parâmetros', 'M4 6h16M4 12h10M4 18h7'],
  ['/equipe', 'Equipe', 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20c0-3 3-5 6-5s6 2 6 5M17 11a3 3 0 1 0 0-6M22 20c0-3-2-5-5-5'],
];

function Shell() {
  const { sessao, carregando, empresa, empresas, escolherEmpresa, sair } = useSessao();
  if (carregando) return <p className="note" style={{ padding: 20 }}>Carregando…</p>;
  if (!sessao) return <Entrar />;
  if (!empresa) return <Empresas />;
  return (
    <div className="app">
      <nav className="side" aria-label="Navegação">
        <div className="brand"><i>PX</i><span>Montador de PX</span></div>
        {MENU.map(([to, nome, d]) => (
          <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'on' : '')}
            aria-current={undefined} style={({ isActive }) => (isActive ? { background: 'var(--accent-soft)', color: 'var(--accent)' } : undefined)}>
            {I(d)}{nome}
          </NavLink>
        ))}
        <div className="foot stack" style={{ gap: 6 }}>
          <strong style={{ color: 'var(--ink)' }}>{empresa.nome}</strong>
          <span>{NOME_PAPEL[empresa.papel]} · {sessao.user.email}</span>
          {empresas.length > 1 && <button className="linkbtn" onClick={() => escolherEmpresa(null)}>Trocar de empresa</button>}
          <button className="linkbtn" onClick={sair}>Sair</button>
        </div>
      </nav>
      <main className="main">
        <Routes>
          <Route path="/px/:id" element={<section className="view on" id="v-px"><EditorPx /></section>} />
          <Route path="*" element={
            <section className="view on">
              <Routes>
                <Route path="/" element={<Projetos />} />
                <Route path="/px/:id/comparar" element={<Comparar />} />
                <Route path="/biblioteca" element={<Biblioteca />} />
                <Route path="/parametros" element={<Parametros />} />
                <Route path="/equipe" element={<Equipe />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </section>
          } />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ProvedorAviso>
        <ProvedorSessao><Shell /></ProvedorSessao>
      </ProvedorAviso>
    </BrowserRouter>
  );
}
