/**
 * Painel da diretoria — o retrato da empresa num período.
 *
 * Padrão: últimos 7 dias. Filtros: dia, 7 dias, mês e período livre; clicar
 * num dia do calendário filtra por aquele dia. Cada número vem comparado com
 * o período anterior de mesmo tamanho.
 *
 * Valores de venda (R$ e m²) e comissões têm um "olho" para ocultar — útil
 * quando o painel está aberto na frente de alguém. A escolha fica no aparelho.
 */
import { useEffect, useMemo, useState } from "react";
import { brl, data, num } from "../api";
import { diaCurto } from "../agendaTexto";
import { Estado, useApi } from "../componentes";
import { BarrasH, CORES, Colunas, Empilhada, Faisca, Funil, Legenda, Linhas, Rosca, fmtCurto } from "../graficos";
import Icone from "../icones";
import "../painel.css";

const C = { laranja: CORES[0], azul: CORES[1], verde: CORES[2], roxo: CORES[3], amarelo: CORES[4],
            cinza: "#b4bac3" };
const SEMANA = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto",
               "setembro", "outubro", "novembro", "dezembro"];

/* ------------------------------------------------------------- datas locais */
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const deIso = (s) => new Date(s + "T00:00:00");
const somar = (s, dias) => { const d = deIso(s); d.setDate(d.getDate() + dias); return iso(d); };
const hojeIso = () => iso(new Date());
const curta = (s) => data(s).slice(0, 5);

function intervalo(modo, f) {
  const hoje = hojeIso();
  if (modo === "dia") return { de: f.dia, ate: f.dia };
  if (modo === "mes") {
    const [a, m] = f.mes.split("-").map(Number);
    return { de: `${f.mes}-01`, ate: iso(new Date(a, m, 0)) };
  }
  if (modo === "periodo") return f.de <= f.ate ? { de: f.de, ate: f.ate } : { de: f.ate, ate: f.de };
  return { de: somar(hoje, -6), ate: hoje };
}

/* ----------------------------------------------------------- olho (oculto) */
const CHAVE_OCULTO = "rf_painel_oculto";
function useOculto() {
  const [oculto, setOculto] = useState(() => {
    try { return JSON.parse(localStorage.getItem(CHAVE_OCULTO)) || {}; } catch { return {}; }
  });
  const alternar = (k) => setOculto((o) => {
    const n = { ...o, [k]: !o[k] };
    try { localStorage.setItem(CHAVE_OCULTO, JSON.stringify(n)); } catch { /* sem armazenamento */ }
    return n;
  });
  return [oculto, alternar];
}

const MASCARA = "••••";
const m2 = (n) => `${num(n, 1)} m²`;

function Olho({ oculto, aoClicar, rotulo }) {
  return (
    <button type="button" className={`olhoBtn${oculto ? " off" : ""}`} onClick={aoClicar}
            title={oculto ? `Mostrar ${rotulo}` : `Ocultar ${rotulo}`}>
      <Icone nome="olho" tamanho={15} />
      <span>{rotulo}</span>
    </button>
  );
}

function Oculto({ aoMostrar }) {
  return (
    <button type="button" className="ocultoBox" onClick={aoMostrar}>
      <Icone nome="olho" tamanho={18} />
      <span>Visualização oculta — clique para mostrar</span>
    </button>
  );
}

/* ----------------------------------------------------------------- filtros */
function Filtros({ modo, setModo, f, setF, periodo }) {
  const muda = (k) => (e) => e.target.value && setF((x) => ({ ...x, [k]: e.target.value }));
  const OPCOES = [["dia", "Dia"], ["7", "7 dias"], ["mes", "Mês"], ["periodo", "Período"]];
  return (
    <div className="filtrosPainel">
      <div className="segmento">
        {OPCOES.map(([k, r]) => (
          <button key={k} type="button" className={modo === k ? "on" : ""} onClick={() => setModo(k)}>{r}</button>
        ))}
      </div>
      {modo === "dia" && (
        <div className="datas">
          <button type="button" className="btn mini" onClick={() => setF((x) => ({ ...x, dia: somar(x.dia, -1) }))}>‹</button>
          <input type="date" value={f.dia} onChange={muda("dia")} />
          <button type="button" className="btn mini" onClick={() => setF((x) => ({ ...x, dia: somar(x.dia, 1) }))}>›</button>
        </div>
      )}
      {modo === "mes" && <div className="datas"><input type="month" value={f.mes} onChange={muda("mes")} /></div>}
      {modo === "periodo" && (
        <div className="datas">
          <input type="date" value={f.de} onChange={muda("de")} />
          <span>até</span>
          <input type="date" value={f.ate} onChange={muda("ate")} />
        </div>
      )}
      {periodo && (
        <span className="periodoTx">
          {periodo.de === periodo.ate ? data(periodo.de) : `${data(periodo.de)} a ${data(periodo.ate)}`}
          <em> · comparado com {periodo.anterior.de === periodo.anterior.ate
            ? data(periodo.anterior.de) : `${curta(periodo.anterior.de)} a ${curta(periodo.anterior.ate)}`}</em>
        </span>
      )}
    </div>
  );
}

/* --------------------------------------------------------- cartão de número */
function Variacao({ atual, anterior }) {
  const a = Number(atual), b = Number(anterior);
  if (!b && !a) return <span className="var neutro">—</span>;
  if (!b) return <span className="var sobe">novo</span>;
  const p = Math.round(((a - b) / b) * 100);
  if (p === 0) return <span className="var neutro">= 0%</span>;
  return <span className={`var ${p > 0 ? "sobe" : "desce"}`}>{p > 0 ? "▲" : "▼"} {Math.abs(p)}%</span>;
}

function Kpi({ icone, cor, rotulo, valor, atual, anterior, sub, faisca, oculto }) {
  return (
    <div className="kpi">
      <div className="topo">
        <span className="ico" style={{ color: cor, background: `${cor}1a` }}><Icone nome={icone} tamanho={16} /></span>
        <span className="lab">{rotulo}</span>
        {!oculto && anterior !== undefined && <Variacao atual={atual} anterior={anterior} />}
      </div>
      <div className="val">{oculto ? MASCARA : valor}</div>
      <div className="sub">{sub}</div>
      {!oculto && faisca && <Faisca valores={faisca} cor={cor} />}
    </div>
  );
}

function Cartao({ titulo, dica, extra, children, className = "" }) {
  return (
    <div className={`card ${className}`}>
      <header><h2>{titulo}</h2>{dica && <span className="hint">{dica}</span>}{extra}</header>
      <div className="body">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------ calendário compacto */
function CalendarioCompacto({ periodo, aoEscolherDia }) {
  const [mes, setMes] = useState(() => hojeIso().slice(0, 7));
  const cal = useApi("/painel/calendario/", { mes }, [mes]);
  const [a, m] = mes.split("-").map(Number);
  const primeiro = new Date(a, m - 1, 1);
  const vazios = (primeiro.getDay() + 6) % 7;           // semana começa na segunda
  const total = new Date(a, m, 0).getDate();
  const hoje = hojeIso();
  const andar = (k) => { const d = new Date(a, m - 1 + k, 1); setMes(iso(d).slice(0, 7)); };
  const dias = cal.dados?.dias || {};

  return (
    <div className="calMini">
      <div className="cmTopo">
        <button type="button" className="btn mini" onClick={() => andar(-1)}>‹</button>
        <b>{MESES[m - 1]} {a}</b>
        <button type="button" className="btn mini" onClick={() => andar(1)}>›</button>
      </div>
      <div className="cmGrade">
        {SEMANA.map((s) => <div className="cmHd" key={s}>{s}</div>)}
        {[...Array(vazios)].map((_, i) => <div key={`v${i}`} />)}
        {[...Array(total)].map((_, i) => {
          const d = `${mes}-${String(i + 1).padStart(2, "0")}`;
          const q = dias[d];
          const noPeriodo = periodo && d >= periodo.de && d <= periodo.ate;
          const domingo = (vazios + i) % 7 === 6;
          return (
            <button type="button" key={d} onClick={() => aoEscolherDia(d)}
                    className={`cmDia${d === hoje ? " hoje" : ""}${noPeriodo ? " sel" : ""}${domingo ? " dom" : ""}`}
                    title={q ? `${q.instalacoes} instalação(ões) · ${q.entregas} entrega(s)` : "livre"}>
              <span className="n">{i + 1}</span>
              <span className="pts">
                {q?.instalacoes > 0 && <i className="pi">{q.instalacoes}</i>}
                {q?.entregas > 0 && <i className="pe">{q.entregas}</i>}
              </span>
            </button>
          );
        })}
      </div>
      <Legenda itens={[{ rotulo: "Instalações em obra", cor: C.laranja }, { rotulo: "Entregas", cor: C.azul }]} />
      <p className="obs" style={{ margin: "6px 0 0" }}>Clique num dia para ver o painel daquele dia.</p>
    </div>
  );
}

/* Colunas do resumo por vendedor. `grupo` diz qual olho esconde a coluna
   (oculta não ordena, para não revelar o ranking). */
const COLUNAS_RESUMO = [
  { campo: "nome", rotulo: "Vendedor", texto: true },
  { campo: "vendas", rotulo: "Vendas" },
  { campo: "m2", rotulo: "m²", grupo: "vendas" },
  { campo: "valor", rotulo: "Valor vendido", grupo: "vendas" },
  { campo: "ticket", rotulo: "Ticket médio", grupo: "vendas", valor: (v) => (v.vendas ? v.valor / v.vendas : 0) },
  { campo: "comissao_gerada", rotulo: "Comissão gerada", grupo: "comissao" },
  { campo: "comissao_recebida", rotulo: "Recebida", grupo: "comissao" },
  { campo: "comissao_pendente", rotulo: "A pagar", grupo: "comissao" },
];

/* --------------------------------------------------------------- a página */
const SITUACAO = {
  feito: ["Feito", "t-finalizada"],
  previsto: ["Previsto", "t-gerada"],
  atrasado: ["Atrasado", "t-atrasado"],
};

export default function Painel() {
  const [modo, setModo] = useState("7");
  const [f, setF] = useState(() => {
    const h = hojeIso();
    return { dia: h, mes: h.slice(0, 7), de: somar(h, -29), ate: h };
  });
  const [oculto, alternar] = useOculto();
  const alvo = useMemo(() => intervalo(modo, f), [modo, f]);
  const painel = useApi("/painel/", alvo, [alvo.de, alvo.ate]);
  const d = painel.dados;

  useEffect(() => { document.title = "Painel · Rei do Forro"; }, []);

  const escolherDia = (dia) => { setF((x) => ({ ...x, dia })); setModo("dia"); };
  const ov = oculto.vendas, oc = oculto.comissao;
  const R = (v) => (ov ? MASCARA : brl(v));

  return (
    <div className="pagina painel">
      <div className="painelTopo">
        <div>
          <h1>Painel</h1>
          <p className="sub">Vendas, recebimentos, execução e comissões da empresa</p>
        </div>
        <div className="olhos">
          <Olho oculto={ov} aoClicar={() => alternar("vendas")} rotulo="valores de venda" />
          <Olho oculto={oc} aoClicar={() => alternar("comissao")} rotulo="comissões" />
        </div>
      </div>

      <Filtros modo={modo} setModo={setModo} f={f} setF={setF} periodo={d?.periodo} />

      {!d ? (
        <Estado carregando={painel.carregando} erro={painel.erro} />
      ) : (
        <div className={painel.carregando ? "recarregando" : ""}>
          {painel.erro && <div className="erro mb">{painel.erro}</div>}
          <Conteudo d={d} ov={ov} oc={oc} R={R} alternar={alternar} escolherDia={escolherDia} />
        </div>
      )}
    </div>
  );
}

function Conteudo({ d, ov, oc, R, alternar, escolherDia }) {
  const a = d.atual, b = d.anterior;
  const pontos = d.serie.pontos;
  const nome = (n) => n.split(" ")[0];
  const hoje = d.periodo.hoje;
  const escalaTx = { dia: "por dia", semana: "por semana", mes: "por mês" }[d.serie.escala];

  const vendedores = d.por_vendedor;
  const comVendas = vendedores.filter((v) => v.vendas > 0);
  const totais = vendedores.reduce((t, v) => {
    ["vendas", "m2", "valor", "comissao_gerada", "comissao_recebida", "comissao_pendente"]
      .forEach((k) => { t[k] = (t[k] || 0) + Number(v[k]); });
    return t;
  }, {});

  const semanaCats = d.semana.dias.map((x) => `${SEMANA[(deIso(x.data).getDay() + 6) % 7]} ${curta(x.data).slice(0, 2)}`);
  const idxHoje = d.semana.dias.findIndex((x) => x.data === hoje);
  const semInst = d.semana.dias.reduce((s, x) => s + x.instalacoes, 0);
  const semEnt = d.semana.dias.reduce((s, x) => s + x.entregas, 0);

  // resumo por vendedor: clique no título ordena; clicar de novo inverte
  const [ordem, setOrdem] = useState({ campo: "valor", cresc: false });
  const ordenar = (campo) => setOrdem((o) => (o.campo === campo ? { campo, cresc: !o.cresc } : { campo, cresc: true }));
  const ordenados = useMemo(() => {
    const col = COLUNAS_RESUMO.find((c) => c.campo === ordem.campo);
    const val = (v) => (col.valor ? col.valor(v) : v[col.campo]);
    return vendedores.slice().sort((x, y) => {
      const r = col.texto
        ? String(val(x)).localeCompare(String(val(y)), "pt-BR", { sensitivity: "base" })
        : Number(val(x)) - Number(val(y));
      return ordem.cresc ? r : -r;
    });
  }, [vendedores, ordem]);

  const coresStatus = { gerada: C.laranja, em_execucao: C.azul, finalizada: C.verde };
  const orc = d.orcamentos;

  return (
    <>
      {/* ------------------------------------------------ números principais */}
      <div className="kpis mb">
        <Kpi icone="dinheiro" cor={C.laranja} rotulo="Valor vendido" valor={brl(a.valor)}
             atual={a.valor} anterior={b.valor} oculto={ov}
             sub={ov ? "oculto" : `antes: ${brl(b.valor)}`} faisca={pontos.map((p) => p.vendido)} />
        <Kpi icone="area" cor={C.roxo} rotulo="m² vendidos" valor={m2(a.m2)}
             atual={a.m2} anterior={b.m2} oculto={ov}
             sub={ov ? "oculto" : `antes: ${m2(b.m2)}`} />
        <Kpi icone="ordem" cor={C.azul} rotulo="Vendas (O.S.)" valor={a.vendas}
             atual={a.vendas} anterior={b.vendas}
             sub={ov ? "ticket médio oculto" : `ticket médio ${brl(a.ticket)}`} faisca={pontos.map((p) => p.vendas)} />
        <Kpi icone="fechado" cor={C.verde} rotulo="Recebido" valor={brl(a.recebido)}
             atual={a.recebido} anterior={b.recebido} oculto={ov}
             sub={ov ? "oculto" : `antes: ${brl(b.recebido)}`} faisca={pontos.map((p) => p.recebido)} />
        <Kpi icone="instalacao" cor={C.laranja} rotulo="Serviços executados" valor={a.instalacoes_feitas}
             atual={a.instalacoes_feitas} anterior={b.instalacoes_feitas}
             sub={`de ${a.instalacoes} instalação(ões) no período`} />
        <Kpi icone="entrega" cor={C.azul} rotulo="Entregas feitas" valor={a.entregas_feitas}
             atual={a.entregas_feitas} anterior={b.entregas_feitas}
             sub={`de ${a.entregas} entrega(s) no período`} />
      </div>

      <div className="faixaInfo mb">
        <div><span>A receber (O.S. abertas)</span><b>{R(d.carteira.a_receber)}</b></div>
        <div><span>O.S. agendadas</span><b>{d.carteira.os_agendadas}</b></div>
        <div><span>Em execução</span><b>{d.carteira.os_em_execucao}</b></div>
        <div><span>Conversão de orçamentos</span><b>{a.conversao}%</b>
          <Variacao atual={a.conversao} anterior={b.conversao} /></div>
        <div><span>Total de serviços</span><b>{a.instalacoes}</b></div>
        <div><span>Total de entregas</span><b>{a.entregas}</b></div>
        <div><span>Comissões a pagar</span><b>{oc ? MASCARA : brl(d.carteira.comissao_pendente)}</b></div>
      </div>

      {/* --------------------------------------------- tempo e composição */}
      <div className="cols g-21 mb">
        <Cartao titulo="Vendido × recebido" dica={escalaTx}>
          {ov ? <Oculto aoMostrar={() => alternar("vendas")} /> : (
            <>
              <Legenda itens={[{ rotulo: "Vendido", cor: C.laranja, linha: true },
                               { rotulo: "Recebido", cor: C.verde, linha: true }]} />
              <Linhas categorias={pontos.map((p) => p.rotulo)} formatoDica={brl}
                      series={[{ rotulo: "Vendido", cor: C.laranja, valores: pontos.map((p) => Number(p.vendido)) },
                               { rotulo: "Recebido", cor: C.verde, valores: pontos.map((p) => Number(p.recebido)) }]} />
            </>
          )}
        </Cartao>
        <Cartao titulo="Vendas por tipo" dica="valor vendido">
          {ov ? <Oculto aoMostrar={() => alternar("vendas")} /> : (
            <Rosca formato={brl} centro={{ valor: `${a.vendas}`, rotulo: a.vendas === 1 ? "venda" : "vendas" }}
                   fatias={d.tipos.map((t, i) => ({ rotulo: t.rotulo, valor: Number(t.valor),
                                                     cor: [C.azul, C.laranja][i] }))} />
          )}
        </Cartao>
      </div>

      {/* --------------------------------------------------- vendedores */}
      <div className="cols g-21 mb">
        <Cartao titulo="Vendas por vendedor" dica="quantidade de O.S. no período">
          {comVendas.length === 0 ? <div className="vazio">Nenhuma venda no período.</div> : (
            <BarrasH formato={(v) => `${v}`} cor={C.azul}
                     itens={comVendas.slice().sort((x, y) => y.vendas - x.vendas).map((v) => ({
                       rotulo: nome(v.nome), valor: v.vendas,
                       sub: ov ? null : `${m2(v.m2)} · ${brl(v.valor)}`,
                     }))} />
          )}
        </Cartao>
        <Cartao titulo="Participação no faturamento" dica="R$ vendido por vendedor">
          {ov ? <Oculto aoMostrar={() => alternar("vendas")} />
            : comVendas.length === 0 ? <div className="vazio">Nenhuma venda no período.</div> : (
              <Rosca interno={0} formato={brl}
                     fatias={comVendas.map((v) => ({ rotulo: nome(v.nome), valor: Number(v.valor) }))} />
            )}
        </Cartao>
      </div>

      <div className="cols g-12 mb">
        <Cartao titulo="m² vendidos por vendedor">
          {ov ? <Oculto aoMostrar={() => alternar("vendas")} />
            : comVendas.length === 0 ? <div className="vazio">Nenhuma venda no período.</div> : (
              <Colunas categorias={comVendas.map((v) => nome(v.nome))} altura={210}
                       series={[{ rotulo: "m²", cor: C.roxo, valores: comVendas.map((v) => Number(v.m2)) }]} />
            )}
        </Cartao>
        <Cartao titulo="Comissão por pessoa" dica="recebida no período × ainda a pagar">
          {oc ? <Oculto aoMostrar={() => alternar("comissao")} />
            : vendedores.every((v) => !Number(v.comissao_recebida) && !Number(v.comissao_pendente))
              ? <div className="vazio">Nenhuma comissão recebida ou a pagar.</div> : (
                <BarrasH formato={brl}
                         series={[{ chave: "comissao_recebida", rotulo: "Recebida", cor: C.verde },
                                  { chave: "comissao_pendente", rotulo: "A pagar", cor: C.amarelo }]}
                         itens={vendedores.filter((v) => Number(v.comissao_recebida) || Number(v.comissao_pendente))
                           .sort((x, y) => (y.comissao_recebida + y.comissao_pendente) - (x.comissao_recebida + x.comissao_pendente))
                           .map((v) => ({ ...v, rotulo: nome(v.nome) }))} />
              )}
        </Cartao>
      </div>

      {/* ------------------------------------------------------- agenda */}
      <div className="cols g-21 mb">
        <Cartao titulo="Semana vigente" dica={`${data(d.semana.de)} a ${data(d.semana.ate)} · ${semInst} instalação(ões) em obra, ${semEnt} entrega(s)`}>
          <Legenda itens={[{ rotulo: "Instalações", cor: C.laranja }, { rotulo: "Entregas", cor: C.azul }]} />
          <Colunas categorias={semanaCats} destaque={idxHoje} formato={(v) => num(v, 0)}
                   series={[{ rotulo: "Instalações", cor: C.laranja, valores: d.semana.dias.map((x) => x.instalacoes) },
                            { rotulo: "Entregas", cor: C.azul, valores: d.semana.dias.map((x) => x.entregas) }]} />
        </Cartao>
        <Cartao titulo="Calendário">
          <CalendarioCompacto periodo={d.periodo} aoEscolherDia={escolherDia} />
        </Cartao>
      </div>

      {/* ----------------------------------------------- operação e caixa */}
      <div className="cols c-3 mb">
        <Cartao titulo="Funil de orçamentos" dica="criados no período">
          <Funil etapas={[
            { rotulo: "Orçamentos feitos", valor: orc.criados, cor: C.cinza },
            { rotulo: "Viraram O.S.", valor: orc.convertidos, cor: C.laranja,
              nota: orc.criados ? `${Math.round((orc.convertidos / orc.criados) * 100)}%` : null },
            { rotulo: "Ainda em aberto", valor: orc.abertos, cor: C.azul },
            { rotulo: "Perdidos", valor: orc.perdidos, cor: "#d03b3b" },
          ]} />
        </Cartao>
        <Cartao titulo="Formas de recebimento" dica="pagamentos do período">
          {ov ? <Oculto aoMostrar={() => alternar("vendas")} />
            : d.formas.length === 0 ? <div className="vazio">Nada recebido no período.</div> : (
              <Rosca formato={brl} tamanho={170} centro={{ valor: `R$ ${fmtCurto(Number(a.recebido))}`, rotulo: "recebido" }}
                     fatias={d.formas.map((x) => ({
                       rotulo: x.rotulo, valor: Number(x.valor),
                       cor: { pix: C.verde, dinheiro: C.amarelo, credito: C.roxo, debito: C.azul }[x.forma],
                     }))} />
            )}
        </Cartao>
        <Cartao titulo="Situação das vendas" dica="O.S. geradas no período">
          <Empilhada partes={d.status.map((s) => ({ rotulo: s.rotulo, valor: s.qtd, cor: coresStatus[s.status] }))} />
        </Cartao>
      </div>

      <div className="cols g-12 mb">
        <Cartao titulo="Forros mais vendidos" dica="m² no período">
          {ov ? <Oculto aoMostrar={() => alternar("vendas")} />
            : d.forros.length === 0 ? <div className="vazio">Nenhum forro vendido no período.</div> : (
              <BarrasH formato={m2} cor={C.laranja}
                       itens={d.forros.map((x) => ({ rotulo: x.nome, valor: Number(x.m2),
                                                     sub: `${x.vendas} venda${x.vendas > 1 ? "s" : ""}` }))} />
            )}
        </Cartao>
        <Cartao titulo="Serviços e entregas do período" dica={`${d.servicos.length} no total`}>
          {d.servicos.length === 0 ? <div className="vazio">Nada agendado no período.</div> : (
            <div className="tw servTab">
              <table>
                <thead><tr><th>Data</th><th>Tipo</th><th>Cliente</th><th>O.S.</th><th>Situação</th></tr></thead>
                <tbody>
                  {d.servicos.map((s) => (
                    <tr key={s.id}>
                      <td>{diaCurto(s.data)}{s.data_fim && s.data_fim !== s.data && <small> → {curta(s.data_fim)}</small>}</td>
                      <td><span className={`pill p-${s.tipo}`}>{s.tipo === "entrega" ? "Entrega" : "Instalação"}</span></td>
                      <td>{s.cliente}</td>
                      <td className="mono">{s.numero.replace("OS-", "")}</td>
                      <td><span className={`tag ${SITUACAO[s.situacao][1]}`}>{SITUACAO[s.situacao][0]}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Cartao>
      </div>

      {/* ------------------------------------------------ tabela resumo */}
      <Cartao titulo="Resumo por vendedor" dica="vendas do período; comissão recebida no período e a pagar hoje">
        {vendedores.length === 0 ? <div className="vazio">Sem movimento no período.</div> : (
          <div className="tw">
            <table className="resumoTab">
              <thead>
                <tr>
                  {COLUNAS_RESUMO.map((c) => {
                    const travada = (c.grupo === "vendas" && ov) || (c.grupo === "comissao" && oc);
                    const ativa = ordem.campo === c.campo;
                    return (
                      <th key={c.campo} className={`${c.texto ? "" : "num"} ordenavel${ativa ? " on" : ""}`}
                          aria-sort={ativa ? (ordem.cresc ? "ascending" : "descending") : "none"}>
                        <button type="button" disabled={travada} onClick={() => ordenar(c.campo)}
                                title={travada ? "coluna oculta" : c.texto ? "Ordenar A–Z / Z–A" : "Ordenar menor → maior / maior → menor"}>
                          {c.rotulo}
                          <span className="seta">{ativa ? (ordem.cresc ? "▲" : "▼") : "↕"}</span>
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {ordenados.map((v) => (
                  <tr key={v.id}>
                    <td><b>{v.nome}</b></td>
                    <td className="num">{v.vendas}</td>
                    <td className="num">{ov ? MASCARA : num(v.m2, 1)}</td>
                    <td className="num">{R(v.valor)}</td>
                    <td className="num">{v.vendas ? R(v.valor / v.vendas) : "—"}</td>
                    <td className="num">{oc ? MASCARA : brl(v.comissao_gerada)}</td>
                    <td className="num">{oc ? MASCARA : brl(v.comissao_recebida)}</td>
                    <td className="num">{oc ? MASCARA : brl(v.comissao_pendente)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td className="num">{totais.vendas}</td>
                  <td className="num">{ov ? MASCARA : num(totais.m2, 1)}</td>
                  <td className="num">{R(totais.valor)}</td>
                  <td className="num">{totais.vendas ? R(totais.valor / totais.vendas) : "—"}</td>
                  <td className="num">{oc ? MASCARA : brl(totais.comissao_gerada)}</td>
                  <td className="num">{oc ? MASCARA : brl(totais.comissao_recebida)}</td>
                  <td className="num">{oc ? MASCARA : brl(totais.comissao_pendente)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Cartao>
    </>
  );
}
