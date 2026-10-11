/**
 * Converte um orçamento em Ordem de Serviço.
 *
 * O agendamento é feito no calendário, com a disponibilidade real de cada dia à
 * vista; a capacidade é conferida de novo no backend ao gravar — se o turno
 * encheu nesse meio-tempo, a O.S. inteira é desfeita em vez de nascer sem
 * agendamento.
 *
 * Instalação só existe quando o orçamento é de instalação: fornecimento de
 * material tem entrega e ponto.
 */
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, brl, num } from "../api";
import { useAuth } from "../auth";
import CalendarioVagas from "../calendario";
import { BotaoAcao, Campo, Estado, Selecao, linhas, useApi } from "../componentes";
import { VERBA, quantidadeTexto } from "../orcamentoDoc";
import Icone from "../icones";
import ClienteModal from "./ClienteModal";

export default function OrdemNova() {
  const [params] = useSearchParams();
  const navegar = useNavigate();
  const { pode, usuario } = useAuth();

  const orcamentoId = params.get("orcamento");
  const orcamento = useApi(orcamentoId ? `/orcamentos/${orcamentoId}/` : "/orcamentos/", null, [orcamentoId]);
  const usuarios = useApi("/usuarios/");

  const [enderecoId, setEnderecoId] = useState("");
  const [vendedorId, setVendedorId] = useState("");
  const [entrega, setEntrega] = useState({ data: "", turno: "" });
  const [instalacao, setInstalacao] = useState({ data: "", turno: "" });
  const [modalidade, setModalidade] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [erro, setErro] = useState("");

  // O orçamento costuma nascer sem cliente: ele é cadastrado aqui, ao fechar o negócio.
  const [modalCliente, setModalCliente] = useState(false);
  const [clienteNovo, setClienteNovo] = useState(null);   // {cliente, endereco} recém-criados

  const orc = orcamentoId ? orcamento.dados : null;
  const comInstalacao = orc?.tipo === "instalado";
  const clienteId = clienteNovo?.cliente ?? orc?.cliente ?? null;
  const enderecos = useApi(clienteId ? "/enderecos/" : null, clienteId ? { cliente: clienteId } : null, [clienteId]);
  const listaEnderecos = linhas(enderecos.dados);

  useEffect(() => {
    if (listaEnderecos.length && !enderecoId) {
      const principal = listaEnderecos.find((e) => e.principal) ?? listaEnderecos[0];
      setEnderecoId(String(principal.id));
    }
  }, [listaEnderecos, enderecoId]);

  // sem cliente ainda: abre o cadastro assim que o orçamento carrega
  useEffect(() => {
    if (orc && !orc.cliente && !clienteNovo) setModalCliente(true);
  }, [orc, clienteNovo]);

  /** Vincula ao orçamento o cliente cadastrado no modal. */
  async function vincularCliente({ cliente, endereco }) {
    await api.patch(`/orcamentos/${orc.id}/`, { cliente });
    setClienteNovo({ cliente, endereco });
    setEnderecoId(String(endereco));
    setModalCliente(false);
    orcamento.recarregar();
  }

  useEffect(() => {
    if (orc && !vendedorId) setVendedorId(String(orc.vendedor));
  }, [orc, vendedorId]);

  const entregaOk = entrega.data && entrega.turno;
  const instalacaoOk = !comInstalacao || (instalacao.data && instalacao.turno);
  const podeGravar = orc && clienteId && enderecoId && entregaOk && instalacaoOk && modalidade;

  async function gerar() {
    setErro("");
    try {
      const os = await api.post("/ordens-servico/", {
        orcamento: orc.id,
        endereco: Number(enderecoId),
        vendedor: pode("trocarVendedor") ? Number(vendedorId) : undefined,
        modalidade,
        observacoes,
        agendar_entrega: entrega,
        agendar_instalacao: comInstalacao ? instalacao : null,
      });
      navegar(`/ordens?abrir=${os.id}`);
      return "serviço gerado";
    } catch (e) {
      setErro(e.message);
      throw e;
    }
  }

  if (!orcamentoId) {
    return (
      <div className="pagina">
        <h1>Gerar Ordem de Serviço</h1>
        <p className="sub">Escolha um orçamento aberto para converter.</p>
        <div className="card">
          <Estado carregando={orcamento.carregando} erro={orcamento.erro}
                  vazio={linhas(orcamento.dados).filter((o) => o.status === "aberto").length === 0
                    ? "Nenhum orçamento aberto." : null}>
            <div className="tw">
              <table>
                <thead><tr><th>Número</th><th>Cliente</th><th>Forro</th>
                  <th className="num">Total</th><th /></tr></thead>
                <tbody>
                  {linhas(orcamento.dados).filter((o) => o.status === "aberto").map((o) => (
                    <tr key={o.id}>
                      <td><b>{o.numero}</b></td>
                      <td>{o.cliente_detalhe?.nome ?? <span style={{ color: "var(--muted)" }}>cadastrar ao fechar</span>}</td>
                      <td>{o.forro_nome}</td>
                      <td className="num">{brl(o.total_vista)}</td>
                      <td>
                        <button className="btn p" disabled={!o.pode_editar}
                                title={o.pode_editar ? "" : `Orçamento de ${o.vendedor_nome}`}
                                onClick={() => navegar(`/ordens/nova?orcamento=${o.id}`)}>
                          Gerar Serviço
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Estado>
        </div>
      </div>
    );
  }

  return (
    <div className="pagina">
      <h1>Gerar Ordem de Serviço</h1>
      <p className="sub">A partir do orçamento {orc?.numero ?? "…"}</p>

      <Estado carregando={orcamento.carregando} erro={orcamento.erro}>
        {orc && (
          <div className="cols c-2">
            <section className="card">
              <header><h2>Dados da O.S.</h2></header>
              <div className="body">
                {erro && <div className="erro">{erro}</div>}

                <div className="clientebox">
                  <div>
                    <span className="lbl" style={{ marginBottom: 2 }}>Cliente</span>
                    {clienteId ? (
                      <b>{orc.cliente_detalhe?.nome ?? "cadastrado"}</b>
                    ) : (
                      <b className="pendente">não informado</b>
                    )}
                  </div>
                  <button className="btn" onClick={() => setModalCliente(true)}>
                    {clienteId ? "Trocar cliente" : "Cadastrar cliente"}
                  </button>
                </div>

                <Campo rotulo="Endereço da obra / entrega">
                  <Selecao valor={enderecoId} aoMudar={setEnderecoId} vazio="Escolha o endereço"
                           disabled={!listaEnderecos.length}
                           opcoes={listaEnderecos.map((e) => ({ valor: e.id, rotulo: e.resumo }))} />
                </Campo>
                {clienteId && !listaEnderecos.length && (
                  <div className="aviso">
                    <span className="ic">⚠</span>
                    <span>Este cliente não tem endereço cadastrado. Cadastre em Clientes antes de seguir.</span>
                  </div>
                )}

                <Campo rotulo="Quem trouxe o cliente"
                       dica={pode("trocarVendedor")
                         ? "A diretoria pode atribuir a comissão a outro funcionário."
                         : `Fica com ${usuario.nome}; só a diretoria altera.`}>
                  <Selecao valor={vendedorId} aoMudar={setVendedorId} disabled={!pode("trocarVendedor")}
                           opcoes={linhas(usuarios.dados)
                             .filter((u) => u.papel !== "instalador")
                             .map((u) => ({ valor: u.id, rotulo: u.nome }))} />
                </Campo>

                {/* ----------------------------------------- pagamento */}
                <div className="lbl" style={{ marginTop: 20 }}>Forma de pagamento escolhida</div>
                <div className="opts">
                  <label className={`opt${modalidade === "vista" ? " on" : ""}`}>
                    <input type="radio" name="mod" checked={modalidade === "vista"}
                           onChange={() => setModalidade("vista")} />
                    <span className="t">À vista<small>Dinheiro, PIX, débito ou transferência</small></span>
                    <span className="v">{brl(orc.total_vista)}</span>
                  </label>
                  <label className={`opt${modalidade === "cartao" ? " on" : ""}`}>
                    <input type="radio" name="mod" checked={modalidade === "cartao"}
                           onChange={() => setModalidade("cartao")} />
                    <span className="t">No cartão<small>Crédito, valor da tabela de cartão</small></span>
                    <span className="v">{brl(orc.total_cartao)}</span>
                  </label>
                </div>
                <p className="nota">
                  É só a escolha do cliente — quem executa o serviço precisa saber o que foi
                  combinado. Os valores recebidos são lançados na finalização, e aí a forma
                  pode ser trocada se o cliente mudar de ideia.
                </p>

                {/* ----------------------------------------- agendamento */}
                <div className="lbl" style={{ marginTop: 20 }}>Agendamento</div>
                <CalendarioVagas titulo="Entrega" tipo="entrega"
                                 valor={entrega} aoMudar={setEntrega} />
                {comInstalacao ? (
                  <CalendarioVagas titulo="Instalação" tipo="instalacao"
                                   valor={instalacao} aoMudar={setInstalacao} />
                ) : (
                  <p className="nota">
                    Fornecimento de material: não há instalação a agendar, só a entrega.
                  </p>
                )}

                <Campo rotulo="Observações da O.S.">
                  <textarea rows={3} value={observacoes} onChange={(e) => setObservacoes(e.target.value)}
                            placeholder="Ex.: prédio sem elevador, subir pela escada." />
                </Campo>
              </div>
              <div className="acts">
                <BotaoAcao classe="btn p" aoClicar={gerar} desabilitado={!podeGravar}>
                  <Icone nome="ordem" tamanho={15} /> Gerar Ordem de Serviço
                </BotaoAcao>
                <button className="btn" onClick={() => navegar("/orcamentos")}>Cancelar</button>
              </div>
            </section>

            <section className="card">
              <header><h2>Resumo do orçamento</h2></header>
              <div className="rows">
                <div className="row"><span className="k">Orçamento</span><span className="v">{orc.numero}</span></div>
                <div className="row"><span className="k">Cliente</span>
                  <span className="v">{orc.cliente_detalhe?.nome}</span></div>
                <div className="row"><span className="k">Tipo</span>
                  <span className="v">{comInstalacao ? "Instalação Completa" : "Fornecimento de Material"}</span></div>
                <div className="row"><span className="k">Área</span><span className="v">{num(orc.area_m2)} m²</span></div>
                <div className="row"><span className="k">Forro</span><span className="v">{orc.forro_nome}</span></div>
                {orc.acabamento_nome && (
                  <div className="row"><span className="k">Acabamento</span>
                    <span className="v">{orc.acabamento_nome}</span></div>
                )}
              </div>
              {orc.itens?.length > 0 && (
                <>
                  <div className="sect">Itens</div>
                  <div className="rows">
                    {orc.itens.map((i) => (
                      <div className="row sm item" key={i.id}>
                        <span className="k">
                          {i.unidade === VERBA
                            ? i.descricao
                            : `${i.descricao} — ${quantidadeTexto(i.quantidade, i.unidade)}`}
                        </span>
                        <span className="v">{brl(i.total)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
              <div className="totais">
                <div className={`tot${modalidade === "cartao" ? "" : " b"}`}>
                  <span className="k">Total à vista</span>
                  <span className="v">{brl(orc.total_vista)}</span>
                </div>
                <div className={`tot${modalidade === "cartao" ? " b" : ""}`}>
                  <span className="k">Total no cartão</span>
                  <span className="v">{brl(orc.total_cartao)}</span>
                </div>
              </div>
              <p className="obs">
                {modalidade
                  ? `O serviço nasce com o valor ${modalidade === "cartao" ? "do cartão" : "à vista"}.
                     Desconto e recebimentos são lançados na finalização, pela diretoria.`
                  : "Escolha a forma de pagamento para definir o valor do serviço."}
              </p>
            </section>
          </div>
        )}
      </Estado>

      {modalCliente && orc && (
        <ClienteModal
          subtitulo={`Fechando o orçamento ${orc.numero}. Esses dados vão para a Ordem de Serviço.`}
          aoFechar={() => setModalCliente(false)}
          aoConcluir={vincularCliente}
        />
      )}
    </div>
  );
}
