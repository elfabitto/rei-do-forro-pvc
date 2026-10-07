import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { brl, data, dataHora } from "../api";
import { useAuth } from "../auth";
import { api } from "../api";
import { BotaoAcao, Estado, Etiqueta, linhas, useApi } from "../componentes";
import Icone from "../icones";
import { compartilharOS, montarOS } from "../osDoc";
import FinalizarModal from "./FinalizarModal";
import OrdemDetalhe from "./OrdemDetalhe";

const FILTROS = [
  ["", "Todas"],
  ["gerada", "Gerada"],
  ["em_execucao", "Em execução"],
  ["finalizada", "Finalizada"],
  ["cancelada", "Cancelada"],
];

function CardOS({ o, verFinanceiro, pode, aoAbrir, aoFinalizar, aoMudarStatus }) {
  const saldo = Number(o.saldo ?? 0);
  const encerrada = ["finalizada", "cancelada"].includes(o.status);
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

        <div className="linhas">
          <div className="li">
            <Icone nome="entrega" tamanho={15} className="ic-ent" />
            <span className="rot">Entrega</span>
            <span className="val">
              {o.entrega ? `${data(o.entrega.data)} · ${o.entrega.turno_display}` : "—"}
            </span>
          </div>
          <div className="li">
            <Icone nome="instalacao" tamanho={15} className="ic-ins" />
            <span className="rot">Instalação</span>
            <span className="val">
              {o.instalacao
                ? `${data(o.instalacao.data)} · ${o.instalacao.turno_display}`
                : <span className="pend">sem instalação</span>}
            </span>
          </div>
        </div>

        {verFinanceiro && (
          <div className="valores">
            <div className="v1"><span>Valor</span><b>{brl(o.valor_total)}</b></div>
            <div className="v2">
              <span>Saldo</span>
              <b className={saldo > 0 ? "devendo" : "quitado"}>
                {saldo > 0 ? brl(saldo) : "quitado"}
              </b>
            </div>
          </div>
        )}

        <div className="rodape">
          <span><Icone nome="calendario" tamanho={13} /> {dataHora(o.criado_em)}</span>
          <span><Icone nome="usuario" tamanho={13} /> {o.vendedor_nome}</span>
        </div>
      </div>

      <footer>
        <button className="btn" onClick={() => aoAbrir(o.id)}>
          <Icone nome="ordem" tamanho={15} /> Abrir
        </button>

        {o.status === "gerada" && (
          <BotaoAcao classe="btn azul" aoClicar={() => aoMudarStatus(o, "em_execucao")}>
            <Icone nome="relogio" tamanho={15} /> Em execução
          </BotaoAcao>
        )}

        {!encerrada && (
          <button className="btn verde" disabled={!pode("finalizarOS")}
                  title={pode("finalizarOS") ? "" : "Exclusivo da diretoria"}
                  onClick={() => aoFinalizar(o)}>
            <Icone nome="fechado" tamanho={15} /> Finalizar
          </button>
        )}

        {!encerrada && (
          <BotaoAcao classe="btn vermelho" desabilitado={!pode("cancelarOS")}
                     titulo={pode("cancelarOS") ? "" : "Exclusivo da diretoria"}
                     aoClicar={() => aoMudarStatus(o, "cancelada", "Cancelada pela diretoria")}>
            <Icone nome="fechar" tamanho={15} /> Cancelar
          </BotaoAcao>
        )}

        <BotaoAcao classe="btn zap"
                   aoClicar={() => compartilharOS(montarOS(o, { verFinanceiro }))}>
          <Icone nome="whatsapp" tamanho={15} /> WhatsApp
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

  const atrasadas = lista.filter((o) => o.atrasado).length;

  return (
    <div className="pagina">
      <div className="paginaTopo">
        <div>
          <h1>Ordens de Serviço</h1>
          <p className="sub">Do orçamento convertido até a finalização</p>
        </div>
        <button className="btn p grande" onClick={() => navegar("/ordens/nova")}>
          <Icone nome="mais" tamanho={16} /> Gerar O.S.
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
                    aoAbrir={setAberta} aoFinalizar={setFinalizando} aoMudarStatus={mudarStatus} />
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
    </div>
  );
}
