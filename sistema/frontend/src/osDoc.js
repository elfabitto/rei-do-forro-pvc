/**
 * Imagem da Ordem de Serviço, para mandar no grupo do WhatsApp.
 *
 * Mesmo desenho do documento de orçamento (docs/ e orcamentoDoc.js), trocando
 * o conteúdo: cliente, endereço, agendamento e situação do pagamento.
 */
import { LOGO } from "./logo";

const brl = (n) =>
  Number(n ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dataBR = (s) => (s ? new Date(s + "T00:00:00").toLocaleDateString("pt-BR") : "—");

const logoImg = new Image();
const logoPronta = new Promise((ok) => {
  logoImg.onload = ok;
  logoImg.onerror = ok;
  logoImg.src = LOGO;
});
const FF = '"Segoe UI", Arial, Helvetica, sans-serif';

/** Reúne o que vai na imagem e no texto, a partir da O.S. da API. */
export function montarOS(os, { verFinanceiro = true } = {}) {
  const end = os.endereco_detalhe;
  const enderecoTxt = end
    ? [end.logradouro, end.numero].filter(Boolean).join(", ")
      + (end.complemento ? ` — ${end.complemento}` : "")
    : "—";

  const d = {
    numero: os.numero,
    status: os.status_display,
    atrasado: os.atrasado,
    cliente: os.cliente_detalhe?.nome ?? "",
    telefone: os.cliente_detalhe?.telefone ?? "",
    endereco: enderecoTxt,
    bairro: end?.bairro ?? "",
    link: end?.link_localizacao ?? "",
    entrega: os.entrega ? `${dataBR(os.entrega.data)} · ${os.entrega.turno_display}` : "—",
    instalacao: os.instalacao ? `${dataBR(os.instalacao.data)} · ${os.instalacao.turno_display}` : "",
    observacoes: os.observacoes ?? "",
    verFinanceiro,
    valor: os.valor_liquido ?? os.valor_total,
    pago: os.total_pago,
    saldo: os.saldo,
    modalidade: os.modalidade_display || "",
  };

  d.resumo = [
    ["Cliente", d.cliente],
    ["Telefone", d.telefone],
    ["Endereço", d.endereco],
    ["Bairro", d.bairro],
  ];

  d.agenda = [["Entrega", d.entrega]];
  if (d.instalacao) d.agenda.push(["Instalação", d.instalacao]);

  d.texto = `*ORDEM DE SERVIÇO ${d.numero}*
_${d.status}${d.atrasado ? " · ATRASADA" : ""}_
----------
*Cliente:* ${d.cliente}
*Telefone:* ${d.telefone}
*Endereço:* ${d.endereco}
*Bairro:* ${d.bairro}${d.link ? `\n*Localização:* ${d.link}` : ""}

*AGENDAMENTO*
📦 *Entrega:* ${d.entrega}${d.instalacao ? `\n🔧 *Instalação:* ${d.instalacao}` : ""}${
    verFinanceiro
      ? `\n----------\n*VALOR*${d.modalidade ? ` (${d.modalidade})` : ""}\nTotal: R$ ${brl(d.valor)}\nPago: R$ ${brl(d.pago)}\nSaldo: R$ ${brl(d.saldo)}`
      : ""
  }${d.observacoes ? `\n----------\n_${d.observacoes}_` : ""}`;

  return d;
}

export function desenharOS(d) {
  const W = 1000, PAD = 56;
  const C = { ink: "#15161a", ink2: "#464a52", muted: "#7c828d", line: "#e4e7eb",
              orange: "#ee6a1e", orangeDk: "#cf5513", orangeBg: "#fdf1e8",
              azul: "#2a78d6", vermelho: "#d03b3b", verde: "#0ca30c" };

  const blocos = [];
  const add = (h, draw) => blocos.push({ h, draw });
  const ls = (x, v) => { if (x.letterSpacing !== undefined) x.letterSpacing = v; };

  const encolher = (x, txt, max, base) => {
    let f = base;
    while (f > 14) { x.font = `700 ${f}px ${FF}`; if (x.measureText(txt).width <= max) break; f -= 1; }
    return f;
  };

  const linha = (k, v) => add(52, (x, y) => {
    x.textAlign = "left";
    x.font = `700 19px ${FF}`; x.fillStyle = C.muted; ls(x, "1px");
    x.fillText(k.toUpperCase(), PAD, y);
    const wk = x.measureText(k.toUpperCase()).width;
    ls(x, "0px");

    x.textAlign = "right"; x.fillStyle = C.ink;
    encolher(x, String(v), W - PAD * 2 - wk - 24, 25);
    x.fillText(String(v), W - PAD, y);

    x.strokeStyle = C.line; x.lineWidth = 1;
    x.beginPath(); x.moveTo(PAD, y + 16.5); x.lineTo(W - PAD, y + 16.5); x.stroke();
  });

  const secao = (txt) => add(46, (x, y) => {
    x.textAlign = "left"; x.font = `800 18px ${FF}`; x.fillStyle = C.ink; ls(x, "1.4px");
    x.fillText(txt.toUpperCase(), PAD, y); ls(x, "0px");
  });

  d.resumo.forEach(([k, v]) => linha(k, v || "—"));
  add(12, () => {});
  secao("Agendamento");
  d.agenda.forEach(([k, v]) => linha(k, v));

  if (d.observacoes) {
    add(12, () => {});
    secao("Observações");
    add(44, (x, y) => {
      x.textAlign = "left"; x.font = `400 19px ${FF}`; x.fillStyle = C.ink2;
      const max = W - PAD * 2;
      let txt = d.observacoes;
      while (x.measureText(txt).width > max && txt.length > 4) txt = txt.slice(0, -2);
      if (txt !== d.observacoes) txt = txt.slice(0, -1) + "…";
      x.fillText(txt, PAD, y);
    });
  }

  const HEAD = 118, BAR = 56, TOT = d.verFinanceiro ? 150 : 0, FOOT = 54;
  const H = HEAD + BAR + blocos.reduce((s, b) => s + b.h, 0) + 28 + TOT + FOOT;

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

  let y = HEAD + BAR + 44;
  for (const b of blocos) { b.draw(x, y); y += b.h; }

  /* valores */
  if (d.verFinanceiro) {
    const ty = H - FOOT - TOT;
    x.fillStyle = C.orangeBg; x.fillRect(0, ty, W, TOT);
    x.fillStyle = C.orange; x.fillRect(0, ty, W, 4);

    x.textAlign = "left"; x.font = `800 19px ${FF}`; x.fillStyle = C.ink2; ls(x, "1.2px");
    x.fillText(`VALOR TOTAL${d.modalidade ? ` — ${d.modalidade.toUpperCase()}` : ""}`, PAD, ty + 52);
    x.fillStyle = C.muted;
    x.fillText("PAGO", PAD, ty + 95);
    x.fillText("SALDO", PAD, ty + 128);
    ls(x, "0px");

    x.textAlign = "right";
    x.font = `800 42px ${FF}`; x.fillStyle = C.orangeDk;
    x.fillText(`R$ ${brl(d.valor)}`, W - PAD, ty + 58);
    x.font = `700 24px ${FF}`; x.fillStyle = C.ink2;
    x.fillText(`R$ ${brl(d.pago)}`, W - PAD, ty + 98);
    x.fillStyle = Number(d.saldo) > 0 ? C.vermelho : C.verde;
    x.fillText(`R$ ${brl(d.saldo)}`, W - PAD, ty + 131);
  }

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
 * Copia a imagem e abre o WhatsApp com o texto.
 * Não dá para anexar imagem pela URL do WhatsApp; o caminho possível é deixar a
 * imagem na área de transferência para o usuário colar na conversa.
 */
export async function compartilharOS(d) {
  await logoPronta;
  const blob = await paraBlob(desenharOS(d));
  const arquivo = new File([blob], nomeArquivo(d), { type: "image/png" });

  // celular: compartilhamento nativo manda a imagem direto
  if (navigator.canShare?.({ files: [arquivo] })) {
    try {
      await navigator.share({ files: [arquivo], text: d.texto });
      return "compartilhada";
    } catch (e) {
      if (e.name === "AbortError") return "cancelado";
    }
  }

  // computador: imagem na área de transferência + WhatsApp Web com o texto
  let copiou = false;
  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    copiou = true;
  } catch {
    baixar(blob, nomeArquivo(d));
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(d.texto)}`, "_blank", "noopener");
  return copiou ? "imagem copiada — cole no WhatsApp" : "imagem baixada";
}

export { brl };
