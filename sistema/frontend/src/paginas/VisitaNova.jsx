/**
 * Agendar visita técnica (orçamento presencial).
 *
 * Primeiro a data: o calendário destaca os dias com mais vagas sobrando, que
 * são os que convém preencher. Depois os dados do cliente — o mesmo cadastro
 * do fechamento de orçamento (novo ou já cadastrado).
 *
 * A visita ocupa 1 das vagas de entrega do dia; o backend confere de novo ao
 * gravar. Se o cliente for novo e a vaga sumir nesse meio-tempo, o cadastro
 * dele fica feito e basta escolher outro dia.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { diaCurto } from "../agendaTexto";
import CalendarioVagas from "../calendario";
import { BotaoAcao, Campo } from "../componentes";
import Icone from "../icones";
import { useEscolhaCliente } from "./ClienteModal";

const ROT_TURNO = { manha: "manhã", tarde: "tarde" };

export default function VisitaNova() {
  const navegar = useNavigate();
  const [quando, setQuando] = useState({ data: "", turno: "" });
  const [observacoes, setObservacoes] = useState("");
  const [erro, setErro] = useState("");
  // cliente já gravado numa tentativa anterior: não cadastra de novo
  const [escolhido, setEscolhido] = useState(null);
  const cliente = useEscolhaCliente({ rotuloEndereco: "Endereço da visita", comObservacao: false });

  const dataOk = quando.data && quando.turno;

  async function agendar() {
    setErro("");
    if (!dataOk) {
      setErro("Escolha o dia e o turno da visita.");
      throw new Error("escolha a data");
    }
    const quem = escolhido ?? (await cliente.confirmar());
    setEscolhido(quem);
    try {
      const v = await api.post("/visitas/", {
        cliente: quem.cliente, endereco: quem.endereco, ...quando, observacoes,
      });
      navegar(`/visitas?abrir=${v.id}`);
      return "agendada";
    } catch (e) {
      setErro(e.message);
      throw e;
    }
  }

  return (
    <div className="pagina">
      <button className="voltar" onClick={() => navegar("/visitas")}>
        <span aria-hidden="true">←</span> Visitas técnicas
      </button>
      <h1>Agendar visita</h1>
      <p className="sub">Orçamento presencial: o técnico vai ao cliente medir e orçar.</p>

      <div className="cols c-2">
        <section className="card">
          <header><h2>Quando</h2></header>
          <div className="body">
            <div className={`passoTit${dataOk ? " feito" : ""}`}><span className="n">1</span> Escolha a data</div>
            <CalendarioVagas titulo="Visita técnica" tipo="visita" valor={quando} aoMudar={setQuando} />
            <p className="nota">
              A visita ocupa 1 das vagas de entrega do dia — é a equipe saindo da loja.
            </p>
          </div>
        </section>

        <section className="card">
          <header><h2>Informações do cliente</h2></header>
          <div className="body">
            {erro && <div className="erro">{erro}</div>}
            {dataOk && (
              <div className="visitaResumo">
                <Icone nome="visita" tamanho={18} />
                Visita em {diaCurto(quando.data)}, {ROT_TURNO[quando.turno]}
              </div>
            )}

            <div className={`passoTit${escolhido ? " feito" : ""}`}><span className="n">2</span> Dados do cliente</div>
            {escolhido ? (
              <div className="clientebox">
                <div>
                  <span className="lbl" style={{ marginBottom: 2 }}>Cliente</span>
                  <b>{escolhido.nome}</b>
                </div>
                <button className="btn" onClick={() => setEscolhido(null)}>Trocar cliente</button>
              </div>
            ) : (
              cliente.conteudo
            )}

            <Campo rotulo="Observações da visita">
              <textarea rows={2} value={observacoes} onChange={(e) => setObservacoes(e.target.value)}
                        placeholder="Ex.: ligar antes de sair; portão azul; medir sala e cozinha." />
            </Campo>
          </div>
          <div className="acts">
            <BotaoAcao classe="btn roxo" aoClicar={agendar} desabilitado={!dataOk}
                       titulo={dataOk ? "" : "Escolha o dia e o turno primeiro"}>
              <Icone nome="visita" tamanho={15} /> Agendar visita
            </BotaoAcao>
            <button className="btn" onClick={() => navegar("/visitas")}>Cancelar</button>
          </div>
        </section>
      </div>
    </div>
  );
}
