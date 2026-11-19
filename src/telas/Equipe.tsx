import { useCallback, useEffect, useState } from 'react';
import { useSessao } from '../app/Sessao';
import { Confirmar, useAcao, useAviso } from '../app/ui';
import { convidarMembro, listarMembros, mudarPapel, NOME_PAPEL, removerMembro, type Membro, type Papel } from '../dados/api';

const PAPEIS = Object.keys(NOME_PAPEL) as Papel[];

export function Equipe() {
  const { empresa, ehAdmin, sessao, recarregarEmpresas } = useSessao();
  const acao = useAcao();
  const [membros, setMembros] = useState<Membro[]>([]);
  const [email, setEmail] = useState('');
  const [papel, setPapel] = useState<Papel>('orcamentista');
  const [perguntar, setPerguntar] = useState<string | null>(null);

  const avisar = useAviso();
  async function convidar(para: string, p: Papel) {
    let situacao = '';
    if (await acao(async () => { situacao = await convidarMembro(empresa!.id, para.trim(), p); })) {
      avisar(situacao === 'convidado' ? `Convite enviado para ${para.trim()}.` : `${para.trim()} já tinha conta e entrou na equipe.`);
      setEmail(''); carregar();
    }
  }
  const carregar = useCallback(async () => { if (empresa) setMembros(await listarMembros(empresa.id)); }, [empresa]);
  useEffect(() => { carregar(); }, [carregar]);
  if (!empresa) return null;

  return (
    <div className="stack" style={{ maxWidth: 800 }}>
      <h1>Equipe · {empresa.nome}</h1>
      <p className="note">A pessoa convidada recebe um e-mail para criar a senha e já entra na empresa. Quem já tem conta entra direto, sem e-mail.</p>
      <p className="note">Administrador: tudo, inclusive clientes, parâmetros e equipe. Orçamentista: projetos, PX e biblioteca. Revisor e Somente leitura: consultam.</p>
      {ehAdmin && (
        <div className="card row" style={{ padding: 12 }}>
          <input className="in" style={{ flex: 1 }} type="email" placeholder="e-mail da pessoa" value={email} onChange={e => setEmail(e.target.value)} />
          <select value={papel} onChange={e => setPapel(e.target.value as Papel)}>{PAPEIS.map(p => <option key={p} value={p}>{NOME_PAPEL[p]}</option>)}</select>
          <button className="btn primary" disabled={!email.includes('@')}
            onClick={() => convidar(email, papel)}>Convidar</button>
        </div>
      )}
      <div className="card">
        <table className="t">
          <thead><tr><th>E-mail</th><th>Papel</th><th /></tr></thead>
          <tbody>
            {membros.map(m => (
              <tr key={m.usuario_id}>
                <td>{m.email}{m.usuario_id === sessao?.user.id && <span className="note"> (você)</span>}
                  {m.pendente && <> <span className="pill p-warn">convite pendente</span>
                    {ehAdmin && <button className="linkbtn" style={{ marginLeft: 8 }} onClick={() => convidar(m.email, m.papel)}>Reenviar convite</button>}</>}</td>
                <td>{ehAdmin
                  ? <select value={m.papel} onChange={async e => { if (await acao(() => mudarPapel(empresa.id, m.usuario_id, e.target.value as Papel), 'Papel alterado.')) { carregar(); recarregarEmpresas(); } }}>
                      {PAPEIS.map(p => <option key={p} value={p}>{NOME_PAPEL[p]}</option>)}</select>
                  : NOME_PAPEL[m.papel]}</td>
                <td>{ehAdmin && (perguntar === m.usuario_id
                  ? <Confirmar msg={<>Remover <b>{m.email}</b> da empresa?</>} sim="Remover" onNao={() => setPerguntar(null)}
                      onSim={async () => { setPerguntar(null); if (await acao(() => removerMembro(empresa.id, m.usuario_id), 'Membro removido.')) carregar(); }} />
                  : <button className="btn small danger" onClick={() => setPerguntar(m.usuario_id)}>Remover</button>)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
