/**
 * Detalhe da O.S.
 *
 * Pagamento não aparece como formulário solto: ele existe dentro do fechamento,
 * que é quando a diretoria confere o que o cliente pagou. Aqui só se vê o que já
 * foi lançado.
 */
import { Fragment, useState } from "react";
import { api, brl, data, dataHora, num } from "../api";
import { useAuth } from "../auth";
import {
  BotaoAcao, Confirmacao, Estado, Etiqueta, Gaveta, Pilula, Selecao, linhas, useApi,
} from "../componentes";
import Icone from "../icones";
import {
  baixarImagemOS, compartilharOS, copiarImagemOS, itensExtras, montarOS, resumoRipao,
} from "../osDoc";
import FinalizarModal from "./FinalizarModal";
import ReagendarModal from "./ReagendarModal";
import { periodoTexto } from "../agendaTexto";

const PASSOS = [
  ["gerada", "Agendado"],
  ["em_execucao", "Em execução"],
  ["finalizada", "Finalizada"],
];

export default function OrdemDetalhe({ id, aoFechar, aoMudar }) {
  const { pode } = useAuth();
  const { dados: os, erro, carregando, recarregar } = useApi(`/ordens-servico/${id}/`, null, [id]);
  const usuarios = useApi("/usuarios/");

  const [msg, setMsg] = useState("");
  const [finalizando, setFinalizando] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [remarcando, setRemarcando] = useState(null);

  function atualizar() {
    recarregar();
    aoMudar?.();
  }

  async function mudarStatus(status, observacao = "") {
    setMsg("");
    try {
      await api.post(`/ordens-servico/${os.id}/mudar_status/`, { status, observacao });
      atualizar();
      return "atualizada";
    } catch (e) {
      setMsg(e.message);
      throw e;
    }
  }

  async function cancelar() {
    await mudarStatus("cancelada", "Cancelada pela diretoria");
    setCancelando(false);
    return "cancelado";
  }

  async function trocarVendedor(novo) {
    await api.patch(`/ordens-servico/${os.id}/`, { vendedor: Number(novo) });
    atualizar();
    return "alterado";
  }

  const encerrada = os && ["finalizada", "cancelada"].includes(os.status);
  const doc = os && montarOS(os, { verFinanceiro: pode("verFinanceiro") });
  const orc = os?.orcamento_detalhe;
  const ripao = orc ? resumoRipao(orc.itens) : "";
  const extras = orc ? itensExtras(orc.itens) : [];

  return (
    <>
      <Gaveta
        titulo={os?.numero ?? "Carregando…"}
        extra={os && (
          <>
            <Etiqueta status={os.status} rotulo={os.status_display} />
            {os.atrasado && (
              <span className="tag t-atrasado">
                Atrasada {os.dias_atraso}d
              </span>
            )}
          </>
        )}
        aoFechar={aoFechar}
        rodape={os && (
          <div className="btnrow">
            {os.status === "gerada" && (
              <BotaoAcao classe="btn azul" aoClicar={() => mudarStatus("em_execucao")}>
                <Icone nome="relogio" tamanho={15} /> Em execução
              </BotaoAcao>
            )}
            <button className="btn verde" disabled={!pode("finalizarOS") || encerrada}
                    title={pode("finalizarOS") ? "" : "Exclusivo da diretoria"}
                    onClick={() => setFinalizando(true)}>
              <Icone nome="fechado" tamanho={15} /> Finalizar serviço
            </button>
            <button className="btn vermelho" disabled={!pode("cancelarOS") || encerrada}
                    title={pode("cancelarOS") ? "" : "Exclusivo da diretoria"}
                    onClick={() => setCancelando(true)}>
              <Icone nome="fechar" tamanho={15} /> Cancelar Serviço
            </button>
          </div>
        )}
      >
        <Estado carregando={carregando} erro={erro}>
          {os && (
            <>
              {msg && <div className="erro" style={{ margin: "14px 20px 0" }}>{msg}</div>}

              {os.atrasado && (
                <div className="aviso critico" style={{ margin: "14px 20px 0" }}>
                  <span className="ic">⏰</span>
                  <span>
                    Serviço atrasado há <b>{os.dias_atraso} dia(s)</b>. Remarque o compromisso
                    abaixo ou cancele a O.S.
                  </span>
                </div>
              )}

              <section className="sec">
                <h4>Enviar para Gestão</h4>
                <div className="acts" style={{ padding: 0 }}>
                  <BotaoAcao classe="btn verde" aoClicar={() => compartilharOS(doc)}>
                    <Icone nome="whatsapp" tamanho={15} /> Compartilhar
                  </BotaoAcao>
                  <BotaoAcao aoClicar={() => copiarImagemOS(doc)}>
                    <Icone nome="imagem" tamanho={15} /> Copiar imagem
                  </BotaoAcao>
                  <BotaoAcao aoClicar={() => baixarImagemOS(doc)}>
                    <Icone nome="baixar" tamanho={15} /> Baixar PNG
                  </BotaoAcao>
                </div>
              </section>

              <section className="sec">
                <h4>Cliente e obra</h4>
                <dl className="kv">
                  <dt>Cliente</dt><dd>{os.cliente_detalhe?.nome}</dd>
                  <dt>Telefone</dt><dd className="wk">{os.cliente_detalhe?.telefone}</dd>
                  <dt>Endereço</dt>
                  <dd className="wk">
                    {os.endereco_detalhe?.logradouro}
                    {os.endereco_detalhe?.numero ? `, ${os.endereco_detalhe.numero}` : ""}
                  </dd>
                  {os.endereco_detalhe?.complemento && (
                    <><dt>Complemento</dt><dd className="wk">{os.endereco_detalhe.complemento}</dd></>
                  )}
                  <dt>Bairro</dt><dd className="wk">{os.endereco_detalhe?.bairro}</dd>
                  <dt>Localização</dt>
                  <dd className="wk">
                    {os.endereco_detalhe?.link_localizacao ? (
                      <a className="lnk" href={os.endereco_detalhe.link_localizacao}
                         target="_blank" rel="noopener noreferrer">link enviado pelo WhatsApp</a>
                    ) : <span style={{ color: "var(--muted)" }}>não enviada</span>}
                  </dd>
                </dl>
              </section>

              <section className="sec">
                <h4>Pedido</h4>
                <dl className="kv">
                  <dt>Tipo</dt><dd>{os.tipo_display}</dd>
                  <dt>Orçamento</dt><dd>{os.orcamento_numero ?? "—"}</dd>
                  {orc && (
                    <>
                      <dt>Área</dt><dd>{num(orc.area_m2)} m²</dd>
                      <dt>Forro</dt><dd className="wk">{orc.forro_nome}</dd>
                      {orc.acabamento_nome && (
                        <><dt>Acabamento</dt><dd className="wk">{orc.acabamento_nome}</dd></>
                      )}
                      {ripao && <><dt>Ripão</dt><dd className="wk">{ripao}</dd></>}
                      {extras.map((e) => (
                        <Fragment key={e.id}>
                          <dt>{e.descricao}</dt><dd className="wk">{brl(e.total)}</dd>
                        </Fragment>
                      ))}
                      <dt>Valor do m²</dt>
                      <dd className="wk">
                        R$ {num(orc.preco_m2_vista)} à vista · R$ {num(orc.preco_m2_cartao)} cartão
                      </dd>
                    </>
                  )}
                  <dt>Forma escolhida</dt>
                  <dd>{os.modalidade_display || <span style={{ color: "var(--muted)" }}>a definir</span>}</dd>
                  <dt>Valor cobrado</dt>
                  <dd><b>{brl(os.valor_total)}</b></dd>
                  {Number(os.desconto) > 0 && (
                    <><dt>Desconto</dt><dd className="wk">− {brl(os.desconto)}</dd></>
                  )}
                </dl>
                {os.observacoes && <p className="obsbox">{os.observacoes}</p>}
              </section>

              <section className="sec">
                <h4>Agendamento</h4>
                {os.agendamentos.length ? (
                  <div className="agenda-lista">
                    {os.agendamentos.map((a) => (
                      <div className="agenda-item" key={a.id}>
                        <Pilula tipo={a.tipo} rotulo={a.tipo_display} />
                        <b>{periodoTexto(a)}</b>
                        {!encerrada && (
                          <button className="lnk" style={{ marginLeft: "auto" }}
                                  onClick={() => setRemarcando(a)}>remarcar</button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : <p className="nada">Sem agendamento.</p>}
              </section>

              <section className="sec">
                <h4>Comissão</h4>
                <dl className="kv">
                  <dt>Trouxe o cliente</dt><dd>{os.vendedor_nome}</dd>
                  <dt>Lançada por</dt>
                  <dd className="wk">
                    {os.criado_por_nome
                      ?? linhas(usuarios.dados).find((u) => u.id === os.criado_por)?.nome
                      ?? "—"}
                  </dd>
                  <dt>Base de cálculo</dt>
                  <dd className="wk">
                    {os.area_m2 ? `${num(os.area_m2)} m² × R$ 2,00` : "sem orçamento vinculado"}
                  </dd>
                  <dt>Comissão</dt>
                  <dd><b>{brl(os.comissao_valor)}</b></dd>
                  <dt>Situação</dt>
                  <dd className="wk">
                    {os.status === "cancelada"
                      ? "serviço cancelado — não gera comissão"
                      : os.comissao_paga
                        ? `paga em ${dataHora(os.comissao_paga_em)}`
                        : os.status === "finalizada"
                          ? "em aberto, a pagar"
                          : "a apurar na finalização"}
                  </dd>
                </dl>
                {pode("trocarVendedor") ? (
                  <div className="linha-acao">
                    <Selecao valor={os.vendedor} aoMudar={trocarVendedor}
                             opcoes={linhas(usuarios.dados)
                               .filter((u) => u.papel !== "instalador")
                               .map((u) => ({ valor: u.id, rotulo: u.nome }))} />
                    <span className="nota">A diretoria pode corrigir quando lança no lugar do funcionário.</span>
                  </div>
                ) : (
                  <p className="nota">Só a diretoria altera quem recebe a comissão.</p>
                )}
              </section>

              {pode("verFinanceiro") && (
                <section className="sec">
                  <h4>Pagamentos</h4>
                  {os.pagamentos.length ? (
                    <>
                      <div className="tw">
                        <table>
                          <thead><tr><th>Forma</th><th>Data</th><th className="num">Valor</th></tr></thead>
                          <tbody>
                            {os.pagamentos.map((p) => (
                              <tr key={p.id}>
                                <td>{p.forma_display}</td>
                                <td>{data(p.data)}</td>
                                <td className="num">{brl(p.valor)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <dl className="kv" style={{ marginTop: 12 }}>
                        <dt>Total</dt><dd>{brl(os.valor_liquido)}</dd>
                        <dt>Pago</dt><dd>{brl(os.total_pago)}</dd>
                        <dt>Saldo</dt>
                        <dd style={{ color: Number(os.saldo) > 0 ? "var(--critical)" : "var(--good)" }}>
                          {brl(os.saldo)}
                        </dd>
                      </dl>
                    </>
                  ) : (
                    <p className="nada">
                      Nada lançado ainda. Os pagamentos são registrados no
                      <b> fechamento da O.S.</b>
                    </p>
                  )}
                </section>
              )}

              <section className="sec">
                <h4>Histórico</h4>
                <ul className="tl">
                  {PASSOS.map(([chave, rotulo]) => {
                    const evento = os.historico.find((h) => h.para_status === chave);
                    const feito = Boolean(evento) || chave === "gerada";
                    return (
                      <li key={chave} className={feito ? "done" : ""}>
                        {rotulo}
                        <small>
                          {chave === "gerada"
                            ? dataHora(os.criado_em)
                            : evento
                              ? `${evento.usuario_nome} · ${dataHora(evento.em)}`
                              : os.status === chave ? "atual" : "pendente"}
                        </small>
                      </li>
                    );
                  })}
                  {os.status === "cancelada" && (
                    <li className="done cancel">
                      Cancelada
                      <small>{os.motivo_cancelamento || "sem motivo registrado"}</small>
                    </li>
                  )}
                </ul>
              </section>
            </>
          )}
        </Estado>
      </Gaveta>

      {finalizando && os && (
        <FinalizarModal os={os} aoFechar={() => setFinalizando(false)}
                        aoConcluir={() => { setFinalizando(false); atualizar(); }} />
      )}
      {cancelando && os && (
        <Confirmacao
          titulo="Cancelar serviço"
          subtitulo={`${os.numero} — ${os.cliente_detalhe?.nome}`}
          aviso="O serviço sai da agenda, as vagas dos turnos são liberadas e a comissão
                 deixa de ser devida. O cancelamento não se desfaz."
          rotulo="Sim, cancelar o serviço"
          aoFechar={() => setCancelando(false)}
          aoConfirmar={cancelar}
        />
      )}
      {remarcando && os && (
        <ReagendarModal os={os} agendamento={remarcando} aoFechar={() => setRemarcando(null)}
                        aoConcluir={() => { setRemarcando(null); atualizar(); }} />
      )}
    </>
  );
}
