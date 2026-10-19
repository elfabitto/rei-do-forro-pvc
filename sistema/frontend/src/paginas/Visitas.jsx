/**
 * Visitas técnicas (orçamento presencial).
 *
 * Agendado → o técnico vai, mede e clica em Gerar Serviço: abre o orçamento já
 * com o cliente da visita; ao fechar o negócio, a O.S. nasce pelo caminho de
 * sempre e a visita fica "Convertido em Serviço". Desistiu: Perdido, e a vaga
 * do dia volta para a agenda.
 */
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, data as fmtData, dataHora } from "../api";
import { diaCurto } from "../agendaTexto";
import { useAuth } from "../auth";
import CalendarioVagas from "../calendario";
import { BotaoAcao, Campo, Confirmacao, Estado, Etiqueta, Gaveta, Modal, linhas, useApi } from "../componentes";
import Icone from "../icones";
import { digitos } from "../mascaras";

const FILTROS = [
  ["", "Todas"],
  ["agendada", "Agendado"],
  ["convertida", "Convertido em Serviço"],
  ["perdida", "Perdido"],
];

const quandoTexto = (v) => `${diaCurto(v.data)} · ${v.turno_display}`;
const zap = (tel) => `https://wa.me/55${digitos(tel)}`;

/** Gerar Serviço: faz o orçamento da visita; se ele já existe, segue para a O.S. */
function useGerarServico() {
  const navegar = useNavigate();
  return (v) => navegar(v.orcamento
    ? `/ordens/nova?orcamento=${v.orcamento}&endereco=${v.endereco}`
    : `/orcamentos/novo?visita=${v.id}`);
}

/** Os botões da visita — os mesmos no card e na gaveta. */
function AcoesVisita({ v, aoRemarcar, aoPerder, aoAbrir }) {
  const { pode } = useAuth();
  const navegar = useNavigate();
  const gerar = useGerarServico();
  const agendada = v.status === "agendada";

  return (
    <>
      {aoAbrir && (
        <button className="btn" onClick={() => aoAbrir(v.id)}>
          <Icone nome="visita" tamanho={15} /> Abrir
        </button>
      )}
      {agendada && (
        <button className="btn verde" disabled={!pode("vender")} onClick={() => gerar(v)}
                title={v.orcamento ? `Orçamento ${v.orcamento_numero} já feito — segue para a O.S.` : ""}>
          <Icone nome="ordem" tamanho={15} /> Gerar Serviço
        </button>
      )}
      {agendada && (
        <button className="btn" disabled={!v.pode_editar} onClick={() => aoRemarcar(v)}
                title={v.pode_editar ? "" : "Só quem agendou ou a diretoria"}>
          <Icone nome="calendario" tamanho={15} /> Remarcar
        </button>
      )}
      {agendada && (
        <button className="btn vermelho" disabled={!v.pode_editar} onClick={() => aoPerder(v)}
                title={v.pode_editar ? "" : "Só quem agendou ou a diretoria"}>
          <Icone nome="fechar" tamanho={15} /> Perdido
        </button>
      )}
      {v.os_id && (
        <button className="btn azul" onClick={() => navegar(`/ordens?abrir=${v.os_id}`)}>
          <Icone nome="ordem" tamanho={15} /> Ver serviço
        </button>
      )}
    </>
  );
}

function CardVisita({ v, ...acoes }) {
  return (
    <article className={`cardItem st-${v.status}${v.atrasada ? " atrasado" : ""}`}>
      <header>
        <Etiqueta status={v.status} rotulo={v.status_display} />
        {v.atrasada && <span className="tag t-atrasado">Data passou</span>}
        <span className="numero">{v.numero}</span>
      </header>

      <div className="corpo">
        <div className="titulo">
          <Icone nome="usuario" tamanho={15} />
          {v.cliente_detalhe?.nome}
        </div>
        <div className="sublinha">
          <Icone nome="local" tamanho={13} /> {v.bairro}
          {v.cliente_detalhe?.telefone ? ` · ${v.cliente_detalhe.telefone}` : ""}
        </div>
        <span className="tipoServico visita">Visita técnica — orçamento presencial</span>

        <div className="linhas">
          <div className="li">
            <Icone nome="visita" tamanho={15} className="ic-vis" />
            <span className="rot">Visita</span>
            <span className="val">{quandoTexto(v)}</span>
          </div>
          <div className="li">
            <Icone nome="orcamento" tamanho={15} />
            <span className="rot">Orçamento</span>
            <span className="val">
              {v.orcamento_numero ?? <span className="pend">{v.status === "agendada" ? "a fazer na visita" : "—"}</span>}
            </span>
          </div>
          <div className="li">
            <Icone nome="ordem" tamanho={15} />
            <span className="rot">Serviço</span>
            <span className="val">{v.os_numero ?? <span className="pend">—</span>}</span>
          </div>
        </div>

        {v.status === "perdida" && v.motivo_perda && <p className="obsbox">{v.motivo_perda}</p>}

        <div className="rodape">
          <span><Icone nome="calendario" tamanho={13} /> {dataHora(v.criado_em)}</span>
          <span><Icone nome="usuario" tamanho={13} /> agendou:{" "}
            <span className="forma">{v.vendedor_nome}</span></span>
        </div>
      </div>

      <footer>
        <AcoesVisita v={v} {...acoes} />
      </footer>
    </article>
  );
}

function VisitaDetalhe({ id, aoFechar, ...acoes }) {
  const { dados: v, erro, carregando } = useApi(`/visitas/${id}/`, null, [id]);
  const e = v?.endereco_detalhe;

  return (
    <Gaveta
      titulo={v?.numero ?? "Carregando…"}
      extra={v && (
        <>
          <Etiqueta status={v.status} rotulo={v.status_display} />
          {v.atrasada && <span className="tag t-atrasado">Data passou</span>}
        </>
      )}
      aoFechar={aoFechar}
      rodape={v && <div className="btnrow"><AcoesVisita v={v} {...acoes} /></div>}
    >
      <Estado carregando={carregando} erro={erro}>
        {v && (
          <>
            {v.atrasada && (
              <div className="aviso critico" style={{ margin: "14px 20px 0" }}>
                <span className="ic">⏰</span>
                <span>A data da visita passou. Gere o serviço, remarque ou marque como perdida.</span>
              </div>
            )}

            <section className="sec">
              <h4>Visita</h4>
              <dl className="kv">
                <dt>Quando</dt><dd><b>{fmtData(v.data)}</b> · {v.turno_display}</dd>
                <dt>Agendou</dt><dd className="wk">{v.vendedor_nome}</dd>
                <dt>Orçamento</dt><dd>{v.orcamento_numero ?? "—"}</dd>
                <dt>Serviço</dt><dd>{v.os_numero ?? "—"}</dd>
              </dl>
              {v.observacoes && <p className="obsbox">{v.observacoes}</p>}
              {v.status === "perdida" && (
                <p className="obsbox">Perdida{v.motivo_perda ? `: ${v.motivo_perda}` : "."}</p>
              )}
            </section>

            <section className="sec">
              <h4>Cliente e endereço</h4>
              <dl className="kv">
                <dt>Cliente</dt><dd>{v.cliente_detalhe?.nome}</dd>
                <dt>Telefone</dt>
                <dd className="wk">
                  {v.cliente_detalhe?.telefone}{" "}
                  {v.cliente_detalhe?.telefone && (
                    <a className="lnk" href={zap(v.cliente_detalhe.telefone)} target="_blank" rel="noopener noreferrer">
                      WhatsApp
                    </a>
                  )}
                </dd>
                <dt>Endereço</dt>
                <dd className="wk">{e?.logradouro}{e?.numero ? `, ${e.numero}` : ""}</dd>
                {e?.complemento && <><dt>Complemento</dt><dd className="wk">{e.complemento}</dd></>}
                <dt>Bairro</dt><dd className="wk">{e?.bairro}</dd>
                {e?.cidade && <><dt>Cidade</dt><dd className="wk">{e.cidade}</dd></>}
              </dl>
            </section>

            {v.status === "agendada" && (
              <section className="sec">
                <h4>Na visita</h4>
                <p className="nota" style={{ margin: 0 }}>
                  Depois de medir, toque em <b>Gerar Serviço</b>: abre o orçamento já com este cliente.
                  Preencha metragem, forro e tipo (Instalação ou Material) e feche o negócio — a O.S.
                  nasce como qualquer outra e a visita fica <b>Convertido em Serviço</b>.
                </p>
              </section>
            )}
          </>
        )}
      </Estado>
    </Gaveta>
  );
}

function RemarcarVisita({ v, aoFechar, aoConcluir }) {
  const [quando, setQuando] = useState({ data: "", turno: "" });
  const [erro, setErro] = useState("");

  async function remarcar() {
    setErro("");
    try {
      if (!quando.data || !quando.turno) throw new Error("Escolha o dia e o turno.");
      await api.patch(`/visitas/${v.id}/`, quando);
      aoConcluir();
      return "remarcada";
    } catch (e) {
      setErro(e.message);
      throw e;
    }
  }

  return (
    <Modal
      titulo="Remarcar visita"
      subtitulo={`${v.numero} — ${v.cliente_detalhe?.nome}, que estava em ${fmtData(v.data)}`}
      aoFechar={aoFechar}
      largura={520}
      rodape={
        <div className="btnrow" style={{ padding: 0 }}>
          <BotaoAcao classe="btn roxo" aoClicar={remarcar}>Remarcar</BotaoAcao>
          <button className="btn" onClick={aoFechar}>Cancelar</button>
        </div>
      }
    >
      {erro && <div className="erro">{erro}</div>}
      <CalendarioVagas titulo="Visita técnica" tipo="visita" excluirVisita={v.id}
                       valor={quando} aoMudar={setQuando} />
    </Modal>
  );
}

function PerderVisita({ v, aoFechar, aoConcluir }) {
  const [motivo, setMotivo] = useState("");

  async function perder() {
    await api.post(`/visitas/${v.id}/perder/`, { motivo });
    aoConcluir();
    return "marcada como perdida";
  }

  return (
    <Confirmacao
      titulo="Visita perdida"
      subtitulo={`${v.numero} — ${v.cliente_detalhe?.nome}`}
      aviso="A visita sai da agenda e a vaga do dia volta a ficar livre."
      rotulo="Marcar como perdida"
      aoFechar={aoFechar}
      aoConfirmar={perder}
    >
      <Campo rotulo="Motivo (opcional)">
        <textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ex.: cliente desistiu; fechou com outro." />
      </Campo>
    </Confirmacao>
  );
}

export default function Visitas() {
  const navegar = useNavigate();
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState("");
  const [aberta, setAberta] = useState(null);
  const [remarcando, setRemarcando] = useState(null);
  const [perdendo, setPerdendo] = useState(null);

  const { dados, erro, carregando, recarregar } =
    useApi("/visitas/", { ordering: "-data", ...(status ? { status } : {}) }, [status]);
  const lista = linhas(dados);

  // chega aqui já com a gaveta aberta: /visitas?abrir=3 (depois de agendar, ou vindo da agenda)
  useEffect(() => {
    const id = params.get("abrir");
    if (id) {
      setAberta(Number(id));
      params.delete("abrir");
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  // remarcou ou perdeu: fecha tudo e recarrega a lista (a gaveta mostraria o estado antigo)
  const depois = (fechar) => () => { fechar(null); setAberta(null); recarregar(); };
  const acoes = { aoRemarcar: setRemarcando, aoPerder: setPerdendo };
  const atrasadas = lista.filter((v) => v.atrasada).length;

  return (
    <div className="pagina">
      <div className="paginaTopo">
        <div>
          <h1>Visitas técnicas</h1>
          <p className="sub">Orçamento presencial: da visita agendada até o serviço gerado</p>
        </div>
        <button className="btn roxo grande" onClick={() => navegar("/visitas/nova")}>
          <Icone nome="mais" tamanho={16} /> Agendar visita
        </button>
      </div>

      <div className="barraFiltros">
        {FILTROS.map(([k, r]) => (
          <button key={k} className={`chip${status === k ? " on" : ""}`} onClick={() => setStatus(k)}>
            {r}
          </button>
        ))}
        <span className="contagem">{lista.length} registro(s)</span>
      </div>

      {atrasadas > 0 && (
        <div className="aviso critico">
          <span className="ic">⏰</span>
          <span><b>{atrasadas}</b> visita(s) com a data vencida ainda como agendadas.
                Gere o serviço, remarque ou marque como perdida.</span>
        </div>
      )}

      <Estado carregando={carregando} erro={erro}
              vazio={lista.length === 0 ? "Nenhuma visita com esse filtro." : null}>
        <div className="cardGrid">
          {lista.map((v) => <CardVisita key={v.id} v={v} aoAbrir={setAberta} {...acoes} />)}
        </div>
      </Estado>

      {aberta && <VisitaDetalhe id={aberta} aoFechar={() => setAberta(null)} {...acoes} />}
      {remarcando && <RemarcarVisita v={remarcando} aoFechar={() => setRemarcando(null)}
                                     aoConcluir={depois(setRemarcando)} />}
      {perdendo && <PerderVisita v={perdendo} aoFechar={() => setPerdendo(null)}
                                 aoConcluir={depois(setPerdendo)} />}
    </div>
  );
}
