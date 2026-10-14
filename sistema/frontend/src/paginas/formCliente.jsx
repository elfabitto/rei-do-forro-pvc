/**
 * Campos de cliente e endereço — os mesmos no cadastro de Clientes e no
 * modal de dados do cliente da O.S. Máscara enquanto digita, erro no próprio
 * campo e as mesmas regras do backend (apps/core/formatos.py).
 */
import { useEffect, useRef, useState } from "react";
import { Campo } from "../componentes";
import * as m from "../mascaras";

/* A empresa atende no Pará: o estado não é pergunta, é constante. */
export const UF = "PA";

export const CLIENTE_VAZIO = { nome: "", telefone: "", observacoes: "" };
export const ENDERECO_VAZIO = {
  logradouro: "", numero: "", complemento: "", bairro: "",
  cidade: "", uf: UF, principal: true,
};

export function validarCliente(c) {
  const e = {};
  if (m.nomeProprio(c.nome).length < 3) e.nome = "Informe o nome do cliente.";
  const tel = m.erroTelefone(c.telefone);
  if (tel) e.telefone = tel;
  return e;
}

export function validarEndereco(x) {
  const e = {};
  if (!x.logradouro.trim()) e.logradouro = "Informe a rua ou avenida.";
  if (!x.bairro.trim()) e.bairro = "Informe o bairro.";
  if (!x.cidade.trim()) e.cidade = "Escolha a cidade.";
  else if (!m.cidadeDaLista(x.cidade)) e.cidade = "Escolha uma cidade da lista.";
  return e;
}

/** Busca de cliente: só números (4+) procura pelo telefone; o resto, por nome/bairro. */
export function paramsBusca(texto) {
  const t = (texto || "").trim();
  if (!t) return null;
  const d = m.digitos(t);
  return d.length >= 4 && !/[a-zà-ú]/i.test(t) ? { fone: d } : { search: t };
}

/** Erros de campo que vieram da API ({telefone: ["..."]}) no mesmo formato. */
export function errosDaApi(err) {
  const d = err?.dados;
  if (!d || typeof d !== "object" || Array.isArray(d) || d.detail) return null;
  return Object.fromEntries(Object.entries(d).map(([k, v]) => [k, [].concat(v).join(" ")]));
}

const limpar = (v) => (typeof v === "string" ? v.trim() : v);
export const corpoCliente = (c) => ({
  nome: m.nomeProprio(c.nome), telefone: c.telefone, observacoes: c.observacoes || "",
});
export const corpoEndereco = (x) => ({
  logradouro: limpar(x.logradouro), numero: x.numero, complemento: limpar(x.complemento),
  bairro: m.nomeProprio(x.bairro), cidade: m.cidadeDaLista(x.cidade), uf: UF, principal: x.principal,
});

/* Liga um campo ao estado: máscara no onChange, nome próprio no onBlur. */
function ligar(obj, set, erros, setErros, k, { mascara, aoSair } = {}) {
  return {
    value: obj[k] ?? "",
    onChange: (ev) => {
      const v = mascara ? mascara(ev.target.value) : ev.target.value;
      set((s) => ({ ...s, [k]: v }));
      if (erros?.[k]) setErros((x) => ({ ...x, [k]: undefined }));
    },
    onBlur: aoSair ? () => set((s) => ({ ...s, [k]: aoSair(s[k]) })) : undefined,
    "aria-invalid": erros?.[k] ? true : undefined,
  };
}

export function CamposCliente({ c, setC, erros = {}, setErros = () => {}, autoFocus }) {
  const f = (k, o) => ligar(c, setC, erros, setErros, k, o);
  return (
    <div className="two">
      <Campo rotulo="Nome" obrigatorio erro={erros.nome}>
        <input {...f("nome", { aoSair: m.nomeProprio })} autoFocus={autoFocus} maxLength={160}
               placeholder="Nome e sobrenome" autoComplete="off" />
      </Campo>
      <Campo rotulo="Telefone (WhatsApp)" obrigatorio erro={erros.telefone}>
        <input {...f("telefone", { mascara: m.telefone })} inputMode="tel" placeholder="(91) 99999-0000"
               autoComplete="off" />
      </Campo>
    </div>
  );
}

/**
 * Cidade: digita e escolhe na lista suspensa (região metropolitana de Belém).
 * Setas sobem/descem, Enter escolhe, Esc fecha. Ao sair, "belem" vira "Belém".
 */
function CampoCidade({ valor, aoMudar, erro }) {
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const caixa = useRef(null);
  const termo = m.semAcento(valor);
  const exata = m.cidadeDaLista(valor);
  const opcoes = !termo || exata ? m.CIDADES : m.CIDADES.filter((c) => m.semAcento(c).includes(termo));

  useEffect(() => {
    if (!aberto) return undefined;
    const fora = (e) => caixa.current && !caixa.current.contains(e.target) && setAberto(false);
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  function escolher(c) {
    aoMudar(c);
    setAberto(false);
  }

  function tecla(e) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setAberto(true);
      setAtivo((a) => (a + (e.key === "ArrowDown" ? 1 : -1) + opcoes.length) % Math.max(opcoes.length, 1));
    } else if (e.key === "Enter" && aberto && opcoes[ativo]) {
      e.preventDefault();
      escolher(opcoes[ativo]);
    } else if (e.key === "Escape") {
      setAberto(false);
    }
  }

  return (
    <Campo rotulo="Cidade" obrigatorio erro={erro}>
      <div className="combo" ref={caixa}>
        <input value={valor} placeholder="Digite ou escolha" autoComplete="off" role="combobox"
               aria-expanded={aberto} aria-autocomplete="list" aria-invalid={erro ? true : undefined}
               onChange={(e) => { aoMudar(e.target.value); setAberto(true); setAtivo(0); }}
               onFocus={() => setAberto(true)} onKeyDown={tecla}
               onBlur={() => { const c = m.cidadeDaLista(valor); if (c && c !== valor) aoMudar(c); }} />
        <button type="button" className="comboSeta" tabIndex={-1} aria-label="Ver cidades"
                onMouseDown={(e) => { e.preventDefault(); setAberto((a) => !a); }}>▾</button>
        {aberto && (
          <ul className="comboLista" role="listbox">
            {opcoes.length === 0 && <li className="nada">Não atendemos essa cidade</li>}
            {opcoes.map((c, i) => (
              <li key={c} role="option" aria-selected={c === exata}
                  className={`${i === ativo ? "ativo" : ""}${c === exata ? " sel" : ""}`}
                  onMouseDown={(e) => { e.preventDefault(); escolher(c); }} onMouseEnter={() => setAtivo(i)}>
                {c}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Campo>
  );
}

export function CamposEndereco({ e, setE, erros = {}, setErros = () => {} }) {
  const f = (k, o) => ligar(e, setE, erros, setErros, k, o);
  return (
    <>
      <Campo rotulo="Rua / Avenida / Passagem" obrigatorio erro={erros.logradouro}>
        <input {...f("logradouro")} maxLength={160} placeholder="Ex.: Passagem São Pedro" />
      </Campo>
      <div className="two">
        <Campo rotulo="Número" erro={erros.numero} dica='Sem número? Digite "s" (S/N).'>
          <input {...f("numero", { mascara: m.numeroCasa })} placeholder="180" />
        </Campo>
        <Campo rotulo="Bairro" obrigatorio erro={erros.bairro}>
          <input {...f("bairro", { aoSair: m.nomeProprio })} maxLength={80} placeholder="Ex.: Marambaia" />
        </Campo>
      </div>
      <div className="two">
        <CampoCidade valor={e.cidade ?? ""} erro={erros.cidade}
                     aoMudar={(v) => { setE((s) => ({ ...s, cidade: v })); if (erros.cidade) setErros((x) => ({ ...x, cidade: undefined })); }} />
        <Campo rotulo="Estado"><div className="travado">{UF}<small>fixo</small></div></Campo>
      </div>
      <Campo rotulo="Complemento e ponto de referência" dica="Apto, bloco, quadra, fundos, perto de quê…">
        <input {...f("complemento")} maxLength={120} placeholder="Ex.: Casa dos fundos, em frente à padaria" />
      </Campo>
    </>
  );
}
