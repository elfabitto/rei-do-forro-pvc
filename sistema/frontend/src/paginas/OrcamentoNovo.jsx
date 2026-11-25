/**
 * Gerador de orçamento: tipo de forro → medida → tipo de orçamento → acabamento e estrutura
 * (Instalado) ou materiais (Material). Cada forro a mais ("+ Adicionar outro tipo de forro")
 * traz a sua própria medida — ex.: branco na casa por cômodos, Cedro no beiral em m².
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
  CORES_MATERIAL, SERVICO, VERBA, baixarImagem, brl, copiarImagem, copiarTexto, ehServico, montarDocumento,
  unidadePlural,
} from "../orcamentoDoc";

// a folha de PVC tem largura fixa: área = tamanho da folha × (0,20 × quantidade)
const LARGURA_FOLHA = 0.2;

const paraNumero = (v) => {
  const n = parseFloat(String(v).replace(/\./g, "").replace(",", "."));
  return isFinite(n) && n > 0 ? n : 0;
};

const COMPARTIMENTO_VAZIO = { nome: "", largura: "", comprimento: "" };

/* Em centímetros inteiros, para arredondar igual ao backend (área_dos_compartimentos). */
const emCm = (v) => Math.round(paraNumero(v) * 100);
const areaDe = (c) => Math.round((emCm(c.largura) * emCm(c.comprimento)) / 100) / 100;

/*
 * Um tipo de forro do orçamento com a sua medida. O 1º é o forro do orçamento; os
 * outros vão em forros_adicionais. Abre pedindo as medidas ao cliente; sem elas, é só
 * trocar para Área em m².
 */
const novoBloco = () => ({
  forroId: "", modo: "medidas", area: "", compartimentos: [{ ...COMPARTIMENTO_VAZIO }],
  tamanhoFolha: "", qtdFolhas: "",
});
// quantidade de folhas é contagem: só inteiro
const folhasDe = (b) => Math.floor(paraNumero(b.qtdFolhas));
function areaDoBloco(b) {
  if (b.modo === "area") return paraNumero(b.area);
  if (b.modo === "folhas") return Math.round(paraNumero(b.tamanhoFolha) * LARGURA_FOLHA * folhasDe(b) * 100) / 100;
  return Math.round(b.compartimentos.reduce((s, c) => s + areaDe(c), 0) * 100) / 100;
}
// só os preenchidos; o backend refaz a área a partir deles
const compartimentosDe = (b) => (b.modo === "medidas"
  ? b.compartimentos.filter((c) => areaDe(c) > 0).map((c) => ({
      nome: c.nome.trim(),
      largura: paraNumero(c.largura).toFixed(2),
      comprimento: paraNumero(c.comprimento).toFixed(2),
    }))
  : []);
const virgula = (n) => String(Number(n)).replace(".", ",");

/** Bloco da tela a partir do que está gravado (o 1º forro ou um de forros_adicionais). */
function blocoGravado({ forro, compartimentos, largura, comprimento, tamanho_folha, quantidade_folhas, area }) {
  const b = { ...novoBloco(), forroId: forro ? String(forro) : "" };
  if (tamanho_folha && quantidade_folhas) {
    return { ...b, modo: "folhas", tamanhoFolha: virgula(tamanho_folha), qtdFolhas: String(quantidade_folhas) };
  }
  if (compartimentos?.length) {
    return { ...b, compartimentos: compartimentos.map((c) => ({
      nome: c.nome ?? "", largura: virgula(c.largura), comprimento: virgula(c.comprimento),
    })) };
  }
  if (Number(largura) && Number(comprimento)) {   // orçamento de antes dos compartimentos
    return { ...b, compartimentos: [{ nome: "", largura: virgula(largura), comprimento: virgula(comprimento) }] };
  }
  return { ...b, modo: "area", area: virgula(area) };
}

/** A medida de um forro: Área em m², Largura × Comprimento (por área) ou Cálculo por folha. */
function MedidaDoForro({ bloco, mudar, rotuloTotal }) {
  const area = areaDoBloco(bloco);
  const mudarComp = (i, campo, valor) =>
    mudar({ compartimentos: bloco.compartimentos.map((c, k) => (k === i ? { ...c, [campo]: valor } : c)) });
  const comps = bloco.compartimentos;
  return (
    <>
      <div className="seg" style={{ marginBottom: 14 }}>
        <button type="button" className={bloco.modo === "area" ? "on" : ""}
                onClick={() => mudar({ modo: "area" })}>Área em m²</button>
        <button type="button" className={bloco.modo === "medidas" ? "on" : ""}
                onClick={() => mudar({ modo: "medidas" })}>Largura × Comprimento</button>
        <button type="button" className={bloco.modo === "folhas" ? "on" : ""}
                onClick={() => mudar({ modo: "folhas" })}>Cálculo por folha</button>
      </div>

      {bloco.modo === "area" ? (
        <Campo rotulo="Área (m²)"
               dica="Se o cliente tiver as medidas, prefira Largura × Comprimento: elas vão para a O.S.">
          <input value={bloco.area} onChange={(e) => mudar({ area: decimal(e.target.value) })}
                 inputMode="decimal" placeholder="Ex.: 23" />
        </Campo>
      ) : bloco.modo === "folhas" ? (
        <>
          <div className="two">
            <Campo rotulo="Tamanho da folha (m)">
              <input value={bloco.tamanhoFolha} onChange={(e) => mudar({ tamanhoFolha: decimal(e.target.value) })}
                     inputMode="decimal" placeholder="Ex.: 5" />
            </Campo>
            <Campo rotulo="Quantidade de folhas">
              <input value={bloco.qtdFolhas} onChange={(e) => mudar({ qtdFolhas: digitos(e.target.value).slice(0, 4) })}
                     inputMode="numeric" placeholder="Ex.: 20" />
            </Campo>
          </div>
          <div className="calc">
            <span>Área calculada · folha de 0,20 m</span>
            <b>{area ? `${num(area)} m²` : "—"}</b>
          </div>
        </>
      ) : (
        <>
          <p className="nota" style={{ marginTop: 0 }}>
            Peça as medidas ao cliente, se ele tiver. Não é obrigatório: sem elas, use Área em m².
          </p>
          {comps.map((c, i) => (
            <div className="compartimento" key={i}>
              {/* cabeçalho: "Área 1" (ou o nome dado) · m² · remover */}
              <div className="topo">
                <span className="tituloArea">{c.nome.trim() || `Área ${i + 1}`}</span>
                <b>{areaDe(c) ? `${num(areaDe(c))} m²` : "—"}</b>
                {comps.length > 1 && (
                  <button type="button" className="x" aria-label={`Remover área ${i + 1}`}
                          onClick={() => mudar({ compartimentos: comps.filter((_, k) => k !== i) })}>×</button>
                )}
              </div>
              <Campo rotulo="Nome do ambiente (opcional)">
                <input value={c.nome} maxLength={40} placeholder="Ex.: Sala, Quarto, Beiral"
                       onChange={(e) => mudarComp(i, "nome", e.target.value)} />
              </Campo>
              {/* lado a lado também no celular: Largura × Comprimento, como se fala a medida */}
              <div className="lxc">
                <Campo rotulo="Largura (m)">
                  <input value={c.largura} inputMode="decimal" placeholder="Ex.: 4,60"
                         onChange={(e) => mudarComp(i, "largura", decimal(e.target.value))} />
                </Campo>
                <span className="vezes" aria-hidden="true">×</span>
                <Campo rotulo="Comprimento (m)">
                  <input value={c.comprimento} inputMode="decimal" placeholder="Ex.: 5"
                         onChange={(e) => mudarComp(i, "comprimento", decimal(e.target.value))} />
                </Campo>
              </div>
            </div>
          ))}
          <button type="button" className="btn mb" onClick={() => mudar({ compartimentos: [...comps, { ...COMPARTIMENTO_VAZIO }] })}>
            <Icone nome="mais" tamanho={14} /> Adicionar área
          </button>
          <div className="calc">
            <span>{rotuloTotal}</span>
            <b>{area ? `${num(area)} m²` : "—"}</b>
          </div>
        </>
      )}
    </>
  );
}

/** Escolha do forro com a foto e o preço do m² — só o forro, à vista e no cartão. */
function EscolhaDoForro({ forros, valor, aoMudar, taxas }) {
  const forro = forros.find((f) => String(f.id) === String(valor));
  return (
    <>
      <SeletorForro forros={forros} valor={valor} aoMudar={aoMudar} />
      {forro && (
        <div className="ref">
          <Miniatura nome={forro.nome} cor={forro.cor_amostra} tamanho={64} className="grande" />
          <div className="tx">Preço do m² — só o forro
            <b>R$ {brl(forro.preco_material_vista)} à vista · R$ {brl(valorNoCartao(taxas, forro.preco_material_vista))} cartão</b>
          </div>
        </div>
      )}
    </>
  );
}

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

  // 1 e 2: os tipos de forro, cada um com a sua medida — o 1º é o forro do orçamento
  const [blocos, setBlocos] = useState(() => [novoBloco()]);

  // 3 em diante
  const [tipo, setTipo] = useState("");
  const [acabamentoId, setAcabamentoId] = useState("");
  const [estruturaId, setEstruturaId] = useState("");
  const [quantidades, setQuantidades] = useState({});
  // cor de perfil, moldura e sanca (material com tem_cor): { [id do material]: "Mogno" }; sem escolha = Branco
  const [cores, setCores] = useState({});
  // serviço, só no orçamento de Material: o sistema sugere área × R$ 25,00/m²,
  // mas o total é negociado. Campo vazio = usa o sugerido (e acompanha a área).
  const [servico, setServico] = useState(false);
  // m² do serviço (Material) e da instalação sem forro: vazio = o padrão de R$ 25,00, pode mudar
  const [m2Servico, setM2Servico] = useState("");
  // "Sem forro": o cliente já tem forro e material — orçamento só da instalação
  const [semForro, setSemForro] = useState(false);
  const [m2Instalacao, setM2Instalacao] = useState("");
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
    // m² diferente do padrão volta no campo; o padrão volta vazio (usa os R$ 25,00)
    const m2Campo = (v) => (Number(v) > 0 && Math.abs(Number(v) - SERVICO.precoM2) >= 0.005 ? brl(v) : "");
    setSemForro(!o.forro);
    setM2Instalacao(o.forro ? "" : m2Campo(o.preco_servico_m2));
    setAcabamentoId(o.acabamento ? String(o.acabamento) : "");
    setEstruturaId(o.estrutura ? String(o.estrutura) : "");
    setObservacoes(o.observacoes ?? "");
    setDesconto(Number(o.desconto) > 0 ? String(Number(o.desconto)).replace(".", ",") : "");
    // o 1º forro fica com a área dele (no detalhe por forro); a do orçamento é a soma de todos
    const areaPrincipal = o.por_forro?.length > 1
      ? o.por_forro.find((g) => g.forro === o.forro)?.area_m2 ?? o.area_m2
      : o.area_m2;
    // formato antigo (nov/2026): outro forro marcado num compartimento vira um bloco próprio
    const deOutro = (c) => c.forro && c.forro !== o.forro;
    const comps = o.compartimentos ?? [];
    const antigos = [...new Set(comps.filter(deOutro).map((c) => c.forro))].map((f) => blocoGravado({
      forro: f, compartimentos: comps.filter((c) => c.forro === f),
    }));
    setBlocos([
      blocoGravado({
        forro: o.forro, compartimentos: comps.filter((c) => !deOutro(c)), largura: o.largura,
        comprimento: o.comprimento, tamanho_folha: o.tamanho_folha, quantidade_folhas: o.quantidade_folhas,
        area: areaPrincipal,
      }),
      ...antigos,
      ...(o.forros_adicionais ?? []).map((b) => blocoGravado({ ...b, area: b.area_m2 })),
    ]);
    const q = {};
    const c = {};   // cores dos itens gravados
    const outros = [];
    let comServico = false;
    for (const item of o.itens ?? []) {
      if (ehServico(item)) {
        comServico = true;
        // o total gravado ÷ a área dá o m² cobrado
        setM2Servico(Number(o.area_m2) > 0 ? m2Campo(Number(item.total) / Number(o.area_m2)) : "");
      } else if (item.unidade === VERBA) {
        outros.push({ descricao: item.descricao, valor: String(Number(item.total)).replace(".", ",") });
      } else if (item.material) {
        // vírgula, não ponto: é o separador que o campo lê de volta
        q[item.material] = String(Number(item.quantidade)).replace(".", ",");
        if (item.cor) c[item.material] = item.cor;
      }
    }
    setQuantidades(q);
    setCores(c);
    setServico(comServico);
    setExtras(outros);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [original.dados, listaMateriais.length]);

  // mexer em qualquer bloco invalida o "já salvo": o documento mudou
  const mudarBloco = (k, mudanca) => {
    setSalvo(null);
    setBlocos((s) => s.map((b, j) => (j === k ? { ...b, ...mudanca } : b)));
  };
  const adicionarForro = () => { setSalvo(null); setBlocos((s) => [...s, novoBloco()]); };
  const removerForro = (k) => { setSalvo(null); setBlocos((s) => s.filter((_, j) => j !== k)); };
  // cada forro só uma vez: o seletor de um bloco não mostra os já escolhidos nos outros
  const forrosLivres = (k) => listaForros.filter(
    (f) => !blocos.some((b, j) => j !== k && String(b.forroId) === String(f.id))
  );
  const forroDe = (b) => listaForros.find((f) => String(f.id) === String(b.forroId));

  const principal = blocos[0];
  const forro = forroDe(principal);
  const areaFinal = Math.round(blocos.reduce((s, b) => s + areaDoBloco(b), 0) * 100) / 100;
  const blocosProntos = semForro
    ? areaDoBloco(principal) > 0
    : blocos.every((b) => forroDe(b) && areaDoBloco(b) > 0);
  // R$/m² da instalação sem forro; vazio = padrão
  const valorM2Instalacao = paraNumero(m2Instalacao) || SERVICO.precoM2;
  function marcarSemForro(marcado) {
    setSalvo(null);
    setSemForro(marcado);
    if (marcado) {
      // um bloco só, sem forro; o tipo é Instalado (só a instalação), sem acabamento nem estrutura
      setBlocos((s) => [{ ...s[0], forroId: "" }]);
      setTipo("instalado");
    } else if (tipo) {
      escolherTipo(tipo);   // volta com acabamento e estrutura padrão no Instalado
    }
  }
  // mais de um forro: cada um sai pelo seu m² ([] = um forro só, a conta de sempre)
  const grupos = useMemo(() => {
    if (blocos.length < 2) return [];
    return blocos.filter((b) => forroDe(b) && areaDoBloco(b) > 0).map((b) => ({
      forro: forroDe(b),
      area: areaDoBloco(b),
      ambientes: b.modo === "medidas"
        ? b.compartimentos.filter((c) => areaDe(c) > 0).map((c, i) => c.nome.trim() || `Área ${i + 1}`)
        : [],
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocos, listaForros]);

  const acabamento = listaAcabamentos.find((a) => String(a.id) === String(acabamentoId));
  // orçamento antigo sem estrutura = a padrão (acréscimo zero), como no backend
  const estruturaPadrao = listaEstruturas.find((e) => Number(e.acrescimo_m2) === 0);
  const estrutura = listaEstruturas.find((e) => String(e.id) === String(estruturaId))
    ?? (tipo === "instalado" ? estruturaPadrao : undefined);

  // itens escolhidos no cardápio (quantidade > 0)
  const itens = useMemo(
    () => listaMateriais
      .map((m) => ({
        ...m, quantidade: paraNumero(quantidades[m.id]), preco: Number(m.preco),
        cor: m.tem_cor ? cores[m.id] ?? CORES_MATERIAL[0] : "",
      }))
      .filter((m) => m.quantidade > 0),
    [listaMateriais, quantidades, cores]
  );

  // Serviço do Material: área × m² (R$ 25,00 por padrão, o vendedor pode mudar)
  const valorM2Servico = paraNumero(m2Servico) || SERVICO.precoM2;
  const valorServico = tipo === "material" && servico ? Math.round(areaFinal * valorM2Servico * 100) / 100 : 0;

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
  const completo = blocosProntos && tipo && (semForro || tipo === "material" || acabamento);
  const doc = completo
    ? montarDocumento({ tipo, area: areaFinal, forro, acabamento, estrutura, itens, extras: extrasValidos,
                        servico: valorServico, desconto: valorDesconto, taxas: taxas.dados, grupos,
                        semForro, precoServico: valorM2Instalacao })
    : null;
  const descontoDemais = doc && valorDesconto > (doc.subtotalVista ?? doc.totalVista);

  async function gravar() {
    if (descontoDemais) throw new Error("O desconto passa do valor à vista do orçamento.");
    const corpo = {
      tipo,
      // a área do orçamento é a de todos os forros; o backend refaz a partir das medidas
      area_m2: areaFinal.toFixed(2),
      // medida do 1º forro; o backend guarda largura/comprimento quando é uma área só
      compartimentos: compartimentosDe(principal),
      largura: null,
      comprimento: null,
      tamanho_folha: principal.modo === "folhas" ? paraNumero(principal.tamanhoFolha).toFixed(2) : null,
      quantidade_folhas: principal.modo === "folhas" ? folhasDe(principal) : null,
      forro: semForro ? null : forro.id,
      preco_servico_m2: semForro ? valorM2Instalacao.toFixed(2) : null,
      // os outros tipos de forro, cada um com a sua medida
      forros_adicionais: blocos.slice(1).map((b) => ({
        forro: Number(b.forroId),
        area_m2: areaDoBloco(b).toFixed(2),
        compartimentos: compartimentosDe(b),
        tamanho_folha: b.modo === "folhas" ? paraNumero(b.tamanhoFolha).toFixed(2) : null,
        quantidade_folhas: b.modo === "folhas" ? folhasDe(b) : null,
      })),
      acabamento: tipo === "instalado" && !semForro ? acabamento.id : null,
      estrutura: tipo === "instalado" && !semForro && estrutura ? estrutura.id : null,
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
              cor: i.cor,
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

  // Outros vem depois de Acabamento e Estrutura (Instalado) ou de Materiais (Material); sem forro, logo após o tipo
  const nOutros = semForro ? 4 : tipo === "instalado" ? 6 : 5;
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
                {passo(1, "Tipo de forro")}
                {!semForro && (
                  <EscolhaDoForro forros={forrosLivres(0)} valor={principal.forroId} taxas={taxas.dados}
                                  aoMudar={(id) => mudarBloco(0, { forroId: id })} />
                )}
                <div className="opts" style={{ marginTop: semForro ? 0 : 10 }}>
                  <label className={`opt${semForro ? " on" : ""}`}>
                    <input type="checkbox" checked={semForro} onChange={(e) => marcarSemForro(e.target.checked)} />
                    <span className="t">Sem forro
                      <small>O cliente já tem forro e material: orçar só a instalação</small>
                    </span>
                  </label>
                </div>
                {semForro && (
                  <Campo rotulo="Valor do m² da instalação (R$)"
                         dica={areaFinal
                           ? `${num(areaFinal)} m² × R$ ${brl(valorM2Instalacao)} = R$ ${brl(areaFinal * valorM2Instalacao)}. Em branco usa o padrão de R$ ${brl(SERVICO.precoM2)}.`
                           : `Padrão: R$ ${brl(SERVICO.precoM2)}/m². Mude se for combinado outro valor.`}>
                    <div className="campoReais">
                      <span className="cifrao">R$</span>
                      <input value={m2Instalacao} inputMode="decimal" placeholder={brl(SERVICO.precoM2)}
                             onChange={(e) => alterou(setM2Instalacao)(decimal(e.target.value))} />
                    </div>
                  </Campo>
                )}
              </div>

              <div className="step">
                {passo(2, blocos.length > 1 && forro ? `Medida — ${forro.nome}` : semForro ? "Medida da instalação" : "Medida")}
                <MedidaDoForro bloco={principal} mudar={(m) => mudarBloco(0, m)}
                               rotuloTotal={blocos.length > 1 ? "Área deste forro" : "Área total"} />

                {/* outros tipos de forro: cada um com o seu seletor e a sua medida */}
                {blocos.slice(1).map((b, j) => {
                  const k = j + 1;
                  return (
                    <div className="blocoForro" key={k}>
                      <div className="blocoForroTopo">
                        <span className="t">{k + 1}º tipo de forro</span>
                        <button type="button" className="x" aria-label={`Remover o ${k + 1}º tipo de forro`}
                                onClick={() => removerForro(k)}>×</button>
                      </div>
                      <EscolhaDoForro forros={forrosLivres(k)} valor={b.forroId} taxas={taxas.dados}
                                      aoMudar={(id) => mudarBloco(k, { forroId: id })} />
                      <div className="blocoForroMedida">Medida{forroDe(b) ? ` — ${forroDe(b).nome}` : ""}</div>
                      <MedidaDoForro bloco={b} mudar={(m) => mudarBloco(k, m)} rotuloTotal="Área deste forro" />
                    </div>
                  );
                })}

                {!semForro && (
                  <button type="button" className="btn maisForro" onClick={adicionarForro}>
                    <Icone nome="mais" tamanho={14} /> Adicionar outro tipo de forro
                  </button>
                )}

                {blocos.length > 1 && (
                  <>
                    <div className="calc total">
                      <span>Área total do orçamento</span>
                      <b>{areaFinal ? `${num(areaFinal)} m²` : "—"}</b>
                    </div>
                    <div className="calcForros">
                      {blocos.map((b, k) => (
                        <span key={k}>{forroDe(b)?.nome ?? `${k + 1}º forro`}: <b>{num(areaDoBloco(b))} m²</b></span>
                      ))}
                    </div>
                    <p className="nota">
                      Cada forro sai pelo seu preço do m²; acabamento e estrutura valem para todos.
                    </p>
                  </>
                )}
              </div>

              <div className="step">
                {passo(3, "Tipo de orçamento")}
                {semForro ? (
                  <div className="opts">
                    <label className="opt on">
                      <input type="radio" name="tipo" checked readOnly />
                      <span className="t">Só instalação
                        <small>Sem forro: a equipe instala o que o cliente já tem, preço por m²</small>
                      </span>
                    </label>
                  </div>
                ) : (
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
                )}
              </div>

              {tipo === "instalado" && !semForro && (
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

              {tipo === "instalado" && !semForro && listaEstruturas.length > 0 && (
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
                              {/* no celular o subtotal vem aqui, e a coluna da direita some */}
                              {q > 0 && <b className="sbm">R$ {brl(q * Number(m.preco))}</b>}
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
                        {/* perfil, moldura e sanca: a cor vai no orçamento e no texto do WhatsApp */}
                        {m.tem_cor && q > 0 && (
                          <label className="corMat">
                            <span>Cor</span>
                            <select value={cores[m.id] ?? CORES_MATERIAL[0]}
                                    aria-label={`${m.nome} — cor`}
                                    onChange={(e) => alterou(setCores)((s) => ({ ...s, [m.id]: e.target.value }))}>
                              {CORES_MATERIAL.map((c) => (
                                <option key={c} value={c}>{c}{c === CORES_MATERIAL[0] ? " (padrão)" : ""}</option>
                              ))}
                            </select>
                          </label>
                        )}
                      </div>
                    );
                  })}

                  <div className="matgrp">Serviço</div>
                  <div className="opts">
                    <label className={`opt${servico ? " on" : ""}`}>
                      <input type="checkbox" checked={servico}
                             onChange={(e) => alterou(setServico)(e.target.checked)} />
                      <span className="t">Serviço
                        <small>R$ {brl(valorM2Servico)}/m² sobre a área</small>
                      </span>
                      <span className="v">{servico && valorServico > 0 ? `R$ ${brl(valorServico)}` : ""}</span>
                    </label>
                    {servico && (
                      <Campo rotulo="Valor do m² do serviço (R$)"
                             dica={areaFinal
                               ? `${num(areaFinal)} m² × R$ ${brl(valorM2Servico)} = R$ ${brl(valorServico)}. Em branco usa o padrão de R$ ${brl(SERVICO.precoM2)}.`
                               : `Padrão: R$ ${brl(SERVICO.precoM2)}/m². Mude se for combinado outro valor.`}>
                        <div className="campoReais">
                          <span className="cifrao">R$</span>
                          <input value={m2Servico} inputMode="decimal" placeholder={brl(SERVICO.precoM2)}
                                 onChange={(e) => alterou(setM2Servico)(decimal(e.target.value))} />
                        </div>
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
                  {passo(nOutros, "Outros")}
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
                  {passo(nOutros + 1, "Desconto")}
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
                {passo(tipo ? nOutros + 2 : 4, "Observações")}
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
                  <li className={semForro || blocos.every(forroDe) ? "ok" : ""}>Escolher o tipo de forro</li>
                  <li className={blocos.every((b) => areaDoBloco(b) > 0) ? "ok" : ""}>Informar a medida</li>
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
