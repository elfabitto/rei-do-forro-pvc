/**
 * Gerador de orçamento — mesma estrutura do gerador estático em docs/:
 * medida → tipo de forro → tipo de orçamento → acabamento (Instalado) ou materiais (Material).
 *
 * A diferença é que aqui o catálogo vem da API e o orçamento é salvo, podendo
 * virar Ordem de Serviço.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, num } from "../api";
import {
  BotaoAcao, Campo, DocumentoOrcamento, Estado, Selecao, linhas, useApi,
} from "../componentes";
import Icone from "../icones";
import { baixarImagem, brl, copiarImagem, copiarTexto, montarDocumento } from "../orcamentoDoc";

const paraNumero = (v) => {
  const n = parseFloat(String(v).replace(/\./g, "").replace(",", "."));
  return isFinite(n) && n > 0 ? n : 0;
};

export default function OrcamentoNovo() {
  const navegar = useNavigate();

  const forros = useApi("/forros/", { ativo: true });
  const materiais = useApi("/materiais/", { ativo: true });
  const acabamentos = useApi("/acabamentos/", { ativo: true });

  // 1. medida
  const [modo, setModo] = useState("area");
  const [area, setArea] = useState("");
  const [largura, setLargura] = useState("");
  const [comprimento, setComprimento] = useState("");

  // 2 a 4
  const [forroId, setForroId] = useState("");
  const [tipo, setTipo] = useState("");
  const [acabamentoId, setAcabamentoId] = useState("");
  const [quantidades, setQuantidades] = useState({});
  const [observacoes, setObservacoes] = useState("");
  const [erro, setErro] = useState("");

  const listaForros = linhas(forros.dados);
  const listaMateriais = linhas(materiais.dados);
  const listaAcabamentos = linhas(acabamentos.dados);

  const areaFinal = useMemo(
    () => (modo === "area"
      ? paraNumero(area)
      : Math.round(paraNumero(largura) * paraNumero(comprimento) * 100) / 100),
    [modo, area, largura, comprimento]
  );

  const forro = listaForros.find((f) => String(f.id) === String(forroId));
  const acabamento = listaAcabamentos.find((a) => String(a.id) === String(acabamentoId));

  // itens escolhidos no cardápio (quantidade > 0)
  const itens = useMemo(
    () => listaMateriais
      .map((m) => ({ ...m, quantidade: paraNumero(quantidades[m.id]), preco: Number(m.preco) }))
      .filter((m) => m.quantidade > 0),
    [listaMateriais, quantidades]
  );

  // o acabamento padrão é o de acréscimo zero (perfil)
  const acabamentoPadrao = listaAcabamentos.find((a) => Number(a.acrescimo_m2) === 0);
  function escolherTipo(t) {
    setTipo(t);
    if (t === "instalado" && !acabamentoId && acabamentoPadrao) setAcabamentoId(String(acabamentoPadrao.id));
    if (t === "material") setAcabamentoId("");
  }

  const completo = areaFinal > 0 && forro && tipo && (tipo === "material" || acabamento);
  const doc = completo
    ? montarDocumento({ tipo, area: areaFinal, forro, acabamento, itens })
    : null;

  async function salvar(gerarOS) {
    setErro("");
    const corpo = {
      tipo,
      area_m2: areaFinal.toFixed(2),
      largura: modo === "medidas" ? paraNumero(largura).toFixed(2) : null,
      comprimento: modo === "medidas" ? paraNumero(comprimento).toFixed(2) : null,
      forro: forro.id,
      acabamento: tipo === "instalado" ? acabamento.id : null,
      observacoes,
      itens: tipo === "material"
        ? itens.map((i) => ({
            material: i.id,
            descricao: i.rotulo,
            unidade: i.unidade,
            quantidade: String(i.quantidade),
            preco_unitario: String(i.preco),
          }))
        : [],
    };

    const salvo = await api.post("/orcamentos/", corpo);
    navegar(gerarOS ? `/ordens/nova?orcamento=${salvo.id}` : "/orcamentos");
    return "salvo";
  }

  const passo = (n, titulo) => (
    <div className="h"><span className="n">{n}</span><span className="t">{titulo}</span></div>
  );

  return (
    <div className="pagina">
      <h1>Novo orçamento</h1>
      <p className="sub">Preencha as etapas; o documento à direita atualiza sozinho.</p>

      <Estado carregando={forros.carregando} erro={forros.erro || materiais.erro || acabamentos.erro}>
        <div className="cols c-2">
          {/* ------------------------------------------------ entrada */}
          <section className="card">
            <header><h2>Dados do orçamento</h2></header>
            <div className="body">

              <div className="step">
                {passo(1, "Medida")}
                <div className="seg" style={{ marginBottom: 14 }}>
                  <button type="button" className={modo === "area" ? "on" : ""}
                          onClick={() => setModo("area")}>Área em m²</button>
                  <button type="button" className={modo === "medidas" ? "on" : ""}
                          onClick={() => setModo("medidas")}>Largura × Comprimento</button>
                </div>

                {modo === "area" ? (
                  <Campo rotulo="Área do compartimento (m²)">
                    <input value={area} onChange={(e) => setArea(e.target.value)}
                           inputMode="decimal" placeholder="Ex.: 23" />
                  </Campo>
                ) : (
                  <>
                    <div className="two">
                      <Campo rotulo="Largura (m)">
                        <input value={largura} onChange={(e) => setLargura(e.target.value)}
                               inputMode="decimal" placeholder="Ex.: 4,60" />
                      </Campo>
                      <Campo rotulo="Comprimento (m)">
                        <input value={comprimento} onChange={(e) => setComprimento(e.target.value)}
                               inputMode="decimal" placeholder="Ex.: 5" />
                      </Campo>
                    </div>
                    <div className="calc">
                      <span>Área calculada</span>
                      <b>{areaFinal ? `${num(areaFinal)} m²` : "—"}</b>
                    </div>
                  </>
                )}
              </div>

              <div className="step">
                {passo(2, "Tipo de forro")}
                <Selecao valor={forroId} aoMudar={setForroId} vazio="Selecione o tipo de forro"
                         opcoes={listaForros.map((f) => ({
                           valor: f.id,
                           rotulo: `${f.nome} — R$ ${brl(f.preco_material_vista)}/m²`,
                         }))} />
                {forro && (
                  <div className="ref">
                    <div className="sw" style={{ background: forro.cor_amostra || "#e9ecef" }} />
                    <div className="tx">Preço do m² — só o forro
                      <b>R$ {brl(forro.preco_material_vista)} à vista · R$ {brl(forro.preco_material_cartao)} cartão</b>
                    </div>
                  </div>
                )}
              </div>

              <div className="step">
                {passo(3, "Tipo de orçamento")}
                <div className="opts">
                  <label className={`opt${tipo === "material" ? " on" : ""}`}>
                    <input type="radio" name="tipo" checked={tipo === "material"}
                           onChange={() => escolherTipo("material")} />
                    <span className="t">Material<small>Só o forro + lista de materiais</small></span>
                  </label>
                  <label className={`opt${tipo === "instalado" ? " on" : ""}`}>
                    <input type="radio" name="tipo" checked={tipo === "instalado"}
                           onChange={() => escolherTipo("instalado")} />
                    <span className="t">Instalado<small>Instalação completa, preço por m²</small></span>
                  </label>
                </div>
              </div>

              {tipo === "instalado" && (
                <div className="step">
                  {passo(4, "Acabamento")}
                  <div className="opts">
                    {listaAcabamentos.map((a) => (
                      <label key={a.id} className={`opt${String(acabamentoId) === String(a.id) ? " on" : ""}`}>
                        <input type="radio" name="acab" checked={String(acabamentoId) === String(a.id)}
                               onChange={() => setAcabamentoId(String(a.id))} />
                        <span className="t">{a.nome}</span>
                        <span className={`v${Number(a.acrescimo_m2) ? "" : " z"}`}>
                          {Number(a.acrescimo_m2) ? `+ R$ ${brl(a.acrescimo_m2)}/m²` : "Incluso"}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {tipo === "material" && (
                <div className="step">
                  {passo(4, "Materiais")}
                  {listaMateriais.map((m, i) => {
                    const grupoNovo = m.grupo && (i === 0 || listaMateriais[i - 1].grupo !== m.grupo);
                    const primeiroAvulso = !m.grupo && i === 0;
                    const q = paraNumero(quantidades[m.id]);
                    return (
                      <div key={m.id}>
                        {primeiroAvulso && <div className="matgrp">Avulsos</div>}
                        {grupoNovo && <div className="matgrp">{m.grupo}</div>}
                        <div className={`mat${q > 0 ? " on" : ""}`}>
                          <div className="i">
                            <b>{m.nome}</b>
                            <small>
                              R$ {brl(m.preco)} / {m.unidade}
                              {m.tem_cotacao_diferente && (
                                <em> · R$ {brl(m.preco_cotacao)} a {m.unidade_cotacao}</em>
                              )}
                            </small>
                          </div>
                          <div className="q">
                            <input value={quantidades[m.id] ?? ""} placeholder="0" inputMode="decimal"
                                   aria-label={`${m.nome} — quantidade em ${m.unidade}`}
                                   onChange={(e) =>
                                     setQuantidades((s) => ({ ...s, [m.id]: e.target.value }))} />
                            <span className="un">{m.unidade}</span>
                            <span className="sb">{q > 0 ? `R$ ${brl(q * Number(m.preco))}` : ""}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <p className="nota">
                    Informe a quantidade na unidade indicada ao lado de cada campo. O ripão é cotado
                    por dúzia, mas lançado por <b>unidade</b> — o valor sai proporcional.
                  </p>
                </div>
              )}

              <div className="step">
                {passo(5, "Observações")}
                <Campo rotulo="Observações"
                       dica="Os dados do cliente são pedidos só na hora de fechar o negócio.">
                  <textarea rows={2} value={observacoes} onChange={(e) => setObservacoes(e.target.value)}
                            placeholder="Detalhes combinados com o cliente" />
                </Campo>
              </div>
            </div>
          </section>

          {/* ------------------------------------------------ saída */}
          <section>
            {erro && <div className="erro">{erro}</div>}
            {!doc ? (
              <div className="empty">
                <b>Nenhum orçamento gerado</b>
                <ol>
                  <li className={areaFinal ? "ok" : ""}>Informar a medida</li>
                  <li className={forro ? "ok" : ""}>Escolher o tipo de forro</li>
                  <li className={tipo ? "ok" : ""}>Escolher o tipo de orçamento</li>
                </ol>
              </div>
            ) : (
              <>
                <DocumentoOrcamento doc={doc} />

                <div className="grupoAcoes">
                  <span className="grupoTit">
                    <Icone nome="whatsapp" tamanho={14} /> Enviar ao cliente
                  </span>
                  <div className="acts">
                    <BotaoAcao classe="btn p" aoClicar={() => copiarImagem(doc)}>
                      <Icone nome="imagem" tamanho={15} /> Copiar imagem
                    </BotaoAcao>
                    <BotaoAcao aoClicar={() => copiarTexto(doc)}>
                      <Icone nome="copiar" tamanho={15} /> Copiar texto
                    </BotaoAcao>
                    <BotaoAcao aoClicar={() => baixarImagem(doc)}>
                      <Icone nome="baixar" tamanho={15} /> Baixar PNG
                    </BotaoAcao>
                    <a className="btn" target="_blank" rel="noopener noreferrer"
                       href={`https://wa.me/?text=${encodeURIComponent(doc.texto)}`}>
                      <Icone nome="whatsapp" tamanho={15} /> WhatsApp
                    </a>
                  </div>
                  <p className="grupoNota">
                    Só envia a proposta — nada é gravado no sistema ainda.
                  </p>
                </div>

                <div className="grupoAcoes destaque">
                  <span className="grupoTit">
                    <Icone nome="salvar" tamanho={14} /> Gravar no sistema
                  </span>
                  <div className="acts">
                    <BotaoAcao classe="btn p" aoClicar={() => salvar(false)}>
                      <Icone nome="salvar" tamanho={15} /> Salvar orçamento
                    </BotaoAcao>
                    <BotaoAcao aoClicar={() => salvar(true)}>
                      <Icone nome="fechado" tamanho={15} /> Salvar e fechar negócio
                    </BotaoAcao>
                  </div>
                  <p className="grupoNota">
                    <b>Salvar</b> guarda a proposta sem cliente. <b>Fechar negócio</b> já pede
                    os dados do cliente e gera a Ordem de Serviço.
                  </p>
                </div>
                <details className="raw">
                  <summary>Texto para WhatsApp</summary>
                  <pre>{doc.texto}</pre>
                </details>
              </>
            )}
          </section>
        </div>
      </Estado>
    </div>
  );
}
