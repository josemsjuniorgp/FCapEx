import { useState } from 'react';
import { useAcao } from '../app/ui';
import { atualizarPx, type Px } from '../dados/api';

/** Corrige o código e o nome de uma PX. Usado no cabeçalho da PX e no cartão da tela Projetos. */
export function RenomearPx({ px, onSalvo, onCancelar, compacto }: {
  px: Pick<Px, 'id' | 'codigo' | 'nome'>; onSalvo: () => void; onCancelar: () => void; compacto?: boolean;
}) {
  const acao = useAcao();
  const [codigo, setCodigo] = useState(px.codigo);
  const [nome, setNome] = useState(px.nome);
  const [ocupado, setOcupado] = useState(false);
  const mudou = codigo.trim() !== px.codigo || nome.trim() !== px.nome;
  const valido = !!codigo.trim() && !!nome.trim();

  async function salvar() {
    if (!valido || !mudou) return;
    setOcupado(true);
    const ok = await acao(() => atualizarPx(px.id, { codigo: codigo.trim(), nome: nome.trim() }), 'Código e nome salvos.');
    setOcupado(false);
    if (ok) onSalvo();
  }
  const tecla = (e: React.KeyboardEvent) => { if (e.key === 'Enter') salvar(); if (e.key === 'Escape') onCancelar(); };

  return (
    <div className={'renomear' + (compacto ? ' compacto' : '')}>
      <label className="fld">Código do Mapa
        <input className="in mono" autoFocus maxLength={250} value={codigo} onChange={e => setCodigo(e.target.value)} onKeyDown={tecla} />
      </label>
      <label className="fld">Nome do Mapa
        <input className="in" value={nome} onChange={e => setNome(e.target.value)} onKeyDown={tecla} />
      </label>
      <div className="row">
        <button className="btn small" onClick={onCancelar}>Cancelar</button>
        <button className="btn small primary" disabled={!valido || !mudou || ocupado} onClick={salvar}>Salvar</button>
      </div>
      {!valido && <span className="note" style={{ color: 'var(--err)' }}>Código e nome são obrigatórios.</span>}
    </div>
  );
}
