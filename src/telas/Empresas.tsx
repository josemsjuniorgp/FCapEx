import { useState } from 'react';
import { useSessao } from '../app/Sessao';
import { useAcao } from '../app/ui';
import { criarEmpresa, NOME_PAPEL } from '../dados/api';

/** Escolha da empresa (tenant) ou criação da primeira. */
export function Empresas() {
  const { empresas, escolherEmpresa, recarregarEmpresas, sessao, sair } = useSessao();
  const [nome, setNome] = useState('');
  const acao = useAcao();

  async function criar() {
    if (!nome.trim()) return;
    let id = '';
    if (await acao(async () => { id = await criarEmpresa(nome.trim()); })) {
      await recarregarEmpresas(); escolherEmpresa(id);
    }
  }

  return (
    <main style={{ display: 'grid', placeItems: 'center', minHeight: '100%', padding: 20 }}>
      <section className="card stack" style={{ width: 'min(480px,100%)', padding: 24 }}>
        <div className="brand"><i>FC</i><span>FCapEx</span></div>
        <h1>{empresas.length ? 'Escolha a empresa' : 'Cadastre sua empresa'}</h1>
        <p className="note">Conectado como {sessao?.user.email}.</p>
        {empresas.length > 0 && (
          <div className="list">
            {empresas.map(e => (
              <button key={e.id} className="projcard" onClick={() => escolherEmpresa(e.id)}>
                <strong>{e.nome}</strong><span className="note">{NOME_PAPEL[e.papel]}</span>
              </button>
            ))}
          </div>
        )}
        <div className="group-box stack" style={{ gap: 8 }}>
          <strong>Nova empresa</strong>
          <span className="note">Você será o administrador. Depois, convide a equipe em Equipe.</span>
          <div className="row">
            <input className="in" style={{ flex: 1 }} placeholder="Nome da empresa" value={nome}
              onChange={e => setNome(e.target.value)} onKeyDown={e => e.key === 'Enter' && criar()} />
            <button className="btn primary" onClick={criar} disabled={!nome.trim()}>Criar</button>
          </div>
        </div>
        <button className="linkbtn" onClick={sair}>Sair</button>
      </section>
    </main>
  );
}
