/**
 * Fotos do catálogo (miniaturas de 192 px em src/imagens/catalogo, geradas a
 * partir de sistema/tipos_forro). O nome do item no catálogo decide a foto —
 * a ordem importa: "Freijó germinado" precisa casar antes de "Freijó".
 */
const ARQUIVOS = import.meta.glob("./imagens/catalogo/*.webp", { eager: true, query: "?url", import: "default" });
const url = (nome) => ARQUIVOS[`./imagens/catalogo/${nome}.webp`] || null;

const sem = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const REGRAS = [
  [/branco.*germinado|germinado.*branco/, "branco_germinado"],
  [/branco.*fosco/, "branco_fosco"],
  [/branco.*brilhoso/, "branco_brilhoso"],
  [/freijo.*germinado/, "freijo_germinado"],
  [/freijo.*colonial/, "freijo_colonial"],
  [/freijo/, "freijo_liso"],
  [/mogno.*germinado/, "mogno_germinado"],
  [/mogno/, "mogno_liso"],
  [/ipe/, "ipe_colonial"],
  [/cedro/, "cedro"],
  [/cerejeira/, "cerejeira"],
  [/[gq]uaruba/, "quaruba"],
  // acabamentos e materiais
  [/sanca/, "sanca_8cm"],
  [/moldura/, "moldura_4cm"],
  [/perfil/, "perfil"],
  // estruturas do Instalado (ripão)
  [/cutiuba/, "cutiuba"],
  [/cupiuba/, "cupiuba"],
  [/plastilon|pastilon/, "plastilon"],
];

/** Foto do item pelo nome (forro, acabamento, estrutura ou material); null se não houver. */
export function imagemDe(nome) {
  const t = sem(nome);
  const regra = REGRAS.find(([re]) => re.test(t));
  return regra ? url(regra[1]) : null;
}
