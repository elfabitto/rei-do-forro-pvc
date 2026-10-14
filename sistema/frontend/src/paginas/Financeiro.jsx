/**
 * Financeiro — o livro-caixa: tudo o que entrou e saiu no período.
 *
 * Entram sozinhos (e ficam travados): os pagamentos das O.S. finalizadas, pelo
 * valor líquido, e as baixas de comissão. O resto a diretoria lança aqui.
 */
import { useMemo, useState } from "react";
import { api, brl, data } from "../api";
import { BotaoAcao, Campo, Estado, Gaveta, useApi } from "../componentes";
import { CORES, Colunas, Legenda, Linhas, Rosca, fmtCurto } from "../graficos";
import Icone from "../icones";
import { decimal } from "../mascaras";

const VERDE = "#1f9d6b", VERMELHO = "#d03b3b";
const FORMAS = ["PIX", "Dinheiro", "Cartão de débito", "Cartão de crédito", "Transferência", "Boleto"];

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const hojeIso = () => iso(new Date());
const somar = (s, n) => { const d = new Date(s + "T00:00:00"); d.setDate(d.getDate() + n); return iso(d); };

function intervalo(modo, f) {
  const hoje = hojeIso();
  if (modo === "mes") {
    const [a, m] = f.mes.split("-").map(Number);
    return { de: `${f.mes}-01`, ate: iso(new Date(a, m, 0)) };
  }
  if (modo === "periodo") return f.de <= f.ate ? { de: f.de, ate: f.ate } : { de: f.ate, ate: f.de };
  if (modo === "dia") return { de: f.dia, ate: f.dia };
  return { de: somar(hoje, -6), ate: hoje };
}

/* ------------------------------------------------------------ formulário */
function FormLancamento({ lancamento, categorias, aoFechar, aoSalvar }) {
  const novo = !lancamento?.id;
  const [l, setL] = useState(() => lancamento?.id ? { ...lancamento, valor: String(lancamento.valor).replace(".", ",") }
    : { tipo: lancamento?.tipo || "saida", categoria: "", descricao: "", valor: "", data: hojeIso(), forma: "", observacao: "" });
  const [erro, setErro] = useState("");
  const campo = (k) => ({ value: l[k] ?? "", onChange: (e) => setL((s) => ({ ...s, [k]: e.target.value })) });
  const opcoes = categorias.filter((c) => c.tipo === l.tipo);

  async function salvar() {
    setErro("");
    try {
      const valor = parseFloat(String(l.valor).replace(/\./g, "").replace(",", "."));
      if (!l.categoria) throw new Error("Escolha a categoria.");
      if (!l.descricao.trim()) throw new Error("Descreva o lançamento.");
      if (!(valor > 0)) throw new Error("Informe um valor maior que zero.");
      const corpo = { tipo: l.tipo, categoria: l.categoria, descricao: l.descricao.trim(), valor: valor.toFixed(2),
                      data: l.data, forma: l.forma, observacao: l.observacao };
      if (novo) await api.post("/lancamentos/", corpo);
      else await api.patch(`/lancamentos/${l.id}/`, corpo);
      aoSalvar();
      aoFechar();
      return "salvo";
    } catch (e) {
      setErro(e.message);
      throw e;
    }
  }

  async function excluir() {
    if (!window.confirm(`Excluir "${l.descricao}"?`)) return "";
    await api.delete(`/lancamentos/${l.id}/`);
    aoSalvar();
    aoFechar();
    return "excluído";
  }

  return (
    <Gaveta titulo={novo ? "Novo lançamento" : "Editar lançamento"} aoFechar={aoFechar}
            rodape={
              <div className="btnrow">
                <BotaoAcao classe="btn p" aoClicar={salvar}>Salvar</BotaoAcao>
                <button className="btn" onClick={aoFechar}>Cancelar</button>
                {!novo && <BotaoAcao classe="btn vermelho" aoClicar={excluir}><Icone nome="lixo" tamanho={15} /> Excluir</BotaoAcao>}
              </div>
            }>
      <section className="sec">
        {erro && <div className="erro">{erro}</div>}
        <div className="tipoLanc">
          {[["entrada", "Entrada", "+"], ["saida", "Saída", "−"]].map(([k, r, s]) => (
            <button key={k} type="button" className={`${k}${l.tipo === k ? " on" : ""}`}
                    onClick={() => setL((x) => ({ ...x, tipo: k, categoria: "" }))}>
              <b>{s}</b> {r}
            </button>
          ))}
        </div>
        <Campo rotulo="Categoria">
          <select {...campo("categoria")}>
            <option value="" disabled>Selecione…</option>
            {opcoes.filter((c) => !["venda", "comissao"].includes(c.valor) || c.valor === l.categoria)
              .map((c) => <option key={c.valor} value={c.valor}>{c.rotulo}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Descrição"><input {...campo("descricao")} autoFocus placeholder={l.tipo === "saida" ? "Ex.: Diesel do caminhão" : "Ex.: Venda de sobra de forro"} /></Campo>
        <div className="two">
          <Campo rotulo="Valor (R$)" obrigatorio><input value={l.valor} onChange={(e) => setL((x) => ({ ...x, valor: decimal(e.target.value) }))} inputMode="decimal" placeholder="0,00" /></Campo>
          <Campo rotulo="Data"><input type="date" {...campo("data")} /></Campo>
        </div>
        <Campo rotulo="Forma de pagamento">
          <input {...campo("forma")} list="formasLanc" placeholder="PIX, dinheiro…" />
          <datalist id="formasLanc">{FORMAS.map((f) => <option key={f} value={f} />)}</datalist>
        </Campo>
        <Campo rotulo="Observação"><textarea rows={2} {...campo("observacao")} /></Campo>
        <p className="nota">Vendas finalizadas e baixas de comissão entram sozinhas — não precisa lançar.</p>
      </section>
    </Gaveta>
  );
}

/* ------------------------------------------------------------- exportação */
function baixarCsv(itens, periodo) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const linhas = [["Data", "Tipo", "Categoria", "Descrição", "Forma", "Origem", "O.S.", "Valor"].map(esc).join(";")];
  itens.forEach((l) => linhas.push([
    data(l.data), l.tipo_display, l.categoria_display, l.descricao, l.forma, l.origem_display, l.os_numero || "",
    (l.tipo === "saida" ? -l.valor : Number(l.valor)).toFixed(2).replace(".", ","),
  ].map(esc).join(";")));
  const blob = new Blob(["﻿" + linhas.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `financeiro_${periodo.de}_a_${periodo.ate}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ------------------------------------------------------------------ página */
export default function Financeiro() {
  const [modo, setModo] = useState("mes");
  const [f, setF] = useState(() => {
    const h = hojeIso();
    return { dia: h, mes: h.slice(0, 7), de: somar(h, -29), ate: h };
  });
  const [tipo, setTipo] = useState("");
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState(null);

  const alvo = useMemo(() => intervalo(modo, f), [modo, f]);
  const resumo = useApi("/lancamentos/resumo/", alvo, [alvo.de, alvo.ate]);
  const lista = useApi("/lancamentos/", alvo, [alvo.de, alvo.ate]);
  const recarregar = () => { resumo.recarregar(); lista.recarregar(); };
  const r = resumo.dados;

  const itens = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (lista.dados || []).filter((l) => (!tipo || l.tipo === tipo) &&
      (!q || `${l.descricao} ${l.observacao} ${l.os_numero || ""} ${l.categoria_display}`.toLowerCase().includes(q)));
  }, [lista.dados, tipo, busca]);

  const muda = (k) => (e) => e.target.value && setF((x) => ({ ...x, [k]: e.target.value }));
  const pontos = r?.serie.pontos || [];
  const saidasCat = (r?.por_categoria || []).filter((c) => c.tipo === "saida");
  const entradasCat = (r?.por_categoria || []).filter((c) => c.tipo === "entrada");

  return (
    <div className="pagina painel financeiro">
      <div className="painelTopo">
        <div>
          <h1>Financeiro</h1>
          <p className="sub">Entradas e saídas da empresa — vendas finalizadas e comissões pagas entram sozinhas</p>
        </div>
        <div className="olhos">
          <button className="btn" onClick={() => baixarCsv(itens, alvo)} disabled={!itens.length}>
            <Icone nome="baixar" tamanho={15} /> Planilha
          </button>
          <button className="btn p" onClick={() => setEditando({})}><Icone nome="mais" tamanho={15} /> Novo lançamento</button>
        </div>
      </div>

      <div className="filtrosPainel">
        <div className="segmento">
          {[["dia", "Dia"], ["7", "7 dias"], ["mes", "Mês"], ["periodo", "Período"]].map(([k, t]) => (
            <button key={k} type="button" className={modo === k ? "on" : ""} onClick={() => setModo(k)}>{t}</button>
          ))}
        </div>
        {modo === "dia" && <div className="datas"><input type="date" value={f.dia} onChange={muda("dia")} /></div>}
        {modo === "mes" && <div className="datas"><input type="month" value={f.mes} onChange={muda("mes")} /></div>}
        {modo === "periodo" && (
          <div className="datas">
            <input type="date" value={f.de} onChange={muda("de")} /><span>até</span>
            <input type="date" value={f.ate} onChange={muda("ate")} />
          </div>
        )}
        <span className="periodoTx">{alvo.de === alvo.ate ? data(alvo.de) : `${data(alvo.de)} a ${data(alvo.ate)}`}</span>
      </div>

      {!r ? <Estado carregando={resumo.carregando} erro={resumo.erro} /> : (
        <div className={resumo.carregando ? "recarregando" : ""}>
          <div className="caixaKpis mb">
            <div className="ck"><span>Saldo anterior</span><b>{brl(r.saldo_anterior)}</b><small>antes de {data(alvo.de)}</small></div>
            <div className="ck ent"><span>Entradas</span><b>+ {brl(r.entradas)}</b><small>{entradasCat.reduce((s, c) => s + c.qtd, 0)} lançamento(s)</small></div>
            <div className="ck sai"><span>Saídas</span><b>− {brl(r.saidas)}</b><small>{saidasCat.reduce((s, c) => s + c.qtd, 0)} lançamento(s)</small></div>
            <div className={`ck ${Number(r.resultado) >= 0 ? "ent" : "sai"}`}><span>Resultado do período</span>
              <b>{Number(r.resultado) >= 0 ? "+ " : "− "}{brl(Math.abs(r.resultado))}</b>
              <small>{Number(r.entradas) ? `margem de ${Math.round((r.resultado / r.entradas) * 100)}%` : "sem entradas"}</small></div>
            <div className="ck forte"><span>Saldo em caixa</span><b>{brl(r.saldo_final)}</b><small>em {data(alvo.ate)}</small></div>
          </div>

          <div className="cols g-21 mb">
            <div className="card">
              <header><h2>Entradas × saídas</h2>
                <span className="hint">{{ dia: "por dia", semana: "por semana", mes: "por mês" }[r.serie.escala]}</span></header>
              <div className="body">
                <Legenda itens={[{ rotulo: "Entradas", cor: VERDE }, { rotulo: "Saídas", cor: VERMELHO }]} />
                <Colunas categorias={pontos.map((p) => p.rotulo)} altura={210}
                         series={[{ rotulo: "Entradas", cor: VERDE, valores: pontos.map((p) => Number(p.entradas)) },
                                  { rotulo: "Saídas", cor: VERMELHO, valores: pontos.map((p) => Number(p.saidas)) }]} />
              </div>
            </div>
            <div className="card">
              <header><h2>Para onde foi o dinheiro</h2><span className="hint">saídas por categoria</span></header>
              <div className="body">
                {saidasCat.length === 0 ? <div className="vazio">Nenhuma saída no período.</div> : (
                  <Rosca formato={brl} tamanho={170} centro={{ valor: `R$ ${fmtCurto(Number(r.saidas))}`, rotulo: "saídas" }}
                         fatias={saidasCat.map((c, i) => ({ rotulo: c.rotulo, valor: Number(c.valor), cor: CORES[(i + 3) % CORES.length] }))} />
                )}
              </div>
            </div>
          </div>

          {pontos.length > 1 && (
            <div className="card mb">
              <header><h2>Saldo em caixa</h2><span className="hint">acumulado, começando do saldo anterior</span></header>
              <div className="body">
                <Linhas categorias={pontos.map((p) => p.rotulo)} altura={190} formatoDica={brl}
                        series={[{ rotulo: "Saldo", cor: CORES[1], valores: pontos.map((p) => Number(p.saldo)) }]} />
              </div>
            </div>
          )}
        </div>
      )}

      <div className="card">
        <header>
          <h2>Lançamentos</h2>
          <span className="hint">{itens.length} no período</span>
          <div className="filtros">
            {[["", "Todos"], ["entrada", "Entradas"], ["saida", "Saídas"]].map(([k, t]) => (
              <button key={k} className={`chip${tipo === k ? " on" : ""}`} onClick={() => setTipo(k)}>{t}</button>
            ))}
            <input className="busca" value={busca} placeholder="Buscar descrição, O.S.…" onChange={(e) => setBusca(e.target.value)} />
          </div>
        </header>
        <Estado carregando={lista.carregando && !lista.dados} erro={lista.erro}
                vazio={itens.length === 0 ? "Nenhum lançamento no período." : null}>
          <div className="tw">
            <table className="lancTab">
              <thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Forma</th><th>Origem</th><th className="num">Valor</th></tr></thead>
              <tbody>
                {itens.map((l) => (
                  <tr key={l.id} className={l.automatico ? "auto" : "manual"}
                      onClick={() => !l.automatico && setEditando(l)}
                      title={l.automatico ? "Lançamento automático — mexa na O.S. ou na comissão" : "Clique para editar"}>
                    <td className="mono">{data(l.data)}</td>
                    <td><b>{l.descricao}</b>{l.observacao && <div className="sub2">{l.observacao}</div>}</td>
                    <td>{l.categoria_display}</td>
                    <td>{l.forma || "—"}</td>
                    <td>{l.automatico
                      ? <span className="origem auto">Automático · {l.origem === "venda" ? "venda" : "comissão"}</span>
                      : <span className="origem">Manual</span>}</td>
                    <td className={`num valor ${l.tipo}`}>{l.tipo === "saida" ? "− " : "+ "}{brl(l.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Estado>
      </div>

      {editando && r && (
        <FormLancamento lancamento={editando} categorias={r.categorias}
                        aoFechar={() => setEditando(null)} aoSalvar={recarregar} />
      )}
    </div>
  );
}
