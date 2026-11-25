import { useMemo, useState } from 'react';
import { brl, Dialogo, plural } from '../app/ui';
import type { ItemPos } from '../dados/api';
import { linhasDaExclusaoDePq, pqsDaPx } from '../dominio/pq';
import type { Resultado } from '../dominio/tipos';

/** Janela "Excluir PQ": escolhe uma ou mais PQs (Documento de Origem) e exclui as linhas delas desta PX. */
export function ExcluirPq({ itens, res, onFechar, onExcluir }: {
  itens: ItemPos[]; res: Map<string, Resultado>;
  onFechar: () => void; onExcluir: (docs: string[], ids: string[]) => void;
}) {
  const pqs = useMemo(() => pqsDaPx(itens).map(p => ({
    ...p, total: itens.filter(i => !i.titulo && i.pqdoc === p.doc).reduce((s, i) => s + (res.get(i.id)?.ger || 0), 0),
  })), [itens, res]);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const ids = useMemo(() => linhasDaExclusaoDePq(itens, marcadas), [itens, marcadas]);
  const titulos = ids.filter(id => itens.find(i => i.id === id)?.titulo).length;
  const marcar = (doc: string, sim: boolean) => setMarcadas(m => { const n = new Set(m); if (sim) n.add(doc); else n.delete(doc); return n; });

  return (
    <Dialogo titulo="Excluir PQ" onFechar={onFechar}>
      <p className="note">Escolha as PQs (pelo Documento de Origem) cujas linhas devem sair deste Mapa. Os títulos que ficarem sem itens
        também saem. O arquivo continua na Biblioteca, e dá para desfazer pelo botão ↶ do Mapa.</p>
      {!pqs.length
        ? <p className="note">Nenhuma linha deste Mapa tem Documento de Origem (só linhas inseridas à mão).</p>
        : (
          <table className="t excluir-pq">
            <thead><tr><th /><th>Documento de Origem</th><th className="num">Itens</th><th className="num">Total geral</th></tr></thead>
            <tbody>
              {pqs.map(p => (
                <tr key={p.doc} className={marcadas.has(p.doc) ? 'sel' : ''}>
                  <td><input type="checkbox" aria-label={`Excluir ${p.doc}`} checked={marcadas.has(p.doc)} onChange={e => marcar(p.doc, e.target.checked)} /></td>
                  <td onClick={() => marcar(p.doc, !marcadas.has(p.doc))} style={{ cursor: 'pointer' }}><b>{p.doc}</b></td>
                  <td className="num">{p.itens}</td>
                  <td className="num">{brl(p.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      <div className="row">
        <span className="note">{marcadas.size
          ? <>Serão excluídos <b>{plural(ids.length - titulos, 'item', 'itens')}</b>{titulos ? <> e <b>{plural(titulos, 'título', 'títulos')}</b></> : ''}.</>
          : 'Nenhuma PQ marcada.'}</span>
        <span className="spacer" />
        <button className="btn" onClick={onFechar}>Cancelar</button>
        <button className="btn danger-cheio" disabled={!marcadas.size} onClick={() => onExcluir([...marcadas], ids)}>
          {marcadas.size ? `Excluir ${plural(marcadas.size, 'PQ', 'PQs')}` : 'Excluir'}</button>
      </div>
    </Dialogo>
  );
}
