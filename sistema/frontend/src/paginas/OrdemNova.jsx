/**
 * Converte um orçamento em Ordem de Serviço.
 *
 * O agendamento consulta a disponibilidade real: só aparecem dia e turno com
 * vaga livre, e a capacidade é conferida de novo no backend ao gravar — se o
 * turno encheu nesse meio-tempo, a O.S. inteira é desfeita em vez de nascer
 * sem agendamento.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, brl, num } from "../api";
import { useAuth } from "../auth";
import { BotaoAcao, Campo, Estado, Selecao, linhas, useApi } from "../componentes";
import ClienteModal from "./ClienteModal";

const hojeISO = () => new Date().toISOString().slice(0, 10);
const maisDias = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const rotuloData = (iso) =>
  new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", {
    weekday: "short", day: "2-digit", month: "2-digit",
  });

/** Seletor de data + turno que só oferece o que tem vaga. */
function Agendamento({ titulo, tipo, dias, valor, aoMudar, opcional }) {
  // A vaga é do turno: entrega e instalação disputam o mesmo limite.
  const comVaga = useMemo(
    () => dias.filter((d) => d.atende && d.turnos.some((t) => t.livre > 0)),
    [dias]
  );
  const dia = comVaga.find((d) => d.data === valor?.data);
  const turnos = dia ? dia.turnos.filter((t) => t.livre > 0) : [];

  return (
    <div className="agbox">
      <div className="agtit">
        <span className={`pill p-${tipo}`}>{titulo}</span>
        {opcional && (
          <label className="agoff">
            <input type="checkbox" checked={!valor}
                   onChange={(e) => aoMudar(e.target.checked ? null : { data: "", turno: "" })} />
            não se aplica
          </label>
        )}
      </div>

      {valor && (
        <div className="two">
          <Campo rotulo="Data">
            <Selecao valor={valor.data} vazio="Escolha o dia"
                     aoMudar={(d) => aoMudar({ data: d, turno: "" })}
                     opcoes={comVaga.map((d) => ({
                       valor: d.data,
                       rotulo: `${rotuloData(d.data)} — ${d.livre_total} vaga(s)`,
                     }))} />
          </Campo>
          <Campo rotulo="Turno">
            <Selecao valor={valor.turno} vazio={dia ? "Escolha o turno" : "Escolha o dia antes"}
                     disabled={!dia}
                     aoMudar={(t) => aoMudar({ ...valor, turno: t })}
                     opcoes={turnos.map((t) => ({
                       valor: t.turno,
                       rotulo: `${t.turno_display} — ${t.livre} de ${t.total} livre(s)`,
                     }))} />
          </Campo>
        </div>
      )}
    </div>
  );
}

export default function OrdemNova() {
  const [params] = useSearchParams();
  const navegar = useNavigate();
  const { pode, usuario } = useAuth();

  const orcamentoId = params.get("orcamento");
  const orcamento = useApi(orcamentoId ? `/orcamentos/${orcamentoId}/` : "/orcamentos/", null, [orcamentoId]);
  const disponibilidade = useApi("/agenda/disponibilidade/", { de: hojeISO(), ate: maisDias(60) });
  const usuarios = useApi("/usuarios/");

  const [enderecoId, setEnderecoId] = useState("");
  const [vendedorId, setVendedorId] = useState("");
  const [entrega, setEntrega] = useState({ data: "", turno: "" });
  const [instalacao, setInstalacao] = useState({ data: "", turno: "" });
  const [observacoes, setObservacoes] = useState("");
  const [erro, setErro] = useState("");

  // O orçamento costuma nascer sem cliente: ele é cadastrado aqui, ao fechar o negócio.
  const [modalCliente, setModalCliente] = useState(false);
  const [clienteNovo, setClienteNovo] = useState(null);   // {cliente, endereco} recém-criados

  const orc = orcamentoId ? orcamento.dados : null;
  const clienteId = clienteNovo?.cliente ?? orc?.cliente ?? null;
  const enderecos = useApi(clienteId ? "/enderecos/" : null, clienteId ? { cliente: clienteId } : null, [clienteId]);
  const listaEnderecos = linhas(enderecos.dados);

  // instalação só faz sentido no orçamento Instalado
  useEffect(() => {
    if (orc && orc.tipo === "material") setInstalacao(null);
  }, [orc]);

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

  const dias = disponibilidade.dados?.dias ?? [];
  const entregaOk = entrega && entrega.data && entrega.turno;
  const instalacaoOk = !instalacao || (instalacao.data && instalacao.turno);
  const podeGravar = orc && clienteId && enderecoId && entregaOk && instalacaoOk;

  async function gerar() {
    setErro("");
    try {
      const os = await api.post("/ordens-servico/", {
        orcamento: orc.id,
        endereco: Number(enderecoId),
        vendedor: pode("trocarVendedor") ? Number(vendedorId) : undefined,
        observacoes,
        agendar_entrega: entrega,
        agendar_instalacao: instalacao?.data ? instalacao : null,
      });
      navegar(`/ordens?abrir=${os.id}`);
      return "O.S. gerada";
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
                        <button className="btn p"
                                onClick={() => navegar(`/ordens/nova?orcamento=${o.id}`)}>
                          Gerar O.S.
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

      <Estado carregando={orcamento.carregando || disponibilidade.carregando}
              erro={orcamento.erro || disponibilidade.erro}>
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

                <div className="lbl" style={{ marginTop: 20 }}>Agendamento</div>
                <Agendamento titulo="Entrega" tipo="entrega" dias={dias}
                             valor={entrega} aoMudar={setEntrega} />
                {orc.tipo === "instalado" ? (
                  <Agendamento titulo="Instalação" tipo="instalacao" dias={dias} opcional
                               valor={instalacao} aoMudar={setInstalacao} />
                ) : (
                  <p className="nota">
                    Orçamento de Material: não há instalação a agendar, só a entrega.
                  </p>
                )}

                <Campo rotulo="Observações da O.S.">
                  <textarea rows={3} value={observacoes} onChange={(e) => setObservacoes(e.target.value)}
                            placeholder="Ex.: prédio sem elevador, subir pela escada." />
                </Campo>
              </div>
              <div className="acts">
                <BotaoAcao classe="btn p" aoClicar={gerar} desabilitado={!podeGravar}>
                  Gerar Ordem de Serviço
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
                <div className="row"><span className="k">Tipo</span><span className="v">{orc.tipo_display}</span></div>
                <div className="row"><span className="k">Área</span><span className="v">{num(orc.area_m2)} m²</span></div>
                <div className="row"><span className="k">Forro</span><span className="v">{orc.forro_nome}</span></div>
                {orc.acabamento_nome && (
                  <div className="row"><span className="k">Acabamento</span>
                    <span className="v">{orc.acabamento_nome}</span></div>
                )}
              </div>
              {orc.itens?.length > 0 && (
                <>
                  <div className="sect">Materiais</div>
                  <div className="rows">
                    {orc.itens.map((i) => (
                      <div className="row sm item" key={i.id}>
                        <span className="k">{i.descricao} — {num(i.quantidade)} {i.unidade}</span>
                        <span className="v">{brl(i.total)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
              <div className="totais">
                <div className="tot"><span className="k">Total à vista</span>
                  <span className="v">{brl(orc.total_vista)}</span></div>
                <div className="tot b"><span className="k">Total no cartão</span>
                  <span className="v">{brl(orc.total_cartao)}</span></div>
              </div>
              <p className="obs">
                A O.S. nasce com o valor à vista. Desconto e forma de pagamento são
                lançados na finalização, pela diretoria.
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
