/**
 * Gráficos do painel em SVG puro — sem biblioteca. Todos se ajustam à largura
 * do cartão (viewBox + width 100%) e mostram o valor exato no `title` (passar o
 * mouse / tocar e segurar no celular).
 */
import { useEffect, useRef, useState } from "react";

/* Paleta categórica: laranja e azul são as cores da casa (instalação ×
   entrega); as demais só aparecem quando há mais categorias. */
export const CORES = ["#ee6a1e", "#2a78d6", "#1f9d6b", "#8a5cd6", "#e0a100", "#d6457a", "#16a3b8", "#7c828d"];

/** Largura real do contêiner — o SVG desenha em px de verdade e o texto não encolhe no celular. */
function useLargura(padrao) {
  const ref = useRef(null);
  const [w, setW] = useState(padrao);
  useEffect(() => {
    if (!ref.current || typeof ResizeObserver === "undefined") return undefined;
    const ob = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))));
    ob.observe(ref.current);
    return () => ob.disconnect();
  }, []);
  return [ref, w];
}

export const fmtCurto = (n) => {
  const v = Math.abs(n);
  if (v >= 1e6) return `${(n / 1e6).toFixed(1).replace(".", ",")} mi`;
  if (v >= 1e3) return `${(n / 1e3).toFixed(v >= 1e4 ? 0 : 1).replace(".", ",")} mil`;
  return String(Math.round(n * 10) / 10).replace(".", ",");
};

/** Topo "redondo" do eixo e as marcas intermediárias. */
function eixo(max, partes = 4) {
  if (max <= 0) return { topo: partes, marcas: [...Array(partes + 1)].map((_, i) => i) };
  const bruto = max / partes;
  const mag = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((p) => p >= bruto);
  return { topo: passo * partes, marcas: [...Array(partes + 1)].map((_, i) => i * passo) };
}

/**
 * Eixo que também desce abaixo de zero (saldo negativo): fundo e topo "redondos"
 * no mesmo passo, para a linha nunca sair da área do gráfico.
 */
function eixoFaixa(min, max, partes = 4) {
  if (min >= 0) return { fundo: 0, ...eixo(max || 1, partes) };
  const amplitude = Math.max(max, 0) - min;
  const bruto = amplitude / partes;
  const mag = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((p) => p >= bruto);
  const fundo = Math.floor(min / passo) * passo;
  const topo = Math.max(passo, Math.ceil(Math.max(max, 0) / passo) * passo);
  const marcas = [];
  for (let m = fundo; m <= topo + passo / 2; m += passo) marcas.push(Math.round(m * 100) / 100);
  return { fundo, topo, marcas };
}

export function Legenda({ itens }) {
  return (
    <div className="legend">
      {itens.map((i) => (
        <span key={i.rotulo}><i style={{ background: i.cor, borderRadius: i.linha ? 2 : 3,
                                         height: i.linha ? 3 : 11, verticalAlign: i.linha ? 3 : -1 }} />
          {i.rotulo}</span>
      ))}
    </div>
  );
}

/**
 * Colunas agrupadas (verticais). `series`: [{rotulo, cor, valores: []}].
 * `destaque`: índice da categoria realçada (ex.: hoje).
 */
export function Colunas({ categorias, series, destaque = -1, altura = 220, formato = fmtCurto }) {
  const [ref, W] = useLargura(640);
  const H = altura, esq = 34, base = H - 30, topoY = 14;
  const max = Math.max(0, ...series.flatMap((s) => s.valores));
  const { topo, marcas } = eixo(max || 1);
  const larg = (W - esq - 6) / categorias.length;
  const barra = Math.min(26, (larg * 0.72) / series.length);
  const y = (v) => base - (v / topo) * (base - topoY);

  const salto = Math.max(1, Math.ceil((categorias.length * 46) / W));
  return (
    <div ref={ref}>
    <svg viewBox={`0 0 ${W} ${H}`} className="graf" role="img">
      {marcas.map((m) => (
        <g key={m}>
          <line x1={esq} x2={W} y1={y(m)} y2={y(m)} className="gl2" />
          <text x={esq - 6} y={y(m) + 4} className="eixoTx" textAnchor="end">{formato(m)}</text>
        </g>
      ))}
      {categorias.map((c, i) => {
        const x0 = esq + i * larg + (larg - barra * series.length) / 2;
        return (
          <g key={c}>
            {i === destaque && (
              <rect x={esq + i * larg + 2} y={topoY - 8} width={larg - 4} height={base - topoY + 8}
                    rx="6" className="realce" />
            )}
            {series.map((s, k) => {
              const v = s.valores[i] || 0;
              return (
                <g key={s.rotulo}>
                  <rect x={x0 + k * barra + 1} y={y(v)} width={barra - 2} height={Math.max(0, base - y(v))}
                        rx="3" fill={s.cor}><title>{`${c} — ${s.rotulo}: ${v}`}</title></rect>
                  {v > 0 && (
                    <text x={x0 + k * barra + barra / 2} y={y(v) - 5} className="valTx"
                          textAnchor="middle">{formato(v)}</text>
                  )}
                </g>
              );
            })}
            <text x={esq + i * larg + larg / 2} y={H - 10} textAnchor="middle"
                  className={`eixoTx${i === destaque ? " forte" : ""}`}>
              {i % salto === 0 || i === destaque ? c.split(" ")[0] + (larg > 52 && c.includes(" ") ? ` ${c.split(" ")[1]}` : "") : ""}
            </text>
          </g>
        );
      })}
    </svg>
    </div>
  );
}

/**
 * Linhas com área sob a primeira série. `series`: [{rotulo, cor, valores}].
 * Mostra no máximo ~10 rótulos no eixo X, para não embolar.
 */
export function Linhas({ categorias, series, altura = 230, formato = fmtCurto, formatoDica = String }) {
  const [sobre, setSobre] = useState(-1);
  const [ref, W] = useLargura(680);
  const H = altura, esq = 44, dir = 12, base = H - 28, topoY = 12;
  const n = categorias.length;
  const valores = series.flatMap((s) => s.valores);
  const { fundo, topo, marcas } = eixoFaixa(Math.min(0, ...valores), Math.max(0, ...valores));
  const x = (i) => (n === 1 ? (esq + W - dir) / 2 : esq + (i / (n - 1)) * (W - esq - dir));
  const y = (v) => base - ((v - fundo) / (topo - fundo)) * (base - topoY);
  const zero = y(0);
  const salto = Math.max(1, Math.ceil((n * 52) / W));

  return (
    <div className="grafWrap" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} className="graf" role="img" onMouseLeave={() => setSobre(-1)}>
        {marcas.map((m) => (
          <g key={m}>
            <line x1={esq} x2={W - dir} y1={y(m)} y2={y(m)} className={m === 0 && fundo < 0 ? "gl0" : "gl2"} />
            <text x={esq - 6} y={y(m) + 4} className="eixoTx" textAnchor="end">{formato(m)}</text>
          </g>
        ))}
        {series.map((s, k) => {
          const pts = s.valores.map((v, i) => `${x(i)},${y(v)}`).join(" ");
          return (
            <g key={s.rotulo}>
              {k === 0 && n > 1 && (
                <polygon points={`${x(0)},${zero} ${pts} ${x(n - 1)},${zero}`} fill={s.cor} opacity=".12" />
              )}
              <polyline points={pts} fill="none" stroke={s.cor} strokeWidth="2.6"
                        strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.tracejado ? "6 5" : undefined} />
              {s.valores.map((v, i) => (n <= 31 || i === sobre) && (
                <circle key={i} cx={x(i)} cy={y(v)} r={i === sobre ? 5 : 3} fill="#fff" stroke={s.cor} strokeWidth="2" />
              ))}
            </g>
          );
        })}
        {categorias.map((c, i) => (
          <g key={i}>
            {(i % salto === 0 || i === n - 1) && (
              <text x={x(i)} y={H - 8} textAnchor="middle" className="eixoTx">{c}</text>
            )}
            <rect x={x(i) - (W / n) / 2} y={topoY} width={W / n} height={base - topoY} fill="transparent"
                  onMouseEnter={() => setSobre(i)} onTouchStart={() => setSobre(i)} />
          </g>
        ))}
        {sobre >= 0 && <line x1={x(sobre)} x2={x(sobre)} y1={topoY} y2={base} className="cursor" />}
      </svg>
      {sobre >= 0 && (
        <div className="grafDica" style={{ left: `${(x(sobre) / W) * 100}%` }}>
          <b>{categorias[sobre]}</b>
          {series.map((s) => (
            <span key={s.rotulo}><i style={{ background: s.cor }} />{s.rotulo}: {formatoDica(s.valores[sobre])}</span>
          ))}
        </div>
      )}
    </div>
  );
}

const polar = (cx, cy, r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];

/**
 * Rosca (ou pizza, com `interno={0}`). `fatias`: [{rotulo, valor, cor?}].
 * O centro mostra o total, ou a fatia sob o mouse.
 */
export function Rosca({ fatias, interno = 0.62, centro, formato = String, tamanho = 190 }) {
  const [sobre, setSobre] = useState(-1);
  const total = fatias.reduce((s, f) => s + Number(f.valor), 0);
  const R = 90, C = 100, ri = R * interno;
  let ang = -Math.PI / 2;

  const arcos = fatias.map((f, i) => {
    const frac = total ? Number(f.valor) / total : 0;
    const a0 = ang, a1 = ang + frac * Math.PI * 2;
    ang = a1;
    const cor = f.cor || CORES[i % CORES.length];
    if (frac <= 0) return null;
    if (frac >= 0.9999) {
      return (
        <g key={f.rotulo} onMouseEnter={() => setSobre(i)}>
          <circle cx={C} cy={C} r={R} fill={cor} />
          {ri > 0 && <circle cx={C} cy={C} r={ri} fill="var(--surface)" />}
        </g>
      );
    }
    const grande = a1 - a0 > Math.PI ? 1 : 0;
    const [x0, y0] = polar(C, C, R, a0), [x1, y1] = polar(C, C, R, a1);
    const [x2, y2] = polar(C, C, ri, a1), [x3, y3] = polar(C, C, ri, a0);
    const d = ri > 0
      ? `M${x0},${y0} A${R},${R} 0 ${grande} 1 ${x1},${y1} L${x2},${y2} A${ri},${ri} 0 ${grande} 0 ${x3},${y3}Z`
      : `M${C},${C} L${x0},${y0} A${R},${R} 0 ${grande} 1 ${x1},${y1}Z`;
    const meio = (a0 + a1) / 2;
    const [tx, ty] = polar(C, C, ri > 0 ? (R + ri) / 2 : R * 0.62, meio);
    return (
      <g key={f.rotulo} onMouseEnter={() => setSobre(i)} onTouchStart={() => setSobre(i)}
         style={{ transform: i === sobre ? `translate(${Math.cos(meio) * 4}px,${Math.sin(meio) * 4}px)` : "none",
                  transition: "transform .15s" }}>
        <path d={d} fill={cor} stroke="var(--surface)" strokeWidth="2">
          <title>{`${f.rotulo}: ${formato(f.valor)} (${Math.round(frac * 100)}%)`}</title>
        </path>
        {frac >= 0.07 && (
          <text x={tx} y={ty + 4} textAnchor="middle" className="fatiaTx">{Math.round(frac * 100)}%</text>
        )}
      </g>
    );
  });

  const f = fatias[sobre];
  return (
    <div className="rosca">
      <svg viewBox="0 0 200 200" style={{ width: tamanho, maxWidth: "100%" }} onMouseLeave={() => setSobre(-1)}>
        {total ? arcos : <circle cx={C} cy={C} r={R} fill="var(--deemph)" />}
        {ri > 0 && (
          <>
            <text x={C} y={C - 4} textAnchor="middle" className="centroVal">
              {f ? formato(f.valor) : centro?.valor ?? formato(total)}
            </text>
            <text x={C} y={C + 15} textAnchor="middle" className="centroRot">
              {f ? f.rotulo.slice(0, 22) : centro?.rotulo ?? "total"}
            </text>
          </>
        )}
      </svg>
      <ul className="roscaLeg">
        {fatias.map((s, i) => (
          <li key={s.rotulo} className={i === sobre ? "on" : ""}
              onMouseEnter={() => setSobre(i)} onMouseLeave={() => setSobre(-1)}>
            <i style={{ background: s.cor || CORES[i % CORES.length] }} />
            <span className="nm">{s.rotulo}</span>
            <b>{formato(s.valor)}</b>
            <span className="pc">{total ? Math.round((Number(s.valor) / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Barras horizontais. `itens`: [{rotulo, valor, sub?}]. Com `series` vira
 * barras empilhadas lado a lado: [{chave, rotulo, cor}] lidas de cada item.
 */
export function BarrasH({ itens, formato = String, cor = CORES[0], series }) {
  const total = (i) => (series ? series.reduce((s, x) => s + Number(i[x.chave] || 0), 0) : Number(i.valor));
  const max = Math.max(1, ...itens.map(total));
  return (
    <div className="barrasH">
      {series && <Legenda itens={series} />}
      {itens.map((i, k) => (
        <div className="bh" key={i.rotulo}>
          <div className="nm"><span className="pos">{k + 1}º</span>{i.rotulo}{i.sub && <small>{i.sub}</small>}</div>
          <div className="tr">
            {series
              ? series.map((s) => (
                  <div key={s.chave} className="fl" title={`${s.rotulo}: ${formato(i[s.chave])}`}
                       style={{ width: `${(Number(i[s.chave] || 0) / max) * 100}%`, background: s.cor }} />
                ))
              : <div className="fl" style={{ width: `${(total(i) / max) * 100}%`, background: i.cor || cor }} />}
          </div>
          <div className="vl">{formato(total(i))}</div>
        </div>
      ))}
    </div>
  );
}

/** Uma barra 100% dividida em partes (ex.: status das O.S.). */
export function Empilhada({ partes, formato = String }) {
  const total = partes.reduce((s, p) => s + Number(p.valor), 0);
  return (
    <div className="empilhada">
      <div className="faixa">
        {total === 0 && <div style={{ flex: 1, background: "var(--deemph)" }} />}
        {partes.filter((p) => p.valor > 0).map((p) => (
          <div key={p.rotulo} style={{ flex: Number(p.valor), background: p.cor }}
               title={`${p.rotulo}: ${formato(p.valor)}`}>
            {total && p.valor / total >= 0.12 ? formato(p.valor) : ""}
          </div>
        ))}
      </div>
      <ul className="roscaLeg">
        {partes.map((p) => (
          <li key={p.rotulo}><i style={{ background: p.cor }} /><span className="nm">{p.rotulo}</span>
            <b>{formato(p.valor)}</b>
            <span className="pc">{total ? Math.round((p.valor / total) * 100) : 0}%</span></li>
        ))}
      </ul>
    </div>
  );
}

/** Funil: cada etapa é uma barra centralizada, proporcional à primeira. */
export function Funil({ etapas }) {
  const max = Math.max(1, ...etapas.map((e) => e.valor));
  return (
    <div className="funil">
      {etapas.map((e, i) => (
        <div className="et" key={e.rotulo}>
          <div className="fx" style={{ width: `${Math.max(14, (e.valor / max) * 100)}%`, background: e.cor || CORES[i] }}>
            <b>{e.valor}</b>
          </div>
          <span>{e.rotulo}{e.nota && <em> · {e.nota}</em>}</span>
        </div>
      ))}
    </div>
  );
}

/** Mini gráfico de linha para dentro dos cartões de número. */
export function Faisca({ valores, cor = CORES[0] }) {
  if (!valores?.length || valores.length < 2) return null;
  const max = Math.max(...valores, 1);
  const pts = valores.map((v, i) => `${(i / (valores.length - 1)) * 100},${28 - (v / max) * 26}`).join(" ");
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="faisca">
      <polygon points={`0,30 ${pts} 100,30`} fill={cor} opacity=".13" />
      <polyline points={pts} fill="none" stroke={cor} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
