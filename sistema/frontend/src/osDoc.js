/**
 * Imagem da Ordem de Serviço, para mandar no grupo de gestão do WhatsApp.
 *
 * Mesmo desenho do documento de orçamento (docs/ e orcamentoDoc.js), com o
 * conteúdo da O.S.: tipo do serviço, cliente, pedido, agendamento, valor do m²
 * e a forma de pagamento que o cliente escolheu.
 */
import { LOGO } from "./logo";
import { periodoTexto } from "./agendaTexto";
import { VERBA, ehServico, quantidadeTexto } from "./orcamentoDoc";

const brl = (n) =>
  Number(n ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const m2 = (n) => Number(n ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });

const logoImg = new Image();
const logoPronta = new Promise((ok) => {
  logoImg.onload = ok;
  logoImg.onerror = ok;
  logoImg.src = LOGO;
});
const FF = '"Segoe UI", Arial, Helvetica, sans-serif';

/** O que foi lançado de ripão, somando os itens do orçamento de Material. */
export function resumoRipao(itens = []) {
  const ripoes = itens.filter((i) => /rip[ãa]o/i.test(i.descricao ?? ""));
  if (!ripoes.length) return "";
  return ripoes
    .map((i) => `${quantidadeTexto(i.quantidade, i.unidade)} — `
      + String(i.descricao).replace(/^Ripão 4 m\s*/i, ""))
    .join(" · ");
}

/** Plastilon lançado no orçamento de Material (por unidade), para a ficha do pedido. */
export function resumoPlastilon(itens = []) {
  const q = itens.filter((i) => /pl?astilon/i.test(i.descricao ?? ""))
    .reduce((s, i) => s + Number(i.quantidade || 0), 0);
  return q ? quantidadeTexto(q, "und") : "";
}

/** Itens "Outro" do orçamento: descrição e valor fechado. */
export const itensExtras = (itens = []) => itens.filter((i) => i.unidade === VERBA);

/** Reúne o que vai na imagem e no texto, a partir da O.S. da API. */
export function montarOS(os, { verFinanceiro = true } = {}) {
  const end = os.endereco_detalhe;
  const orc = os.orcamento_detalhe;

  const enderecoTxt = end
    ? [end.logradouro, end.numero].filter(Boolean).join(", ")
      + (end.complemento ? ` — ${end.complemento}` : "")
    : "—";

  const d = {
    numero: os.numero,
    status: os.status_display,
    tipo: os.tipo_display || (os.tipo === "material" ? "Fornecimento de Material" : "Instalação Completa"),
    atrasado: os.atrasado,
    cliente: os.cliente_detalhe?.nome ?? "",
    telefone: os.cliente_detalhe?.telefone ?? "",
    endereco: enderecoTxt,
    bairro: end?.bairro ?? "",
    cidade: end?.cidade ?? "",
    entrega: os.entrega ? periodoTexto(os.entrega) : "",
    instalacao: os.instalacao ? periodoTexto(os.instalacao) : "",
    observacoes: os.observacoes ?? "",
    verFinanceiro,
    modalidade: os.modalidade_display || "",
    valor: os.valor_liquido ?? os.valor_total,
    pago: os.total_pago,
    saldo: os.saldo,
    vendedor: os.vendedor_nome ?? "",
  };

  /* ---- informações do cliente ---- */
  d.cliente_linhas = [
    ["Cliente", d.cliente],
    ["Telefone", d.telefone],
    ["Endereço", d.endereco],
    ["Bairro", d.bairro],
    ...(d.cidade ? [["Cidade", d.cidade]] : []),
  ];

  /* ---- informações do pedido ---- */
  d.pedido = [];
  if (orc) {
    d.pedido.push(["Área", `${m2(orc.area_m2)} m²`]);
    // como a área foi tirada: medidas do cômodo ou contagem de folhas
    if (Number(orc.largura) > 0 && Number(orc.comprimento) > 0) {
      d.pedido.push(["Medidas", `${m2(orc.largura)} m × ${m2(orc.comprimento)} m`]);
    } else if (Number(orc.tamanho_folha) > 0 && Number(orc.quantidade_folhas) > 0) {
      const q = Number(orc.quantidade_folhas);
      d.pedido.push(["Folhas", `${q} folha${q > 1 ? "s" : ""} de ${m2(orc.tamanho_folha)} m`]);
    }
    d.pedido.push(["Forro", orc.forro_nome ?? "—"]);
    if (orc.acabamento_nome) d.pedido.push(["Acabamento", orc.acabamento_nome]);
    if (orc.estrutura_nome) d.pedido.push(["Estrutura", orc.estrutura_nome]);
    const ripao = resumoRipao(orc.itens);
    if (ripao) d.pedido.push(["Ripão", ripao]);
    const plastilon = resumoPlastilon(orc.itens);
    if (plastilon) d.pedido.push(["Plastilon", plastilon]);
    const servico = orc.itens?.find(ehServico);
    if (servico) d.pedido.push(["Serviço", `${m2(orc.area_m2)} m² — R$ ${brl(servico.total)}`]);
    if (Number(orc.taxa_logistica) > 0) {
      d.pedido.push(["Logística", `R$ ${brl(orc.taxa_logistica)}`]);
    }
    for (const extra of itensExtras(orc.itens)) {
      d.pedido.push([extra.descricao, `R$ ${brl(extra.total)}`]);
    }
    if (Number(orc.desconto) > 0) d.pedido.push(["Desconto", `− R$ ${brl(orc.desconto)}`]);

    d.m2Vista = Number(orc.preco_m2_vista);
    d.m2Cartao = Number(orc.preco_m2_cartao);
  }

  /* ---- agendamento ---- */
  d.agenda = [];
  if (d.entrega) d.agenda.push(["Entrega", d.entrega]);
  if (d.instalacao) d.agenda.push(["Instalação", d.instalacao]);
  if (!d.agenda.length) d.agenda.push(["Agendamento", "—"]);

  /* ---- texto do WhatsApp ---- */
  const bloco = (titulo, pares) =>
    pares.length ? `\n*${titulo}*\n` + pares.map(([k, v]) => `${k}: ${v || "—"}`).join("\n") : "";

  d.texto = `*ORDEM DE SERVIÇO ${d.numero}*
_${d.tipo.toUpperCase()}${d.atrasado ? " · ATRASADA" : ""}_
Situação: ${d.status}
----------${bloco("INFORMAÇÕES DO CLIENTE", d.cliente_linhas)}${bloco("INFORMAÇÕES DO PEDIDO", d.pedido)}${bloco("AGENDAMENTO", d.agenda)}${
    d.m2Vista
      ? `\n*VALOR DO M²*\nÀ vista: R$ ${brl(d.m2Vista)}/m²\nNo cartão: R$ ${brl(d.m2Cartao)}/m²`
      : ""
  }
*INFORMAÇÕES DE PAGAMENTO*
Tipo: ${d.modalidade || "a definir"}
Total: R$ ${brl(d.valor)}${
    verFinanceiro && Number(d.saldo) > 0 ? `\nPago: R$ ${brl(d.pago)}\nSaldo: R$ ${brl(d.saldo)}` : ""
  }${d.observacoes ? `\n----------\n_${d.observacoes}_` : ""}`;

  return d;
}

export function desenharOS(d) {
  const W = 1000, PAD = 56;
  const C = { ink: "#15161a", ink2: "#464a52", muted: "#7c828d", line: "#e4e7eb",
              orange: "#ee6a1e", orangeDk: "#cf5513", orangeBg: "#fdf1e8",
              vermelho: "#d03b3b", verde: "#0ca30c" };

  const blocos = [];
  const add = (h, draw) => blocos.push({ h, draw });
  const ls = (x, v) => { if (x.letterSpacing !== undefined) x.letterSpacing = v; };

  const encolher = (x, txt, max, base) => {
    let f = base;
    while (f > 14) { x.font = `700 ${f}px ${FF}`; if (x.measureText(txt).width <= max) break; f -= 1; }
    return f;
  };

  const linha = (k, v) => add(50, (x, y) => {
    x.textAlign = "left";
    x.font = `700 18px ${FF}`; x.fillStyle = C.muted; ls(x, "1px");
    x.fillText(String(k).toUpperCase(), PAD, y);
    const wk = x.measureText(String(k).toUpperCase()).width;
    ls(x, "0px");

    x.textAlign = "right"; x.fillStyle = C.ink;
    encolher(x, String(v), W - PAD * 2 - wk - 24, 24);
    x.fillText(String(v), W - PAD, y);

    x.strokeStyle = C.line; x.lineWidth = 1;
    x.beginPath(); x.moveTo(PAD, y + 16.5); x.lineTo(W - PAD, y + 16.5); x.stroke();
  });

  const secao = (txt) => add(48, (x, y) => {
    x.textAlign = "left"; x.font = `800 18px ${FF}`; x.fillStyle = C.ink; ls(x, "1.4px");
    x.fillText(txt.toUpperCase(), PAD, y); ls(x, "0px");
  });

  secao("Informações do cliente");
  d.cliente_linhas.forEach(([k, v]) => linha(k, v || "—"));

  if (d.pedido.length) {
    add(10, () => {});
    secao("Informações do pedido");
    d.pedido.forEach(([k, v]) => linha(k, v));
  }

  add(10, () => {});
  secao("Agendamento");
  d.agenda.forEach(([k, v]) => linha(k, v));

  if (d.m2Vista) {
    add(10, () => {});
    secao("Valor do metro quadrado");
    linha("À vista", `R$ ${brl(d.m2Vista)}/m²`);
    linha("No cartão", `R$ ${brl(d.m2Cartao)}/m²`);
  }

  if (d.observacoes) {
    add(10, () => {});
    secao("Observações");
    add(42, (x, y) => {
      x.textAlign = "left"; x.font = `400 19px ${FF}`; x.fillStyle = C.ink2;
      const max = W - PAD * 2;
      let txt = d.observacoes;
      while (x.measureText(txt).width > max && txt.length > 4) txt = txt.slice(0, -2);
      if (txt !== d.observacoes) txt = txt.slice(0, -1) + "…";
      x.fillText(txt, PAD, y);
    });
  }

  const HEAD = 118, BAR = 56, TIPO = 46, TOT = 150, FOOT = 54;
  const H = HEAD + BAR + TIPO + blocos.reduce((s, b) => s + b.h, 0) + 26 + TOT + FOOT;

  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const x = cv.getContext("2d");
  x.textBaseline = "alphabetic";
  x.fillStyle = "#fff"; x.fillRect(0, 0, W, H);

  /* cabeçalho */
  if (logoImg.naturalWidth) x.drawImage(logoImg, PAD - 10, 12, 92, 92);
  x.textAlign = "left"; x.font = `800 26px ${FF}`;
  const bx = PAD + 92, t1 = "REI DO ", w1 = x.measureText(t1).width;
  x.fillStyle = C.ink; x.fillText(t1, bx, 56);
  x.fillStyle = C.orange; x.fillText("FORRO", bx + w1, 56);
  x.font = `600 15px ${FF}`; x.fillStyle = C.muted; ls(x, "2px");
  x.fillText("FORRO DE PVC", bx, 80);
  x.textAlign = "right"; x.font = `700 16px ${FF}`; x.fillStyle = C.muted;
  x.fillText("ORDEM DE SERVIÇO", W - PAD, 60);
  ls(x, "0px");

  /* faixa com número e situação */
  x.fillStyle = C.ink; x.fillRect(0, HEAD, W, BAR);
  x.textAlign = "left"; x.fillStyle = "#fff"; x.font = `800 22px ${FF}`; ls(x, "3px");
  x.fillText(d.numero, PAD, HEAD + 37);
  ls(x, "1.4px");
  x.textAlign = "right";
  x.fillStyle = d.atrasado ? "#ff8a8a" : C.orange;
  x.font = `800 20px ${FF}`;
  x.fillText(d.atrasado ? `${d.status.toUpperCase()} · ATRASADA` : d.status.toUpperCase(), W - PAD, HEAD + 37);
  ls(x, "0px");

  /* tipo do serviço, logo abaixo do número */
  x.fillStyle = C.orangeBg; x.fillRect(0, HEAD + BAR, W, TIPO);
  x.textAlign = "center"; x.font = `800 19px ${FF}`; x.fillStyle = C.orangeDk; ls(x, "2px");
  x.fillText(d.tipo.toUpperCase(), W / 2, HEAD + BAR + 30);
  ls(x, "0px");

  let y = HEAD + BAR + TIPO + 40;
  for (const b of blocos) { b.draw(x, y); y += b.h; }

  /* informações de pagamento */
  const ty = H - FOOT - TOT;
  x.fillStyle = C.orangeBg; x.fillRect(0, ty, W, TOT);
  x.fillStyle = C.orange; x.fillRect(0, ty, W, 4);

  x.textAlign = "left"; x.font = `800 18px ${FF}`; x.fillStyle = C.ink; ls(x, "1.4px");
  x.fillText("INFORMAÇÕES DE PAGAMENTO", PAD, ty + 38);
  x.font = `700 18px ${FF}`; x.fillStyle = C.muted;
  x.fillText("FORMA ESCOLHIDA", PAD, ty + 78);
  x.fillText("TOTAL", PAD, ty + 118);
  ls(x, "0px");

  x.textAlign = "right";
  x.font = `700 24px ${FF}`; x.fillStyle = C.ink;
  x.fillText(d.modalidade || "a definir", W - PAD, ty + 82);
  x.font = `800 42px ${FF}`; x.fillStyle = C.orangeDk;
  x.fillText(`R$ ${brl(d.valor)}`, W - PAD, ty + 126);

  /* rodapé */
  x.fillStyle = C.ink; x.fillRect(0, H - FOOT, W, FOOT);
  x.textAlign = "center"; x.font = `600 16px ${FF}`; x.fillStyle = "#a8aeb8";
  x.fillText("Rei do Forro — controle interno de serviços", W / 2, H - 20);

  return cv;
}

const paraBlob = (cv) => new Promise((r) => cv.toBlob(r, "image/png"));

function baixar(blob, nome) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

const nomeArquivo = (d) => `${d.numero.toLowerCase()}.png`;

export async function copiarImagemOS(d) {
  await logoPronta;
  const blob = await paraBlob(desenharOS(d));
  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return "copiada";
  } catch {
    baixar(blob, nomeArquivo(d));
    return "baixada";
  }
}

export async function baixarImagemOS(d) {
  await logoPronta;
  baixar(await paraBlob(desenharOS(d)), nomeArquivo(d));
  return "baixada";
}

/**
 * WhatsApp só com o texto — pedido da diretoria. A imagem continua nos botões
 * de copiar e baixar PNG.
 */
export function abrirWhatsApp(texto) {
  window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank", "noopener");
  return "WhatsApp aberto";
}

export const compartilharOS = (d) => abrirWhatsApp(d.texto);

export { brl, m2 };
