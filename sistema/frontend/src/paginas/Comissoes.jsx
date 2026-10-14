/**
 * Comissões — R$ 2,00 por m² para quem trouxe o cliente.
 *
 * O ciclo segue a O.S.:
 *   orçamento → ainda não conta;
 *   O.S. agendada/em execução → AGENDADA (vai receber quando o serviço sair);
 *   O.S. finalizada → A RECEBER (a diretoria paga);
 *   baixa da diretoria → PAGA.
 *
 * O vendedor vê só as próprias, por venda. A diretoria vê todos e dá a baixa,
 * que registra quem deu e quando.
 */
import { useState } from "react";
import { api, brl, data, dataHora, num } from "../api";
import { useAuth } from "../auth";
import { BotaoAcao, Confirmacao, Estado, Etiqueta, useApi } from "../componentes";
import Icone from "../icones";
import OrdemDetalhe from "./OrdemDetalhe";

const FILTROS = [
  ["", "Todas"],
  ["a_receber", "A receber"],
  ["agendada", "Agendadas"],
  ["paga", "Pagas"],
];

// cor da etiqueta de cada situação (mesmas cores dos status da O.S.)
const COR = { agendada: "em_execucao", a_receber: "gerada", paga: "finalizada" };

export default function Comissoes() {
  const { pode, usuario } = useAuth();
  const diretoria = pode("verFinanceiro");
  const [situacao, setSituacao] = useState(diretoria ? "a_receber" : "");
  const [vendedor, setVendedor] = useState("");
  const [aberta, setAberta] = useState(null);
  const [baixando, setBaixando] = useState(null);
  const [pagandoPessoa, setPagandoPessoa] = useState(null);   // linha de "Por pessoa"
  const [erro, setErro] = useState("");

  const params = { ...(situacao ? { situacao } : {}), ...(vendedor ? { vendedor } : {}) };
  const { dados, erro: erroApi, carregando, recarregar } =
    useApi("/comissoes/", params, [situacao, vendedor]);

  const resumo = dados?.resumo;
  const cont = resumo?.contagem ?? {};
  const porVendedor = dados?.por_vendedor ?? [];
  const itens = dados?.itens ?? [];

  async function darBaixa() {
    setErro("");
    try {
      await api.post(`/ordens-servico/${baixando.id}/pagar_comissao/`, {});
      setBaixando(null);
      recarregar();
      return "paga";
    } catch (e) {
      setErro(e.message);
      throw e;
    }
  }

  async function pagarPessoa() {
    setErro("");
    try {
      await api.post("/comissoes/pagar/", { vendedor: pagandoPessoa.vendedor });
      setPagandoPessoa(null);
      recarregar();
      return "pago";
    } catch (e) {
      setErro(e.message);
      throw e;
    }
  }

  async function estornar(item) {
    setErro("");
    try {
      await api.post(`/ordens-servico/${item.id}/estornar_comissao/`, {});
      recarregar();
      return "estornada";
    } catch (e) {
      setErro(e.message);
      throw e;
    }
  }

  /* o que muda de palavra entre quem recebe e quem paga */
  const txt = diretoria
    ? { aberto: "A pagar", abertoSub: "serviços finalizados, falta repassar",
        agendada: "Agendada", agendadaSub: "serviços ainda não executados",
        pago: "Já pago", pagoSub: "com baixa registrada" }
    : { aberto: "A receber", abertoSub: "serviço feito — aguardando o pagamento da diretoria",
        agendada: "Agendado", agendadaSub: "serviços agendados, ainda não executados",
        pago: "Recebido", pagoSub: "comissões já pagas a você" };

  const quando = (i) =>
    i.situacao === "agendada"
      ? (i.agendado_para ? `agendado para ${data(i.agendado_para)}` : "sem data agendada")
      : i.situacao === "paga"
        ? `paga em ${dataHora(i.paga_em)}`
        : `finalizado em ${dataHora(i.finalizada_em)}`;

  return (
    <div className="pagina">
      <div className="paginaTopo">
        <div>
          <h1>{diretoria ? "Comissões" : "Minhas comissões"}</h1>
          <p className="sub">
            Instalação: R$ {num(dados?.por_m2 ?? 2)} por m². Material: item a item (forro R$ 1/m²,
            peças e ripão pela Tabela de preços, serviço R$ 2/m²). Conta a partir da O.S. agendada
            e é paga depois que o serviço é finalizado.
          </p>
        </div>
      </div>

      {erro && <div className="erro">{erro}</div>}

      {/* diretoria olhando uma pessoa só: caminho claro de volta para o geral */}
      {diretoria && vendedor && (
        <div className="filtroPessoa">
          <button className="btn" onClick={() => setVendedor("")}>
            <span aria-hidden="true">←</span> Todas as comissões
          </button>
          <span>
            Mostrando só <b>{porVendedor.find((v) => String(v.vendedor) === String(vendedor))?.nome ?? "um vendedor"}</b>
          </span>
        </div>
      )}

      <Estado carregando={carregando} erro={erroApi}>
        <div className="comResumo">
          <button className={`comCard aberto${situacao === "a_receber" ? " sel" : ""}`}
                  onClick={() => setSituacao("a_receber")}>
            <span>{txt.aberto}</span>
            <b>{brl(resumo?.aberto)}</b>
            <small>{cont.aberto ?? 0} serviço(s) · {txt.abertoSub}</small>
          </button>
          <button className={`comCard agendada${situacao === "agendada" ? " sel" : ""}`}
                  onClick={() => setSituacao("agendada")}>
            <span>{txt.agendada}</span>
            <b>{brl(resumo?.agendada)}</b>
            <small>{cont.agendada ?? 0} serviço(s) · {txt.agendadaSub}</small>
          </button>
          <button className={`comCard pago${situacao === "paga" ? " sel" : ""}`}
                  onClick={() => setSituacao("paga")}>
            <span>{txt.pago}</span>
            <b>{brl(resumo?.pago)}</b>
            <small>{cont.pago ?? 0} serviço(s) · {txt.pagoSub}</small>
          </button>
        </div>

        {diretoria && porVendedor.length > 0 && (
          <div className="card" style={{ marginBottom: 18 }}>
            <header><h2>Por pessoa</h2></header>
            <div className="tw">
              <table>
                <thead>
                  <tr><th>Quem trouxe</th><th className="num">Serviços</th>
                    <th className="num">Agendada</th><th className="num">A pagar</th>
                    <th className="num">Já pago</th>{pode("cancelarOS") && <th />}</tr>
                </thead>
                <tbody>
                  {porVendedor.map((v) => (
                    <tr key={v.vendedor}
                        className={String(vendedor) === String(v.vendedor) ? "linhaAtrasada" : ""}
                        style={{ cursor: "pointer" }}
                        onClick={() => setVendedor(String(vendedor) === String(v.vendedor) ? "" : String(v.vendedor))}>
                      <td><b>{v.nome}</b></td>
                      <td className="num">{v.ordens}</td>
                      <td className="num" style={{ color: "#1b5496" }}>{brl(v.agendada)}</td>
                      <td className="num" style={{ color: "var(--orange-dk)", fontWeight: 700 }}>
                        {brl(v.aberto)}
                      </td>
                      <td className="num">{brl(v.pago)}</td>
                      {pode("cancelarOS") && (
                        <td className="num">
                          {Number(v.aberto) > 0 && (
                            <button className="btn verde mini-baixa"
                                    onClick={(e) => { e.stopPropagation(); setPagandoPessoa(v); }}>
                              <Icone nome="dinheiro" tamanho={14} /> Dar baixa
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!vendedor && (
              <p className="nota" style={{ padding: "0 16px 14px" }}>
                Clique numa pessoa para ver só as comissões dela.
              </p>
            )}
          </div>
        )}

        <div className="barraFiltros">
          {FILTROS.map(([k, r]) => (
            <button key={k} className={`chip${situacao === k ? " on" : ""}`}
                    onClick={() => setSituacao(k)}>{diretoria && k === "a_receber" ? "A pagar" : r}</button>
          ))}
          <span className="contagem">{itens.length} venda(s)</span>
        </div>

        {/* uma linha por venda — em cartão, que é como se lê no celular */}
        <Estado vazio={itens.length === 0 ? "Nenhuma comissão com esse filtro." : null}>
          <div className="comLista">
            {itens.map((i) => (
              <div className={`comItem s-${i.situacao}`} key={i.id}>
                <div className="topo">
                  <button className="lnk" onClick={() => setAberta(i.id)}>{i.numero}</button>
                  <Etiqueta status={COR[i.situacao]}
                            rotulo={diretoria && i.situacao === "a_receber" ? "A pagar" : i.situacao_display} />
                </div>
                <b className="cli">{i.cliente}</b>
                <div className="sub2">
                  {i.tipo_display} · {num(i.area_m2)} m²
                  {diretoria && usuario?.id !== i.vendedor ? ` · ${i.vendedor_nome}` : ""}
                </div>
                {i.detalhe?.length > 1 && (
                  <ul className="comDetalhe">
                    {i.detalhe.map((l) => (
                      <li key={l.descricao}><span>{l.descricao}</span><b>{brl(l.valor)}</b></li>
                    ))}
                  </ul>
                )}
                <div className="rodape">
                  <span className="quando">{quando(i)}</span>
                  <b className="valor">{brl(i.valor)}</b>
                </div>
                {pode("cancelarOS") && i.situacao !== "agendada" && (
                  <div className="acoes">
                    {i.paga ? (
                      <BotaoAcao aoClicar={() => estornar(i)}>Estornar</BotaoAcao>
                    ) : (
                      <button className="btn verde" onClick={() => setBaixando(i)}>
                        <Icone nome="dinheiro" tamanho={15} /> Dar baixa
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Estado>
      </Estado>

      {aberta && (
        <OrdemDetalhe id={aberta} aoFechar={() => setAberta(null)} aoMudar={recarregar} />
      )}
      {pagandoPessoa && (
        <Confirmacao
          titulo="Dar baixa nas comissões"
          subtitulo={pagandoPessoa.nome}
          aviso={`Confirma o pagamento de ${brl(pagandoPessoa.aberto)} a ${pagandoPessoa.nome}?
                  Todas as comissões a pagar dessa pessoa ficam como pagas, com registro de quem deu a baixa e quando.`}
          rotulo={`Pagar ${brl(pagandoPessoa.aberto)}`}
          classe="btn verde"
          aoFechar={() => setPagandoPessoa(null)}
          aoConfirmar={pagarPessoa}
        />
      )}
      {baixando && (
        <Confirmacao
          titulo="Dar baixa na comissão"
          subtitulo={`${baixando.numero} — ${baixando.vendedor_nome}`}
          aviso={`Confirma o repasse de ${brl(baixando.valor)} referente a ${num(baixando.area_m2)} m²?
                  Fica registrado quem deu a baixa e quando.`}
          rotulo="Confirmar pagamento"
          classe="btn verde"
          aoFechar={() => setBaixando(null)}
          aoConfirmar={darBaixa}
        />
      )}
    </div>
  );
}
