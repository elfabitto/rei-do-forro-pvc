/**
 * Cadastro do cliente no momento de fechar o negócio.
 *
 * O orçamento nasce sem cliente — só quando vira O.S. é que os dados importam.
 * Além do cadastro novo, dá para apontar um cliente já existente, senão o mesmo
 * comprador vira dois registros a cada obra. Se o telefone digitado já é de um
 * cliente, o sistema avisa e oferece usar o cadastro dele.
 *
 * `useEscolhaCliente` é o formulário sem a moldura do modal — a página de
 * agendar visita técnica usa o mesmo, direto na tela.
 */
import { useState } from "react";
import { api } from "../api";
import { BotaoAcao, Campo, Modal, linhas, useApi } from "../componentes";
import {
  CLIENTE_VAZIO, CamposCliente, CamposEndereco, ENDERECO_VAZIO,
  corpoCliente, corpoEndereco, errosDaApi, paramsBusca, validarCliente, validarEndereco,
} from "./formCliente";

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

    const ec = validarCliente(c);
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
  const duplicado = erros.telefone?.startsWith("Já existe cliente");
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

      {erro && <div className="erro">{erro}</div>}
      {aba === "novo" && duplicado && (
        <button type="button" className="btn mb" onClick={usarExistente}>Usar o cliente já cadastrado</button>
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
          <CamposCliente c={c} setC={setC} erros={erros} setErros={setErros} autoFocus />
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
