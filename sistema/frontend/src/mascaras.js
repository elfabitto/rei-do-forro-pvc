/**
 * Máscaras e checagens de preenchimento — as mesmas regras do backend
 * (apps/core/formatos.py), aplicadas enquanto a pessoa digita.
 */
export const digitos = (v) => String(v ?? "").replace(/\D/g, "");

/** Formata enquanto digita: só números, no máximo 11, "(94) 99999-0000". */
export function telefone(v) {
  let d = digitos(v);
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  d = d.slice(0, 11);
  if (d.length <= 2) return d ? `(${d}` : "";
  const meio = d.length === 11 ? 7 : 6;
  if (d.length <= meio) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, meio)}-${d.slice(meio)}`;
}

/** Mensagem de erro, ou "" se está certo. Vazio só é erro quando obrigatório. */
export function erroTelefone(v, obrigatorio = true) {
  const d = digitos(v);
  if (!d) return obrigatorio ? "Informe o telefone (WhatsApp)." : "";
  if (d.length < 10) return "Faltam dígitos: DDD + número, ex.: (94) 99999-0000.";
  if (d[0] === "0" || d[1] === "0") return "DDD inválido.";
  if (d.length === 11 && d[2] !== "9") return "Celular começa com 9 depois do DDD.";
  return "";
}

/** Número da casa: dígitos e uma letra ("180A"), ou S/N (digitar "s" já completa). */
export function numeroCasa(v) {
  const t = String(v ?? "").toUpperCase().replace(/\s/g, "");
  if (t === "S/") return "";        // apagando o S/N
  if (t.startsWith("S")) return "S/N";
  return (t.match(/^\d{1,6}[A-Z]?/) || [""])[0];
}

const MINUSCULAS = new Set(["da", "de", "do", "das", "dos", "e"]);
/** "maria DA silva" → "Maria da Silva" (aplicado ao sair do campo). */
export const nomeProprio = (v) =>
  String(v ?? "").trim().split(/\s+/).filter(Boolean)
    .map((p, i) => (i && MINUSCULAS.has(p.toLowerCase()) ? p.toLowerCase() : p[0].toUpperCase() + p.slice(1).toLowerCase()))
    .join(" ");

/** Valor em reais/m²: só dígitos e uma vírgula, no máximo 2 casas. */
export function decimal(v, casas = 2) {
  let t = String(v ?? "");
  t = (t.includes(",") ? t.replace(/\./g, "") : t.replace(/\./g, ",")).replace(/[^0-9,]/g, "");   // 1.500,00 ou 12.5
  const i = t.indexOf(",");
  if (i >= 0) t = t.slice(0, i + 1) + t.slice(i + 1).replace(/,/g, "").slice(0, casas);
  return t;
}

export const erroEmail = (v) =>
  !v || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? "" : "E-mail inválido.";

/** Props prontas para um <input> controlado com máscara. */
export const comMascara = (valor, setValor, mascara) => ({
  value: valor ?? "",
  onChange: (e) => setValor(mascara(e.target.value)),
});

/* Onde a empresa atende — mesma lista do backend (apps/core/formatos.py). */
export const CIDADES = ["Belém", "Ananindeua", "Marituba", "Benfica", "Americano", "Santa Bárbara", "Mosqueiro",
  "Outeiro", "Benevides", "Santa Isabel"];

export const semAcento = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** "belem" → "Belém"; "" se não for uma cidade atendida. */
export const cidadeDaLista = (t) => CIDADES.find((c) => semAcento(c) === semAcento(t)) || "";
