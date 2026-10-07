import { useState } from "react";
import { api } from "../api";
import { BotaoAcao, Campo, Estado, Gaveta, linhas, useApi } from "../componentes";
import Icone from "../icones";

const CLIENTE_VAZIO = { nome: "", telefone: "", observacoes: "" };
const ENDERECO_VAZIO = {
  logradouro: "", numero: "", complemento: "", bairro: "",
  cidade: "Rondonópolis", uf: "MT", cep: "", ponto_referencia: "",
  link_localizacao: "", principal: true,
};

function FormCliente({ cliente, aoFechar, aoSalvar }) {
  const novo = !cliente;
  const [c, setC] = useState(cliente ? { ...cliente } : { ...CLIENTE_VAZIO });
  const [e, setE] = useState({ ...ENDERECO_VAZIO });
  const [erro, setErro] = useState("");

  const campo = (k) => ({
    value: c[k] ?? "",
    onChange: (ev) => setC((s) => ({ ...s, [k]: ev.target.value })),
  });
  const campoE = (k) => ({
    value: e[k] ?? "",
    onChange: (ev) => setE((s) => ({ ...s, [k]: ev.target.value })),
  });

  async function salvar() {
    setErro("");
    try {
      if (!c.nome.trim()) throw new Error("Informe o nome do cliente.");
      const salvo = novo
        ? await api.post("/clientes/", c)
        : await api.patch(`/clientes/${c.id}/`, c);

      // no cadastro novo, o endereço vai junto quando houver logradouro
      if (novo && e.logradouro.trim()) {
        await api.post("/enderecos/", { ...e, cliente: salvo.id });
      }
      aoSalvar();
      aoFechar();
      return "salvo";
    } catch (err) {
      setErro(err.message);
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
        <Campo rotulo="Nome"><input {...campo("nome")} autoFocus /></Campo>
        <Campo rotulo="Telefone"><input {...campo("telefone")} placeholder="(66) 99999-0000" /></Campo>
        <Campo rotulo="Observações">
          <textarea rows={2} {...campo("observacoes")} />
        </Campo>
      </section>

      {novo && (
        <section className="sec">
          <h4>Endereço da obra</h4>
          <p className="nota" style={{ marginTop: 0 }}>
            Opcional agora, mas a O.S. precisa de um endereço para ser gerada.
          </p>
          <Campo rotulo="Logradouro"><input {...campoE("logradouro")} placeholder="Rua, avenida…" /></Campo>
          <div className="two">
            <Campo rotulo="Número"><input {...campoE("numero")} /></Campo>
            <Campo rotulo="Bairro"><input {...campoE("bairro")} /></Campo>
          </div>
          <Campo rotulo="Complemento" dica="Apto, bloco, fundos, sala…">
            <input {...campoE("complemento")} />
          </Campo>
          <div className="two">
            <Campo rotulo="Cidade"><input {...campoE("cidade")} /></Campo>
            <Campo rotulo="UF"><input {...campoE("uf")} maxLength={2} /></Campo>
          </div>
          <Campo rotulo="Ponto de referência"><input {...campoE("ponto_referencia")} /></Campo>
          <Campo rotulo="Localização do WhatsApp"
                 dica="Cole aqui o link de localização que o cliente mandou.">
            <input {...campoE("link_localizacao")} placeholder="https://maps.app.goo.gl/…" />
          </Campo>
        </section>
      )}
    </Gaveta>
  );
}

function FormEndereco({ cliente, aoFechar, aoSalvar }) {
  const [e, setE] = useState({ ...ENDERECO_VAZIO });
  const [erro, setErro] = useState("");
  const campo = (k) => ({
    value: e[k] ?? "",
    onChange: (ev) => setE((s) => ({ ...s, [k]: ev.target.value })),
  });

  async function salvar() {
    setErro("");
    try {
      if (!e.logradouro.trim() || !e.bairro.trim()) {
        throw new Error("Logradouro e bairro são obrigatórios.");
      }
      await api.post("/enderecos/", { ...e, cliente: cliente.id });
      aoSalvar();
      aoFechar();
      return "salvo";
    } catch (err) {
      setErro(err.message);
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
        <Campo rotulo="Logradouro"><input {...campo("logradouro")} autoFocus /></Campo>
        <div className="two">
          <Campo rotulo="Número"><input {...campo("numero")} /></Campo>
          <Campo rotulo="Bairro"><input {...campo("bairro")} /></Campo>
        </div>
        <Campo rotulo="Complemento"><input {...campo("complemento")} /></Campo>
        <div className="two">
          <Campo rotulo="Cidade"><input {...campo("cidade")} /></Campo>
          <Campo rotulo="UF"><input {...campo("uf")} maxLength={2} /></Campo>
        </div>
        <Campo rotulo="Ponto de referência"><input {...campo("ponto_referencia")} /></Campo>
        <Campo rotulo="Localização do WhatsApp">
          <input {...campo("link_localizacao")} placeholder="https://maps.app.goo.gl/…" />
        </Campo>
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
    useApi("/clientes/", busca ? { search: busca } : null, [busca]);
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
                  <th>Bairro</th><th>Localização</th><th className="num">O.S.</th><th /></tr>
              </thead>
              <tbody>
                {lista.map((c) => {
                  const e = c.enderecos?.find((x) => x.principal) ?? c.enderecos?.[0];
                  return (
                    <tr key={c.id}>
                      <td>
                        <b>{c.nome}</b>
                      </td>
                      <td>{c.telefone}</td>
                      <td>
                        {e ? `${e.logradouro}${e.numero ? ", " + e.numero : ""}` :
                          <span style={{ color: "var(--muted)" }}>sem endereço</span>}
                        {e?.complemento && <div className="sub2">{e.complemento}</div>}
                        {c.enderecos?.length > 1 && (
                          <div className="sub2">+{c.enderecos.length - 1} endereço(s)</div>
                        )}
                      </td>
                      <td>{e?.bairro ?? "—"}</td>
                      <td>
                        {e?.link_localizacao
                          ? <a className="lnk" href={e.link_localizacao}
                               target="_blank" rel="noopener noreferrer">abrir mapa</a>
                          : <span style={{ color: "var(--muted)" }}>não enviada</span>}
                      </td>
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
