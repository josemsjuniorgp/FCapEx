/** Gráficos do Estudo de Viabilidade (SVG próprio, sem biblioteca): fluxo de caixa e tornado. */
import type { AnoFluxo } from '../dominio/viabilidade';

const mi = (v: number) => v / 1e6;
const nf1 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Passo "redondo" para a escala do eixo. */
function passo(amplitude: number) {
  const bruto = amplitude / 5, p10 = Math.pow(10, Math.floor(Math.log10(bruto || 1)));
  for (const m of [1, 2, 2.5, 5, 10]) if (bruto <= m * p10) return m * p10;
  return 10 * p10;
}

/** Barras = caixa de cada ano (vermelho = negativo); linha = caixa acumulado; marca do payback. R$ milhões. */
export function GraficoFluxo({ anos, payback }: { anos: AnoFluxo[]; payback: number | null }) {
  const W = 760, H = 260, x0 = 52, y0 = 16, ph = 190;
  if (!anos.length) return null;
  const cx = anos.map(a => mi(a.caixa)), ac = anos.map(a => mi(a.acumulado));
  let mn = Math.min(0, ...cx, ...ac), mx = Math.max(0, ...cx, ...ac);
  if (mx - mn < 1e-9) { mx = 1; mn = -1; }
  const st = passo(mx - mn);
  mn = Math.floor(mn / st) * st; mx = Math.ceil(mx / st) * st;
  const Y = (v: number) => y0 + ((mx - v) / (mx - mn)) * ph;
  const bw = (W - x0 - 10) / anos.length;
  const ticks: number[] = []; for (let t = mn; t <= mx + 1e-9; t += st) ticks.push(Math.round(t * 1e6) / 1e6);
  const pi = payback ? anos.findIndex(a => a.ano === payback) : -1;
  const cada = Math.ceil(anos.length / 12);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="grafico" role="img" aria-label="Fluxo de caixa por ano e acumulado">
      {ticks.map(t => (
        <g key={t}>
          <line x1={x0} x2={W - 6} y1={Y(t)} y2={Y(t)} stroke={t === 0 ? '#9aa8b3' : 'var(--line)'} />
          <text x={x0 - 6} y={Y(t) + 3.5} textAnchor="end" className="eixo">{nf1(t).replace(/,0$/, '')}</text>
        </g>
      ))}
      {anos.map((a, i) => {
        const v = cx[i], x = x0 + i * bw + bw * 0.18, w = bw * 0.64;
        return (
          <g key={a.ano}>
            <rect x={x} y={Y(Math.max(v, 0))} width={w} height={Math.max(0.5, Math.abs(Y(v) - Y(0)))} rx={2}
              className={v < 0 ? 'barra-neg' : 'barra-pos'}><title>{`Ano ${a.ano}: R$ ${nf1(v)} mi`}</title></rect>
            {i % cada === 0 && <text x={x + w / 2} y={y0 + ph + 15} textAnchor="middle" className="eixo">{a.ano}</text>}
          </g>
        );
      })}
      <polyline points={ac.map((v, i) => `${x0 + i * bw + bw / 2},${Y(v)}`).join(' ')} fill="none" className="linha-acum" />
      {pi >= 0 && (
        <g>
          <circle cx={x0 + pi * bw + bw / 2} cy={Y(ac[pi])} r={4.5} fill="#fff" className="ponto-acum" />
          <rect x={x0 + pi * bw + bw / 2 - 46} y={Y(ac[pi]) - 30} width={92} height={18} rx={4} fill="#fff" className="ponto-acum" />
          <text x={x0 + pi * bw + bw / 2} y={Y(ac[pi]) - 17} textAnchor="middle" className="rotulo-acum">payback: ano {payback}</text>
        </g>
      )}
      <text x={W / 2} y={H - 2} textAnchor="middle" className="eixo">ano do projeto</text>
      <text x={14} y={y0 + ph / 2} textAnchor="middle" className="eixo" transform={`rotate(-90 14 ${y0 + ph / 2})`}>R$ milhões</text>
    </svg>
  );
}

/** Tornado: VPL com cada premissa variando sozinha; barra vermelha = lado desfavorável. R$ milhões. */
export function GraficoTornado({ base, itens }: { base: number; itens: { nome: string; baixo: number; alto: number }[] }) {
  const W = 660, nomeW = 210, H = 30 + itens.length * 34;
  const ext = Math.max(1e-9, ...itens.flatMap(i => [Math.abs(i.baixo - base), Math.abs(i.alto - base)]));
  const meio = nomeW + (W - nomeW - 60) / 2 + 10, esc = (W - nomeW - 90) / 2 / ext;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="grafico" role="img" aria-label="Sensibilidade do VPL (tornado)">
      {itens.map((it, i) => {
        const y = 8 + i * 34, xb = meio + (it.baixo - base) * esc, xa = meio + (it.alto - base) * esc;
        const neg = Math.min(xb, xa), pos = Math.max(xb, xa);
        return (
          <g key={it.nome}>
            <text x={nomeW - 8} y={y + 15} textAnchor="end" className="nome-sens">{it.nome}</text>
            <rect x={Math.min(neg, meio)} y={y + 3} width={Math.abs(meio - Math.min(neg, meio))} height={18} rx={2} className="barra-neg" />
            <rect x={meio} y={y + 3} width={Math.max(0, pos - meio)} height={18} rx={2} className="barra-pos" />
            <text x={Math.min(neg, meio) - 4} y={y + 16} textAnchor="end" className="eixo">{nf1(mi(Math.min(it.baixo, it.alto)))}</text>
            <text x={Math.max(pos, meio) + 4} y={y + 16} className="eixo">{nf1(mi(Math.max(it.baixo, it.alto)))}</text>
          </g>
        );
      })}
      <line x1={meio} x2={meio} y1={4} y2={H - 20} className="linha-acum" strokeWidth={1.5} />
      <text x={meio} y={H - 5} textAnchor="middle" className="rotulo-acum">VPL base R$ {nf1(mi(base))} mi</text>
    </svg>
  );
}
