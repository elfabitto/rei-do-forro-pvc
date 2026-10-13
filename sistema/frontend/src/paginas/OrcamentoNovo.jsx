/**
 * Gerador de orçamento — mesma estrutura do gerador estático em docs/:
 * medida → tipo de forro → tipo de orçamento → acabamento (Instalado) ou materiais (Material).
 *
 * A diferença é que aqui o catálogo vem da API e o orçamento é salvo, podendo
 * virar Ordem de Serviço. Enviar ao cliente só aparece depois de gravar: o que
 * sai da loja precisa ter número e ficar registrado.
 *
 * A mesma tela edita um orçamento já salvo (rota /orcamentos/:id/editar).
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, num } from "../api";
import {
  BotaoAcao, Campo, DocumentoOrcamento, Estado, Selecao, linhas, useApi,
} from "../componentes";
import Icone from "../icones";
import {
  SERVICO, VERBA, baixarImagem, brl, copiarImagem, copiarTexto, ehServico, montarDocumento,
  unidadePlural,
} from "../orcamentoDoc";

// a folha de PVC tem largura fixa: área = tamanho da folha × (0,20 × quantidade)
const LARGURA_FOLHA = 0.2;

const paraNumero = (v) => {
  const n = parseFloat(String(v).replace(/\./g, "").replace(",", "."));
  return isFinite(n) && n > 0 ? n : 0;
};

export default function OrcamentoNovo() {
  const navegar = useNavigate();
  const { id } = useParams();
  const editando = Boolean(id);

  const forros = useApi("/forros/", { ativo: true });
  const materiais = useApi("/materiais/", { ativo: true });
  const acabamentos = useApi("/acabamentos/", { ativo: true });
  const original = useApi(editando ? `/orcamentos/${id}/` : null, null, [id]);

  // 1. medida
  const [modo, setModo] = useState("area");
  const [area, setArea] = useState("");
  const [largura, setLargura] = useState("");
  const [comprimento, setComprimento] = useState("");
  const [tamanhoFolha, setTamanhoFolha] = useState("");
  const [qtdFolhas, setQtdFolhas] = useState("");

  // 2 a 4
  const [forroId, setForroId] = useState("");
  const [tipo, setTipo] = useState("");
  const [acabamentoId, setAcabamentoId] = useState("");
  const [quantidades, setQuantidades] = useState({});
  // serviço, só no orçamento de Material: o sistema sugere área × R$ 25,00/m²,
  // mas o total é negociado. Campo vazio = usa o sugerido (e acompanha a área).
  const [servico, setServico] = useState(false);
  const [totalServico, setTotalServico] = useState("");
  // itens "Outro": descrição livre e valor fechado, nos dois tipos de orçamento
  const [extras, setExtras] = useState([]);
  const [observacoes, setObservacoes] = useState("");
  const [erro, setErro] = useState("");

  // orçamento já gravado nesta sessão — libera o envio ao cliente
  const [salvo, setSalvo] = useState(null);

  const listaForros = linhas(forros.dados);
  const listaMateriais = linhas(materiais.dados);
  const listaAcabamentos = linhas(acabamentos.dados);

  /* preenche os campos com o orçamento que está sendo editado */
  useEffect(() => {
    const o = original.dados;
    if (!o || !listaMateriais.length) return;
    setTipo(o.tipo);
    setForroId(String(o.forro));
    setAcabamentoId(o.acabamento ? String(o.acabamento) : "");
    setObservacoes(o.observacoes ?? "");
    if (o.tamanho_folha && o.quantidade_folhas) {
      setModo("folhas");
      setTamanhoFolha(String(o.tamanho_folha).replace(".", ","));
      setQtdFolhas(String(o.quantidade_folhas));
    } else if (o.largura && o.comprimento) {
      setModo("medidas");
      setLargura(String(o.largura));
      setComprimento(String(o.comprimento));
    } else {
      setModo("area");
      setArea(String(o.area_m2));
    }
    const q = {};
    const outros = [];
    let comServico = false;
    for (const item of o.itens ?? []) {
      if (ehServico(item)) {
        comServico = true;
        // igual ao sugerido volta como automático; negociado volta fixo
        const sugerido = Math.round(Number(o.area_m2) * SERVICO.precoM2 * 100) / 100;
        setTotalServico(Number(item.total) === sugerido ? "" : brl(item.total));
      } else if (item.unidade === VERBA) {
        outros.push({ descricao: item.descricao, valor: String(Number(item.total)).replace(".", ",") });
      } else if (item.material) {
        // vírgula, não ponto: é o separador que o campo lê de volta
        q[item.material] = String(Number(item.quantidade)).replace(".", ",");
      }
    }
    setQuantidades(q);
    setServico(comServico);
    setExtras(outros);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [original.dados, listaMateriais.length]);

  // quantidade de folhas é contagem: só inteiro
  const folhas = Math.floor(paraNumero(qtdFolhas));

  const areaFinal = useMemo(() => {
    if (modo === "area") return paraNumero(area);
    if (modo === "folhas") return Math.round(paraNumero(tamanhoFolha) * LARGURA_FOLHA * folhas * 100) / 100;
    return Math.round(paraNumero(largura) * paraNumero(comprimento) * 100) / 100;
  }, [modo, area, largura, comprimento, tamanhoFolha, folhas]);

  const forro = listaForros.find((f) => String(f.id) === String(forroId));
  const acabamento = listaAcabamentos.find((a) => String(a.id) === String(acabamentoId));

  // itens escolhidos no cardápio (quantidade > 0)
  const itens = useMemo(
    () => listaMateriais
      .map((m) => ({ ...m, quantidade: paraNumero(quantidades[m.id]), preco: Number(m.preco) }))
      .filter((m) => m.quantidade > 0),
    [listaMateriais, quantidades]
  );

  const servicoSugerido = Math.round(areaFinal * SERVICO.precoM2 * 100) / 100;
  const valorServico = tipo === "material" && servico
    ? (totalServico.trim() ? paraNumero(totalServico) : servicoSugerido)
    : 0;

  // o acabamento padrão é o de acréscimo zero (perfil)
  const acabamentoPadrao = listaAcabamentos.find((a) => Number(a.acrescimo_m2) === 0);
  function escolherTipo(t) {
    setTipo(t);
    setSalvo(null);
    if (t === "instalado" && !acabamentoId && acabamentoPadrao) setAcabamentoId(String(acabamentoPadrao.id));
    if (t === "material") setAcabamentoId("");
  }

  // só entram no documento os "Outros" que já têm descrição e valor
  const extrasValidos = useMemo(
    () => extras
      .map((e) => ({ descricao: e.descricao.trim(), valor: paraNumero(e.valor) }))
      .filter((e) => e.descricao && e.valor > 0),
    [extras]
  );

  const completo = areaFinal > 0 && forro && tipo && (tipo === "material" || acabamento);
  const doc = completo
    ? montarDocumento({ tipo, area: areaFinal, forro, acabamento, itens, extras: extrasValidos, servico: valorServico })
    : null;

  async function gravar() {
    const corpo = {
      tipo,
      area_m2: areaFinal.toFixed(2),
      largura: modo === "medidas" ? paraNumero(largura).toFixed(2) : null,
      comprimento: modo === "medidas" ? paraNumero(comprimento).toFixed(2) : null,
      tamanho_folha: modo === "folhas" ? paraNumero(tamanhoFolha).toFixed(2) : null,
      quantidade_folhas: modo === "folhas" ? folhas : null,
      forro: forro.id,
      acabamento: tipo === "instalado" ? acabamento.id : null,
      observacoes,
      itens: [
        ...(tipo === "material"
          ? itens.map((i) => ({
              material: i.id,
              descricao: i.rotulo,
              unidade: i.unidade,
              quantidade: String(i.quantidade),
              preco_unitario: String(i.preco),
            }))
          : []),
        // serviço: valor fechado, quantidade 1 e a unidade `serviço` o identificam
        ...(valorServico > 0
          ? [{
              material: null,
              descricao: SERVICO.descricao,
              unidade: SERVICO.unidade,
              quantidade: "1",
              preco_unitario: valorServico.toFixed(2),
            }]
          : []),
        // "Outro": quantidade 1 e a unidade `verba` marcam o valor fechado
        ...extrasValidos.map((e) => ({
          material: null,
          descricao: e.descricao,
          unidade: VERBA,
          quantidade: "1",
          preco_unitario: String(e.valor),
        })),
      ],
    };
    return editando ? api.patch(`/orcamentos/${id}/`, corpo) : api.post("/orcamentos/", corpo);
  }

  async function salvar() {
    setErro("");
    try {
      const registro = await gravar();
      setSalvo(registro);
      return editando ? "alterações salvas" : `salvo como ${registro.numero}`;
    } catch (e) {
      setErro(e.message);
      throw e;
    }
  }

  async function salvarEFechar() {
    setErro("");
    try {
      const registro = salvo ?? (await gravar());
      navegar(`/ordens/nova?orcamento=${registro.id}`);
      return "salvo";
    } catch (e) {
      setErro(e.message);
      throw e;
    }
  }

  const passo = (n, titulo) => (
    <div className="h"><span className="n">{n}</span><span className="t">{titulo}</span></div>
  );

  /* mexer em qualquer campo invalida o "já salvo": o documento mudou */
  const alterou = (fn) => (v) => { setSalvo(null); fn(v); };

  const adicionarExtra = () => {
    setSalvo(null);
    setExtras((s) => [...s, { descricao: "", valor: "" }]);
  };
  const mudarExtra = (i, campo, valor) => {
    setSalvo(null);
    setExtras((s) => s.map((e, k) => (k === i ? { ...e, [campo]: valor } : e)));
  };
  const removerExtra = (i) => {
    setSalvo(null);
    setExtras((s) => s.filter((_, k) => k !== i));
  };

  return (
    <div className="pagina">
      <h1>{editando ? `Editar ${original.dados?.numero ?? "orçamento"}` : "Novo orçamento"}</h1>
      <p className="sub">
        {editando
          ? "Os valores são recalculados pela tabela vigente ao salvar."
          : "Preencha as etapas; o documento à direita atualiza sozinho."}
      </p>

      <Estado carregando={forros.carregando || original.carregando}
              erro={forros.erro || materiais.erro || acabamentos.erro || original.erro}>
        <div className="cols c-2">
          {/* ------------------------------------------------ entrada */}
          <section className="card">
            <header><h2>Dados do orçamento</h2></header>
            <div className="body">

              <div className="step">
                {passo(1, "Medida")}
                <div className="seg" style={{ marginBottom: 14 }}>
                  <button type="button" className={modo === "area" ? "on" : ""}
                          onClick={() => { setSalvo(null); setModo("area"); }}>Área em m²</button>
                  <button type="button" className={modo === "medidas" ? "on" : ""}
                          onClick={() => { setSalvo(null); setModo("medidas"); }}>Largura × Comprimento</button>
                  <button type="button" className={modo === "folhas" ? "on" : ""}
                          onClick={() => { setSalvo(null); setModo("folhas"); }}>Cálculo por folha</button>
                </div>

                {modo === "area" ? (
                  <Campo rotulo="Área do compartimento (m²)">
                    <input value={area} onChange={(e) => alterou(setArea)(e.target.value)}
                           inputMode="decimal" placeholder="Ex.: 23" />
                  </Campo>
                ) : modo === "folhas" ? (
                  <>
                    <div className="two">
                      <Campo rotulo="Tamanho da folha (m)">
                        <input value={tamanhoFolha} onChange={(e) => alterou(setTamanhoFolha)(e.target.value)}
                               inputMode="decimal" placeholder="Ex.: 5" />
                      </Campo>
                      <Campo rotulo="Quantidade de folhas">
                        <input value={qtdFolhas} onChange={(e) => alterou(setQtdFolhas)(e.target.value)}
                               inputMode="numeric" placeholder="Ex.: 20" />
                      </Campo>
                    </div>
                    <div className="calc">
                      <span>Área calculada · folha de 0,20 m</span>
                      <b>{areaFinal ? `${num(areaFinal)} m²` : "—"}</b>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="two">
                      <Campo rotulo="Largura (m)">
                        <input value={largura} onChange={(e) => alterou(setLargura)(e.target.value)}
                               inputMode="decimal" placeholder="Ex.: 4,60" />
                      </Campo>
                      <Campo rotulo="Comprimento (m)">
                        <input value={comprimento} onChange={(e) => alterou(setComprimento)(e.target.value)}
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
                <Selecao valor={forroId} aoMudar={alterou(setForroId)} vazio="Selecione o tipo de forro"
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
                               onChange={() => alterou(setAcabamentoId)(String(a.id))} />
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
                                   onChange={(e) => {
                                     setSalvo(null);
                                     setQuantidades((s) => ({ ...s, [m.id]: e.target.value }));
                                   }} />
                            <span className="un">{unidadePlural(q, m.unidade)}</span>
                            <span className="sb">{q > 0 ? `R$ ${brl(q * Number(m.preco))}` : ""}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  <div className="matgrp">Serviço</div>
                  <div className="opts">
                    <label className={`opt${servico ? " on" : ""}`}>
                      <input type="checkbox" checked={servico}
                             onChange={(e) => alterou(setServico)(e.target.checked)} />
                      <span className="t">Serviço
                        <small>Sugerido: R$ {brl(SERVICO.precoM2)}/m² sobre a área</small>
                      </span>
                      <span className="v">{servico && valorServico > 0 ? `R$ ${brl(valorServico)}` : ""}</span>
                    </label>
                    {servico && (
                      <Campo rotulo="Valor total do serviço (R$)"
                             dica={servicoSugerido
                               ? `Sugerido: ${num(areaFinal)} m² × R$ ${brl(SERVICO.precoM2)} = R$ ${brl(servicoSugerido)}. Altere se for negociado; em branco usa o sugerido.`
                               : "Informe a medida para o sistema sugerir o valor."}>
                        <input value={totalServico} inputMode="decimal"
                               placeholder={servicoSugerido ? brl(servicoSugerido) : "0,00"}
                               onChange={(e) => alterou(setTotalServico)(e.target.value)} />
                      </Campo>
                    )}
                  </div>

                  <p className="nota">
                    Informe a quantidade na unidade indicada ao lado de cada campo. O ripão é
                    lançado por <b>dúzia</b> — para meia dúzia, use 0,5.
                  </p>
                </div>
              )}

              {tipo && (
                <div className="step">
                  {passo(5, "Outros")}
                  <p className="nota" style={{ marginTop: 0 }}>
                    Para o que não está na tabela: taxa de deslocamento, retirada de forro
                    antigo, andaime. Entra no total dos dois tipos de orçamento.
                  </p>
                  {extras.map((e, i) => (
                    <div className="extra" key={i}>
                      <input value={e.descricao} placeholder="Ex.: retirada do forro antigo"
                             aria-label={`Descrição do item ${i + 1}`}
                             onChange={(ev) => mudarExtra(i, "descricao", ev.target.value)} />
                      <div className="vl">
                        <span className="cifrao">R$</span>
                        <input value={e.valor} placeholder="0,00" inputMode="decimal"
                               aria-label={`Valor do item ${i + 1}`}
                               onChange={(ev) => mudarExtra(i, "valor", ev.target.value)} />
                      </div>
                      <button type="button" className="x" aria-label="Remover item"
                              onClick={() => removerExtra(i)}>×</button>
                    </div>
                  ))}
                  <button type="button" className="btn" onClick={adicionarExtra}>
                    <Icone nome="mais" tamanho={14} /> Adicionar outro item
                  </button>
                </div>
              )}

              <div className="step">
                {passo(6, "Observações")}
                <Campo rotulo="Observações"
                       dica="Os dados do cliente são pedidos só na hora de fechar o negócio.">
                  <textarea rows={2} value={observacoes}
                            onChange={(e) => alterou(setObservacoes)(e.target.value)}
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

                <div className="grupoAcoes destaque">
                  <span className="grupoTit">
                    <Icone nome="salvar" tamanho={14} /> Gravar no sistema
                  </span>
                  <div className="acts">
                    <BotaoAcao classe="btn p" aoClicar={salvar}>
                      <Icone nome="salvar" tamanho={15} />
                      {editando ? " Salvar alterações" : " Salvar orçamento"}
                    </BotaoAcao>
                    <BotaoAcao aoClicar={salvarEFechar}>
                      <Icone nome="fechado" tamanho={15} /> Salvar e fechar negócio
                    </BotaoAcao>
                    {editando && (
                      <button className="btn" onClick={() => navegar("/orcamentos")}>Voltar</button>
                    )}
                  </div>
                  <p className="grupoNota">
                    <b>Salvar</b> guarda a proposta sem cliente e libera o envio abaixo.
                    <b> Fechar negócio</b> já pede os dados do cliente e gera a Ordem de Serviço.
                  </p>
                </div>

                {salvo ? (
                  <div className="grupoAcoes">
                    <span className="grupoTit">
                      <Icone nome="whatsapp" tamanho={14} /> Enviar ao cliente — {salvo.numero}
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
                      <a className="btn zap" target="_blank" rel="noopener noreferrer"
                         href={`https://wa.me/?text=${encodeURIComponent(doc.texto)}`}>
                        <Icone nome="whatsapp" tamanho={15} /> WhatsApp
                      </a>
                    </div>
                    <p className="grupoNota">
                      Gravado como <b>{salvo.numero}</b>. Continua na lista de orçamentos para
                      reenviar quando precisar.
                    </p>
                  </div>
                ) : (
                  <p className="nota" style={{ marginTop: 16 }}>
                    Salve o orçamento para liberar o envio ao cliente — assim o que sai da loja
                    tem número e fica registrado.
                  </p>
                )}

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
