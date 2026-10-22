/**
 * Agenda do mês. A instalação aparece em todos os dias que ocupa (dia 1/3,
 * 2/3…); a entrega, no dia dela. Azul é entrega, laranja é instalação, roxo é
 * visita técnica (orçamento presencial, que ocupa uma vaga de entrega).
 *
 * Exceção: a gestão (diretoria e TI) abre vaga a mais num dia lotado. O dia com
 * exceção ganha uma bolinha vermelha no calendário.
 *
 * No celular o mês vira uma grade compacta com marcações coloridas, e tocar
 * num dia abre a lista daquele dia logo abaixo — é o uso mais comum.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { inicial, textoDias } from "../agendaTexto";
import { api } from "../api";
import { useAuth } from "../auth";
import { BotaoAcao, Campo, Estado, Modal, linhas, useApi } from "../componentes";
import Icone from "../icones";
import OrdemDetalhe from "./OrdemDetalhe";

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const ROT_TURNO = { manha: "manhã", tarde: "tarde" };
const primeiroNome = (n) => String(n ?? "").split(" ")[0];
const ICONE = { entrega: "entrega", instalacao: "instalacao", visita: "visita" };

/** A visita técnica no mesmo formato de um agendamento, para entrar na mesma grade. */
const comoCompromisso = (v) => ({
  id: `v${v.id}`, visita: v.id, tipo: "visita", tipo_display: "Visita técnica",
  data: v.data, turno: v.turno, ocupacao: [`${v.data}:${v.turno}`],
  os_numero: v.numero, atrasado: v.atrasada, cliente_nome: v.cliente_detalhe?.nome,
  cliente_telefone: v.cliente_detalhe?.telefone, bairro: v.bairro, endereco_resumo: v.endereco_resumo,
});

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

/** Abrir vaga de exceção: dia, tipo, quantas vagas e o porquê. */
function ExcecaoModal({ dataInicial, aoFechar, aoConcluir }) {
  const hoje = iso(new Date());
  const [f, setF] = useState({ data: dataInicial >= hoje ? dataInicial : hoje, tipo: "entrega", vagas: 1, motivo: "" });
  const [erro, setErro] = useState("");
  const mudar = (campo) => (e) => setF((s) => ({ ...s, [campo]: e.target.value }));

  async function abrir() {
    setErro("");
    try {
      await api.post("/excecoes-agenda/", { ...f, vagas: Number(f.vagas) });
      aoConcluir();
      return "exceção aberta";
    } catch (e) {
      setErro(e.message);
      throw e;
    }
  }

  return (
    <Modal
      titulo="Abrir exceção na agenda"
      subtitulo="Vaga a mais num dia lotado. Só a gestão abre; o sistema passa a aceitar o agendamento nesse dia."
      aoFechar={aoFechar}
      largura={460}
      rodape={
        <div className="btnrow" style={{ padding: 0 }}>
          <BotaoAcao classe="btn p" aoClicar={abrir}>Abrir exceção</BotaoAcao>
          <button className="btn" onClick={aoFechar}>Cancelar</button>
        </div>
      }
    >
      {erro && <div className="erro">{erro}</div>}
      <Campo rotulo="Data">
        <input type="date" value={f.data} min={hoje} onChange={mudar("data")} />
      </Campo>
      <div className="lbl">Vaga para</div>
      <div className="opts" style={{ marginBottom: 14 }}>
        <label className={`opt${f.tipo === "entrega" ? " on" : ""}`}>
          <input type="radio" name="tipoExc" checked={f.tipo === "entrega"}
                 onChange={() => setF((s) => ({ ...s, tipo: "entrega" }))} />
          <span className="t">Entrega / visita técnica
            <small>Entrega de material, visita (orçamento presencial) ou o dia de início de uma instalação</small>
          </span>
        </label>
        <label className={`opt${f.tipo === "instalacao" ? " on" : ""}`}>
          <input type="radio" name="tipoExc" checked={f.tipo === "instalacao"}
                 onChange={() => setF((s) => ({ ...s, tipo: "instalacao" }))} />
          <span className="t">Instalação
            <small>Uma equipe a mais na manhã e na tarde do dia (já inclui a vaga de entrega)</small>
          </span>
        </label>
      </div>
      <Campo rotulo="Quantas vagas a mais">
        <input type="number" min={1} max={10} value={f.vagas} onChange={mudar("vagas")} style={{ maxWidth: 120 }} />
      </Campo>
      <Campo rotulo="Motivo (opcional)">
        <input value={f.motivo} onChange={mudar("motivo")} maxLength={160} placeholder="Ex.: cliente antigo, entrega rápida" />
      </Campo>
    </Modal>
  );
}

const turnoDoDia = (e) =>
  e.turnosDia.length === 2 ? "dia todo" : ROT_TURNO[e.turnosDia[0]];

export default function Agenda() {
  const navegar = useNavigate();
  const { pode } = useAuth();
  const [abrindoExcecao, setAbrindoExcecao] = useState(false);
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
  const vis = useApi("/visitas/", { de: inicio, ate: fim, page_size: 300 }, [inicio, fim]);
  const exc = useApi("/excecoes-agenda/", { de: inicio, ate: fim }, [inicio, fim]);
  const excecoes = linhas(exc.dados);
  const excecoesDo = (d) => excecoes.filter((e) => e.data === d);

  async function retirarExcecao(e) {
    await api.delete(`/excecoes-agenda/${e.id}/`);
    exc.recarregar();
    disp.recarregar();
    return "retirada";
  }

  // visita perdida não ocupa mais a agenda
  const visitas = linhas(vis.dados).filter((v) => v.status !== "perdida").map(comoCompromisso);
  const lista = [...linhas(ags.dados), ...visitas];
  const porDia = useMemo(() => espalhar(lista), [ags.dados, vis.dados]); // eslint-disable-line react-hooks/exhaustive-deps

  // a visita abre no painel de visitas; o resto, na gaveta da O.S.
  const abrir = (e) => (e.tipo === "visita" ? navegar(`/visitas?abrir=${e.visita}`) : setAberta(e.ordem));

  const hoje = iso(new Date());
  const dias = disp.dados?.dias ?? [];
  const vazios = ref.getDay();
  const capInst = disp.dados?.capacidade_instalacao ?? 2;
  const capEnt = disp.dados?.capacidade_entrega_dia ?? 4;

  const nEntregas = lista.filter((a) => a.tipo === "entrega").length;
  const nInstalacoes = lista.filter((a) => a.tipo === "instalacao").length;
  const nVisitas = visitas.length;

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
        por dia — a instalação conta como entrega no dia em que começa, e a visita técnica também.
      </p>

      <div className="card">
        <header className="aghead">
          <div className="agmes">
            <button className="btn ic" onClick={() => setOffset((o) => o - 1)} aria-label="Mês anterior">←</button>
            <h2>{mes}</h2>
            <button className="btn ic" onClick={() => setOffset((o) => o + 1)} aria-label="Próximo mês">→</button>
          </div>
          <button className="btn" onClick={() => setOffset(0)}>Hoje</button>
          {pode("abrirExcecao") && (
            <button className="btn excBtn" onClick={() => setAbrindoExcecao(true)}
                    title="Abrir vaga a mais num dia lotado">
              <i className="excBola" aria-hidden="true" /> Abrir exceção
            </button>
          )}
          <div className="agcont">
            <span className="tag-ent"><i />{nEntregas} entrega(s)</span>
            <span className="tag-ins"><i />{nInstalacoes} instalação(ões)</span>
            <span className="tag-vis"><i />{nVisitas} visita(s)</span>
          </div>
        </header>

        <div className="body">
          <Estado carregando={disp.carregando || ags.carregando || vis.carregando}
                  erro={disp.erro || ags.erro || vis.erro}>
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
                    <div className="n">
                      {Number(dia.data.slice(-2))}
                      {excecoesDo(dia.data).length > 0 && (
                        <i className="excBola" title={`Exceção: ${excecoesDo(dia.data)
                          .map((e) => `+${e.vagas} ${e.tipo_display.toLowerCase()}`).join(", ")}`} />
                      )}
                    </div>

                    {/* desktop: um bloco por compromisso */}
                    <div className="evs">
                      {eventos.map((e) => (
                        <button className={`ev ${e.tipo}${e.atrasado ? " atrasado" : ""}${e.partes > 1 ? " cont" : ""}`}
                                key={`${e.id}-${e.parte}`}
                                onClick={(ev) => { ev.stopPropagation(); abrir(e); }}
                                title={`${e.os_numero} · ${e.tipo_display} · ${e.cliente_nome} — ${e.bairro}`}>
                          <Icone nome={ICONE[e.tipo]} tamanho={12} />
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
                        <span className={`vi${instLivre ? "" : " zero"}`} title="vagas de instalação livres">{instLivre}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="legend">
              <span><i style={{ background: "var(--s-entrega)" }} />Entrega</span>
              <span><i style={{ background: "var(--s-instalacao)" }} />Instalação</span>
              <span><i style={{ background: "var(--s-visita)" }} />Visita técnica</span>
              <span><i className="excBola" style={{ position: "static" }} />Exceção (vaga extra)</span>
              <span className="leg-vagas">
                Números no canto: vagas livres de <b className="ve">entrega</b> e de <b className="vi">instalação</b>
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
              {diaSel.entregas.livre} de {diaSel.entregas.total} entregas livres · instalação livre:{" "}
              {diaSel.turnos.map((t) => `${t.instalacoes.livre} ${ROT_TURNO[t.turno]}`).join(", ")}
            </span>
          )}
        </header>
        {excecoesDo(selecionado).length > 0 && (
          <div className="excLista">
            {excecoesDo(selecionado).map((e) => (
              <div className="excItem" key={e.id}>
                <i className="excBola" style={{ position: "static" }} />
                <span>
                  <b>Exceção: +{e.vagas} {e.tipo_display.toLowerCase()}</b>
                  {e.motivo ? ` — ${e.motivo}` : ""}
                  <small> · aberta por {e.criado_por_nome}</small>
                </span>
                {pode("abrirExcecao") && (
                  <BotaoAcao classe="btn mini-baixa" aoClicar={() => retirarExcecao(e)}>Retirar</BotaoAcao>
                )}
              </div>
            ))}
          </div>
        )}
        {!diaSel?.atende && diaSel ? (
          <p className="nada" style={{ padding: 18 }}>Sem atendimento neste dia.</p>
        ) : eventosSel.length === 0 ? (
          <p className="nada" style={{ padding: 18 }}>Nenhum compromisso neste dia.</p>
        ) : (
          <div className="agdia">
            {eventosSel.map((e) => (
              <button key={`${e.id}-${e.parte}`} className={`agcard ${e.tipo}${e.atrasado ? " atrasado" : ""}`}
                      onClick={() => abrir(e)}>
                <div className="topo">
                  <span className={`pill p-${e.tipo}`}>
                    <Icone nome={ICONE[e.tipo]} tamanho={12} /> {e.tipo_display}
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

      {abrindoExcecao && (
        <ExcecaoModal dataInicial={selecionado} aoFechar={() => setAbrindoExcecao(false)}
                      aoConcluir={() => { setAbrindoExcecao(false); exc.recarregar(); disp.recarregar(); }} />
      )}
      {aberta && (
        <OrdemDetalhe id={aberta} aoFechar={() => setAberta(null)}
                      aoMudar={() => { disp.recarregar(); ags.recarregar(); vis.recarregar(); }} />
      )}
    </div>
  );
}
