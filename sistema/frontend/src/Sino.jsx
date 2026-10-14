/**
 * Sino do topo: avisos de quem está logado (O.S. finalizada, comissão paga,
 * chamado respondido). Busca de tempos em tempos e quando a aba volta ao foco;
 * aviso novo aparece num alerta no canto e, se a pessoa permitiu, também como
 * notificação do celular/computador.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, dataHora } from "./api";
import Icone from "./icones";
import { LOGO } from "./logo";

const INTERVALO = 45_000;
const ICONE = { os_finalizada: "fechado", comissao_paga: "comissao", chamado: "chamado" };

const suportaPush = () => typeof window !== "undefined" && "Notification" in window;

function quandoTexto(s) {
  const min = Math.round((Date.now() - new Date(s)) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  if (min < 24 * 60) return `há ${Math.round(min / 60)} h`;
  return dataHora(s);
}

export default function Sino() {
  const [dados, setDados] = useState({ nao_lidas: 0, itens: [] });
  const [aberto, setAberto] = useState(false);
  const [alerta, setAlerta] = useState(null);
  const [permissao, setPermissao] = useState(() => (suportaPush() ? Notification.permission : "denied"));
  const vistos = useRef(null);            // ids já conhecidos — o resto é novidade
  const caixa = useRef(null);
  const ir = useNavigate();

  const buscar = useCallback(async () => {
    try {
      const d = await api.get("/notificacoes/");
      const novos = vistos.current ? d.itens.filter((n) => !n.lida && !vistos.current.has(n.id)) : [];
      vistos.current = new Set(d.itens.map((n) => n.id));
      setDados(d);
      if (novos.length) {
        const n = novos[0];
        setAlerta({ ...n, extra: novos.length - 1 });
        setTimeout(() => setAlerta(null), 7000);
        if (suportaPush() && Notification.permission === "granted" && document.hidden) {
          try { new Notification(n.titulo, { body: n.mensagem, icon: LOGO, tag: `rf-${n.id}` }); }
          catch { /* alguns celulares só notificam via service worker */ }
        }
      }
    } catch { /* sem rede: tenta de novo no próximo ciclo */ }
  }, []);

  useEffect(() => {
    buscar();
    const t = setInterval(buscar, INTERVALO);
    const foco = () => document.visibilityState === "visible" && buscar();
    document.addEventListener("visibilitychange", foco);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", foco); };
  }, [buscar]);

  useEffect(() => {
    if (!aberto) return undefined;
    const fora = (e) => caixa.current && !caixa.current.contains(e.target) && setAberto(false);
    const esc = (e) => e.key === "Escape" && setAberto(false);
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", fora); document.removeEventListener("keydown", esc); };
  }, [aberto]);

  async function abrir(n) {
    setAberto(false);
    setAlerta(null);
    if (!n.lida) {
      await api.post(`/notificacoes/${n.id}/ler/`).catch(() => {});
      buscar();
    }
    if (n.link) ir(n.link);
  }

  async function lerTodas() {
    await api.post("/notificacoes/ler-todas/").catch(() => {});
    buscar();
  }

  async function ativarPush() {
    if (!suportaPush()) return;
    setPermissao(await Notification.requestPermission());
  }

  const qtd = dados.nao_lidas;
  return (
    <div className="sino" ref={caixa}>
      <button type="button" className={`sinoBtn${qtd ? " tem" : ""}`} onClick={() => setAberto((a) => !a)}
              aria-label={qtd ? `${qtd} notificação(ões) não lida(s)` : "Notificações"} aria-expanded={aberto}>
        <Icone nome="sino" tamanho={19} />
        {qtd > 0 && <span className="cont">{qtd > 9 ? "9+" : qtd}</span>}
      </button>

      {aberto && (
        <div className="sinoCaixa" role="dialog" aria-label="Notificações">
          <header>
            <b>Notificações</b>
            {qtd > 0 && <button type="button" className="link" onClick={lerTodas}>Marcar todas como lidas</button>}
          </header>
          {dados.itens.length === 0 ? (
            <div className="sinoVazio">Nenhuma notificação por enquanto.</div>
          ) : (
            <ul>
              {dados.itens.map((n) => (
                <li key={n.id}>
                  <button type="button" className={n.lida ? "" : "nova"} onClick={() => abrir(n)}>
                    <span className={`ico t-${n.tipo}`}><Icone nome={ICONE[n.tipo] || "sino"} tamanho={15} /></span>
                    <span className="txt">
                      <b>{n.titulo}</b>
                      {n.mensagem && <span>{n.mensagem}</span>}
                      <small>{quandoTexto(n.criada_em)}</small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {suportaPush() && permissao === "default" && (
            <footer>
              <button type="button" className="btn" onClick={ativarPush}>
                Avisar também fora do sistema (celular/computador)
              </button>
            </footer>
          )}
        </div>
      )}

      {alerta && (
        <button type="button" className="sinoAlerta" onClick={() => abrir(alerta)} role="status">
          <span className={`ico t-${alerta.tipo}`}><Icone nome={ICONE[alerta.tipo] || "sino"} tamanho={17} /></span>
          <span className="txt">
            <b>{alerta.titulo}</b>
            {alerta.mensagem && <span>{alerta.mensagem}</span>}
            {alerta.extra > 0 && <small>+ {alerta.extra} aviso(s) novo(s)</small>}
          </span>
        </button>
      )}
    </div>
  );
}
