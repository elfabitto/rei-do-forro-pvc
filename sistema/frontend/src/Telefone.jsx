/**
 * Telefone clicável: toca e abre a conversa no WhatsApp com aquele número.
 * Um só componente para o sistema inteiro — onde aparece telefone de cliente
 * (ou da equipe), aparece assim.
 *
 * `dentroDeBotao`: o cartão inteiro já é um <button> (agenda) — link dentro de
 * botão não é HTML válido, então vira um <span> que abre o WhatsApp sozinho.
 */
import Icone from "./icones";

/** "(91) 98877-6655" → "https://wa.me/5591988776655"; "" se não der número válido. */
export function linkWhatsApp(telefone) {
  const dig = String(telefone ?? "").replace(/\D/g, "");
  if (dig.length < 10) return "";
  return `https://wa.me/${dig.startsWith("55") && dig.length > 11 ? dig : `55${dig}`}`;
}

export default function Telefone({ numero, dentroDeBotao = false }) {
  if (!numero) return null;
  const url = linkWhatsApp(numero);
  if (!url) return <span>{numero}</span>;

  const conteudo = <><Icone nome="whatsapp" tamanho={14} />{numero}</>;
  const titulo = "Abrir conversa no WhatsApp";

  if (dentroDeBotao) {
    const abrir = (e) => {
      e.stopPropagation();
      e.preventDefault();
      window.open(url, "_blank", "noopener");
    };
    return (
      <span role="link" tabIndex={0} className="foneZap" title={titulo}
            onClick={abrir} onKeyDown={(e) => e.key === "Enter" && abrir(e)}>
        {conteudo}
      </span>
    );
  }
  // stopPropagation: a linha da tabela (ou o cartão) abre outra coisa ao clicar
  return (
    <a className="foneZap" href={url} target="_blank" rel="noopener noreferrer" title={titulo}
       onClick={(e) => e.stopPropagation()}>
      {conteudo}
    </a>
  );
}
