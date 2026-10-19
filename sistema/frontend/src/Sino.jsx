/**
 * Sino do topo: avisos de quem está logado. Busca de tempos em tempos e quando
 * a aba volta ao foco; aviso novo aparece num alerta no canto. Fora do sistema
 * (app fechado), quem avisa é o Web Push — ver push.js e public/sw.js.
 *
 * A engrenagem abre os ajustes: ativar neste aparelho e ligar/desligar cada tipo
 * de aviso. As opções mudam com o perfil (vendedor × diretoria; o TI vê tudo).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, dataHora } from "./api";
import Icone from "./icones";
import { ativar, situacao } from "./push";

const INTERVALO = 45_000;
const ICONE = {
  os_finalizada: "fechado", comissao_paga: "comissao", chamado: "chamado", orcamento_novo: "orcamento",
  os_gerada: "ordem", os_cancelada: "fechar", os_nao_iniciada: "relogio", os_vencida: "relogio",
  agenda_dia: "agenda", visita_nova: "visita", visita_convertida: "visita",
};

const AVISO_APARELHO = {
  ativo: "Ativas neste aparelho — chegam mesmo com o sistema fechado.",
  desligado: "Desligadas neste aparelho.",
  bloqueado: "Bloqueadas nas configurações do navegador/celular. Libere as notificações do site e volte aqui.",
  instalar: "No iPhone, primeiro instale: Compartilhar → Adicionar à Tela de Início, e abra pelo ícone.",
  "sem-suporte": "Este navegador não recebe notificações fora do sistema.",
};

/** Ajustes do sino: este aparelho + cada tipo de aviso com a chavinha. */
function Ajustes({ aparelho, aoAtivar }) {
  const [pref, setPref] = useState(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    api.get("/notificacoes/preferencias/").then(setPref).catch((e) => setErro(e.message));
  }, []);

  async function trocar(item) {
    const ligado = !item.ligado;
    setPref((p) => ({ ...p, itens: p.itens.map((i) => (i.tipo === item.tipo ? { ...i, ligado } : i)) }));
    try {
      setPref(await api.put("/notificacoes/preferencias/", { ligadas: { [item.tipo]: ligado } }));
    } catch (e) {
      setErro(e.message);
    }
  }

  return (
    <div className="sinoAjustes">
      <div className="aparelho">
        <span className={`estado e-${aparelho}`} />
        <div>
          <b>Neste aparelho</b>
          <small>{AVISO_APARELHO[aparelho] ?? "Verificando…"}</small>
        </div>
        {aparelho === "desligado" && (
          <button type="button" className="btn p" onClick={aoAtivar}>Ativar</button>
        )}
      </div>
      {erro && <div className="erro">{erro}</div>}
      <div className="grupoTit">Quais avisos receber</div>
      {!pref ? <div className="sinoVazio">Carregando…</div> : (
        <ul className="prefs">
          {pref.itens.map((i) => (
            <li key={i.tipo}>
              <span className={`ico t-${i.tipo}`}><Icone nome={ICONE[i.tipo] || "sino"} tamanho={15} /></span>
              <span className="txt"><b>{i.rotulo}</b><span>{i.descricao}</span></span>
              <button type="button" role="switch" aria-checked={i.ligado} aria-label={i.rotulo}
                      className={`chave${i.ligado ? " on" : ""}`} onClick={() => trocar(i)}>
                <i />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

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
  const [vista, setVista] = useState("lista");          // "lista" | "ajustes"
  const [aparelho, setAparelho] = useState(null);       // situação do push neste aparelho
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
    if (aberto) situacao().then(setAparelho).catch(() => setAparelho("sem-suporte"));
    else setVista("lista");
  }, [aberto]);

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
    try { await ativar(); } catch { /* a situação abaixo explica o porquê */ }
    setAparelho(await situacao());
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
            {vista === "ajustes" ? (
              <button type="button" className="voltarSino" onClick={() => setVista("lista")} aria-label="Voltar">←</button>
            ) : null}
            <b>{vista === "ajustes" ? "Ajustes das notificações" : "Notificações"}</b>
            {vista === "lista" && qtd > 0 && (
              <button type="button" className="link" onClick={lerTodas}>Marcar todas como lidas</button>
            )}
            {vista === "lista" && (
              <button type="button" className="engrenagem" onClick={() => setVista("ajustes")}
                      aria-label="Ajustes das notificações" title="Escolher os avisos">
                <Icone nome="ajustes" tamanho={16} />
              </button>
            )}
          </header>
          {vista === "ajustes" ? (
            <Ajustes aparelho={aparelho} aoAtivar={ativarPush} />
          ) : dados.itens.length === 0 ? (
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
          {vista === "lista" && aparelho === "desligado" && (
            <footer>
              <button type="button" className="btn" onClick={ativarPush}>
                Ativar notificações neste aparelho (celular/computador)
              </button>
            </footer>
          )}
          {vista === "lista" && aparelho === "instalar" && (
            <footer><small className="dicaSino">{AVISO_APARELHO.instalar}</small></footer>
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
