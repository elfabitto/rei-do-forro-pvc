import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { LOGO } from "./logo";
import { brl, m2 } from "./orcamentoDoc";

/** Busca dados da API com carregando/erro resolvidos e recarga manual. */
export function useApi(caminho, params, deps = []) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    api.get(caminho, params)
      .then((d) => { if (vivo) { setDados(d); setErro(""); } })
      .catch((e) => { if (vivo) setErro(e.message); })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, versao]);

  const recarregar = useCallback(() => setVersao((v) => v + 1), []);
  return { dados, erro, carregando, recarregar };
}

export const linhas = (d) => (Array.isArray(d) ? d : d?.results ?? []);

export const Etiqueta = ({ status, rotulo }) => <span className={`tag t-${status}`}>{rotulo}</span>;
export const Pilula = ({ tipo, rotulo }) => <span className={`pill p-${tipo}`}>{rotulo}</span>;

export function Estado({ carregando, erro, vazio, children }) {
  if (carregando) return <div className="vazio">Carregando…</div>;
  if (erro) return <div className="erro">{erro}</div>;
  if (vazio) return <div className="vazio">{vazio}</div>;
  return children;
}

/* ---------------------------------------------------------------- formulário */
export function Campo({ rotulo, erro, dica, children }) {
  return (
    <label className="f">
      <span>{rotulo}</span>
      {children}
      {dica && !erro && <small className="dica">{dica}</small>}
      {erro && <small className="erroCampo">{erro}</small>}
    </label>
  );
}

export function Selecao({ valor, aoMudar, opcoes, vazio = "Selecione…", ...resto }) {
  return (
    <select value={valor ?? ""} onChange={(e) => aoMudar(e.target.value)} {...resto}>
      <option value="" disabled>{vazio}</option>
      {opcoes.map((o) => (
        <option key={o.valor} value={o.valor}>{o.rotulo}</option>
      ))}
    </select>
  );
}

/* ---------------------------------------------------------------- gaveta/modal */
export function Gaveta({ titulo, extra, aoFechar, children, rodape }) {
  useEffect(() => {
    const esc = (e) => e.key === "Escape" && aoFechar();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [aoFechar]);

  return (
    <>
      <div className="scrim" onClick={aoFechar} />
      <div className="drawer" role="dialog" aria-label={titulo}>
        <div className="dh">
          <h3>{titulo}</h3>
          {extra}
          <button className="x" onClick={aoFechar} aria-label="Fechar">×</button>
        </div>
        <div className="dcorpo">{children}</div>
        {rodape && <div className="drodape">{rodape}</div>}
      </div>
    </>
  );
}

/** Botão que mostra o resultado da ação nele mesmo. */
export function BotaoAcao({ aoClicar, children, classe = "btn", desabilitado, titulo }) {
  const [estado, setEstado] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  async function clicar() {
    setOcupado(true);
    try {
      const r = await aoClicar();
      setEstado({ ok: true, msg: typeof r === "string" ? r : "feito" });
    } catch (e) {
      setEstado({ ok: false, msg: e.message });
    } finally {
      setOcupado(false);
      setTimeout(() => setEstado(null), 2600);
    }
  }

  return (
    <button className={`${classe}${estado?.ok ? " ok" : ""}${estado && !estado.ok ? " ruim" : ""}`}
            onClick={clicar} disabled={desabilitado || ocupado} title={titulo}>
      {estado ? (estado.ok ? `${estado.msg} ✓` : estado.msg) : ocupado ? "…" : children}
    </button>
  );
}

/* ---------------------------------------------------------------- documento */
/** O orçamento desenhado na tela — mesmo layout do PNG exportado. */
export function DocumentoOrcamento({ doc }) {
  return (
    <article className="doc">
      <div className="doc-top">
        <img src={LOGO} alt="" />
        <div className="n">REI DO <i>FORRO</i><s>Forro de PVC</s></div>
        <div className="mod">Orçamento</div>
      </div>
      <div className="doc-bar">
        <span>{doc.titulo}</span>
        <span className="m">{m2(doc.area)} m²</span>
      </div>

      <div className="rows">
        {doc.resumo.map(([k, v]) => (
          <div className="row" key={k}><span className="k">{k}</span><span className="v">{v}</span></div>
        ))}
      </div>

      <div className="sect">{doc.secao}</div>
      <div className="rows">
        {doc.linhas.map(([k, v], i) => (
          <div className="row sm item" key={i}><span className="k">{k}</span><span className="v">{v}</span></div>
        ))}
      </div>
      {doc.obs && <p className="obs">{doc.obs}</p>}

      <div className="totais">
        <div className="tot"><span className="k">Total à vista</span>
          <span className="v">R$ {brl(doc.totalVista)}</span></div>
        <div className="tot b"><span className="k">Total no cartão</span>
          <span className="v">R$ {brl(doc.totalCartao)}</span></div>
      </div>
    </article>
  );
}

/* ---------------------------------------------------------------- modal central */
export function Modal({ titulo, subtitulo, aoFechar, children, rodape, largura = 560 }) {
  useEffect(() => {
    const esc = (e) => e.key === "Escape" && aoFechar();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [aoFechar]);

  return (
    <>
      <div className="scrim" onClick={aoFechar} />
      <div className="modal" style={{ maxWidth: largura }} role="dialog" aria-label={titulo}>
        <div className="mh">
          <div>
            <h3>{titulo}</h3>
            {subtitulo && <p className="msub">{subtitulo}</p>}
          </div>
          <button className="x" onClick={aoFechar} aria-label="Fechar">×</button>
        </div>
        <div className="mcorpo">{children}</div>
        {rodape && <div className="mrodape">{rodape}</div>}
      </div>
    </>
  );
}
