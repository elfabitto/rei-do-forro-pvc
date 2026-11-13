/**
 * Gerador de orçamento — mesma estrutura do gerador estático em docs/:
 * medida → tipo de forro → tipo de orçamento → acabamento e estrutura (Instalado) ou materiais (Material).
 *
 * A diferença é que aqui o catálogo vem da API e o orçamento é salvo, podendo
 * virar Ordem de Serviço. Enviar ao cliente só aparece depois de gravar: o que
 * sai da loja precisa ter número e ficar registrado.
 *
 * A mesma tela edita um orçamento já salvo (rota /orcamentos/:id/editar).
 *
 * Vindo de uma visita técnica (?visita=ID), o orçamento já nasce com o cliente
 * da visita e ligado a ela; fechar o negócio segue direto para a O.S.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, num } from "../api";
import { valorNoCartao } from "../cartao";
import {
  BotaoAcao, Campo, DocumentoOrcamento, Estado, linhas, useApi,
} from "../componentes";
import Icone from "../icones";
import { imagemDe } from "../imagensCatalogo";
import { decimal, digitos } from "../mascaras";
import SeletorForro, { Miniatura } from "./SeletorForro";
import {
  SERVICO, VERBA, baixarImagem, brl, copiarImagem, copiarTexto, ehServico, gruposDeForro, montarDocumento,
  unidadePlural,
} from "../orcamentoDoc";

// a folha de PVC tem largura fixa: área = tamanho da folha × (0,20 × quantidade)
const LARGURA_FOLHA = 0.2;

const paraNumero = (v) => {
  const n = parseFloat(String(v).replace(/\./g, "").replace(",", "."));
  return isFinite(n) && n > 0 ? n : 0;
};

// forro vazio = o principal (passo 2); outro forro só nesse compartimento (ex.: Cedro no beiral)
const COMPARTIMENTO_VAZIO = { nome: "", largura: "", comprimento: "", forro: "" };

/* Em centímetros inteiros, para arredondar igual ao backend (área_dos_compartimentos). */
const emCm = (v) => Math.round(paraNumero(v) * 100);
const areaDe = (c) => Math.round((emCm(c.largura) * emCm(c.comprimento)) / 100) / 100;

export default function OrcamentoNovo() {
  const navegar = useNavigate();
  const { id } = useParams();
  const editando = Boolean(id);
  const [params] = useSearchParams();
  const visitaId = editando ? null : params.get("visita");
  const visita = useApi(visitaId ? `/visitas/${visitaId}/` : null, null, [visitaId]);
  const v = visita.dados;
  const voltarPara = visitaId ? "/visitas" : "/orcamentos";

  const forros = useApi("/forros/", { ativo: true });
  const materiais = useApi("/materiais/", { ativo: true });
  const acabamentos = useApi("/acabamentos/", { ativo: true });
  const estruturas = useApi("/estruturas/", { ativo: true });
  const taxas = useApi("/taxas-cartao/");   // o valor no cartão sai da taxa de 5x
  const original = useApi(editando ? `/orcamentos/${id}/` : null, null, [id]);

  // 1. medida
  // abre pedindo as medidas ao cliente; sem elas, é só trocar para Área em m²
  const [modo, setModo] = useState("medidas");
  const [area, setArea] = useState("");
  const [compartimentos, setCompartimentos] = useState([{ ...COMPARTIMENTO_VAZIO }]);
  const [tamanhoFolha, setTamanhoFolha] = useState("");
  const [qtdFolhas, setQtdFolhas] = useState("");

  // 2 a 4
  const [forroId, setForroId] = useState("");
  const [tipo, setTipo] = useState("");
  const [acabamentoId, setAcabamentoId] = useState("");
  const [estruturaId, setEstruturaId] = useState("");
  const [quantidades, setQuantidades] = useState({});
  // serviço, só no orçamento de Material: o sistema sugere área × R$ 25,00/m²,
  // mas o total é negociado. Campo vazio = usa o sugerido (e acompanha a área).
  const [servico, setServico] = useState(false);
  const [totalServico, setTotalServico] = useState("");
  // itens "Outro": descrição livre e valor fechado, nos dois tipos de orçamento
  const [extras, setExtras] = useState([]);
  const [observacoes, setObservacoes] = useState("");
  // desconto em R$, dado já no orçamento: abate do à vista, e o cartão sai do valor já com desconto
  const [desconto, setDesconto] = useState("");
  const [erro, setErro] = useState("");

  // orçamento já gravado nesta sessão — libera o envio ao cliente
  const [salvo, setSalvo] = useState(null);
  // o registro criado nesta tela: depois do primeiro salvar, tudo vira edição
  // dele — nunca um segundo orçamento igual
  const [gravadoId, setGravadoId] = useState(null);
  const alvoId = editando ? id : gravadoId;

  const listaForros = linhas(forros.dados);
  const listaMateriais = linhas(materiais.dados);
  const listaAcabamentos = linhas(acabamentos.dados);
  const listaEstruturas = linhas(estruturas.dados);

  /* preenche os campos com o orçamento que está sendo editado */
  useEffect(() => {
    const o = original.dados;
    if (!o || !listaMateriais.length) return;
    setTipo(o.tipo);
    setForroId(String(o.forro));
    setAcabamentoId(o.acabamento ? String(o.acabamento) : "");
    setEstruturaId(o.estrutura ? String(o.estrutura) : "");
    setObservacoes(o.observacoes ?? "");
    setDesconto(Number(o.desconto) > 0 ? String(Number(o.desconto)).replace(".", ",") : "");
    if (o.tamanho_folha && o.quantidade_folhas) {
      setModo("folhas");
      setTamanhoFolha(String(o.tamanho_folha).replace(".", ","));
      setQtdFolhas(String(o.quantidade_folhas));
    } else if (o.compartimentos?.length) {
      setModo("medidas");
      setCompartimentos(o.compartimentos.map((c) => ({
        nome: c.nome ?? "",
        largura: String(Number(c.largura)).replace(".", ","),
        comprimento: String(Number(c.comprimento)).replace(".", ","),
        forro: c.forro ? String(c.forro) : "",
      })));
    } else if (o.largura && o.comprimento) {   // orçamento de antes dos compartimentos
      setModo("medidas");
      setCompartimentos([{
        nome: "",
        largura: String(Number(o.largura)).replace(".", ","),
        comprimento: String(Number(o.comprimento)).replace(".", ","),
        forro: "",
      }]);
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
    return Math.round(compartimentos.reduce((s, c) => s + areaDe(c), 0) * 100) / 100;
  }, [modo, area, compartimentos, tamanhoFolha, folhas]);

  const mudarCompartimento = (i, campo, valor) => {
    setSalvo(null);
    setCompartimentos((s) => s.map((c, k) => (k === i ? { ...c, [campo]: valor } : c)));
  };
  const novoCompartimento = () => {
    setSalvo(null);
    setCompartimentos((s) => [...s, { ...COMPARTIMENTO_VAZIO }]);
  };
  const removerCompartimento = (i) => {
    setSalvo(null);
    setCompartimentos((s) => s.filter((_, k) => k !== i));
  };

  const forro = listaForros.find((f) => String(f.id) === String(forroId));
  // mais de um forro (por compartimento): cada um sai pelo seu m²; [] = um forro só
  const grupos = useMemo(
    () => (modo === "medidas"
      ? gruposDeForro(compartimentos.map((c) => ({
          nome: c.nome, largura: paraNumero(c.largura), comprimento: paraNumero(c.comprimento),
          area: areaDe(c), forro: c.forro,
        })), forro, listaForros)
      : []),
    [modo, compartimentos, forro, listaForros]
  );
  const acabamento = listaAcabamentos.find((a) => String(a.id) === String(acabamentoId));
  // orçamento antigo sem estrutura = a padrão (acréscimo zero), como no backend
  const estruturaPadrao = listaEstruturas.find((e) => Number(e.acrescimo_m2) === 0);
  const estrutura = listaEstruturas.find((e) => String(e.id) === String(estruturaId))
    ?? (tipo === "instalado" ? estruturaPadrao : undefined);

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
    if (t === "instalado" && !estruturaId && estruturaPadrao) setEstruturaId(String(estruturaPadrao.id));
    if (t === "material") { setAcabamentoId(""); setEstruturaId(""); }
  }

  // só entram no documento os "Outros" que já têm descrição e valor
  const extrasValidos = useMemo(
    () => extras
      .map((e) => ({ descricao: e.descricao.trim(), valor: paraNumero(e.valor) }))
      .filter((e) => e.descricao && e.valor > 0),
    [extras]
  );

  const valorDesconto = paraNumero(desconto);
  const completo = areaFinal > 0 && forro && tipo && (tipo === "material" || acabamento);
  const doc = completo
    ? montarDocumento({ tipo, area: areaFinal, forro, acabamento, estrutura, itens, extras: extrasValidos,
                        servico: valorServico, desconto: valorDesconto, taxas: taxas.dados, grupos })
    : null;
  const descontoDemais = doc && valorDesconto > (doc.subtotalVista ?? doc.totalVista);

  async function gravar() {
    if (descontoDemais) throw new Error("O desconto passa do valor à vista do orçamento.");
    const corpo = {
      tipo,
      area_m2: areaFinal.toFixed(2),
      // só os preenchidos; o backend refaz a área e guarda largura/comprimento quando é um só
      compartimentos: modo === "medidas"
        ? compartimentos.filter((c) => areaDe(c) > 0).map((c) => ({
            nome: c.nome.trim(),
            largura: paraNumero(c.largura).toFixed(2),
            comprimento: paraNumero(c.comprimento).toFixed(2),
            ...(c.forro && String(c.forro) !== String(forro.id) ? { forro: Number(c.forro) } : {}),
          }))
        : [],
      largura: null,
      comprimento: null,
      tamanho_folha: modo === "folhas" ? paraNumero(tamanhoFolha).toFixed(2) : null,
      quantidade_folhas: modo === "folhas" ? folhas : null,
      forro: forro.id,
      acabamento: tipo === "instalado" ? acabamento.id : null,
      estrutura: tipo === "instalado" && estrutura ? estrutura.id : null,
      observacoes,
      desconto: valorDesconto.toFixed(2),
      // só na criação: liga o orçamento à visita e traz o cliente dela
      ...(visitaId && !alvoId ? { visita: Number(visitaId) } : {}),
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
    const registro = alvoId
      ? await api.patch(`/orcamentos/${alvoId}/`, corpo)
      : await api.post("/orcamentos/", corpo);
    setGravadoId(registro.id);
    return registro;
  }

  async function salvar() {
    setErro("");
    try {
      const registro = await gravar();
      setSalvo(registro);
      return alvoId ? "alterações salvas" : `salvo como ${registro.numero}`;
    } catch (e) {
      setErro(e.message);
      throw e;
    }
  }

  async function salvarEFechar() {
    setErro("");
    try {
      const registro = salvo ?? (await gravar());
      navegar(`/ordens/nova?orcamento=${registro.id}${v ? `&endereco=${v.endereco}` : ""}`);
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
      <button className="voltar" onClick={() => navegar(voltarPara)}>
        <span aria-hidden="true">←</span> {visitaId ? "Visitas técnicas" : "Orçamentos"}
      </button>
      <h1>{editando ? `Editar ${original.dados?.numero ?? "orçamento"}` : "Novo orçamento"}</h1>
      <p className="sub">
        {editando
          ? "Os valores são recalculados pela tabela vigente ao salvar."
          : "Preencha as etapas; o documento à direita atualiza sozinho."}
      </p>

      {v && (
        <div className="faixaVisita">
          <Icone nome="visita" tamanho={18} />
          <span>
            Orçamento da visita <b>{v.numero}</b> — <b>{v.cliente_detalhe?.nome}</b>, {v.bairro}.
            {" "}Preencha a medida tirada, o forro e o tipo; depois <b>Salvar e gerar serviço</b>.
          </span>
        </div>
      )}
      {v?.orcamento && !gravadoId && (
        <div className="aviso">
          <span className="ic">⚠</span>
          <span>
            Esta visita já tem o orçamento {v.orcamento_numero}.{" "}
            <button className="lnk" onClick={() => navegar(`/ordens/nova?orcamento=${v.orcamento}&endereco=${v.endereco}`)}>
              Seguir com ele para a O.S.
            </button>
          </span>
        </div>
      )}

      <Estado carregando={forros.carregando || taxas.carregando || original.carregando || visita.carregando}
              erro={forros.erro || materiais.erro || acabamentos.erro || estruturas.erro || taxas.erro || original.erro || visita.erro}>
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
                  <Campo rotulo="Área total (m²)"
                         dica="Se o cliente tiver as medidas, prefira Largura × Comprimento: elas vão para a O.S.">
                    <input value={area} onChange={(e) => alterou(setArea)(decimal(e.target.value))}
                           inputMode="decimal" placeholder="Ex.: 23" />
                  </Campo>
                ) : modo === "folhas" ? (
                  <>
                    <div className="two">
                      <Campo rotulo="Tamanho da folha (m)">
                        <input value={tamanhoFolha} onChange={(e) => alterou(setTamanhoFolha)(decimal(e.target.value))}
                               inputMode="decimal" placeholder="Ex.: 5" />
                      </Campo>
                      <Campo rotulo="Quantidade de folhas">
                        <input value={qtdFolhas} onChange={(e) => alterou(setQtdFolhas)(digitos(e.target.value).slice(0, 4))}
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
                    <p className="nota" style={{ marginTop: 0 }}>
                      Peça as medidas ao cliente, se ele tiver. Não é obrigatório: sem elas, use Área em m².
                    </p>
                    {compartimentos.map((c, i) => (
                      <div className="compartimento" key={i}>
                        <div className="topo">
                          <input value={c.nome} maxLength={40} placeholder={`Compartimento ${i + 1} (ex.: Sala)`}
                                 aria-label={`Nome do compartimento ${i + 1} (opcional)`}
                                 onChange={(e) => mudarCompartimento(i, "nome", e.target.value)} />
                          <b>{areaDe(c) ? `${num(areaDe(c))} m²` : "—"}</b>
                          {compartimentos.length > 1 && (
                            <button type="button" className="x" aria-label={`Remover compartimento ${i + 1}`}
                                    onClick={() => removerCompartimento(i)}>×</button>
                          )}
                        </div>
                        {/* lado a lado também no celular: Largura × Comprimento, como se fala a medida */}
                        <div className="lxc">
                          <Campo rotulo="Largura (m)">
                            <input value={c.largura} inputMode="decimal" placeholder="Ex.: 4,60"
                                   onChange={(e) => mudarCompartimento(i, "largura", decimal(e.target.value))} />
                          </Campo>
                          <span className="vezes" aria-hidden="true">×</span>
                          <Campo rotulo="Comprimento (m)">
                            <input value={c.comprimento} inputMode="decimal" placeholder="Ex.: 5"
                                   onChange={(e) => mudarCompartimento(i, "comprimento", decimal(e.target.value))} />
                          </Campo>
                        </div>
                        {/* outro forro só neste compartimento: ex.: branco na casa, Cedro no beiral */}
                        {compartimentos.length > 1 && (
                          <Campo rotulo="Forro deste compartimento">
                            <select value={c.forro} onChange={(e) => mudarCompartimento(i, "forro", e.target.value)}>
                              <option value="">{forro ? `${forro.nome} (principal)` : "Forro principal (escolha abaixo)"}</option>
                              {listaForros.filter((f) => String(f.id) !== String(forroId)).map((f) => (
                                <option key={f.id} value={String(f.id)}>{f.nome}</option>
                              ))}
                            </select>
                          </Campo>
                        )}
                      </div>
                    ))}
                    <button type="button" className="btn mb" onClick={novoCompartimento}>
                      <Icone nome="mais" tamanho={14} /> Novo compartimento
                    </button>
                    <div className="calc">
                      <span>Área total</span>
                      <b>{areaFinal ? `${num(areaFinal)} m²` : "—"}</b>
                    </div>
                    {grupos.length > 1 && (
                      <div className="calcForros">
                        {grupos.map((g) => (
                          <span key={g.forro.id}>{g.forro.nome}: <b>{num(g.area)} m²</b></span>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="step">
                {passo(2, grupos.length > 1 ? "Tipo de forro (principal)" : "Tipo de forro")}
                <SeletorForro forros={listaForros} valor={forroId} aoMudar={alterou(setForroId)} />
                {grupos.length > 1 && (
                  <p className="nota">
                    Vale para os compartimentos sem outro forro marcado. Cada forro sai pelo seu
                    preço do m²; acabamento e estrutura valem para a casa toda.
                  </p>
                )}
                {forro && (
                  <div className="ref">
                    <Miniatura nome={forro.nome} cor={forro.cor_amostra} tamanho={64} className="grande" />
                    <div className="tx">Preço do m² — só o forro
                      <b>R$ {brl(forro.preco_material_vista)} à vista · R$ {brl(valorNoCartao(taxas.dados, forro.preco_material_vista))} cartão</b>
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
                        <Miniatura nome={a.nome} tamanho={58} className="acab" />
                        <span className="t">{a.nome}</span>
                        <span className={`v${Number(a.acrescimo_m2) ? "" : " z"}`}>
                          {Number(a.acrescimo_m2) ? `+ R$ ${brl(a.acrescimo_m2)}/m²` : "Incluso"}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {tipo === "instalado" && listaEstruturas.length > 0 && (
                <div className="step">
                  {passo(5, "Estrutura")}
                  <div className="opts">
                    {listaEstruturas.map((e) => (
                      <label key={e.id} className={`opt${String(estrutura?.id) === String(e.id) ? " on" : ""}`}>
                        <input type="radio" name="estr" checked={String(estrutura?.id) === String(e.id)}
                               onChange={() => alterou(setEstruturaId)(String(e.id))} />
                        <Miniatura nome={e.nome} tamanho={58} className="acab" />
                        <span className="t">{e.nome}</span>
                        <span className={`v${Number(e.acrescimo_m2) ? "" : " z"}${Number(e.acrescimo_m2) < 0 ? " abate" : ""}`}>
                          {Number(e.acrescimo_m2) > 0 ? `+ R$ ${brl(e.acrescimo_m2)}/m²`
                            : Number(e.acrescimo_m2) < 0
                              ? `− R$ ${brl(-e.acrescimo_m2)}/m²${areaFinal ? ` (abate R$ ${brl(areaFinal * -e.acrescimo_m2)})` : ""}`
                              : "Incluso"}
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
                          {imagemDe(m.nome) && <Miniatura nome={m.nome} tamanho={48} className="acab" />}
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
                                     setQuantidades((s) => ({ ...s, [m.id]: decimal(e.target.value) }));
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
                               onChange={(e) => alterou(setTotalServico)(decimal(e.target.value))} />
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
                  {passo(tipo === "instalado" ? 6 : 5, "Outros")}
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
                               onChange={(ev) => mudarExtra(i, "valor", decimal(ev.target.value))} />
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

              {tipo && (
                <div className="step">
                  {passo(tipo === "instalado" ? 7 : 6, "Desconto")}
                  <Campo rotulo="Desconto (R$)" erro={descontoDemais ? "Maior que o valor à vista do orçamento." : ""}
                         dica={doc && valorDesconto > 0
                           ? `À vista R$ ${brl(doc.subtotalVista)} → R$ ${brl(doc.totalVista)}; o cartão é calculado sobre o valor com desconto.`
                           : "Opcional. Abate do total à vista; o cartão é calculado sobre o valor com desconto."}>
                    <div className="campoReais">
                      <span className="cifrao">R$</span>
                      <input value={desconto} placeholder="0,00" inputMode="decimal"
                             onChange={(e) => alterou(setDesconto)(decimal(e.target.value))} />
                    </div>
                  </Campo>
                </div>
              )}

              <div className="step">
                {passo(tipo === "instalado" ? 8 : tipo ? 7 : 6, "Observações")}
                <Campo rotulo="Observações"
                       dica={v ? `Cliente da visita: ${v.cliente_detalhe?.nome}.`
                         : "Os dados do cliente são pedidos só na hora de fechar o negócio."}>
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
                    {visitaId && (
                      <BotaoAcao classe="btn verde" aoClicar={salvarEFechar}>
                        <Icone nome="ordem" tamanho={15} /> {salvo ? "Gerar serviço" : "Salvar e gerar serviço"}
                      </BotaoAcao>
                    )}
                    {salvo ? (
                      // travado enquanto nada mudar: o mesmo documento não se salva duas vezes
                      <button className="btn ok" disabled>
                        ✓ Salvo — {salvo.numero}
                      </button>
                    ) : (
                      <BotaoAcao classe={visitaId ? "btn" : "btn p"} aoClicar={salvar}>
                        <Icone nome="salvar" tamanho={15} />
                        {alvoId ? " Salvar alterações" : " Salvar orçamento"}
                      </BotaoAcao>
                    )}
                    {!visitaId && (
                      <BotaoAcao aoClicar={salvarEFechar}>
                        <Icone nome="fechado" tamanho={15} /> {salvo ? "Fechar negócio" : "Salvar e fechar negócio"}
                      </BotaoAcao>
                    )}
                    <button className="btn" onClick={() => navegar(voltarPara)}>
                      {visitaId ? "Voltar para visitas" : "Voltar para orçamentos"}
                    </button>
                  </div>
                  {visitaId ? (
                    <p className="grupoNota">
                      <b>Salvar e gerar serviço</b> grava o orçamento na visita e abre a Ordem de Serviço
                      para agendar. <b>Salvar</b> só guarda — o cliente ainda vai pensar; o serviço
                      sai depois pelo botão Gerar Serviço da visita.
                    </p>
                  ) : (
                    <p className="grupoNota">
                      <b>Salvar</b> guarda a proposta sem cliente e libera o envio abaixo.
                      <b> Fechar negócio</b> já pede os dados do cliente e gera a Ordem de Serviço.
                    </p>
                  )}
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
