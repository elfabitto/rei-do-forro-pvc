/**
 * Detalhe da O.S.
 *
 * Pagamento não aparece como formulário solto: ele existe dentro do fechamento,
 * que é quando a diretoria confere o que o cliente pagou. Aqui só se vê o que já
 * foi lançado.
 */
import { useState } from "react";
import { api, brl, data, dataHora } from "../api";
import { useAuth } from "../auth";
import { BotaoAcao, Estado, Etiqueta, Gaveta, Pilula, Selecao, linhas, useApi } from "../componentes";
import Icone from "../icones";
import { baixarImagemOS, compartilharOS, copiarImagemOS, montarOS } from "../osDoc";
import FinalizarModal from "./FinalizarModal";
import ReagendarModal from "./ReagendarModal";

const PASSOS = [
  ["gerada", "Gerada"],
  ["em_execucao", "Em execução"],
  ["finalizada", "Finalizada"],
];

export default function OrdemDetalhe({ id, aoFechar, aoMudar }) {
  const { pode } = useAuth();
  const { dados: os, erro, carregando, recarregar } = useApi(`/ordens-servico/${id}/`, null, [id]);
  const usuarios = useApi("/usuarios/");

  const [msg, setMsg] = useState("");
  const [finalizando, setFinalizando] = useState(false);
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

  async function trocarVendedor(novo) {
    await api.patch(`/ordens-servico/${os.id}/`, { vendedor: Number(novo) });
    atualizar();
    return "alterado";
  }

  const encerrada = os && ["finalizada", "cancelada"].includes(os.status);
  const doc = os && montarOS(os, { verFinanceiro: pode("verFinanceiro") });

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
            <BotaoAcao classe="btn vermelho" desabilitado={!pode("cancelarOS") || encerrada}
                       titulo={pode("cancelarOS") ? "" : "Exclusivo da diretoria"}
                       aoClicar={() => mudarStatus("cancelada", "Cancelada pela diretoria")}>
              <Icone nome="fechar" tamanho={15} /> Cancelar
            </BotaoAcao>
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
                <h4>Enviar</h4>
                <div className="acts" style={{ padding: 0 }}>
                  <BotaoAcao classe="btn p" aoClicar={() => compartilharOS(doc)}>
                    <Icone nome="whatsapp" tamanho={15} /> Compartilhar no WhatsApp
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
                  <dt>Orçamento</dt><dd>{os.orcamento_numero ?? "—"}</dd>
                  {pode("verFinanceiro") && (
                    <>
                      <dt>Valor cobrado</dt>
                      <dd>{brl(os.valor_total)}{os.modalidade_display && ` · ${os.modalidade_display}`}</dd>
                      {os.valor_vista != null && !os.modalidade && (
                        <>
                          <dt>Referência</dt>
                          <dd className="wk">
                            {brl(os.valor_vista)} à vista · {brl(os.valor_cartao)} cartão
                          </dd>
                        </>
                      )}
                      {Number(os.desconto) > 0 && (
                        <><dt>Desconto</dt><dd className="wk">− {brl(os.desconto)}</dd></>
                      )}
                    </>
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
                        <b>{data(a.data)}</b>
                        <span>{a.turno_display}</span>
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
                    {linhas(usuarios.dados).find((u) => u.id === os.criado_por)?.nome ?? "—"}
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
      {remarcando && os && (
        <ReagendarModal os={os} agendamento={remarcando} aoFechar={() => setRemarcando(null)}
                        aoConcluir={() => { setRemarcando(null); atualizar(); }} />
      )}
    </>
  );
}
