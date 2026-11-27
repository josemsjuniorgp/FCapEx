import { BrowserRouter, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ProvedorSessao, useSessao } from './app/Sessao';
import { iniciais, ProvedorAviso } from './app/ui';
import { NOME_PAPEL } from './dados/api';
import { PaginaBdi } from './telas/Bdi';
import { PaginaMaturidade } from './telas/Maturidade';
import { Viabilidade } from './telas/Viabilidade';
import { Estudo } from './telas/Estudo';
import { Biblioteca } from './telas/Biblioteca';
import { Comparar } from './telas/Comparar';
import { DefinirSenha } from './telas/DefinirSenha';
import { EditorPx } from './telas/EditorPx';
import { Empresas } from './telas/Empresas';
import { Entrar } from './telas/Entrar';
import { Equipe } from './telas/Equipe';
import { Parametros } from './telas/Parametros';
import { Projetos } from './telas/Projetos';

const I = (d: string) => <svg viewBox="0 0 24 24"><path d={d} /></svg>;
const MENU: [string, string, string][] = [
  ['/', 'Projetos', 'M3 7h18M3 12h18M3 17h12'],
  ['/viabilidade', 'Viabilidade', 'M3 17l6-6 4 4 8-8M15 7h6v6'],
  ['/biblioteca', 'Biblioteca', 'M4 4h6l2 2h8v14H4z'],
  ['/bdi', 'BDI', 'M5 19L19 5M9 7a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM19 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0z'],
  ['/maturidade', 'Maturidade', 'M4 20V10M10 20V4M16 20v-7M22 20H2'],
  ['/parametros', 'Parâmetros', 'M4 6h16M4 12h10M4 18h7'],
  ['/equipe', 'Equipe', 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20c0-3 3-5 6-5s6 2 6 5M17 11a3 3 0 1 0 0-6M22 20c0-3-2-5-5-5'],
];

function Shell() {
  const { sessao, carregando, empresa, empresas, escolherEmpresa, sair, definirSenha } = useSessao();
  const local = useLocation();
  if (carregando) return <p className="note" style={{ padding: 20 }}>Carregando…</p>;
  if (!sessao) return <Entrar />;
  if (definirSenha) return <DefinirSenha />;
  if (!empresa) return <Empresas />;
  return (
    <div className="app">
      <nav className="side" aria-label="Navegação">
        <div className="brand2"><i>FC</i><div><b>FCapEx</b><small>Mapas de Preços CapEx</small></div></div>
        <div className="nav-label">Menu</div>
        {MENU.map(([to, nome, d]) => (
          <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => 'nav-item' + (isActive || (to === '/' && local.pathname.startsWith('/px/')) || (to === '/viabilidade' && local.pathname.startsWith('/estudo/')) ? ' ativo' : '')}>
            {I(d)}{nome}
          </NavLink>
        ))}
        <div className="conta">
          <div className="conta-cab">
            <span className="avatar" aria-hidden="true">{iniciais(empresa.nome)}</span>
            <div><b title={empresa.nome}>{empresa.nome}</b><small>{NOME_PAPEL[empresa.papel]}</small></div>
          </div>
          <span className="conta-email" title={sessao.user.email}>{sessao.user.email}</span>
          <div className="conta-acoes">
            {empresas.length > 1 && <button onClick={() => escolherEmpresa(null)}>Trocar empresa</button>}
            <button onClick={sair}>Sair</button>
          </div>
        </div>
      </nav>
      <main className="main">
        <Routes>
          <Route path="/px/:id" element={<section className="view on" id="v-px"><EditorPx /></section>} />
          <Route path="/estudo/:id" element={<section className="view on" id="v-estudo"><Estudo /></section>} />
          <Route path="*" element={
            <section className="view on">
              <Routes>
                <Route path="/" element={<Projetos />} />
                <Route path="/px/:id/comparar" element={<Comparar />} />
                <Route path="/biblioteca" element={<Biblioteca />} />
                <Route path="/bdi" element={<PaginaBdi />} />
                <Route path="/viabilidade" element={<Viabilidade />} />
                <Route path="/maturidade" element={<PaginaMaturidade />} />
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
