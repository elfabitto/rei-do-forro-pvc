/**
 * Escolha do forro com a foto de cada tipo — o vendedor vê o que está
 * oferecendo. Lista suspensa própria porque o <select> não mostra imagem.
 * Setas sobem/descem, Enter escolhe, Esc fecha.
 */
import { useEffect, useRef, useState } from "react";
import { imagemDe } from "../imagensCatalogo";
import { brl } from "../orcamentoDoc";

/** Quadradinho com a foto do item; sem foto, a cor de amostra do catálogo. */
export function Miniatura({ nome, cor, tamanho = 36, className = "" }) {
  const src = imagemDe(nome);
  return src
    ? <img className={`mini ${className}`} src={src} alt="" width={tamanho} height={tamanho} loading="lazy" />
    : <span className={`mini ${className}`} style={{ width: tamanho, height: tamanho, background: cor || "#e9ecef" }} />;
}

export default function SeletorForro({ forros, valor, aoMudar }) {
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const caixa = useRef(null);
  const lista = useRef(null);
  const atual = forros.find((f) => String(f.id) === String(valor));

  useEffect(() => {
    if (!aberto) return undefined;
    const fora = (e) => caixa.current && !caixa.current.contains(e.target) && setAberto(false);
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  useEffect(() => {   // mantém o item ativo à vista ao navegar pelo teclado
    lista.current?.children[ativo]?.scrollIntoView({ block: "nearest" });
  }, [ativo, aberto]);

  function abrir() {
    setAtivo(Math.max(0, forros.findIndex((f) => String(f.id) === String(valor))));
    setAberto(true);
  }

  function escolher(f) {
    aoMudar(String(f.id));
    setAberto(false);
  }

  function tecla(e) {
    if (!aberto && ["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) { e.preventDefault(); abrir(); return; }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setAtivo((a) => (a + (e.key === "ArrowDown" ? 1 : -1) + forros.length) % forros.length);
    } else if (e.key === "Enter" && forros[ativo]) {
      e.preventDefault();
      escolher(forros[ativo]);
    } else if (e.key === "Escape") {
      setAberto(false);
    }
  }

  return (
    <div className="selForro" ref={caixa}>
      <button type="button" className={`selForroBtn${aberto ? " aberto" : ""}`} onClick={() => (aberto ? setAberto(false) : abrir())}
              onKeyDown={tecla} aria-haspopup="listbox" aria-expanded={aberto}>
        {atual ? (
          <>
            <Miniatura nome={atual.nome} cor={atual.cor_amostra} tamanho={34} />
            <span className="nm">{atual.nome}</span>
            <span className="pr">R$ {brl(atual.preco_material_vista)}/m²</span>
          </>
        ) : <span className="ph">Selecione o tipo de forro</span>}
        <span className="seta">▾</span>
      </button>

      {aberto && (
        <ul className="selForroLista" role="listbox" ref={lista}>
          {forros.map((f, i) => (
            <li key={f.id} role="option" aria-selected={String(f.id) === String(valor)}
                className={`${i === ativo ? "ativo" : ""}${String(f.id) === String(valor) ? " sel" : ""}`}
                onMouseDown={(e) => { e.preventDefault(); escolher(f); }} onMouseEnter={() => setAtivo(i)}>
              <Miniatura nome={f.nome} cor={f.cor_amostra} tamanho={48} />
              <span className="nm">{f.nome}</span>
              <span className="pr">R$ {brl(f.preco_material_vista)}<small>/m²</small></span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
