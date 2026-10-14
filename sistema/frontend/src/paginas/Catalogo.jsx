/**
 * Tabela de preços. Leitura liberada a todos; alteração só pela diretoria —
 * a API recusa a escrita de quem não é diretor (LeituraOuDiretor).
 */
import { useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { BotaoAcao, Estado, linhas, useApi } from "../componentes";
import { PARCELAS_MAX, acrescimoCartao } from "../cartao";
import { brl } from "../orcamentoDoc";

/** Célula de preço editável no lugar, salva ao sair do campo. */
function Preco({ registro, campo, recurso, editavel, aoSalvar }) {
  const [valor, setValor] = useState(String(registro[campo]).replace(".", ","));
  const [estado, setEstado] = useState("");

  async function salvar() {
    const n = parseFloat(valor.replace(/\./g, "").replace(",", "."));
    if (!isFinite(n) || n < 0) { setEstado("erro"); return; }
    if (n === Number(registro[campo])) return;
    try {
      await api.patch(`/${recurso}/${registro.id}/`, { [campo]: String(n) });
      setEstado("ok");
      setTimeout(() => setEstado(""), 1600);
      aoSalvar();
    } catch {
      setEstado("erro");
    }
  }

  if (!editavel) return <span>{brl(registro[campo])}</span>;

  return (
    <input className={`preco ${estado}`} value={valor} inputMode="decimal"
           onChange={(e) => setValor(e.target.value)} onBlur={salvar}
           onKeyDown={(e) => e.key === "Enter" && e.target.blur()} />
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
    <div className="card" style={{ marginTop: 18 }}>
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

export default function Catalogo() {
  const { pode } = useAuth();
  const editavel = pode("verTudo") && pode("finalizarOS");   // diretor
  const forros = useApi("/forros/");
  const materiais = useApi("/materiais/");
  const acabamentos = useApi("/acabamentos/");

  return (
    <div className="pagina">
      <h1>Tabela de preços</h1>
      <p className="sub">
        {editavel
          ? "Clique num preço para alterar; sai do campo e salva."
          : "Somente leitura — alterar a tabela é exclusivo da diretoria."}
      </p>

      {!editavel && (
        <div className="aviso" style={{ margin: "0 0 18px" }}>
          <span className="ic">⚠</span>
          <span>Você pode consultar os preços, mas não alterá-los.</span>
        </div>
      )}

      <div className="card mb">
        <header>
          <h2>Forros</h2>
          <span className="hint">R$ por m²</span>
        </header>
        <Estado carregando={forros.carregando} erro={forros.erro}>
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Forro</th>
                  <th className="num">Material à vista</th><th className="num">Material cartão</th>
                  <th className="num">Instalado à vista</th><th className="num">Instalado cartão</th>
                  <th>Ativo</th>
                </tr>
              </thead>
              <tbody>
                {linhas(forros.dados).map((f) => (
                  <tr key={f.id}>
                    <td>
                      <div className="comSwatch">
                        <span className="sw" style={{ background: f.cor_amostra || "#e9ecef" }} />
                        <b>{f.nome}</b>
                      </div>
                    </td>
                    {["preco_material_vista", "preco_material_cartao",
                      "preco_instalado_vista", "preco_instalado_cartao"].map((campo) => (
                      <td className="num" key={campo}>
                        <Preco registro={f} campo={campo} recurso="forros"
                               editavel={editavel} aoSalvar={forros.recarregar} />
                      </td>
                    ))}
                    <td>{f.ativo ? "sim" : "não"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Estado>
      </div>

      <div className="cols c-2">
        <div className="card">
          <header>
            <h2>Materiais</h2>
            <span className="hint">preço da unidade de lançamento</span>
          </header>
          <Estado carregando={materiais.carregando} erro={materiais.erro}>
            <div className="tw">
              <table>
                <thead>
                  <tr><th>Material</th><th>Unidade</th>
                    <th className="num">Preço</th><th>Cotação</th></tr>
                </thead>
                <tbody>
                  {linhas(materiais.dados).map((m) => (
                    <tr key={m.id}>
                      <td>
                        <b>{m.rotulo}</b>
                        {m.grupo && <div className="sub2">{m.grupo}</div>}
                      </td>
                      <td>{m.unidade}</td>
                      <td className="num">
                        <Preco registro={m} campo="preco" recurso="materiais"
                               editavel={editavel} aoSalvar={materiais.recarregar} />
                      </td>
                      <td className="compacto">
                        {m.tem_cotacao_diferente
                          ? `R$ ${brl(m.preco_cotacao)} / ${m.unidade_cotacao}`
                          : <span style={{ color: "var(--muted)" }}>—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Estado>
          <p className="obs">
            O ripão é cotado por dúzia e lançado por unidade: o preço unitário é a dúzia
            dividida por 12, então 12 unidades fecham exatamente o valor da dúzia.
          </p>
        </div>

        <div className="card">
          <header>
            <h2>Acabamentos</h2>
            <span className="hint">só no orçamento Instalado</span>
          </header>
          <Estado carregando={acabamentos.carregando} erro={acabamentos.erro}>
            <div className="tw">
              <table>
                <thead><tr><th>Acabamento</th><th className="num">Acréscimo por m²</th></tr></thead>
                <tbody>
                  {linhas(acabamentos.dados).map((a) => (
                    <tr key={a.id}>
                      <td><b>{a.nome}</b></td>
                      <td className="num">
                        <Preco registro={a} campo="acrescimo_m2" recurso="acabamentos"
                               editavel={editavel} aoSalvar={acabamentos.recarregar} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Estado>
          <p className="obs">
            No orçamento de Material não há acabamento por m² — perfil, moldura e sanca
            entram como peças, por unidade.
          </p>
        </div>
      </div>

      <TaxasMaquininha editavel={editavel} />
    </div>
  );
}
