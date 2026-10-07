/**
 * Fechamento da O.S. — só a diretoria chega aqui.
 *
 * É neste momento que se escolhe a modalidade (à vista ou cartão, com os valores
 * que vieram do orçamento) e se registra o que o cliente pagou. Os pagamentos não
 * existem antes disso: a O.S. em andamento não tem o que lançar.
 */
import { useState } from "react";
import { api, brl } from "../api";
import { BotaoAcao, Campo, Modal, Selecao } from "../componentes";
import Icone from "../icones";

const FORMAS = [
  ["dinheiro", "Dinheiro"], ["pix", "PIX"], ["debito", "Cartão de débito"],
  ["credito", "Cartão de crédito"], ["transferencia", "Transferência"],
  ["boleto", "Boleto"], ["cheque", "Cheque"],
];

const paraNumero = (v) => {
  const n = parseFloat(String(v).replace(/\./g, "").replace(",", "."));
  return isFinite(n) ? n : 0;
};

export default function FinalizarModal({ os, aoFechar, aoConcluir }) {
  const temReferencia = os.valor_vista != null && os.valor_cartao != null;

  const [modalidade, setModalidade] = useState(os.modalidade || (temReferencia ? "vista" : ""));
  const [desconto, setDesconto] = useState("");
  const [observacao, setObservacao] = useState("");
  const [linhas, setLinhas] = useState([{ forma: "pix", valor: "" }]);
  const [erro, setErro] = useState("");

  const valorBase = !temReferencia
    ? Number(os.valor_total)
    : Number(modalidade === "cartao" ? os.valor_cartao : os.valor_vista);
  const jaPago = Number(os.total_pago ?? 0);
  const aCobrar = valorBase - paraNumero(desconto) - jaPago;
  const somaLancada = linhas.reduce((s, l) => s + paraNumero(l.valor), 0);
  const restante = aCobrar - somaLancada;

  const mudar = (i, campo, valor) =>
    setLinhas((s) => s.map((l, k) => (k === i ? { ...l, [campo]: valor } : l)));

  async function finalizar() {
    setErro("");
    try {
      const pagamentos = linhas
        .filter((l) => paraNumero(l.valor) > 0)
        .map((l) => ({ forma: l.forma, valor: String(paraNumero(l.valor)) }));

      if (!pagamentos.length) throw new Error("Lance ao menos um pagamento.");

      await api.post(`/ordens-servico/${os.id}/finalizar/`, {
        ...(temReferencia && modalidade ? { modalidade } : {}),
        ...(paraNumero(desconto) > 0 ? { desconto: String(paraNumero(desconto)) } : {}),
        observacao,
        pagamentos,
      });
      aoConcluir();
      return "finalizada";
    } catch (e) {
      setErro(e.message);
      throw e;
    }
  }

  return (
    <Modal
      titulo={`Finalizar ${os.numero}`}
      subtitulo="Registre como o cliente pagou. Depois de finalizada, a O.S. não volta atrás."
      aoFechar={aoFechar}
      largura={580}
      rodape={
        <div className="btnrow" style={{ padding: 0 }}>
          <BotaoAcao classe="btn p" aoClicar={finalizar}>
            <Icone nome="fechado" tamanho={15} /> Finalizar O.S.
          </BotaoAcao>
          <button className="btn" onClick={aoFechar}>Cancelar</button>
        </div>
      }
    >
      {erro && <div className="erro">{erro}</div>}

      {temReferencia ? (
        <>
          <div className="lbl">Modalidade</div>
          <div className="opts" style={{ marginBottom: 18 }}>
            <label className={`opt${modalidade === "vista" ? " on" : ""}`}>
              <input type="radio" name="mod" checked={modalidade === "vista"}
                     onChange={() => setModalidade("vista")} />
              <span className="t">À vista<small>Dinheiro, PIX, débito ou transferência</small></span>
              <span className="v">{brl(os.valor_vista)}</span>
            </label>
            <label className={`opt${modalidade === "cartao" ? " on" : ""}`}>
              <input type="radio" name="mod" checked={modalidade === "cartao"}
                     onChange={() => setModalidade("cartao")} />
              <span className="t">No cartão<small>Crédito parcelado, valor da tabela de cartão</small></span>
              <span className="v">{brl(os.valor_cartao)}</span>
            </label>
          </div>
        </>
      ) : (
        <div className="aviso">
          <span className="ic">⚠</span>
          <span>Esta O.S. não veio de um orçamento, então não há os dois valores de
                referência. Será cobrado o valor lançado: <b>{brl(os.valor_total)}</b>.</span>
        </div>
      )}

      <Campo rotulo="Desconto" dica="Opcional — o preço pode ser negociado.">
        <input value={desconto} inputMode="decimal" placeholder="0,00"
               onChange={(e) => setDesconto(e.target.value)} />
      </Campo>

      <div className="resumoFechamento">
        <div><span>Valor</span><b>{brl(valorBase)}</b></div>
        {paraNumero(desconto) > 0 && (
          <div><span>Desconto</span><b>− {brl(paraNumero(desconto))}</b></div>
        )}
        {jaPago > 0 && <div><span>Já pago</span><b>− {brl(jaPago)}</b></div>}
        <div className="destaque"><span>A receber</span><b>{brl(aCobrar)}</b></div>
      </div>

      <div className="lbl" style={{ marginTop: 18 }}>Pagamentos recebidos</div>
      {linhas.map((l, i) => (
        <div className="two" key={i}>
          <Campo rotulo="Forma">
            <Selecao valor={l.forma} aoMudar={(v) => mudar(i, "forma", v)}
                     opcoes={FORMAS.map(([v, r]) => ({ valor: v, rotulo: r }))} />
          </Campo>
          <Campo rotulo="Valor">
            <input value={l.valor} inputMode="decimal" placeholder="0,00"
                   onChange={(e) => mudar(i, "valor", e.target.value)} />
          </Campo>
        </div>
      ))}

      <div className="btnrow" style={{ padding: 0, marginTop: 2 }}>
        <button className="btn" onClick={() => setLinhas((s) => [...s, { forma: "dinheiro", valor: "" }])}>
          <Icone nome="mais" tamanho={14} /> Outra forma
        </button>
        {linhas.length > 1 && (
          <button className="btn" onClick={() => setLinhas((s) => s.slice(0, -1))}>Remover última</button>
        )}
      </div>

      <div className={`conferencia${Math.abs(restante) < 0.005 ? " ok" : ""}`}>
        {Math.abs(restante) < 0.005
          ? <><Icone nome="fechado" tamanho={14} /> Lançado bate com o valor a receber.</>
          : restante > 0
            ? <>Faltam <b>{brl(restante)}</b> para fechar — a O.S. não finaliza com saldo em aberto.</>
            : <>Lançado <b>{brl(-restante)}</b> a mais que o valor a receber.</>}
      </div>

      <Campo rotulo="Observação do fechamento">
        <textarea rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)}
                  placeholder="Ex.: entrada no PIX e o restante em 2x no cartão." />
      </Campo>
    </Modal>
  );
}
