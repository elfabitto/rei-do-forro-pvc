import { useState } from "react";
import { api } from "../api";
import { BotaoAcao, Campo, Estado, Gaveta, linhas, useApi } from "../componentes";
import Icone from "../icones";
import Telefone from "../Telefone";
import {
  CLIENTE_VAZIO, CamposCliente, CamposEndereco, ENDERECO_VAZIO,
  corpoCliente, corpoEndereco, errosDaApi, paramsBusca, validarCliente, validarEndereco,
} from "./formCliente";

const PRIMEIRO_ERRO = "Confira os campos destacados.";

function FormCliente({ cliente, aoFechar, aoSalvar }) {
  const novo = !cliente;
  const [c, setC] = useState(cliente ? { ...CLIENTE_VAZIO, ...cliente } : { ...CLIENTE_VAZIO });
  const [e, setE] = useState({ ...ENDERECO_VAZIO });
  const [erros, setErros] = useState({});
  const [errosE, setErrosE] = useState({});
  const [erro, setErro] = useState("");

  async function salvar() {
    setErro("");
    // no cadastro novo, o endereço vai junto quando houver logradouro
    const comEndereco = novo && (e.logradouro.trim() || e.bairro.trim());
    const ec = validarCliente(c);
    const ee = comEndereco ? validarEndereco(e) : {};
    setErros(ec);
    setErrosE(ee);
    if (Object.keys(ec).length || Object.keys(ee).length) {
      setErro(PRIMEIRO_ERRO);
      throw new Error("confira os campos");
    }
    try {
      const salvo = novo
        ? await api.post("/clientes/", corpoCliente(c))
        : await api.patch(`/clientes/${c.id}/`, corpoCliente(c));
      if (comEndereco) await api.post("/enderecos/", { ...corpoEndereco(e), cliente: salvo.id });
      aoSalvar();
      aoFechar();
      return "salvo";
    } catch (err) {
      const campos = errosDaApi(err);
      if (campos) { setErros(campos); setErrosE(campos); }
      setErro(campos ? PRIMEIRO_ERRO : err.message);
      throw err;
    }
  }

  return (
    <Gaveta titulo={novo ? "Novo cliente" : c.nome} aoFechar={aoFechar}
            rodape={
              <div className="btnrow">
                <BotaoAcao classe="btn p" aoClicar={salvar}>Salvar</BotaoAcao>
                <button className="btn" onClick={aoFechar}>Cancelar</button>
              </div>
            }>
      <section className="sec">
        <h4>Dados do cliente</h4>
        {erro && <div className="erro">{erro}</div>}
        <CamposCliente c={c} setC={setC} erros={erros} setErros={setErros} autoFocus />
        <Campo rotulo="Observações">
          <textarea rows={2} value={c.observacoes ?? ""}
                    onChange={(ev) => setC((s) => ({ ...s, observacoes: ev.target.value }))} />
        </Campo>
      </section>

      {novo && (
        <section className="sec">
          <h4>Endereço da obra</h4>
          <p className="nota" style={{ marginTop: 0 }}>
            Opcional agora, mas a O.S. precisa de um endereço para ser gerada.
          </p>
          <CamposEndereco e={e} setE={setE} erros={errosE} setErros={setErrosE} />
        </section>
      )}
    </Gaveta>
  );
}

function FormEndereco({ cliente, aoFechar, aoSalvar }) {
  const [e, setE] = useState({ ...ENDERECO_VAZIO });
  const [erros, setErros] = useState({});
  const [erro, setErro] = useState("");

  async function salvar() {
    setErro("");
    const ee = validarEndereco(e);
    setErros(ee);
    if (Object.keys(ee).length) {
      setErro(PRIMEIRO_ERRO);
      throw new Error("confira os campos");
    }
    try {
      await api.post("/enderecos/", { ...corpoEndereco(e), cliente: cliente.id });
      aoSalvar();
      aoFechar();
      return "salvo";
    } catch (err) {
      const campos = errosDaApi(err);
      if (campos) setErros(campos);
      setErro(campos ? PRIMEIRO_ERRO : err.message);
      throw err;
    }
  }

  return (
    <Gaveta titulo={`Novo endereço — ${cliente.nome}`} aoFechar={aoFechar}
            rodape={
              <div className="btnrow">
                <BotaoAcao classe="btn p" aoClicar={salvar}>Salvar endereço</BotaoAcao>
                <button className="btn" onClick={aoFechar}>Cancelar</button>
              </div>
            }>
      <section className="sec">
        {erro && <div className="erro">{erro}</div>}
        <CamposEndereco e={e} setE={setE} erros={erros} setErros={setErros} />
        <label className="check">
          <input type="checkbox" checked={e.principal}
                 onChange={(ev) => setE((s) => ({ ...s, principal: ev.target.checked }))} />
          Usar como endereço principal
        </label>
      </section>
    </Gaveta>
  );
}

export default function Clientes() {
  const [busca, setBusca] = useState("");
  const { dados, erro, carregando, recarregar } =
    useApi("/clientes/", paramsBusca(busca), [busca]);
  const [editando, setEditando] = useState(null);   // objeto cliente ou "novo"
  const [novoEndereco, setNovoEndereco] = useState(null);
  const lista = linhas(dados);

  return (
    <div className="pagina">
      <h1>Clientes</h1>
      <p className="sub">Cadastro e endereços de obra</p>

      <div className="card">
        <header>
          <h2>Clientes</h2>
          <div className="filtros">
            <input className="busca" value={busca} placeholder="Buscar por nome, telefone ou bairro"
                   onChange={(e) => setBusca(e.target.value)} />
            <button className="btn p" onClick={() => setEditando("novo")}><Icone nome="mais" tamanho={15} /> Novo cliente</button>
          </div>
        </header>

        <Estado carregando={carregando} erro={erro}
                vazio={lista.length === 0 ? "Nenhum cliente encontrado." : null}>
          <div className="tw">
            <table>
              <thead>
                <tr><th>Cliente</th><th>Telefone</th><th>Endereço da obra</th>
                  <th>Bairro</th><th>Cidade</th><th className="num">O.S.</th><th /></tr>
              </thead>
              <tbody>
                {lista.map((c) => {
                  const e = c.enderecos?.find((x) => x.principal) ?? c.enderecos?.[0];
                  return (
                    <tr key={c.id}>
                      <td>
                        <b>{c.nome}</b>
                      </td>
                      <td><Telefone numero={c.telefone} /></td>
                      <td>
                        {e ? `${e.logradouro}${e.numero ? ", " + e.numero : ""}` :
                          <span style={{ color: "var(--muted)" }}>sem endereço</span>}
                        {e?.complemento && <div className="sub2">{e.complemento}</div>}
                        {c.enderecos?.length > 1 && (
                          <div className="sub2">+{c.enderecos.length - 1} endereço(s)</div>
                        )}
                      </td>
                      <td>{e?.bairro ?? "—"}</td>
                      <td>{e?.cidade || "—"}</td>
                      <td className="num">{c.total_ordens ?? 0}</td>
                      <td className="acoes">
                        <button className="lnk" onClick={() => setEditando(c)}>editar</button>
                        <button className="lnk" onClick={() => setNovoEndereco(c)}>+ endereço</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Estado>
      </div>

      {editando && (
        <FormCliente cliente={editando === "novo" ? null : editando}
                     aoFechar={() => setEditando(null)} aoSalvar={recarregar} />
      )}
      {novoEndereco && (
        <FormEndereco cliente={novoEndereco}
                      aoFechar={() => setNovoEndereco(null)} aoSalvar={recarregar} />
      )}
    </div>
  );
}
