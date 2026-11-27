/** Dados de apoio dos estudos: total geral dos Mapas de Preços (revisão em edição) e entrada do cálculo. */
import { listarItens, listarLinhasEstudo, type Estudo, type Px, type Revisao } from '../dados/api';
import { totais } from '../dominio/calculo';
import type { Parametros } from '../dominio/tipos';
import { normalizarCapex, normalizarPremissas, type EntradaEstudo, type LinhaEstudo } from '../dominio/viabilidade';

/** Total geral (R$) de cada Mapa, pela revisão em edição (ou a última emitida, se não houver em edição). */
export async function totaisDosMapas(pxs: Px[], revs: Revisao[], p: Parametros): Promise<Record<string, number>> {
  const pares = await Promise.all(pxs.map(async x => {
    const dele = revs.filter(r => r.px_id === x.id);
    const rev = dele.find(r => !r.emitida_em) ?? dele.sort((a, b) => b.numero - a.numero)[0];
    if (!rev) return [x.id, 0] as const;
    return [x.id, totais(await listarItens(rev.id), p, new Set(x.colunas)).ger] as const;
  }));
  return Object.fromEntries(pares);
}

export function entradaDoEstudo(e: Estudo, linhas: LinhaEstudo[], totaisMapas: Record<string, number>, p: Parametros): EntradaEstudo {
  const capex = normalizarCapex(e.capex);
  return {
    tipo: e.tipo, premissas: normalizarPremissas(e.premissas), capex, linhas, cambio: p.cambio,
    capexMapas: capex.mapas.reduce((s, id) => s + (totaisMapas[id] ?? 0), 0),
  };
}

export async function entradaCompleta(e: Estudo, totaisMapas: Record<string, number>, p: Parametros) {
  return entradaDoEstudo(e, await listarLinhasEstudo(e.id), totaisMapas, p);
}
