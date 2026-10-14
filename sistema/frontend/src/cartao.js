/**
 * Repasse da taxa da maquininha ao cliente — a mesma conta do backend
 * (TaxasCartao.acrescimo): para a loja receber `base` limpo, o cliente paga
 * base ÷ (1 − taxa).
 */
export const PARCELAS_MAX = 12;

const cent = (n) => Math.round(n * 100) / 100;

/** Taxa (%) da forma e parcelas; 0 fora do cartão ou sem tabela carregada. */
export function taxaDe(taxas, forma, parcelas = 1) {
  if (!taxas) return 0;
  if (forma === "debito") return Number(taxas.debito) || 0;
  if (forma === "credito") return Number(taxas.credito?.[String(parcelas)]) || 0;
  return 0;
}

/** Quanto somar a `base` para cobrir a taxa. */
export function acrescimoCartao(taxas, base, forma, parcelas = 1) {
  const t = taxaDe(taxas, forma, parcelas) / 100;
  if (!(base > 0) || t <= 0 || t >= 1) return 0;
  return cent(base / (1 - t) - base);
}
