/**
 * Calendário de vagas: marca-se o dia no próprio mês, vendo a disponibilidade
 * de cada data, e só depois o turno.
 *
 * Entrega: 4 por dia (o turno é só informativo). Instalação: a duração vem da
 * área (1 a 6 dias úteis) e o backend diz em que turnos ela pode começar sem
 * faltar equipe em nenhum dos dias seguintes — e onde termina.
 *
 * É a mesma conta que o backend confere ao gravar; se a vaga sumir entre a
 * escolha e o envio, o servidor recusa e nada é criado pela metade.
 */
import { useEffect, useMemo, useState } from "react";
import { diaCurto, inicial, textoDias } from "./agendaTexto";
import { Estado, useApi } from "./componentes";

const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default function CalendarioVagas({ valor, aoMudar, tipo = "entrega", titulo, area, excluir }) {
  const [offset, setOffset] = useState(0);
  const instalacao = tipo === "instalacao";

  const { inicio, fim, ref } = useMemo(() => {
    const hoje = new Date();
    const ref = new Date(hoje.getFullYear(), hoje.getMonth() + offset, 1);
    const fim = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
    return { inicio: iso(ref), fim: iso(fim), ref };
  }, [offset]);

  const params = { de: inicio, ate: fim, tipo };
  if (instalacao && area) params.area = area;
  if (excluir) params.excluir = excluir;
  const disp = useApi("/agenda/disponibilidade/", params, [inicio, fim, tipo, area, excluir]);

  const hoje = iso(new Date());
  const dias = disp.dados?.dias ?? [];
  const vazios = ref.getDay();
  const duracao = disp.dados?.duracao_dias;

  const escolhido = dias.find((d) => d.data === valor?.data);
  const turnos = escolhido?.turnos ?? [];
  const turnoEscolhido = turnos.find((t) => t.turno === valor?.turno);

  /*
   * Prévia do prazo: com o dia marcado, pinta no calendário os dias que o
   * serviço vai tomar e o dia em que termina. Sem turno ainda, usa o primeiro
   * turno livre (manhã, normalmente). Fica guardada ao trocar de mês, para a
   * instalação que atravessa o fim do mês continuar visível no seguinte.
   */
  const [previa, setPrevia] = useState(null);
  useEffect(() => {
    if (!valor?.data) { setPrevia(null); return; }
    if (!escolhido) return;   // outro mês na tela: mantém a prévia já calculada
    const t = (turnoEscolhido?.disponivel && turnoEscolhido) || turnos.find((x) => x.disponivel);
    if (!t) { setPrevia(null); return; }
    const periodo = t.periodo ?? [`${escolhido.data}:${t.turno}`];
    const porData = {};
    for (const k of periodo) {
      const [d, tr] = k.split(":");
      (porData[d] ??= []).push(tr);
    }
    setPrevia({
      inicio: escolhido.data,
      turno: t,
      porData,
      fim: t.termina?.data ?? escolhido.data,
      turnoFim: t.termina?.turno_display ?? t.turno_display,
      provisoria: !turnoEscolhido,
    });
  }, [valor?.data, valor?.turno, escolhido, turnoEscolhido]); // eslint-disable-line react-hooks/exhaustive-deps

  const mes = inicial(ref.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }));

  /*
   * O número que aparece no quadradinho do dia. Nos dias da prévia ele já sai
   * descontado: é o que sobra depois deste agendamento.
   */
  const vagasDoDia = (dia) => {
    const ocupa = previa?.porData[dia.data];
    if (!instalacao) return Math.max(0, dia.entregas.livre - (ocupa ? 1 : 0));
    if (ocupa) {
      return Math.max(0, Math.min(...ocupa.map((tr) =>
        (dia.turnos.find((t) => t.turno === tr)?.instalacoes.livre ?? 1) - 1)));
    }
    return Math.max(0, ...dia.turnos.filter((t) => t.disponivel).map((t) => t.instalacoes.livre));
  };

  return (
    <div className="agbox">
      <div className="agtit">
        <span className={`pill p-${tipo}`}>{titulo}</span>
        {instalacao && duracao && <span className="dur">{textoDias(duracao)} de serviço</span>}
        <div className="calnav">
          <button type="button" className="mini" onClick={() => setOffset((o) => o - 1)}
                  aria-label="Mês anterior">←</button>
          <b>{mes}</b>
          <button type="button" className="mini" onClick={() => setOffset((o) => o + 1)}
                  aria-label="Próximo mês">→</button>
        </div>
      </div>

      <Estado carregando={disp.carregando} erro={disp.erro}>
        <div className={`calvagas ${tipo}`}>
          {SEMANA.map((d) => <div className="hd" key={d}>{d}</div>)}
          {Array.from({ length: vazios }, (_, i) => <div key={`v${i}`} />)}

          {dias.map((dia) => {
            const passado = dia.data < hoje;
            const livre = vagasDoDia(dia);
            const marcado = dia.data === valor?.data;
            const naFaixa = Boolean(previa?.porData[dia.data]) && !marcado;
            const ehFim = instalacao && previa && dia.data === previa.fim && previa.fim !== previa.inicio;
            const bloqueado = !dia.atende || passado || (!dia.disponivel && !marcado);
            return (
              <button
                type="button"
                key={dia.data}
                disabled={bloqueado}
                className={`cvd${marcado ? " on" : ""}${naFaixa ? " faixa" : ""}${ehFim ? " fim" : ""}`
                  + `${bloqueado ? " off" : ""}${dia.data === hoje ? " hoje" : ""}`}
                onClick={() => aoMudar({ data: dia.data, turno: "" })}
                title={bloqueado
                  ? (passado ? "data passada" : !dia.atende ? "sem atendimento" : "sem vaga")
                  : instalacao ? `${livre} equipe(s) livre(s)` : `${livre} entrega(s) livre(s)`}
              >
                <span className="n">{Number(dia.data.slice(-2))}</span>
                <span className="v">
                  {ehFim ? "fim" : !dia.atende ? "—" : passado ? "" : dia.disponivel || naFaixa || marcado ? livre : "lotado"}
                </span>
              </button>
            );
          })}
        </div>
        <p className="calleg">
          {instalacao
            ? "Número = equipes livres. Com o dia marcado, os dias do serviço ficam pintados e o número já mostra o que sobra."
            : "Número = entregas livres no dia (4 por dia, contando as instalações que começam nele)."}
        </p>

        {instalacao && previa && (
          <div className={`prazo${previa.provisoria ? " prov" : ""}`}>
            <div className="ponta">
              <small>Começa</small>
              <b>{diaCurto(previa.inicio)}</b>
              <span>{previa.turno.turno_display.toLowerCase()}</span>
            </div>
            <div className="seta" aria-hidden="true">
              <span>{textoDias(duracao)}</span>
            </div>
            <div className="ponta fim">
              <small>Termina</small>
              <b>{diaCurto(previa.fim)}</b>
              <span>{previa.turnoFim.toLowerCase()}</span>
            </div>
          </div>
        )}
        {instalacao && previa?.provisoria && (
          <p className="calleg" style={{ marginTop: 6 }}>
            Prévia começando de {previa.turno.turno_display.toLowerCase()} — escolha o turno abaixo para confirmar.
          </p>
        )}

        <div className="calturnos">
          {escolhido ? (
            turnos.map((t) => (
              <button
                type="button"
                key={t.turno}
                disabled={!t.disponivel}
                title={t.motivo || ""}
                className={`cvt${valor?.turno === t.turno ? " on" : ""}`}
                onClick={() => aoMudar({ ...valor, turno: t.turno })}
              >
                <b>{t.turno_display}</b>
                <small>
                  {!t.disponivel
                    ? (t.trabalha ? "sem vaga" : "bloqueado")
                    : instalacao
                      ? `termina ${diaCurto(t.termina.data)} · ${t.termina.turno_display.toLowerCase()}`
                      : `${escolhido.entregas.livre} de ${escolhido.entregas.total} livre(s) no dia`}
                </small>
              </button>
            ))
          ) : (
            <p className="nota" style={{ margin: 0 }}>Escolha o dia no calendário para ver os turnos.</p>
          )}
        </div>
        {turnoEscolhido && !turnoEscolhido.disponivel && turnoEscolhido.motivo && (
          <p className="nota">{turnoEscolhido.motivo}</p>
        )}
      </Estado>
    </div>
  );
}
