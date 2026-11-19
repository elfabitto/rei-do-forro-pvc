/**
 * Cadastro do cliente no momento de fechar o negócio.
 *
 * O orçamento nasce sem cliente — só quando vira O.S. é que os dados importam.
 * Além do cadastro novo, dá para apontar um cliente já existente, senão o mesmo
 * comprador vira dois registros a cada obra. Assim que o telefone digitado em
 * "Novo cliente" bate com um cliente já cadastrado, o sistema avisa e manda para
 * a aba "Já cadastrado" (o backend também recusa o cadastro repetido).
 *
 * `useEscolhaCliente` é o formulário sem a moldura do modal — a página de
 * agendar visita técnica usa o mesmo, direto na tela.
 */
import { useEffect, useState } from "react";
import { api } from "../api";
import { digitos } from "../mascaras";
import { BotaoAcao, Campo, Modal, linhas, useApi } from "../componentes";
import {
  CLIENTE_VAZIO, CamposCliente, CamposEndereco, ENDERECO_VAZIO,
  corpoCliente, corpoEndereco, errosDaApi, paramsBusca, validarCliente, validarEndereco,
} from "./formCliente";

/** O mesmo texto do backend (clientes/serializers.py), para o aviso aparecer já ao digitar. */
const AVISO_DUPLICADO = "Cliente já cadastrado no sistema";
const mensagemDuplicado = (nome) =>
  `${AVISO_DUPLICADO} (${nome}). Vá na aba "Já cadastrado" e busque o nome do cliente.`;

/**
 * Novo cliente ou já cadastrado. `confirmar()` valida, grava se for novo e
 * devolve {cliente, endereco} (ids) — ou lança erro, já mostrado no formulário.
 */
export function useEscolhaCliente({ rotuloEndereco = "Endereço da obra", comObservacao = true } = {}) {
  const [aba, setAba] = useState("novo");
  const [c, setC] = useState({ ...CLIENTE_VAZIO });
  const [e, setE] = useState({ ...ENDERECO_VAZIO });
  const [erros, setErros] = useState({});
  const [errosE, setErrosE] = useState({});
  const [busca, setBusca] = useState("");
  const [existente, setExistente] = useState(null);
  const [erro, setErro] = useState("");

  // telefone completo (10 ou 11 dígitos) já de outro cliente: avisa sem esperar o "Confirmar"
  const fone = digitos(c.telefone);
  useEffect(() => {
    if (aba !== "novo") return undefined;
    const limpar = () => setErros((s) => (s.telefone?.startsWith(AVISO_DUPLICADO)
      ? (({ telefone, ...resto }) => resto)(s) : s));   // eslint-disable-line no-unused-vars
    if (fone.length < 10) { limpar(); return undefined; }
    let valido = true;
    const espera = setTimeout(async () => {
      try {
        const achados = linhas(await api.get("/clientes/", { fone }));
        // a busca acha o número dentro de outro maior: confere o telefone inteiro
        const dono = achados.find((x) => digitos(x.telefone) === fone || digitos(x.telefone_alt) === fone);
        if (!valido) return;
        if (dono) setErros((s) => ({ ...s, telefone: mensagemDuplicado(dono.nome) }));
        else limpar();
      } catch { /* sem rede: o backend confere de novo ao gravar */ }
    }, 350);
    return () => { valido = false; clearTimeout(espera); };
  }, [fone, aba]);

  const filtro = paramsBusca(busca);
  const clientes = useApi(aba === "existente" ? "/clientes/" : null, filtro, [aba, JSON.stringify(filtro)]);
  const achados = linhas(clientes.dados).slice(0, 8);

  async function confirmar() {
    setErro("");
    if (aba === "existente") {
      if (!existente) { setErro("Escolha o cliente."); throw new Error("escolha o cliente"); }
      const end = existente.enderecos?.find((x) => x.principal) ?? existente.enderecos?.[0];
      if (!end) { setErro("Este cliente não tem endereço. Cadastre em Clientes."); throw new Error("sem endereço"); }
      return { cliente: existente.id, endereco: end.id, nome: existente.nome };
    }

    // o aviso de telefone repetido continua valendo: não deixa gravar o cadastro duplicado
    const ec = { ...validarCliente(c), ...(erros.telefone?.startsWith(AVISO_DUPLICADO) ? { telefone: erros.telefone } : {}) };
    const ee = validarEndereco(e);
    setErros(ec);
    setErrosE(ee);
    if (Object.keys(ec).length || Object.keys(ee).length) {
      setErro("Confira os campos destacados.");
      throw new Error("confira os campos");
    }
    try {
      const cliente = await api.post("/clientes/", corpoCliente(c));
      const endereco = await api.post("/enderecos/", { ...corpoEndereco(e), cliente: cliente.id, principal: true });
      return { cliente: cliente.id, endereco: endereco.id, nome: cliente.nome };
    } catch (err) {
      const campos = errosDaApi(err);
      if (campos) setErros(campos);
      setErro(campos ? "Confira os campos destacados." : err.message);
      throw err;
    }
  }

  // telefone já cadastrado: leva direto para "Já cadastrado" com a busca pronta
  const duplicado = erros.telefone?.startsWith(AVISO_DUPLICADO);
  function usarExistente() {
    setBusca(c.telefone);
    setExistente(null);
    setErro("");
    setAba("existente");
  }

  const conteudo = (
    <>
      <div className="seg" style={{ marginBottom: 18 }}>
        <button type="button" className={aba === "novo" ? "on" : ""}
                onClick={() => setAba("novo")}>Novo cliente</button>
        <button type="button" className={aba === "existente" ? "on" : ""}
                onClick={() => setAba("existente")}>Já cadastrado</button>
      </div>

      {erro && !duplicado && <div className="erro">{erro}</div>}
      {aba === "novo" && duplicado && (
        <div className="erro">
          {erros.telefone}{" "}
          <button type="button" className="lnk" onClick={usarExistente}>Ir para "Já cadastrado"</button>
        </div>
      )}

      {aba === "existente" ? (
        <>
          <Campo rotulo="Buscar cliente" dica="Nome, telefone ou bairro. Usa o endereço principal já cadastrado.">
            <input value={busca} onChange={(ev) => { setBusca(ev.target.value); setExistente(null); }}
                   autoFocus placeholder="Ex.: Maria ou 99988-1122" />
          </Campo>
          <div className="achados">
            {clientes.carregando && <div className="nota">Buscando…</div>}
            {!clientes.carregando && achados.length === 0 && <div className="nota">Nenhum cliente encontrado.</div>}
            {achados.map((x) => {
              const end = x.enderecos?.find((y) => y.principal) ?? x.enderecos?.[0];
              return (
                <button key={x.id} type="button" className={`achado${existente?.id === x.id ? " on" : ""}`}
                        onClick={() => setExistente(x)}>
                  <b>{x.nome}</b>
                  <span>{x.telefone}</span>
                  <small>{end ? end.resumo : "sem endereço cadastrado"}</small>
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <>
          {/* o aviso completo, com o atalho, fica no quadro de cima; no campo, só o destaque */}
          <CamposCliente c={c} setC={setC} setErros={setErros} autoFocus
                         erros={duplicado ? { ...erros, telefone: "Telefone de um cliente já cadastrado." } : erros} />
          <div className="lbl" style={{ marginTop: 6 }}>{rotuloEndereco}</div>
          <CamposEndereco e={e} setE={setE} erros={errosE} setErros={setErrosE} />
          {comObservacao && <Campo rotulo="Observação">
            <textarea rows={2} value={c.observacoes} onChange={(ev) => setC((s) => ({ ...s, observacoes: ev.target.value }))}
                      placeholder="Combinados, cuidados na entrega, horário preferido…" />
          </Campo>}
        </>
      )}
    </>
  );

  return { conteudo, confirmar };
}

export default function ClienteModal({ aoFechar, aoConcluir, subtitulo }) {
  const { conteudo, confirmar } = useEscolhaCliente();

  async function continuar() {
    const escolhido = await confirmar();
    await aoConcluir(escolhido);
    return "ok";
  }

  return (
    <Modal
      titulo="Dados do cliente"
      subtitulo={subtitulo ?? "Preencha para transformar o orçamento em Ordem de Serviço."}
      aoFechar={aoFechar}
      rodape={
        <div className="btnrow" style={{ padding: 0 }}>
          <BotaoAcao classe="btn p" aoClicar={continuar}>Confirmar e continuar</BotaoAcao>
          <button className="btn" onClick={aoFechar}>Cancelar</button>
        </div>
      }
    >
      {conteudo}
    </Modal>
  );
}
