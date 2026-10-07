/**
 * Cliente HTTP da API.
 *
 * Guarda os tokens JWT no localStorage e renova o access automaticamente
 * quando a API devolve 401 — assim nenhuma tela precisa tratar expiração.
 */
const BASE = import.meta.env.VITE_API_URL ?? "/api";

const token = {
  get access() { return localStorage.getItem("rf_access"); },
  get refresh() { return localStorage.getItem("rf_refresh"); },
  set({ access, refresh }) {
    if (access) localStorage.setItem("rf_access", access);
    if (refresh) localStorage.setItem("rf_refresh", refresh);
  },
  limpar() {
    localStorage.removeItem("rf_access");
    localStorage.removeItem("rf_refresh");
  },
};

export class ApiError extends Error {
  constructor(status, dados) {
    super(ApiError.mensagem(dados) || `Erro ${status}`);
    this.status = status;
    this.dados = dados;
  }
  /** Transforma o dicionário de erros do DRF numa frase legível. */
  static mensagem(d) {
    if (!d) return "";
    if (typeof d === "string") return d;
    if (Array.isArray(d)) return d.join(" ");
    if (d.detail) return d.detail;
    return Object.entries(d)
      .map(([campo, erros]) => `${campo}: ${[].concat(erros).join(" ")}`)
      .join(" · ");
  }
}

async function bruto(caminho, opcoes = {}) {
  const cabecalhos = { "Content-Type": "application/json", ...opcoes.headers };
  if (token.access) cabecalhos.Authorization = `Bearer ${token.access}`;

  const r = await fetch(`${BASE}${caminho}`, { ...opcoes, headers: cabecalhos });
  if (r.status === 204) return null;

  const corpo = await r.json().catch(() => null);
  if (!r.ok) throw new ApiError(r.status, corpo);
  return corpo;
}

async function renovar() {
  if (!token.refresh) return false;
  const r = await fetch(`${BASE}/token/refresh/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh: token.refresh }),
  });
  if (!r.ok) { token.limpar(); return false; }
  token.set(await r.json());
  return true;
}

async function pedir(caminho, opcoes) {
  try {
    return await bruto(caminho, opcoes);
  } catch (e) {
    if (e.status === 401 && (await renovar())) return bruto(caminho, opcoes);
    throw e;
  }
}

const corpo = (metodo) => (caminho, dados) =>
  pedir(caminho, { method: metodo, body: JSON.stringify(dados) });

export const api = {
  get: (caminho, params) => {
    const q = params ? "?" + new URLSearchParams(params) : "";
    return pedir(caminho + q);
  },
  post: corpo("POST"),
  put: corpo("PUT"),
  patch: corpo("PATCH"),
  delete: (caminho) => pedir(caminho, { method: "DELETE" }),

  async entrar(username, password) {
    const r = await fetch(`${BASE}/token/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (!r.ok) throw new ApiError(r.status, await r.json().catch(() => null));
    token.set(await r.json());
    return pedir("/eu/");
  },
  sair: () => token.limpar(),
  autenticado: () => Boolean(token.access),
};

/* ---------------- formatação pt-BR, usada por todas as telas ---------------- */
export const brl = (n) =>
  Number(n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const num = (n, casas = 2) =>
  Number(n ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: casas });
export const data = (s) => (s ? new Date(s + "T00:00:00").toLocaleDateString("pt-BR") : "—");
export const dataHora = (s) =>
  s ? new Date(s).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";
