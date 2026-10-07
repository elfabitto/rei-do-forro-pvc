/**
 * Tabela de preços. Leitura liberada a todos; alteração só pela diretoria —
 * a API recusa a escrita de quem não é diretor (LeituraOuDiretor).
 */
import { useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { BotaoAcao, Estado, linhas, useApi } from "../componentes";
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
    </div>
  );
}
