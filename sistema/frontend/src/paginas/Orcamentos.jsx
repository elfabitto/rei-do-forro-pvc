import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, brl, dataHora, num } from "../api";
import { useAuth } from "../auth";
import {
  BotaoAcao, Confirmacao, DocumentoOrcamento, Estado, Etiqueta, Gaveta, linhas, useApi,
} from "../componentes";
import Icone from "../icones";
import {
  VERBA, baixarImagem, copiarImagem, copiarTexto, ehServico, montarDocumento,
} from "../orcamentoDoc";

const FILTROS = [
  ["", "Todos"],
  ["aberto", "Em aberto"],
  ["convertido", "Convertidos em Serviço"],
  ["perdido", "Perdidos"],
];

/** Reabre um orçamento salvo como documento, para reenviar ao cliente. */
function VerOrcamento({ orcamento, aoFechar }) {
  const forros = useApi("/forros/");
  const acabamentos = useApi("/acabamentos/");

  const forro = linhas(forros.dados).find((f) => f.id === orcamento.forro);
  const acabamento = linhas(acabamentos.dados).find((a) => a.id === orcamento.acabamento);

  // os itens gravados voltam separados: material de catálogo de um lado,
  // "Outro" (verba) do outro — é como o documento os apresenta
  const gravados = orcamento.itens ?? [];
  const doc = forro && montarDocumento({
    tipo: orcamento.tipo,
    area: Number(orcamento.area_m2),
    forro,
    acabamento,
    itens: gravados.filter((i) => i.unidade !== VERBA && !ehServico(i)).map((i) => ({
      rotulo: i.descricao,
      unidade: i.unidade,
      quantidade: Number(i.quantidade),
      preco: Number(i.preco_unitario),
    })),
    extras: gravados.filter((i) => i.unidade === VERBA).map((i) => ({
      descricao: i.descricao,
      valor: Number(i.total),
    })),
    servico: Number(gravados.find(ehServico)?.total ?? 0),
  });

  return (
    <Gaveta titulo={orcamento.numero} aoFechar={aoFechar}
            extra={<Etiqueta status={orcamento.status} rotulo={orcamento.status_display} />}>
      <Estado carregando={forros.carregando} erro={forros.erro}>
        {doc && (
          <div style={{ padding: 20 }}>
            <DocumentoOrcamento doc={doc} />
            <div className="grupoAcoes destaque">
              <span className="grupoTit">
                <Icone nome="whatsapp" tamanho={14} /> Enviar ao cliente
              </span>
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
                <a className="btn zap" target="_blank" rel="noopener noreferrer"
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

function CardOrcamento({ o, aoVer, aoGerarOS, aoPerder, aoReabrir, aoEditar }) {
  const material = o.tipo === "material";
  // Lista aberta à equipe inteira; ação, só de quem lançou e da diretoria.
  const meu = o.pode_editar;
  const trava = meu ? "" : `Orçamento de ${o.vendedor_nome} — só quem lançou ou a diretoria altera`;

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
        <span className="tipoServico">
          {material ? "Fornecimento de Material" : "Instalação Completa"}
        </span>

        <div className="linhas">
          <div className="li">
            <Icone nome={material ? "entrega" : "instalacao"} tamanho={15}
                   className={material ? "ic-ent" : "ic-ins"} />
            <span className="rot">Forro</span>
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
          <Icone nome="olho" tamanho={15} /> Ver e Enviar ao Cliente
        </button>

        {o.status === "aberto" && (
          <>
            <button className="btn verde" disabled={!meu} title={trava}
                    onClick={() => aoGerarOS(o)}>
              <Icone nome="fechado" tamanho={15} /> Gerar Serviço
            </button>
            <button className="btn vermelho" disabled={!meu} title={trava}
                    onClick={() => aoPerder(o)}>
              <Icone nome="fechar" tamanho={15} /> Perdido
            </button>
          </>
        )}

        {o.status === "perdido" && (
          <BotaoAcao classe="btn p" desabilitado={!meu} titulo={trava}
                     aoClicar={() => aoReabrir(o)}>
            <Icone nome="relogio" tamanho={15} /> Reabrir
          </BotaoAcao>
        )}

        {o.status !== "convertido" && (
          <button className="btn" disabled={!meu} title={trava} onClick={() => aoEditar(o)}>
            <Icone nome="editar" tamanho={15} /> Editar
          </button>
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
  const [perdendo, setPerdendo] = useState(null);

  const { dados, erro, carregando, recarregar } =
    useApi("/orcamentos/", status ? { status } : null, [status]);
  const lista = linhas(dados);

  async function marcarPerdido() {
    await api.patch(`/orcamentos/${perdendo.id}/`, { status: "perdido" });
    setPerdendo(null);
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
                           aoEditar={(x) => navegar(`/orcamentos/${x.id}/editar`)}
                           aoPerder={setPerdendo} aoReabrir={reabrir} />
          ))}
        </div>
      </Estado>

      {vendo && <VerOrcamento orcamento={vendo} aoFechar={() => setVendo(null)} />}

      {perdendo && (
        <Confirmacao
          titulo="Declarar orçamento perdido"
          subtitulo={`${perdendo.numero} — ${perdendo.cliente_detalhe?.nome ?? "sem cliente"}`}
          aviso="Confirma que o cliente não fechou o pedido? O orçamento sai da lista de
                 abertos e deixa de contar como negócio em andamento. Dá para reabrir depois."
          rotulo="Sim, o cliente não fechou"
          aoFechar={() => setPerdendo(null)}
          aoConfirmar={marcarPerdido}
        />
      )}
    </div>
  );
}
