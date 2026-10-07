/**
 * Remarcação de um compromisso — a saída para a O.S. que atrasou.
 * Só oferece dia e turno com vaga; o backend confere de novo ao gravar.
 */
import { useMemo, useState } from "react";
import { api, data as fmtData } from "../api";
import { BotaoAcao, Campo, Estado, Modal, Pilula, Selecao, useApi } from "../componentes";

const hojeISO = () => new Date().toISOString().slice(0, 10);
const maisDias = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const rotuloDia = (iso) =>
  new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", {
    weekday: "short", day: "2-digit", month: "2-digit",
  });

export default function ReagendarModal({ os, agendamento, aoFechar, aoConcluir }) {
  const disp = useApi("/agenda/disponibilidade/", { de: hojeISO(), ate: maisDias(60) });
  const [dia, setDia] = useState("");
  const [turno, setTurno] = useState("");
  const [erro, setErro] = useState("");

  const dias = disp.dados?.dias ?? [];
  const comVaga = useMemo(
    () => dias.filter((d) => d.atende && d.turnos.some((t) => t.livre > 0)),
    [dias]
  );
  const escolhido = comVaga.find((d) => d.data === dia);
  const turnos = escolhido ? escolhido.turnos.filter((t) => t.livre > 0) : [];

  async function remarcar() {
    setErro("");
    try {
      if (!dia || !turno) throw new Error("Escolha o dia e o turno.");
      await api.post(`/ordens-servico/${os.id}/reagendar/${agendamento.id}/`, { data: dia, turno });
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
      largura={460}
      rodape={
        <div className="btnrow" style={{ padding: 0 }}>
          <BotaoAcao classe="btn p" aoClicar={remarcar}>Remarcar</BotaoAcao>
          <button className="btn" onClick={aoFechar}>Cancelar</button>
        </div>
      }
    >
      {erro && <div className="erro">{erro}</div>}

      <div style={{ marginBottom: 14 }}>
        <Pilula tipo={agendamento.tipo} rotulo={agendamento.tipo_display} />
      </div>

      <Estado carregando={disp.carregando} erro={disp.erro}>
        <Campo rotulo="Nova data">
          <Selecao valor={dia} vazio="Escolha o dia"
                   aoMudar={(d) => { setDia(d); setTurno(""); }}
                   opcoes={comVaga.map((d) => ({
                     valor: d.data,
                     rotulo: `${rotuloDia(d.data)} — ${d.livre_total} vaga(s)`,
                   }))} />
        </Campo>
        <Campo rotulo="Turno">
          <Selecao valor={turno} aoMudar={setTurno} disabled={!escolhido}
                   vazio={escolhido ? "Escolha o turno" : "Escolha o dia antes"}
                   opcoes={turnos.map((t) => ({
                     valor: t.turno,
                     rotulo: `${t.turno_display} — ${t.livre} de ${t.total} livre(s)`,
                   }))} />
        </Campo>
      </Estado>
    </Modal>
  );
}
