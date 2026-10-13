/**
 * Como um compromisso da agenda é escrito em tela, na imagem e no WhatsApp.
 * Entrega é um dia; instalação pode durar vários e é escrita como período.
 */
const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

const dd = (s) => {
  const d = new Date(s + "T00:00:00");
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
};

/** Só a primeira letra maiúscula: "Outubro de 2026", não "Outubro De 2026". */
export const inicial = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** "qua 15/10" */
export const diaCurto = (s) => `${SEMANA[new Date(s + "T00:00:00").getDay()]} ${dd(s)}`;

/** 1 → "1 dia", 1.5 → "1,5 dia", 2 → "2 dias" */
export const textoDias = (n) => `${String(n).replace(".", ",")} dia${Number(n) >= 2 ? "s" : ""}`;

/** É uma instalação que passa do turno em que começou? */
export const varioTurnos = (a) => a?.tipo === "instalacao" && Number(a.duracao_turnos) > 1;

/**
 * "15/10 · Manhã" para a entrega; para a instalação,
 * "15/10 manhã → 16/10 manhã · 1,5 dia".
 */
export function periodoTexto(a) {
  if (!a) return "—";
  if (!varioTurnos(a) || !a.data_fim) return `${dd(a.data)} · ${a.turno_display}`;
  return `${dd(a.data)} ${a.turno_display.toLowerCase()} → ${dd(a.data_fim)} `
    + `${(a.turno_fim_display || "").toLowerCase()} · ${textoDias(a.dias)}`;
}
