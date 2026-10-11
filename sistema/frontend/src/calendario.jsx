/**
 * Calendário de vagas: marca-se o dia no próprio mês, vendo a disponibilidade
 * de cada data, e só depois o turno. Substitui os menus suspensos de data e
 * turno, que escondiam justamente a informação que importa — onde ainda cabe.
 *
 * A disponibilidade é a mesma que o backend confere ao gravar; se o turno
 * encher entre a escolha e o envio, o servidor recusa e nada é criado pela metade.
 */
import { useMemo, useState } from "react";
import { Estado, useApi } from "./componentes";

const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default function CalendarioVagas({ valor, aoMudar, tipo = "entrega", titulo }) {
  const [offset, setOffset] = useState(0);

  const { inicio, fim, ref } = useMemo(() => {
    const hoje = new Date();
    const ref = new Date(hoje.getFullYear(), hoje.getMonth() + offset, 1);
    const fim = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
    return { inicio: iso(ref), fim: iso(fim), ref };
  }, [offset]);

  const disp = useApi("/agenda/disponibilidade/", { de: inicio, ate: fim }, [inicio, fim]);

  const hoje = iso(new Date());
  const dias = disp.dados?.dias ?? [];
  const vazios = ref.getDay();

  const escolhido = dias.find((d) => d.data === valor?.data);
  const turnos = escolhido?.turnos ?? [];

  const mes = ref.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  return (
    <div className="agbox">
      <div className="agtit">
        <span className={`pill p-${tipo}`}>{titulo}</span>
        <div className="calnav">
          <button type="button" className="mini" onClick={() => setOffset((o) => o - 1)}
                  aria-label="Mês anterior">←</button>
          <b>{mes}</b>
          <button type="button" className="mini" onClick={() => setOffset((o) => o + 1)}
                  aria-label="Próximo mês">→</button>
        </div>
      </div>

      <Estado carregando={disp.carregando} erro={disp.erro}>
        <div className="calvagas">
          {SEMANA.map((d) => <div className="hd" key={d}>{d}</div>)}
          {Array.from({ length: vazios }, (_, i) => <div key={`v${i}`} />)}

          {dias.map((dia) => {
            const livre = dia.livre_total ?? 0;
            const passado = dia.data < hoje;
            const bloqueado = !dia.atende || passado || livre === 0;
            const marcado = dia.data === valor?.data;
            return (
              <button
                type="button"
                key={dia.data}
                disabled={bloqueado}
                className={`cvd${marcado ? " on" : ""}${bloqueado ? " off" : ""}${dia.data === hoje ? " hoje" : ""}`}
                onClick={() => aoMudar({ data: dia.data, turno: "" })}
                title={bloqueado
                  ? (passado ? "data passada" : !dia.atende ? "sem atendimento" : "dia lotado")
                  : `${livre} vaga(s) livre(s)`}
              >
                <span className="n">{Number(dia.data.slice(-2))}</span>
                <span className="v">
                  {!dia.atende ? "—" : passado ? "" : livre ? `${livre} vaga${livre === 1 ? "" : "s"}` : "lotado"}
                </span>
              </button>
            );
          })}
        </div>

        <div className="calturnos">
          {escolhido ? (
            turnos.map((t) => (
              <button
                type="button"
                key={t.turno}
                disabled={t.livre === 0}
                className={`cvt${valor?.turno === t.turno ? " on" : ""}`}
                onClick={() => aoMudar({ ...valor, turno: t.turno })}
              >
                <b>{t.turno_display}</b>
                <small>{t.livre ? `${t.livre} de ${t.total} livre(s)` : "lotado"}</small>
              </button>
            ))
          ) : (
            <p className="nota" style={{ margin: 0 }}>Escolha o dia no calendário para ver os turnos.</p>
          )}
        </div>
      </Estado>
    </div>
  );
}
