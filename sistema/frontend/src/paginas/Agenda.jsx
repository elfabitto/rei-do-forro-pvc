/**
 * Agenda do mês. A instalação aparece em todos os dias que ocupa (dia 1/3,
 * 2/3…); a entrega, no dia dela. Azul é entrega, laranja é instalação.
 *
 * No celular o mês vira uma grade compacta com marcações coloridas, e tocar
 * num dia abre a lista daquele dia logo abaixo — é o uso mais comum.
 */
import { useEffect, useMemo, useState } from "react";
import { inicial, textoDias } from "../agendaTexto";
import { Estado, linhas, useApi } from "../componentes";
import Icone from "../icones";
import OrdemDetalhe from "./OrdemDetalhe";

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const ROT_TURNO = { manha: "manhã", tarde: "tarde" };
const primeiroNome = (n) => String(n ?? "").split(" ")[0];

/**
 * Espalha cada compromisso pelos dias que ele ocupa. Para cada dia, guarda os
 * turnos ocupados naquele dia e a posição (dia 2 de 3).
 */
function espalhar(agendamentos) {
  const porDia = {};
  for (const a of agendamentos) {
    const chaves = a.ocupacao?.length ? a.ocupacao : [`${a.data}:${a.turno}`];
    const turnosPorData = {};
    for (const k of chaves) {
      const [d, t] = k.split(":");
      (turnosPorData[d] ??= []).push(t);
    }
    const datas = Object.keys(turnosPorData).sort();
    datas.forEach((d, i) => {
      (porDia[d] ??= []).push({
        ...a,
        turnosDia: turnosPorData[d],
        parte: i + 1,
        partes: datas.length,
      });
    });
  }
  // manhã antes da tarde; entrega antes de instalação no mesmo turno
  for (const lista of Object.values(porDia)) {
    lista.sort((x, y) => x.turnosDia[0].localeCompare(y.turnosDia[0]) || x.tipo.localeCompare(y.tipo));
  }
  return porDia;
}

const turnoDoDia = (e) =>
  e.turnosDia.length === 2 ? "dia todo" : ROT_TURNO[e.turnosDia[0]];

export default function Agenda() {
  const [offset, setOffset] = useState(0);
  const [aberta, setAberta] = useState(null);
  const [selecionado, setSelecionado] = useState(iso(new Date()));

  const { inicio, fim, ref } = useMemo(() => {
    const hoje = new Date();
    const ref = new Date(hoje.getFullYear(), hoje.getMonth() + offset, 1);
    const fim = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
    return { inicio: iso(ref), fim: iso(fim), ref };
  }, [offset]);

  // ao trocar de mês, seleciona hoje (se estiver nele) ou o dia 1
  useEffect(() => {
    const hoje = iso(new Date());
    setSelecionado(hoje >= inicio && hoje <= fim ? hoje : inicio);
  }, [inicio, fim]);

  const disp = useApi("/agenda/disponibilidade/", { de: inicio, ate: fim }, [inicio, fim]);
  const ags = useApi("/agendamentos/", { de: inicio, ate: fim, page_size: 300 }, [inicio, fim]);

  const lista = linhas(ags.dados);
  const porDia = useMemo(() => espalhar(lista), [ags.dados]); // eslint-disable-line react-hooks/exhaustive-deps

  const hoje = iso(new Date());
  const dias = disp.dados?.dias ?? [];
  const vazios = ref.getDay();
  const capInst = disp.dados?.capacidade_instalacao ?? 2;
  const capEnt = disp.dados?.capacidade_entrega_dia ?? 4;

  const nEntregas = lista.filter((a) => a.tipo === "entrega").length;
  const nInstalacoes = lista.filter((a) => a.tipo === "instalacao").length;

  const diaSel = dias.find((d) => d.data === selecionado);
  const eventosSel = porDia[selecionado] ?? [];

  const mes = inicial(ref.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }));
  const tituloSel = selecionado
    ? inicial(new Date(selecionado + "T00:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" }))
    : "";

  return (
    <div className="pagina agenda">
      <h1>Agenda</h1>
      <p className="sub">
        Toque num dia para ver os compromissos. {capInst} instalações por turno e {capEnt} entregas
        por dia — a instalação conta como entrega no dia em que começa.
      </p>

      <div className="card">
        <header className="aghead">
          <div className="agmes">
            <button className="btn ic" onClick={() => setOffset((o) => o - 1)} aria-label="Mês anterior">←</button>
            <h2>{mes}</h2>
            <button className="btn ic" onClick={() => setOffset((o) => o + 1)} aria-label="Próximo mês">→</button>
          </div>
          <button className="btn" onClick={() => setOffset(0)}>Hoje</button>
          <div className="agcont">
            <span className="tag-ent"><i />{nEntregas} entrega(s)</span>
            <span className="tag-ins"><i />{nInstalacoes} instalação(ões)</span>
          </div>
        </header>

        <div className="body">
          <Estado carregando={disp.carregando || ags.carregando} erro={disp.erro || ags.erro}>
            <div className="cal">
              {DIAS.map((d) => <div className="hd" key={d}>{d}</div>)}
              {Array.from({ length: vazios }, (_, i) => <div className="dy vazio" key={`v${i}`} />)}

              {dias.map((dia) => {
                const eventos = porDia[dia.data] ?? [];
                const entLivre = dia.entregas?.livre ?? 0;
                const instLivre = Math.min(...(dia.turnos ?? []).map((t) => t.instalacoes.livre), capInst);
                const classes = ["dy"];
                if (dia.data === hoje) classes.push("hoje");
                if (!dia.atende) classes.push("off");
                if (dia.data === selecionado) classes.push("sel");
                return (
                  <div key={dia.data} className={classes.join(" ")} role="button" tabIndex={0}
                       onClick={() => setSelecionado(dia.data)}
                       onKeyDown={(ev) => ev.key === "Enter" && setSelecionado(dia.data)}
                       aria-label={`${dia.data}: ${eventos.length} compromisso(s)`}>
                    <div className="n">{Number(dia.data.slice(-2))}</div>

                    {/* desktop: um bloco por compromisso */}
                    <div className="evs">
                      {eventos.map((e) => (
                        <button className={`ev ${e.tipo}${e.atrasado ? " atrasado" : ""}${e.partes > 1 ? " cont" : ""}`}
                                key={`${e.id}-${e.parte}`}
                                onClick={(ev) => { ev.stopPropagation(); setAberta(e.ordem); }}
                                title={`${e.os_numero} · ${e.tipo_display} · ${e.cliente_nome} — ${e.bairro}`}>
                          <Icone nome={e.tipo === "entrega" ? "entrega" : "instalacao"} tamanho={12} />
                          <span className="tx">
                            {primeiroNome(e.cliente_nome)}
                            <small>{turnoDoDia(e)}{e.partes > 1 ? ` · ${e.parte}/${e.partes}` : ""}</small>
                          </span>
                        </button>
                      ))}
                    </div>

                    {/* celular: marcações coloridas */}
                    <div className="marcas" aria-hidden="true">
                      {eventos.slice(0, 4).map((e) => (
                        <i key={`${e.id}-${e.parte}`} className={`${e.tipo}${e.atrasado ? " atrasado" : ""}`} />
                      ))}
                      {eventos.length > 4 && <b>+{eventos.length - 4}</b>}
                    </div>

                    {dia.atende && dia.data >= hoje && (
                      <div className="vagas">
                        <span className={`ve${entLivre ? "" : " zero"}`} title="entregas livres">{entLivre}</span>
                        <span className={`vi${instLivre ? "" : " zero"}`} title="equipes livres">{instLivre}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="legend">
              <span><i style={{ background: "var(--s-entrega)" }} />Entrega</span>
              <span><i style={{ background: "var(--s-instalacao)" }} />Instalação</span>
              <span className="leg-vagas">
                Números no canto: <b className="ve">entregas</b> e <b className="vi">equipes</b> livres
              </span>
            </div>
          </Estado>
        </div>
      </div>

      {/* ------------------------------------------------ dia selecionado */}
      <div className="card diasel" style={{ marginTop: 18 }}>
        <header>
          <h2 style={{ textTransform: "none" }}>{tituloSel}</h2>
          {diaSel?.atende && (
            <span className="hint">
              {diaSel.entregas.livre} de {diaSel.entregas.total} entregas livres · equipes livres:{" "}
              {diaSel.turnos.map((t) => `${t.instalacoes.livre} ${ROT_TURNO[t.turno]}`).join(", ")}
            </span>
          )}
        </header>
        {!diaSel?.atende && diaSel ? (
          <p className="nada" style={{ padding: 18 }}>Sem atendimento neste dia.</p>
        ) : eventosSel.length === 0 ? (
          <p className="nada" style={{ padding: 18 }}>Nenhum compromisso neste dia.</p>
        ) : (
          <div className="agdia">
            {eventosSel.map((e) => (
              <button key={`${e.id}-${e.parte}`} className={`agcard ${e.tipo}${e.atrasado ? " atrasado" : ""}`}
                      onClick={() => setAberta(e.ordem)}>
                <div className="topo">
                  <span className={`pill p-${e.tipo}`}>
                    <Icone nome={e.tipo === "entrega" ? "entrega" : "instalacao"} tamanho={12} /> {e.tipo_display}
                  </span>
                  <span className="quando">{turnoDoDia(e)}</span>
                  {e.partes > 1 && <span className="parte">dia {e.parte} de {e.partes}</span>}
                  {e.atrasado && <span className="tag t-atrasado">atrasado</span>}
                </div>
                <b className="cli">{e.cliente_nome}</b>
                <div className="sub2">
                  <Icone nome="local" tamanho={12} /> {e.bairro}
                  {e.endereco_resumo ? ` — ${e.endereco_resumo}` : ""}
                </div>
                <div className="rodape">
                  <span>{e.os_numero}</span>
                  {e.tipo === "instalacao" && e.dias > 0 && <span>{textoDias(e.dias)} de serviço</span>}
                  {e.cliente_telefone && <span>{e.cliente_telefone}</span>}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {aberta && (
        <OrdemDetalhe id={aberta} aoFechar={() => setAberta(null)}
                      aoMudar={() => { disp.recarregar(); ags.recarregar(); }} />
      )}
    </div>
  );
}
