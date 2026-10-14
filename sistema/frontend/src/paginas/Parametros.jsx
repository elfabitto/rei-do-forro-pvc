/**
 * Parâmetros do sistema — só a diretoria altera. Mesmo jeito da Tabela de
 * preços: clica no valor, edita, sai do campo e salva.
 *
 * - Comissões: R$ por m² (instalação completa; forro e serviço na O.S. de
 *   Material) e R$ por unidade de cada material. Cada O.S. guarda os valores
 *   que valiam quando foi gerada: mudar aqui só vale daqui para frente.
 * - Taxas da maquininha: repassadas ao cliente no pagamento com cartão.
 */
import { useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { PARCELAS_MAX, acrescimoCartao } from "../cartao";
import { Estado, linhas, useApi } from "../componentes";
import { brl } from "../orcamentoDoc";
import { Preco } from "./Catalogo";

/** Valor de um registro único (PUT parcial), salvo ao sair do campo. */
function ValorParametro({ valor, campo, endpoint, editavel, aoSalvar, sufixo = "" }) {
  const [texto, setTexto] = useState(String(valor ?? "").replace(".", ","));
  const [estado, setEstado] = useState("");

  async function salvar() {
    const n = parseFloat(texto.replace(/\./g, "").replace(",", "."));
    if (!isFinite(n) || n < 0) { setEstado("erro"); return; }
    if (n === Number(valor)) return;
    try {
      await api.put(endpoint, { [campo]: String(n) });
      setEstado("ok");
      setTimeout(() => setEstado(""), 1600);
      aoSalvar();
    } catch {
      setEstado("erro");
    }
  }

  if (!editavel) return <span>{brl(valor)}{sufixo}</span>;
  return (
    <input className={`preco ${estado}`} value={texto} inputMode="decimal"
           onChange={(e) => setTexto(e.target.value)} onBlur={salvar}
           onKeyDown={(e) => e.key === "Enter" && e.target.blur()} />
  );
}

function Comissoes({ editavel }) {
  const params = useApi("/parametros-comissao/");
  const materiais = useApi("/materiais/");
  const p = params.dados;

  const linhaM2 = (rotulo, sub, campo) => (
    <tr>
      <td><b>{rotulo}</b><div className="sub2">{sub}</div></td>
      <td>m²</td>
      <td className="num">
        {p && (
          <ValorParametro key={p[campo]} valor={p[campo]} campo={campo} endpoint="/parametros-comissao/"
                          editavel={editavel} aoSalvar={params.recarregar} />
        )}
      </td>
    </tr>
  );

  return (
    <div className="card mb">
      <header>
        <h2>Comissões</h2>
        <span className="hint">R$ para quem trouxe o cliente — vale para O.S. geradas depois da mudança</span>
      </header>
      <Estado carregando={params.carregando || materiais.carregando} erro={params.erro || materiais.erro}>
        <div className="tw">
          <table>
            <thead><tr><th>O que conta</th><th>Por</th><th className="num">Comissão (R$)</th></tr></thead>
            <tbody>
              <tr className="grupoLinha"><td colSpan={3}>Instalação completa</td></tr>
              {linhaM2("Instalação", "O.S. de serviço — sobre a área do orçamento", "instalado_m2")}

              <tr className="grupoLinha"><td colSpan={3}>Material — item a item</td></tr>
              {linhaM2("Forro", "área do orçamento de Material", "material_forro_m2")}
              {linhaM2("Serviço (instalação)", "quando o item Serviço é incluído no Material", "material_servico_m2")}
              {linhas(materiais.dados).map((m) => (
                <tr key={m.id}>
                  <td><b>{m.rotulo}</b>{m.grupo && <div className="sub2">{m.grupo}</div>}</td>
                  <td>{m.unidade}</td>
                  <td className="num">
                    <Preco registro={m} campo="comissao" recurso="materiais"
                           editavel={editavel} aoSalvar={materiais.recarregar} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Estado>
      <p className="obs">
        Comissão zero = o item não gera comissão (ex.: pregos). Itens "Outro" do orçamento nunca geram.
      </p>
    </div>
  );
}

/**
 * Taxas da maquininha: o fechamento usa para repassar o custo do cartão ao
 * cliente. Cada conta PagBank tem as suas (bandeira e faturamento mudam a taxa).
 */
function TaxasMaquininha({ editavel }) {
  const taxas = useApi("/taxas-cartao/");
  const [edicao, setEdicao] = useState(null);
  const [estado, setEstado] = useState("");
  const atual = edicao ?? taxas.dados;

  const linhasTaxa = [["debito", "Débito"],
    ...Array.from({ length: PARCELAS_MAX }, (_, i) => [String(i + 1), `Crédito ${i + 1}x`])];

  const valorDe = (chave) => (chave === "debito" ? atual?.debito : atual?.credito?.[chave]) ?? "";
  const mudar = (chave, v) => {
    const base = edicao ?? { debito: taxas.dados.debito, credito: { ...taxas.dados.credito } };
    setEdicao(chave === "debito"
      ? { ...base, debito: v }
      : { ...base, credito: { ...base.credito, [chave]: v } });
  };

  async function salvar() {
    if (!edicao) return;
    try {
      const num = (v) => String(v).replace(",", ".");
      const credito = Object.fromEntries(Object.entries(edicao.credito).map(([k, v]) => [k, num(v)]));
      await api.put("/taxas-cartao/", { debito: num(edicao.debito), credito });
      setEdicao(null);
      taxas.recarregar();
      setEstado("ok");
      setTimeout(() => setEstado(""), 1600);
    } catch {
      setEstado("erro");
    }
  }

  const exemplo = 1000;
  return (
    <div className="card">
      <header>
        <h2>Taxas da maquininha</h2>
        <span className="hint">PagBank — repassadas ao cliente no pagamento com cartão</span>
      </header>
      <Estado carregando={taxas.carregando} erro={taxas.erro}>
        <div className="tw">
          <table className="taxas">
            <thead>
              <tr><th>Forma</th><th className="num">Taxa (%)</th>
                <th className="num">R$ 1.000 à vista vira</th><th className="num">Parcela</th></tr>
            </thead>
            <tbody>
              {linhasTaxa.map(([chave, rotulo]) => {
                const forma = chave === "debito" ? "debito" : "credito";
                const parcelas = chave === "debito" ? 1 : Number(chave);
                const t = String(valorDe(chave)).replace(",", ".");
                const total = exemplo + acrescimoCartao(
                  { debito: t, credito: { [chave]: t } }, exemplo, forma, parcelas);
                return (
                  <tr key={chave}>
                    <td><b>{rotulo}</b></td>
                    <td className="num">
                      {editavel ? (
                        <input className={`preco ${estado}`} inputMode="decimal"
                               value={String(valorDe(chave)).replace(".", ",")}
                               onChange={(e) => mudar(chave, e.target.value)} onBlur={salvar}
                               onKeyDown={(e) => e.key === "Enter" && e.target.blur()} />
                      ) : `${String(valorDe(chave)).replace(".", ",")}%`}
                    </td>
                    <td className="num">{brl(total)}</td>
                    <td className="num compacto">{parcelas > 1 ? `${parcelas}x de ${brl(total / parcelas)}` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Estado>
      <p className="obs">
        Valores iniciais: tabela pública do PagBank (Visa/Master, faturamento de R$ 20 a 50 mil/mês,
        recebimento no mesmo dia). <b>Troque pelas taxas da sua conta</b> — no app PagBank, em taxas
        da maquininha. A loja recebe o valor à vista; o cliente paga valor ÷ (1 − taxa).
      </p>
    </div>
  );
}

export default function Parametros() {
  const { pode } = useAuth();
  const editavel = pode("verTudo") && pode("finalizarOS");   // diretor

  return (
    <div className="pagina">
      <h1>Parâmetros</h1>
      <p className="sub">
        {editavel
          ? "Clique num valor para alterar; sai do campo e salva."
          : "Somente leitura — alterar os parâmetros é exclusivo da diretoria."}
      </p>
      <Comissoes editavel={editavel} />
      <TaxasMaquininha editavel={editavel} />
    </div>
  );
}
