/**
 * Notificações no celular/computador (Web Push), com o sistema aberto ou fechado.
 *
 * - Android/computador: funciona no navegador e no app instalado.
 * - iPhone/iPad: só no app instalado (Compartilhar → Adicionar à Tela de Início),
 *   iOS 16.4 ou mais novo — é regra da Apple.
 *
 * A assinatura do aparelho fica no servidor ligada a quem está logado; trocar de
 * login passa o aparelho para a pessoa nova, e sair desliga.
 */
import { api } from "./api";

const ehIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
  || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const instalado = () => window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true;

export const suportado = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

/**
 * Situação neste aparelho:
 * "ativo" · "desligado" (pode ativar) · "bloqueado" (negado nas configurações)
 * · "instalar" (iPhone fora do app instalado) · "sem-suporte".
 */
export async function situacao() {
  if (!suportado()) return ehIOS() && !instalado() ? "instalar" : "sem-suporte";
  if (Notification.permission === "denied") return "bloqueado";
  if (Notification.permission !== "granted") return "desligado";
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ? "ativo" : "desligado";
}

export function registrar() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => { /* sem SW: fica só o sino */ });
  });
}

const bytes = (b64) => {
  const s = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

async function assinatura(pedirPermissao) {
  if (!suportado()) return null;
  if (pedirPermissao && Notification.permission === "default") await Notification.requestPermission();
  if (Notification.permission !== "granted") return null;
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  const { chave } = await api.get("/notificacoes/push/chave/");
  // chave do servidor mudou: a assinatura velha não serve mais
  if (sub && sub.options?.applicationServerKey) {
    const atual = new Uint8Array(sub.options.applicationServerKey);
    const nova = bytes(chave);
    if (atual.length !== nova.length || atual.some((v, i) => v !== nova[i])) {
      await sub.unsubscribe();
      sub = null;
    }
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes(chave) });
  await api.post("/notificacoes/push/assinar/", sub.toJSON());
  return sub;
}

/** Botão "ativar": pede a permissão e registra o aparelho. */
export async function ativar() {
  const sub = await assinatura(true);
  if (!sub) throw new Error(Notification.permission === "denied"
    ? "Notificações bloqueadas nas configurações do aparelho."
    : "Não foi possível ativar neste aparelho.");
  return "ativadas";
}

/** Ao entrar no sistema: se já tinha permissão, garante que o aparelho é desta pessoa. */
export async function sincronizar() {
  try { await assinatura(false); } catch { /* sem rede ou sem suporte: tenta na próxima */ }
}

/** Ao sair: o aparelho para de receber os avisos de quem saiu. */
export async function desligarAparelho() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) await api.post("/notificacoes/push/cancelar/", { endpoint: sub.endpoint });
  } catch { /* segue saindo */ }
}
