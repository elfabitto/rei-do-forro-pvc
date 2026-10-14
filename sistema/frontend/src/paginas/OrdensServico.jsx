import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, brl, dataHora } from "../api";
import { periodoTexto } from "../agendaTexto";
import { useAuth } from "../auth";
import { BotaoAcao, Confirmacao, Estado, Etiqueta, linhas, useApi } from "../componentes";
import Icone from "../icones";
import { compartilharOS, montarOS } from "../osDoc";
import FinalizarModal from "./FinalizarModal";
import OrdemDetalhe from "./OrdemDetalhe";

const FILTROS = [
  ["", "Todas"],
  ["gerada", "Agendado"],
  ["em_execucao", "Em execução"],
  ["finalizada", "Finalizada"],
  ["cancelada", "Cancelada"],
];

/**
 * A imagem precisa da ficha completa (endereço, pedido, preço do m²), que a
 * listagem não carrega — por isso o card busca o detalhe antes de compartilhar.
 */
async function compartilharDaLista(o, verFinanceiro) {
  const completa = await api.get(`/ordens-servico/${o.id}/`);
  return compartilharOS(montarOS(completa, { verFinanceiro }));
}

function CardOS({ o, verFinanceiro, pode, aoAbrir, aoFinalizar, aoMudarStatus, aoCancelar }) {
  const encerrada = ["finalizada", "cancelada"].includes(o.status);
  const meu = o.pode_editar;

  return (
    <article className={`cardItem st-${o.status}${o.atrasado ? " atrasado" : ""}`}>
      <header>
        <Etiqueta status={o.status} rotulo={o.status_display} />
        {o.atrasado && <span className="tag t-atrasado">Atrasada {o.dias_atraso}d</span>}
        <span className="numero">{o.numero}</span>
      </header>

      <div className="corpo">
        <div className="titulo">
          <Icone nome="usuario" tamanho={15} />
          {o.cliente_detalhe?.nome}
        </div>
        {o.cliente_detalhe?.bairro && (
          <div className="sublinha">
            <Icone nome="local" tamanho={13} /> {o.cliente_detalhe.bairro}
          </div>
        )}
        <span className="tipoServico">{o.tipo_display}</span>

        <div className="linhas">
          <div className="li">
            <Icone nome="entrega" tamanho={15} className="ic-ent" />
            <span className="rot">Entrega</span>
            <span className="val">
              {o.entrega
                ? periodoTexto(o.entrega)
                : <span className="pend">{o.tipo === "instalado" ? "junto da instalação" : "—"}</span>}
            </span>
          </div>
          <div className="li">
            <Icone nome="instalacao" tamanho={15} className="ic-ins" />
            <span className="rot">Instalação</span>
            <span className="val">
              {o.instalacao
                ? periodoTexto(o.instalacao)
                : <span className="pend">{o.tipo === "material" ? "não se aplica" : "sem instalação"}</span>}
            </span>
          </div>
        </div>

        <div className="valores pagamento">
          <div className="v1">
            <span>Valor total</span>
            <b>{brl(o.valor_total)}</b>
          </div>
          <span className="formaPg">{o.modalidade_display || "a definir"}</span>
        </div>

        <div className="rodape">
          <span><Icone nome="calendario" tamanho={13} /> {dataHora(o.criado_em)}</span>
          <span><Icone nome="usuario" tamanho={13} /> trouxe:{" "}
            <span className="forma">{o.vendedor_nome}</span></span>
        </div>
      </div>

      <footer>
        <button className="btn" onClick={() => aoAbrir(o.id)}>
          <Icone nome="ordem" tamanho={15} /> Abrir
        </button>

        {o.status === "gerada" && (
          <BotaoAcao classe="btn azul" desabilitado={!meu && !pode("verTudo")}
                     aoClicar={() => aoMudarStatus(o, "em_execucao")}>
            <Icone nome="relogio" tamanho={15} /> Em execução
          </BotaoAcao>
        )}

        {!encerrada && (
          <button className="btn verde" disabled={!pode("finalizarOS")}
                  title={pode("finalizarOS") ? "" : "Exclusivo da diretoria"}
                  onClick={() => aoFinalizar(o)}>
            <Icone nome="fechado" tamanho={15} /> Finalizar Serviço
          </button>
        )}

        {!encerrada && (
          <button className="btn vermelho" disabled={!pode("cancelarOS")}
                  title={pode("cancelarOS") ? "" : "Exclusivo da diretoria"}
                  onClick={() => aoCancelar(o)}>
            <Icone nome="fechar" tamanho={15} /> Cancelar Serviço
          </button>
        )}

        <BotaoAcao classe="btn zap" aoClicar={() => compartilharDaLista(o, verFinanceiro)}>
          <Icone nome="whatsapp" tamanho={15} /> Compartilhar
        </BotaoAcao>
      </footer>
    </article>
  );
}

export default function OrdensServico() {
  const { pode } = useAuth();
  const navegar = useNavigate();
  const [params, setParams] = useSearchParams();

  const [status, setStatus] = useState("");
  const [aberta, setAberta] = useState(null);
  const [finalizando, setFinalizando] = useState(null);
  const [cancelando, setCancelando] = useState(null);
  const [erroAcao, setErroAcao] = useState("");

  const { dados, erro, carregando, recarregar } =
    useApi("/ordens-servico/", status ? { status } : null, [status]);
  const lista = linhas(dados);

  // permite chegar aqui já com a gaveta aberta: /ordens?abrir=12
  useEffect(() => {
    const id = params.get("abrir");
    if (id) {
      setAberta(Number(id));
      params.delete("abrir");
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  async function mudarStatus(o, novo, observacao = "") {
    setErroAcao("");
    try {
      await api.post(`/ordens-servico/${o.id}/mudar_status/`, { status: novo, observacao });
      recarregar();
      return "ok";
    } catch (e) {
      setErroAcao(e.message);
      throw e;
    }
  }

  async function cancelar() {
    await mudarStatus(cancelando, "cancelada", "Cancelada pela diretoria");
    setCancelando(null);
    return "cancelado";
  }

  const atrasadas = lista.filter((o) => o.atrasado).length;

  return (
    <div className="pagina">
      <div className="paginaTopo">
        <div>
          <h1>Ordens de Serviço</h1>
          <p className="sub">Do orçamento convertido até a finalização</p>
        </div>
        <button className="btn p grande" onClick={() => navegar("/ordens/nova")}>
          <Icone nome="mais" tamanho={16} /> Gerar Serviço
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

      {erroAcao && <div className="erro">{erroAcao}</div>}
      {atrasadas > 0 && (
        <div className="aviso critico">
          <span className="ic">⏰</span>
          <span><b>{atrasadas}</b> serviço(s) com data vencida sem finalizar.
                Remarque o compromisso ou cancele a O.S.</span>
        </div>
      )}

      <Estado carregando={carregando} erro={erro}
              vazio={lista.length === 0 ? "Nenhuma O.S. com esse filtro." : null}>
        <div className="cardGrid">
          {lista.map((o) => (
            <CardOS key={o.id} o={o} verFinanceiro={pode("verFinanceiro")} pode={pode}
                    aoAbrir={setAberta} aoFinalizar={setFinalizando}
                    aoMudarStatus={mudarStatus} aoCancelar={setCancelando} />
          ))}
        </div>
      </Estado>

      {aberta && (
        <OrdemDetalhe id={aberta} aoFechar={() => setAberta(null)} aoMudar={recarregar} />
      )}
      {finalizando && (
        <FinalizarModal os={finalizando} aoFechar={() => setFinalizando(null)}
                        aoConcluir={() => { setFinalizando(null); recarregar(); }} />
      )}
      {cancelando && (
        <Confirmacao
          titulo="Cancelar serviço"
          subtitulo={`${cancelando.numero} — ${cancelando.cliente_detalhe?.nome}`}
          aviso="O serviço sai da agenda, as vagas dos turnos são liberadas e a comissão
                 deixa de ser devida. O cancelamento não se desfaz."
          rotulo="Sim, cancelar o serviço"
          aoFechar={() => setCancelando(null)}
          aoConfirmar={cancelar}
        />
      )}
    </div>
  );
}
