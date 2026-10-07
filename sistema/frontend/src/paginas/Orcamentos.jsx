import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, brl, dataHora, num } from "../api";
import { useAuth } from "../auth";
import {
  BotaoAcao, DocumentoOrcamento, Estado, Etiqueta, Gaveta, linhas, useApi,
} from "../componentes";
import Icone from "../icones";
import { baixarImagem, copiarImagem, copiarTexto, montarDocumento } from "../orcamentoDoc";

const FILTROS = [
  ["", "Todos"],
  ["aberto", "Abertos"],
  ["convertido", "Convertidos"],
  ["perdido", "Perdidos"],
];

/** Reabre um orçamento salvo como documento, para reenviar ao cliente. */
function VerOrcamento({ orcamento, aoFechar }) {
  const forros = useApi("/forros/");
  const acabamentos = useApi("/acabamentos/");

  const forro = linhas(forros.dados).find((f) => f.id === orcamento.forro);
  const acabamento = linhas(acabamentos.dados).find((a) => a.id === orcamento.acabamento);

  const doc = forro && montarDocumento({
    tipo: orcamento.tipo,
    area: Number(orcamento.area_m2),
    forro,
    acabamento,
    itens: (orcamento.itens ?? []).map((i) => ({
      rotulo: i.descricao,
      unidade: i.unidade,
      quantidade: Number(i.quantidade),
      preco: Number(i.preco_unitario),
    })),
  });

  return (
    <Gaveta titulo={orcamento.numero} aoFechar={aoFechar}
            extra={<Etiqueta status={orcamento.status} rotulo={orcamento.status_display} />}>
      <Estado carregando={forros.carregando} erro={forros.erro}>
        {doc && (
          <div style={{ padding: 20 }}>
            <DocumentoOrcamento doc={doc} />
            <div className="grupoAcoes">
              <span className="grupoTit">Enviar ao cliente</span>
              <div className="acts">
                <BotaoAcao classe="btn p" aoClicar={() => copiarImagem(doc)}>
                  <Icone nome="imagem" tamanho={15} /> Copiar imagem
                </BotaoAcao>
                <BotaoAcao aoClicar={() => copiarTexto(doc)}>
                  <Icone nome="copiar" tamanho={15} /> Copiar texto
                </BotaoAcao>
                <BotaoAcao aoClicar={() => baixarImagem(doc)}>
                  <Icone nome="baixar" tamanho={15} /> Baixar PNG
                </BotaoAcao>
                <a className="btn" target="_blank" rel="noopener noreferrer"
                   href={`https://wa.me/?text=${encodeURIComponent(doc.texto)}`}>
                  <Icone nome="whatsapp" tamanho={15} /> WhatsApp
                </a>
              </div>
            </div>

            {Number(orcamento.total_vista) !== doc.totalVista && (
              <div className="aviso">
                <span className="ic">⚠</span>
                <span>
                  A tabela mudou desde que este orçamento foi feito. Gravado:{" "}
                  <b>{brl(orcamento.total_vista)}</b>; pela tabela de hoje seria{" "}
                  <b>{brl(doc.totalVista)}</b>. Vale o valor gravado.
                </span>
              </div>
            )}
          </div>
        )}
      </Estado>
    </Gaveta>
  );
}

function CardOrcamento({ o, aoVer, aoGerarOS, aoPerder, aoReabrir }) {
  const material = o.tipo === "material";
  return (
    <article className={`cardItem st-${o.status}`}>
      <header>
        <Etiqueta status={o.status} rotulo={o.status_display} />
        <span className="numero">{o.numero}</span>
      </header>

      <div className="corpo">
        <div className="titulo">
          <Icone nome="usuario" tamanho={15} />
          {o.cliente_detalhe?.nome ?? <span className="pend">cliente ao fechar</span>}
        </div>

        <div className="linhas">
          <div className="li">
            <Icone nome={material ? "entrega" : "instalacao"} tamanho={15} className={material ? "ic-ent" : "ic-ins"} />
            <span className="rot">{material ? "Material" : "Instalado"}</span>
            <span className="val">{o.forro_nome}</span>
          </div>
          {o.acabamento_nome && (
            <div className="li">
              <Icone nome="precos" tamanho={15} />
              <span className="rot">Acabamento</span>
              <span className="val">{o.acabamento_nome}</span>
            </div>
          )}
          <div className="li">
            <Icone nome="area" tamanho={15} />
            <span className="rot">Área</span>
            <span className="val">{num(o.area_m2)} m²</span>
          </div>
        </div>

        <div className="valores">
          <div className="v1"><span>À vista</span><b>{brl(o.total_vista)}</b></div>
          <div className="v2"><span>No cartão</span><b>{brl(o.total_cartao)}</b></div>
        </div>

        <div className="rodape">
          <span><Icone nome="calendario" tamanho={13} /> {dataHora(o.criado_em)}</span>
          <span><Icone nome="usuario" tamanho={13} /> {o.vendedor_nome}</span>
        </div>
      </div>

      <footer>
        <button className="btn" onClick={() => aoVer(o)}>
          <Icone nome="imagem" tamanho={15} /> Ver
        </button>
        {o.status === "aberto" && (
          <>
            <button className="btn verde" onClick={() => aoGerarOS(o)}>
              <Icone nome="fechado" tamanho={15} /> Gerar O.S.
            </button>
            <BotaoAcao classe="btn vermelho" aoClicar={() => aoPerder(o)}>
              <Icone nome="fechar" tamanho={15} /> Perdido
            </BotaoAcao>
          </>
        )}

        {o.status === "perdido" && (
          <BotaoAcao classe="btn p" aoClicar={() => aoReabrir(o)}>
            <Icone nome="relogio" tamanho={15} /> Reabrir
          </BotaoAcao>
        )}
        {o.tem_os && <span className="selo">{o.tem_os}</span>}
      </footer>
    </article>
  );
}

export default function Orcamentos() {
  const navegar = useNavigate();
  const { pode } = useAuth();
  const [status, setStatus] = useState("");
  const [vendo, setVendo] = useState(null);

  const { dados, erro, carregando, recarregar } =
    useApi("/orcamentos/", status ? { status } : null, [status]);
  const lista = linhas(dados);

  async function marcarPerdido(o) {
    await api.patch(`/orcamentos/${o.id}/`, { status: "perdido" });
    recarregar();
    return "marcado";
  }

  async function reabrir(o) {
    await api.patch(`/orcamentos/${o.id}/`, { status: "aberto" });
    recarregar();
    return "reaberto";
  }

  return (
    <div className="pagina">
      <div className="paginaTopo">
        <div>
          <h1>Orçamentos</h1>
          <p className="sub">Gere, reenvie e converta em Ordem de Serviço</p>
        </div>
        <button className="btn p grande" disabled={!pode("vender")}
                title={pode("vender") ? "" : "Seu perfil não cria orçamentos"}
                onClick={() => navegar("/orcamentos/novo")}>
          <Icone nome="mais" tamanho={16} /> Novo orçamento
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

      <Estado carregando={carregando} erro={erro}
              vazio={lista.length === 0 ? "Nenhum orçamento com esse filtro." : null}>
        <div className="cardGrid">
          {lista.map((o) => (
            <CardOrcamento key={o.id} o={o}
                           aoVer={setVendo}
                           aoGerarOS={(x) => navegar(`/ordens/nova?orcamento=${x.id}`)}
                           aoPerder={marcarPerdido} aoReabrir={reabrir} />
          ))}
        </div>
      </Estado>

      {vendo && <VerOrcamento orcamento={vendo} aoFechar={() => setVendo(null)} />}
    </div>
  );
}
