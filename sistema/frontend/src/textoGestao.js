/**
 * Texto que vai para o grupo da gestão no WhatsApp (O.S. e visita técnica),
 * no modelo combinado com a diretoria: emoji em cada linha, blocos separados
 * por ━━━. O negrito (*…*) do WhatsApp fica nos títulos.
 */
export const SEPARADOR = "━━━━━━━━━━━━━━━";

/** Emoji de cada informação; o que não estiver aqui (peças do pedido) usa ▫️. */
const EMOJI = {
  Cliente: "🙋", Telefone: "📞", Endereço: "📍", Bairro: "🏘️", Cidade: "🌆",
  Área: "📐", Medidas: "📏", Folhas: "📏", Forro: "⬜", Acabamento: "✨", Estrutura: "🪵",
  Serviço: "🛠️", Logística: "🚚", Desconto: "🔻",
  Entrega: "🚚", Instalação: "🛠️", Visita: "📐", Agendamento: "🗓️",
  "Agendado por": "🙍", Orçamento: "📄",
  "À vista": "💵", "No cartão": "💳", Tipo: "🏷️", Total: "✅", Pago: "💰", Saldo: "⏳",
};

export const linha = ([rotulo, valor]) => `${EMOJI[rotulo] ?? "▫️"} ${rotulo}: ${valor || "—"}`;

/** Bloco com título (emoji + *TÍTULO*) e as linhas; vazio se não há linhas. */
export function bloco(emoji, titulo, pares) {
  const validos = pares.filter(Boolean);
  if (!validos.length) return "";
  return `${SEPARADOR}\n${emoji} *${titulo}*\n${validos.map(linha).join("\n")}`;
}

/** Junta cabeçalho e blocos, pulando os vazios; observação no fim, em itálico. */
export function montarTexto(cabecalho, blocos, observacao = "") {
  return [cabecalho, ...blocos.filter(Boolean), observacao ? `${SEPARADOR}\n📝 _${observacao}_` : ""]
    .filter(Boolean)
    .join("\n");
}
