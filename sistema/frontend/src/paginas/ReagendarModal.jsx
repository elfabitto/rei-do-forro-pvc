/**
 * Remarcação de um compromisso — a saída para a O.S. que atrasou.
 * Mesmo calendário de vagas da geração do serviço; o backend confere de novo
 * ao gravar.
 */
import { useState } from "react";
import { data as fmtData, api } from "../api";
import CalendarioVagas from "../calendario";
import { BotaoAcao, Modal } from "../componentes";

export default function ReagendarModal({ os, agendamento, aoFechar, aoConcluir }) {
  const [quando, setQuando] = useState({ data: "", turno: "" });
  const [erro, setErro] = useState("");

  async function remarcar() {
    setErro("");
    try {
      if (!quando.data || !quando.turno) throw new Error("Escolha o dia e o turno.");
      await api.post(`/ordens-servico/${os.id}/reagendar/${agendamento.id}/`, quando);
      aoConcluir();
      return "remarcado";
    } catch (e) {
      setErro(e.message);
      throw e;
    }
  }

  return (
    <Modal
      titulo="Remarcar compromisso"
      subtitulo={`${os.numero} — ${agendamento.tipo_display} que estava em ${fmtData(agendamento.data)}`}
      aoFechar={aoFechar}
      largura={520}
      rodape={
        <div className="btnrow" style={{ padding: 0 }}>
          <BotaoAcao classe="btn p" aoClicar={remarcar}>Remarcar</BotaoAcao>
          <button className="btn" onClick={aoFechar}>Cancelar</button>
        </div>
      }
    >
      {erro && <div className="erro">{erro}</div>}
      <CalendarioVagas titulo={agendamento.tipo_display} tipo={agendamento.tipo}
                       area={os.area_m2} excluir={agendamento.id}
                       valor={quando} aoMudar={setQuando} />
    </Modal>
  );
}
