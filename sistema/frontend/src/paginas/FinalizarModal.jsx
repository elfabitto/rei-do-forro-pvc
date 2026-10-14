/**
 * Fechamento da O.S. — só a diretoria chega aqui.
 *
 * O preço é sempre o à vista. Cada pagamento quita uma parte dele:
 *   - PIX e dinheiro: o valor lançado;
 *   - cartão (crédito parcelado ou débito): o valor à vista que ele quita, e o
 *     cliente paga por cima a taxa da maquininha (tabela em Tabela de preços),
 *     para a loja receber o valor à vista limpo.
 * A linha de cartão fica sempre com o que falta depois do PIX/dinheiro: a lista
 * de parcelas já mostra quanto fica cada uma, e o valor da parcela aparece
 * travado ao lado.
 * O backend refaz a mesma conta ao gravar.
 */
import { useEffect, useRef, useState } from "react";
import { api, brl } from "../api";
import { PARCELAS_MAX, acrescimoCartao, taxaDe } from "../cartao";
import { BotaoAcao, Campo, Modal, Selecao, useApi } from "../componentes";
import Icone from "../icones";

const FORMAS = [["pix", "PIX"], ["dinheiro", "Dinheiro"],
  ["credito", "Cartão de crédito"], ["debito", "Cartão de débito"]];
const ehCartao = (forma) => forma === "credito" || forma === "debito";

const paraNumero = (v) => {
  const n = parseFloat(String(v).replace(/\./g, "").replace(",", "."));
  return isFinite(n) ? n : 0;
};
const cent = (n) => Math.round(n * 100) / 100;
/** 1234.5 → "1.234,50" (sem R$, para caber na lista de parcelas) */
const num2 = (n) => Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n) => `${Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

/**
 * Escolha das parcelas com o valor de cada uma à vista na própria lista —
 * "3x (de 345,85)". O <select> nativo não deixa formatar o texto da opção,
 * por isso a lista é própria e abre logo abaixo do campo.
 */
function EscolhaParcelas({ valor, opcoes, aoMudar }) {
  const [aberta, setAberta] = useState(false);
  const raiz = useRef(null);
  const atual = opcoes.find((o) => o.n === valor);

  // fecha ao tocar fora
  useEffect(() => {
    if (!aberta) return undefined;
    const fora = (e) => { if (!raiz.current?.contains(e.target)) setAberta(false); };
    document.addEventListener("mousedown", fora);
    document.addEventListener("touchstart", fora);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("touchstart", fora);
    };
  }, [aberta]);

  const escolher = (n) => { aoMudar(n); setAberta(false); };

  return (
    <div className={`parcsel${aberta ? " aberta" : ""}`} ref={raiz}>
      <button type="button" className="parcsel-campo" aria-haspopup="listbox" aria-expanded={aberta}
              onClick={() => setAberta((a) => !a)}
              onKeyDown={(e) => e.key === "Escape" && setAberta(false)}>
        {atual ? <>{atual.n}x <i>(de {num2(atual.parcela)})</i></> : <span className="ph">Selecione…</span>}
        <span className="seta" aria-hidden="true">▾</span>
      </button>
      {aberta && (
        <ul className="parcsel-lista" role="listbox">
          {opcoes.map((o) => (
            <li key={o.n} role="option" aria-selected={o.n === valor}
                className={o.n === valor ? "on" : ""}
                onMouseDown={(e) => { e.preventDefault(); escolher(o.n); }}>
              <b>{o.n}x</b> <i>(de {num2(o.parcela)})</i>
              <span className="tot">total {num2(o.total)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function FinalizarModal({ os, aoFechar, aoConcluir }) {
  const taxas = useApi("/taxas-cartao/");
  const [desconto, setDesconto] = useState("");
  const [observacao, setObservacao] = useState("");
  const [linhas, setLinhas] = useState([{ forma: "pix", valor: "", parcelas: 1 }]);
  const [erro, setErro] = useState("");

  const temReferencia = os.valor_vista != null;
  const base = Number(os.valor_vista ?? os.valor_total);
  const desc = paraNumero(desconto);
  // o que já foi pago antes conta pelo valor à vista que quitou (sem o acréscimo)
  const jaPagoBase = (os.pagamentos ?? []).reduce((s, p) => s + Number(p.valor) - Number(p.acrescimo ?? 0), 0);
  const aReceber = cent(base - desc - jaPagoBase);

  /*
   * Valor à vista de cada linha. PIX/dinheiro: o que foi digitado. Cartão: o
   * que falta depois deles (a primeira linha de cartão leva tudo). Crédito sem
   * parcelas escolhidas ainda não quita nada.
   */
  const digitado = linhas.reduce((s, l) => s + (ehCartao(l.forma) ? 0 : paraNumero(l.valor)), 0);
  let falta = cent(aReceber - digitado);
  const calculadas = linhas.map((l) => {
    if (!ehCartao(l.forma)) return { ...l, base: paraNumero(l.valor), acrescimo: 0, cobrado: paraNumero(l.valor) };
    const disponivel = Math.max(0, falta);
    // opções de parcelamento sobre o que falta — é o que a lista mostra
    const opcoes = Array.from({ length: PARCELAS_MAX }, (_, k) => {
      const n = k + 1;
      const total = cent(disponivel + acrescimoCartao(taxas.dados, disponivel, "credito", n));
      return { n, total, parcela: cent(total / n) };
    });
    const escolhido = l.forma === "debito" || l.parcelas > 0;
    const valor = escolhido ? disponivel : 0;
    falta = cent(falta - valor);
    const acrescimo = acrescimoCartao(taxas.dados, valor, l.forma, l.parcelas || 1);
    const cobrado = cent(valor + acrescimo);
    return { ...l, base: valor, acrescimo, cobrado, opcoes,
             parcela: l.forma === "credito" && l.parcelas ? cent(cobrado / l.parcelas) : cobrado };
  });

  const quitado = calculadas.reduce((s, l) => s + l.base, 0);
  const acrescimoTotal = calculadas.reduce((s, l) => s + l.acrescimo, 0);
  const restante = cent(aReceber - quitado);

  const mudar = (i, campo, valor) =>
    setLinhas((s) => s.map((l, k) => (k === i ? { ...l, [campo]: valor } : l)));

  async function finalizar() {
    setErro("");
    try {
      const pagamentos = calculadas
        .filter((l) => l.base > 0)
        .map((l) => ({
          forma: l.forma,
          valor: l.base.toFixed(2),
          parcelas: l.forma === "credito" ? l.parcelas : 1,
        }));

      if (calculadas.some((l) => l.forma === "credito" && !l.parcelas)) {
        throw new Error("Escolha em quantas parcelas vai o cartão de crédito.");
      }
      if (!pagamentos.length) throw new Error("Lance ao menos um pagamento.");

      const finalizada = await api.post(`/ordens-servico/${os.id}/finalizar/`, {
        ...(desc > 0 ? { desconto: String(desc) } : {}),
        observacao,
        pagamentos,
      });
      aoConcluir(finalizada);   // quem abriu mostra o recibo em seguida
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
      largura={600}
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

      {!temReferencia && (
        <div className="aviso">
          <span className="ic">⚠</span>
          <span>Esta O.S. não veio de um orçamento: o valor base é o lançado, <b>{brl(base)}</b>.</span>
        </div>
      )}

      <Campo rotulo="Desconto" dica="Opcional — o preço pode ser negociado. Abate do valor à vista.">
        <input value={desconto} inputMode="decimal" placeholder="0,00"
               onChange={(e) => setDesconto(e.target.value)} />
      </Campo>

      <div className="lbl" style={{ marginTop: 6 }}>Pagamentos recebidos</div>
      {calculadas.map((l, i) => (
        <div className="pgbloco" key={i}>
          <div className={`pgto${l.forma === "credito" ? " parc" : ""}`}>
            <Campo rotulo="Forma">
              <Selecao valor={l.forma} aoMudar={(v) => { mudar(i, "forma", v); if (v === "credito") mudar(i, "parcelas", 0); }}
                       opcoes={FORMAS.map(([v, r]) => ({ valor: v, rotulo: r }))} />
            </Campo>
            {l.forma === "credito" && (
              <Campo rotulo="Parcelas">
                <EscolhaParcelas valor={l.parcelas} opcoes={l.opcoes}
                                 aoMudar={(n) => mudar(i, "parcelas", n)} />
              </Campo>
            )}
            {ehCartao(l.forma) ? (
              <Campo rotulo={l.forma === "credito" ? "Valor da parcela" : "Valor no débito"}>
                <input className="travado" readOnly tabIndex={-1}
                       value={l.base > 0 ? brl(l.parcela) : ""}
                       placeholder={l.forma === "credito" ? "escolha as parcelas" : "—"} />
              </Campo>
            ) : (
              <Campo rotulo="Valor">
                <div className="valcampo">
                  <input value={l.valor} inputMode="decimal" placeholder="0,00"
                         onChange={(e) => mudar(i, "valor", e.target.value)} />
                  {restante > 0.004 && (
                    <button type="button" className="lnk"
                            onClick={() => mudar(i, "valor", brl(cent(paraNumero(l.valor) + restante)))}>
                      completar
                    </button>
                  )}
                </div>
              </Campo>
            )}
          </div>

          {ehCartao(l.forma) && l.base > 0 && (
            <div className="maquininha">
              <div className="mq-valor">
                <small>Passar na maquininha</small>
                <b>{brl(l.cobrado)}</b>
                {l.forma === "credito" && l.parcelas > 1 && (
                  <span>{l.parcelas}x de {brl(l.cobrado / l.parcelas)}</span>
                )}
              </div>
              <div className="mq-conta">
                <span>Valor à vista <b>{brl(l.base)}</b></span>
                <span>
                  + taxa {l.forma === "credito" ? `${l.parcelas}x` : "débito"}{" "}
                  ({pct(taxaDe(taxas.dados, l.forma, l.parcelas))}) <b>{brl(l.acrescimo)}</b>
                </span>
                <em>restante do serviço — juros pagos pelo cliente</em>
              </div>
            </div>
          )}
        </div>
      ))}

      <div className="btnrow" style={{ padding: 0, marginTop: 2 }}>
        <button className="btn" onClick={() => setLinhas((s) => [...s, { forma: "credito", valor: "", parcelas: 0 }])}>
          <Icone nome="mais" tamanho={14} /> Outra forma
        </button>
        {linhas.length > 1 && (
          <button className="btn" onClick={() => setLinhas((s) => s.slice(0, -1))}>Remover última</button>
        )}
      </div>

      <div className="resumoFechamento" style={{ marginTop: 14 }}>
        <div><span>Valor do serviço (à vista)</span><b>{brl(base)}</b></div>
        {desc > 0 && <div><span>Desconto</span><b>− {brl(desc)}</b></div>}
        {jaPagoBase > 0 && <div><span>Já pago</span><b>− {brl(jaPagoBase)}</b></div>}
        {acrescimoTotal > 0 && (
          <div><span>Taxa do cartão (paga pelo cliente)</span><b>+ {brl(acrescimoTotal)}</b></div>
        )}
        <div className="destaque"><span>Total que o cliente paga</span><b>{brl(aReceber + acrescimoTotal)}</b></div>
      </div>

      <div className={`conferencia${Math.abs(restante) < 0.005 ? " ok" : ""}`}>
        {Math.abs(restante) < 0.005
          ? <><Icone nome="fechado" tamanho={14} /> Pagamentos fecham o valor do serviço.</>
          : restante > 0
            ? <>Faltam <b>{brl(restante)}</b> (à vista) para fechar — a O.S. não finaliza com saldo em aberto.</>
            : <>Lançado <b>{brl(-restante)}</b> a mais que o valor do serviço.</>}
      </div>

      <Campo rotulo="Observação do fechamento">
        <textarea rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)}
                  placeholder="Ex.: entrada no PIX e o restante em 3x no cartão." />
      </Campo>
    </Modal>
  );
}
