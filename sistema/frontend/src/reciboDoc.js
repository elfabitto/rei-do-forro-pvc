/**
 * Recibo do cliente, emitido na finalização da O.S.
 *
 * Mesmo desenho da imagem da O.S. (osDoc.js), com o que o cliente precisa:
 * de quem recebemos, quanto (com o valor por extenso), por qual serviço e como
 * foi pago. Sai como PNG (para o WhatsApp) ou PDF — o PDF é montado aqui mesmo,
 * com a imagem dentro de uma página A4, sem biblioteca.
 */
import fonteAssinatura from "./fontes/mrs-saint-delafield.woff2";
import { LOGO } from "./logo";

const brl = (n) =>
  Number(n ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const m2 = (n) => Number(n ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const dataBR = (s) => (s ? new Date(String(s).length === 10 ? s + "T00:00:00" : s).toLocaleDateString("pt-BR") : "");

const logoImg = new Image();
const logoPronta = new Promise((ok) => {
  logoImg.onload = ok;
  logoImg.onerror = ok;
  logoImg.src = LOGO;
});
const FF = '"Segoe UI", Arial, Helvetica, sans-serif';

// fonte manuscrita da assinatura (Mrs Saint Delafield, licença OFL), empacotada com o
// sistema para sair igual em qualquer aparelho, mesmo offline
const CURSIVA = "Assinatura Rei do Forro";
const fontePronta = (async () => {
  try {
    const f = new FontFace(CURSIVA, `url(${fonteAssinatura})`);
    document.fonts.add(await f.load());
  } catch { /* sem a fonte, a assinatura sai na cursiva do sistema */ }
})();
const pronto = () => Promise.all([logoPronta, fontePronta]);

/** Dados da empresa que vão no recibo. */
export const EMPRESA = {
  nome: "Rei do Forro",
  cnpj: "34.914.999/0001-04",
  responsavel: "Felipe de Lima Marques",
};

/* ------------------------------------------------------------ valor por extenso */
const UNID = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez",
  "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const DEZ = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const CEM = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos",
  "setecentos", "oitocentos", "novecentos"];

/** 0 a 999 por extenso. */
function ate999(n) {
  if (n === 0) return "";
  if (n === 100) return "cem";
  const c = Math.floor(n / 100), r = n % 100;
  const partes = [];
  if (c) partes.push(CEM[c]);
  if (r < 20) { if (r) partes.push(UNID[r]); }
  else {
    const d = Math.floor(r / 10), u = r % 10;
    partes.push(u ? `${DEZ[d]} e ${UNID[u]}` : DEZ[d]);
  }
  return partes.join(" e ");
}

/** Inteiro até 999.999.999 por extenso. */
function inteiro(n) {
  if (n === 0) return "zero";
  const milhoes = Math.floor(n / 1e6), milhares = Math.floor((n % 1e6) / 1000), resto = n % 1000;
  const grupos = [];
  if (milhoes) grupos.push(milhoes === 1 ? "um milhão" : `${ate999(milhoes)} milhões`);
  if (milhares) grupos.push(milhares === 1 ? "mil" : `${ate999(milhares)} mil`);
  if (resto) grupos.push(ate999(resto));
  // "mil e duzentos", mas "mil duzentos e trinta": o "e" entra antes do último
  // grupo quando ele é redondo (centena exata) ou menor que cem
  if (grupos.length > 1 && resto && (resto < 100 || resto % 100 === 0)) {
    const ultimo = grupos.pop();
    return `${grupos.join(" ")} e ${ultimo}`;
  }
  return grupos.join(" ");
}

/** 1656.5 → "mil seiscentos e cinquenta e seis reais e cinquenta centavos" */
export function porExtenso(valor) {
  const total = Math.round(Number(valor) * 100);
  const reais = Math.floor(total / 100), centavos = total % 100;
  const partes = [];
  if (reais) {
    const de = reais % 1e6 === 0 ? " de" : "";   // "um milhão de reais"
    partes.push(`${inteiro(reais)}${de} ${reais === 1 ? "real" : "reais"}`);
  }
  if (centavos) partes.push(`${inteiro(centavos)} ${centavos === 1 ? "centavo" : "centavos"}`);
  return partes.length ? partes.join(" e ") : "zero reais";
}

/* ------------------------------------------------------------ conteúdo */
const formaTexto = (p) =>
  p.forma === "credito" && Number(p.parcelas) > 1 ? `${p.forma_display} ${p.parcelas}x` : p.forma_display;

export function montarRecibo(os) {
  const orc = os.orcamento_detalhe;
  const end = os.endereco_detalhe;
  const recebido = Number(os.total_pago ?? 0);
  const emissao = os.finalizada_em || new Date().toISOString();

  const servico = [os.tipo_display, orc?.forro_nome].filter(Boolean).join(" — ");
  const area = orc?.area_m2 ? `${m2(orc.area_m2)} m²` : "";
  const endereco = end
    ? [`${end.logradouro ?? ""}${end.numero ? `, ${end.numero}` : ""}`, end.bairro].filter(Boolean).join(" — ")
    : "";

  const d = {
    numero: os.numero,
    emissao: dataBR(emissao),
    cliente: os.cliente_detalhe?.nome ?? "",
    telefone: os.cliente_detalhe?.telefone ?? "",
    documento: os.cliente_detalhe?.documento ?? "",
    endereco,
    servico,
    area,
    desconto: Number(os.desconto ?? 0),
    recebido,
    extenso: porExtenso(recebido),
    pagamentos: (os.pagamentos ?? []).map((p) => ({
      forma: formaTexto(p), data: dataBR(p.data), valor: Number(p.valor),
    })),
  };

  d.declaracao = `Recebemos de ${d.cliente} a importância de R$ ${brl(recebido)} (${d.extenso}), `
    + `referente a ${servico || "serviço"}${area ? `, ${area}` : ""}, conforme a Ordem de Serviço ${os.numero}.`;

  d.texto = `*RECIBO — REI DO FORRO*
CNPJ ${EMPRESA.cnpj}
----------
${d.declaracao}

*PAGAMENTOS*
${d.pagamentos.map((p) => `• ${p.forma} (${p.data}) = R$ ${brl(p.valor)}`).join("\n")}
----------
*VALOR RECEBIDO: R$ ${brl(recebido)}*
Emitido em ${d.emissao}.
Obrigado pela preferência!`;

  return d;
}

/* ------------------------------------------------------------ imagem */
/** Quebra o texto em linhas que cabem em `max` pixels. */
function quebrar(x, texto, max) {
  const linhas = [];
  let atual = "";
  for (const palavra of texto.split(" ")) {
    const teste = atual ? `${atual} ${palavra}` : palavra;
    if (x.measureText(teste).width > max && atual) {
      linhas.push(atual);
      atual = palavra;
    } else atual = teste;
  }
  if (atual) linhas.push(atual);
  return linhas;
}

export function desenharRecibo(d) {
  const W = 1000, PAD = 56, MAX = W - PAD * 2;
  const C = { ink: "#15161a", ink2: "#464a52", muted: "#7c828d", line: "#e4e7eb",
              orange: "#ee6a1e", orangeDk: "#cf5513", orangeBg: "#fdf1e8" };
  const ls = (x, v) => { if (x.letterSpacing !== undefined) x.letterSpacing = v; };

  // mede a declaração antes, para saber a altura do canvas
  const medir = document.createElement("canvas").getContext("2d");
  medir.font = `400 23px ${FF}`;
  const decl = quebrar(medir, d.declaracao, MAX - 40);

  const blocos = [];
  const add = (h, draw) => blocos.push({ h, draw });

  const linha = (k, v, h = 48) => add(h, (x, y) => {
    x.textAlign = "left"; x.font = `700 17px ${FF}`; x.fillStyle = C.muted; ls(x, "1px");
    x.fillText(String(k).toUpperCase(), PAD, y);
    const wk = x.measureText(String(k).toUpperCase()).width;
    ls(x, "0px");
    x.textAlign = "right"; x.fillStyle = C.ink;
    let f = 22;
    do { x.font = `700 ${f}px ${FF}`; f -= 1; } while (x.measureText(String(v)).width > MAX - wk - 24 && f > 13);
    x.fillText(String(v), W - PAD, y);
    x.strokeStyle = C.line; x.lineWidth = 1;
    x.beginPath(); x.moveTo(PAD, y + 16.5); x.lineTo(W - PAD, y + 16.5); x.stroke();
  });
  const secao = (txt) => add(46, (x, y) => {
    x.textAlign = "left"; x.font = `800 18px ${FF}`; x.fillStyle = C.ink; ls(x, "1.4px");
    x.fillText(txt.toUpperCase(), PAD, y); ls(x, "0px");
  });

  // declaração em destaque
  const hDecl = 40 + decl.length * 34;
  add(hDecl + 24, (x, y) => {
    const top = y - 24;
    x.fillStyle = "#f7f8fa"; x.fillRect(PAD, top, MAX, hDecl);
    x.fillStyle = C.orange; x.fillRect(PAD, top, 5, hDecl);
    x.textAlign = "left"; x.font = `400 23px ${FF}`; x.fillStyle = C.ink;
    decl.forEach((l, i) => x.fillText(l, PAD + 24, top + 44 + i * 34));
  });

  secao("Cliente e serviço");
  linha("Cliente", d.cliente || "—");
  if (d.documento) linha("CPF/CNPJ", d.documento);
  if (d.telefone) linha("Telefone", d.telefone);
  if (d.endereco) linha("Endereço", d.endereco);
  linha("Serviço", d.servico || "—");
  if (d.area) linha("Área", d.area);

  add(10, () => {});
  secao("Pagamentos");
  d.pagamentos.forEach((p) => linha(`${p.forma} · ${p.data}`, `R$ ${brl(p.valor)}`));
  if (d.desconto > 0) linha("Desconto concedido", `R$ ${brl(d.desconto)}`);

  const HEAD = 118, BAR = 56, TOT = 112, ASS = 198, FOOT = 54;
  const H = HEAD + BAR + 40 + blocos.reduce((s, b) => s + b.h, 0) + 20 + TOT + ASS + FOOT;

  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const x = cv.getContext("2d");
  x.fillStyle = "#fff"; x.fillRect(0, 0, W, H);

  /* cabeçalho */
  if (logoImg.naturalWidth) x.drawImage(logoImg, PAD - 10, 12, 92, 92);
  x.textAlign = "left"; x.font = `800 26px ${FF}`;
  const bx = PAD + 92, t1 = "REI DO ", w1 = x.measureText(t1).width;
  x.fillStyle = C.ink; x.fillText(t1, bx, 56);
  x.fillStyle = C.orange; x.fillText("FORRO", bx + w1, 56);
  x.font = `600 15px ${FF}`; x.fillStyle = C.muted; ls(x, "2px");
  x.fillText("FORRO DE PVC", bx, 80);
  ls(x, "0px"); x.font = `600 15px ${FF}`; x.fillStyle = C.ink2;
  x.fillText(`CNPJ ${EMPRESA.cnpj}`, bx, 102);
  x.textAlign = "right"; x.font = `800 30px ${FF}`; x.fillStyle = C.ink; ls(x, "4px");
  x.fillText("RECIBO", W - PAD, 66);
  ls(x, "0px");

  /* faixa: número e data */
  x.fillStyle = C.ink; x.fillRect(0, HEAD, W, BAR);
  x.textAlign = "left"; x.fillStyle = "#fff"; x.font = `800 21px ${FF}`; ls(x, "2px");
  x.fillText(d.numero, PAD, HEAD + 37);
  x.textAlign = "right"; x.fillStyle = C.orange; x.font = `700 19px ${FF}`; ls(x, "1px");
  x.fillText(`EMITIDO EM ${d.emissao}`, W - PAD, HEAD + 37);
  ls(x, "0px");

  let y = HEAD + BAR + 64;
  for (const b of blocos) { b.draw(x, y); y += b.h; }

  /* valor recebido */
  const ty = H - FOOT - ASS - TOT;
  x.fillStyle = C.orangeBg; x.fillRect(0, ty, W, TOT);
  x.fillStyle = C.orange; x.fillRect(0, ty, W, 4);
  x.textAlign = "left"; x.font = `800 19px ${FF}`; x.fillStyle = C.ink; ls(x, "1.4px");
  x.fillText("VALOR RECEBIDO", PAD, ty + 66);
  ls(x, "0px");
  x.textAlign = "right"; x.font = `800 44px ${FF}`; x.fillStyle = C.orangeDk;
  x.fillText(`R$ ${brl(d.recebido)}`, W - PAD, ty + 74);

  /* assinatura: o nome manuscrito sobre a linha, e por extenso embaixo */
  const ay = ty + TOT + 104;
  x.textAlign = "center"; x.fillStyle = "#000";
  x.font = `400 64px "${CURSIVA}", "Segoe Script", "Brush Script MT", cursive`;
  x.save();
  x.translate(W / 2, ay - 12); x.rotate(-0.03);   // leve inclinação de quem assina
  x.fillText(EMPRESA.responsavel, 0, 0);
  x.restore();
  x.strokeStyle = C.ink2; x.lineWidth = 1.5;
  x.beginPath(); x.moveTo(W / 2 - 240, ay); x.lineTo(W / 2 + 240, ay); x.stroke();
  x.font = `700 18px ${FF}`; x.fillStyle = C.ink;
  x.fillText(EMPRESA.responsavel.toUpperCase(), W / 2, ay + 40);
  x.font = `500 15px ${FF}`; x.fillStyle = C.muted;
  x.fillText(`${EMPRESA.nome} · CNPJ ${EMPRESA.cnpj}`, W / 2, ay + 64);

  /* rodapé */
  x.fillStyle = C.ink; x.fillRect(0, H - FOOT, W, FOOT);
  x.textAlign = "center"; x.font = `600 16px ${FF}`; x.fillStyle = "#a8aeb8";
  x.fillText("Obrigado pela preferência!", W / 2, H - 20);

  return cv;
}

/* ------------------------------------------------------------ PDF (A4, sem biblioteca) */
const enc = new TextEncoder();

/** Um PDF de uma página A4 com a imagem JPEG centralizada. */
function pdfComImagem(jpeg, larguraPx, alturaPx) {
  const PW = 595.28, PH = 841.89, M = 28;
  let w = PW - M * 2, h = (alturaPx * w) / larguraPx;
  if (h > PH - M * 2) { h = PH - M * 2; w = (larguraPx * h) / alturaPx; }
  const px = (PW - w) / 2, py = PH - M - h;

  const conteudo = `q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${px.toFixed(2)} ${py.toFixed(2)} cm /Im0 Do Q`;
  const partes = [];
  const offsets = [];
  let tamanho = 0;
  const push = (p) => { const b = typeof p === "string" ? enc.encode(p) : p; partes.push(b); tamanho += b.length; };
  const obj = (n, corpo) => { offsets[n] = tamanho; push(`${n} 0 obj\n`); corpo(); push("\nendobj\n"); };

  push("%PDF-1.4\n%âãÏÓ\n");
  obj(1, () => push("<< /Type /Catalog /Pages 2 0 R >>"));
  obj(2, () => push("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"));
  obj(3, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] `
    + "/Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>"));
  obj(4, () => {
    push(`<< /Type /XObject /Subtype /Image /Width ${larguraPx} /Height ${alturaPx} `
      + `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
    push(jpeg);
    push("\nendstream");
  });
  obj(5, () => push(`<< /Length ${conteudo.length} >>\nstream\n${conteudo}\nendstream`));

  const xref = tamanho;
  let tabela = "xref\n0 6\n0000000000 65535 f \n";
  for (let n = 1; n <= 5; n++) tabela += `${String(offsets[n]).padStart(10, "0")} 00000 n \n`;
  push(tabela);
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(partes, { type: "application/pdf" });
}

/* ------------------------------------------------------------ ações */
const paraBlob = (cv, tipo = "image/png", q) => new Promise((r) => cv.toBlob(r, tipo, q));
const nome = (d, ext) => `recibo-${d.numero.toLowerCase()}.${ext}`;

function baixar(blob, arquivo) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = arquivo;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

async function gerarPDF(d) {
  await pronto();
  const cv = desenharRecibo(d);
  const jpeg = new Uint8Array(await (await paraBlob(cv, "image/jpeg", 0.92)).arrayBuffer());
  return pdfComImagem(jpeg, cv.width, cv.height);
}

export async function previaRecibo(d) {
  await pronto();
  return desenharRecibo(d).toDataURL("image/png");
}

export async function baixarReciboPNG(d) {
  await pronto();
  baixar(await paraBlob(desenharRecibo(d)), nome(d, "png"));
  return "baixado";
}

export async function baixarReciboPDF(d) {
  baixar(await gerarPDF(d), nome(d, "pdf"));
  return "baixado";
}

/** Número do cliente no formato do wa.me: só dígitos, com 55 na frente. */
export function whatsDoCliente(telefone) {
  const dig = String(telefone ?? "").replace(/\D/g, "");
  if (dig.length < 10) return "";
  return dig.startsWith("55") && dig.length > 11 ? dig : `55${dig}`;
}

/**
 * Manda o recibo ao cliente.
 * Celular: compartilhamento nativo com o PDF (ou a imagem) anexado — escolhe-se
 * a conversa do cliente no WhatsApp. Computador: o link do WhatsApp não anexa
 * arquivo, então o PDF é baixado e a conversa do cliente abre com o texto,
 * para arrastar o arquivo para dentro.
 */
export async function enviarRecibo(d, formato = "pdf") {
  const blob = formato === "pdf" ? await gerarPDF(d) : await (async () => {
    await pronto();
    return paraBlob(desenharRecibo(d));
  })();
  const arquivo = new File([blob], nome(d, formato), { type: blob.type });

  if (navigator.canShare?.({ files: [arquivo] })) {
    try {
      await navigator.share({ files: [arquivo], text: `Recibo ${d.numero} — Rei do Forro` });
      return "enviado";
    } catch (e) {
      if (e.name === "AbortError") return "cancelado";
    }
  }

  baixar(blob, arquivo.name);
  const numero = whatsDoCliente(d.telefone);
  window.open(`https://wa.me/${numero}?text=${encodeURIComponent(d.texto)}`, "_blank", "noopener");
  return "arquivo baixado — anexe na conversa";
}
