/**
 * Cadastro do cliente no momento de fechar o negócio.
 *
 * O orçamento nasce sem cliente — só quando vira O.S. é que os dados importam.
 * Além do cadastro novo, dá para apontar um cliente já existente, senão o mesmo
 * comprador vira dois registros a cada obra.
 */
import { useState } from "react";
import { api } from "../api";
import { BotaoAcao, Campo, Modal, Selecao, linhas, useApi } from "../componentes";

/* A empresa atende no Pará: o estado não é pergunta, é constante. */
const UF = "PA";

const NOVO = {
  nome: "", telefone: "", observacoes: "",
  logradouro: "", numero: "", complemento: "", bairro: "",
  cidade: "", uf: UF, ponto_referencia: "", link_localizacao: "",
};

export default function ClienteModal({ aoFechar, aoConcluir, subtitulo }) {
  const [aba, setAba] = useState("novo");
  const [f, setF] = useState({ ...NOVO });
  const [existente, setExistente] = useState("");
  const [erro, setErro] = useState("");

  const clientes = useApi("/clientes/");
  const campo = (k) => ({
    value: f[k] ?? "",
    onChange: (e) => setF((s) => ({ ...s, [k]: e.target.value })),
  });

  async function confirmar() {
    setErro("");
    try {
      if (aba === "existente") {
        if (!existente) throw new Error("Escolha o cliente.");
        const c = linhas(clientes.dados).find((x) => String(x.id) === String(existente));
        const end = c.enderecos?.find((e) => e.principal) ?? c.enderecos?.[0];
        if (!end) throw new Error("Este cliente não tem endereço. Cadastre em Clientes.");
        aoConcluir({ cliente: c.id, endereco: end.id });
        return "selecionado";
      }

      if (!f.nome.trim()) throw new Error("Informe o nome do cliente.");
      if (!f.telefone.trim()) throw new Error("Informe o telefone.");
      if (!f.logradouro.trim()) throw new Error("Informe o endereço da obra.");
      if (!f.bairro.trim()) throw new Error("Informe o bairro.");

      const cliente = await api.post("/clientes/", {
        nome: f.nome.trim(),
        telefone: f.telefone.trim(),
        observacoes: f.observacoes,
      });
      const endereco = await api.post("/enderecos/", {
        cliente: cliente.id,
        logradouro: f.logradouro.trim(),
        numero: f.numero,
        complemento: f.complemento,
        bairro: f.bairro.trim(),
        cidade: f.cidade.trim(),
        uf: UF,
        ponto_referencia: f.ponto_referencia,
        link_localizacao: f.link_localizacao.trim(),
        principal: true,
      });

      aoConcluir({ cliente: cliente.id, endereco: endereco.id });
      return "cadastrado";
    } catch (e) {
      setErro(e.message);
      throw e;
    }
  }

  return (
    <Modal
      titulo="Dados do cliente"
      subtitulo={subtitulo ?? "Preencha para transformar o orçamento em Ordem de Serviço."}
      aoFechar={aoFechar}
      rodape={
        <div className="btnrow" style={{ padding: 0 }}>
          <BotaoAcao classe="btn p" aoClicar={confirmar}>Confirmar e continuar</BotaoAcao>
          <button className="btn" onClick={aoFechar}>Cancelar</button>
        </div>
      }
    >
      <div className="seg" style={{ marginBottom: 18 }}>
        <button type="button" className={aba === "novo" ? "on" : ""}
                onClick={() => setAba("novo")}>Novo cliente</button>
        <button type="button" className={aba === "existente" ? "on" : ""}
                onClick={() => setAba("existente")}>Já cadastrado</button>
      </div>

      {erro && <div className="erro">{erro}</div>}

      {aba === "existente" ? (
        <Campo rotulo="Cliente" dica="Usa o endereço principal já cadastrado.">
          <Selecao valor={existente} aoMudar={setExistente} vazio="Escolha o cliente"
                   opcoes={linhas(clientes.dados).map((c) => ({
                     valor: c.id,
                     rotulo: `${c.nome} — ${c.telefone}`,
                   }))} />
        </Campo>
      ) : (
        <>
          <div className="two">
            <Campo rotulo="Nome">
              <input {...campo("nome")} autoFocus placeholder="Nome do cliente" />
            </Campo>
            <Campo rotulo="Telefone">
              <input {...campo("telefone")} placeholder="(66) 99999-0000" />
            </Campo>
          </div>

          <div className="lbl" style={{ marginTop: 6 }}>Endereço da obra</div>
          <Campo rotulo="Rua / Avenida">
            <input {...campo("logradouro")} placeholder="Rua das Palmeiras" />
          </Campo>
          <div className="two">
            <Campo rotulo="Número"><input {...campo("numero")} placeholder="180" /></Campo>
            <Campo rotulo="Bairro"><input {...campo("bairro")} placeholder="Jardim Aeroporto" /></Campo>
          </div>
          <Campo rotulo="Complemento" dica="Apto, bloco, fundos, sala…">
            <input {...campo("complemento")} placeholder="Casa dos fundos" />
          </Campo>
          <div className="two">
            <Campo rotulo="Cidade"><input {...campo("cidade")} placeholder="Marabá" /></Campo>
            <Campo rotulo="Estado">
              <div className="travado">{UF}<small>fixo</small></div>
            </Campo>
          </div>
          <Campo rotulo="Ponto de referência">
            <input {...campo("ponto_referencia")} placeholder="Em frente à padaria" />
          </Campo>
          <Campo rotulo="Link de localização"
                 dica="Se o cliente mandou a localização pelo WhatsApp, cole aqui.">
            <input {...campo("link_localizacao")} placeholder="https://maps.app.goo.gl/…" />
          </Campo>
          <Campo rotulo="Observação">
            <textarea rows={2} {...campo("observacoes")}
                      placeholder="Combinados, cuidados na entrega, horário preferido…" />
          </Campo>
        </>
      )}
    </Modal>
  );
}
