/**
 * Documento do orçamento: texto para WhatsApp e imagem PNG.
 *
 * É a mesma estrutura e o mesmo desenho do gerador estático em docs/index.html —
 * o que muda é a origem dos dados, que aqui vêm da API em vez de um array fixo.
 */
import { LOGO } from "./logo";

const brl = (n) =>
  Number(n ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const m2 = (n) => Number(n ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const qtd = (n) => Number(n ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const cent = (n) => Math.round(Number(n) * 100) / 100;

/** Unidade de um item "Outro": valor fechado, sem quantidade a multiplicar. */
export const VERBA = "verba";
export const ehExtra = (i) => i.unidade === VERBA;

/* "1 dúzia" / "3,5 dúzias"; und e kg não flexionam */
export const unidadePlural = (q, u) => (u === "dúzia" && Number(q) > 1 ? "dúzias" : u);
export const quantidadeTexto = (q, u) => `${qtd(q)} ${unidadePlural(q, u)}`;

export const descricaoItem = (i) =>
  ehExtra(i)
    ? i.rotulo
    : `${i.rotulo} — ${quantidadeTexto(i.quantidade, i.unidade)} × R$ ${brl(i.preco)}`;

/**
 * Monta o documento a partir do que está na tela.
 * Devolve resumo, seções de linhas, totais e o texto do WhatsApp — a mesma
 * forma que `desenhar()` e o React consomem.
 *
 * `extras` são os itens "Outro": descrição livre e valor fechado, que existem
 * nos dois tipos de orçamento para o que não cabe na tabela.
 */
export function montarDocumento({ tipo, area, forro, acabamento, itens = [], extras = [] }) {
  const instalado = tipo === "instalado";
  const somaExtras = extras.reduce((s, e) => s + cent(e.valor), 0);
  const linhasExtras = extras.map((e) => [e.descricao, `R$ ${brl(cent(e.valor))}`]);

  const precoVista = Number(instalado ? forro.preco_instalado_vista : forro.preco_material_vista);
  const precoCartao = Number(instalado ? forro.preco_instalado_cartao : forro.preco_material_cartao);
  const acrescimo = instalado && acabamento ? Number(acabamento.acrescimo_m2) : 0;

  const m2Vista = precoVista + acrescimo;
  const m2Cartao = precoCartao + acrescimo;

  const doc = {
    tipo,
    titulo: instalado ? "INSTALAÇÃO COMPLETA" : "MATERIAL",
    area,
    forro: forro.nome,
    acabamento: instalado ? acabamento?.nome ?? "" : "",
    m2Vista,
    m2Cartao,
  };

  doc.resumo = [["Área", `${m2(area)} m²`], ["Forro", forro.nome]];
  if (instalado && acabamento) doc.resumo.push(["Acabamento", acabamento.nome]);

  /* Bloco de texto dos itens "Outro", usado nos dois tipos. */
  const textoExtras = linhasExtras.length
    ? "\n\n*OUTROS*\n" + extras.map((e) => `• ${e.descricao} = R$ ${brl(cent(e.valor))}`).join("\n")
    : "";

  if (instalado) {
    doc.secoes = [{
      titulo: "Valor do metro quadrado",
      linhas: [
        ["À vista", `R$ ${brl(m2Vista)}/m²`],
        ["No cartão", `R$ ${brl(m2Cartao)}/m²`],
      ],
    }];
    if (linhasExtras.length) {
      doc.secoes.push({
        titulo: "Outros",
        linhas: [
          [`Instalação ${m2(area)} m² × R$ ${brl(m2Vista)}/m²`, `R$ ${brl(cent(area * m2Vista))}`],
          ...linhasExtras,
        ],
      });
    }
    doc.obs = "";
    doc.totalVista = cent(area * m2Vista + somaExtras);
    doc.totalCartao = cent(area * m2Cartao + somaExtras);

    doc.texto = `*ORÇAMENTO — REI DO FORRO*
----------
*Área:* ${m2(area)}m²
*Forro:* ${forro.nome}
*Acabamento:* ${acabamento?.nome ?? "—"}

*INSTALAÇÃO COMPLETA*
_valor do metro quadrado_
*À vista*: R$ ${brl(m2Vista)}/m²
*No cartão*: R$ ${brl(m2Cartao)}/m²${textoExtras}
----------
*VALOR TOTAL*
💵 *À vista*: R$ ${brl(doc.totalVista)}
💳 *No cartão*: R$ ${brl(doc.totalCartao)}`;
  } else {
    const forroVista = cent(area * precoVista);
    const forroCartao = cent(area * precoCartao);
    const materiais = itens.reduce((s, i) => s + cent(i.quantidade * i.preco), 0);

    doc.secoes = [{
      titulo: "Itens do orçamento",
      linhas: [
        [`Forro ${m2(area)} m² × R$ ${brl(precoVista)}/m²`, `R$ ${brl(forroVista)}`],
        ...itens.map((i) => [descricaoItem(i), `R$ ${brl(cent(i.quantidade * i.preco))}`]),
      ],
    }];
    if (linhasExtras.length) doc.secoes.push({ titulo: "Outros", linhas: linhasExtras });

    doc.obs = `No cartão o forro sai a R$ ${brl(precoCartao)}/m² e os demais itens não têm acréscimo.`;
    doc.totalVista = cent(forroVista + materiais + somaExtras);
    doc.totalCartao = cent(forroCartao + materiais + somaExtras);

    const lista = [
      `• Forro ${m2(area)}m² × R$ ${brl(precoVista)}/m² = R$ ${brl(forroVista)}`,
      ...itens.map((i) => `• ${descricaoItem(i)} = R$ ${brl(cent(i.quantidade * i.preco))}`),
    ].join("\n");

    doc.texto = `*ORÇAMENTO DE MATERIAL — REI DO FORRO*
----------
*Área:* ${m2(area)}m²
*Forro:* ${forro.nome}

*ITENS*
${lista}${textoExtras}
----------
*VALOR TOTAL*
💵 *À vista*: R$ ${brl(doc.totalVista)}
💳 *No cartão*: R$ ${brl(doc.totalCartao)}

_${doc.obs}_`;
  }

  return doc;
}

/* ------------------------- imagem (canvas, sem biblioteca) ------------------------- */
const logoImg = new Image();
const logoPronta = new Promise((ok) => {
  logoImg.onload = ok;
  logoImg.onerror = ok;
  logoImg.src = LOGO;
});
const FF = '"Segoe UI", Arial, Helvetica, sans-serif';

export function desenhar(d) {
  const W = 1000, PAD = 56, MAXT = W - PAD * 2;
  const C = { ink: "#15161a", ink2: "#464a52", muted: "#7c828d", line: "#e4e7eb",
              orange: "#ee6a1e", orangeDk: "#cf5513", orangeBg: "#fdf1e8" };

  const itens = [];
  const add = (h, draw) => itens.push({ h, draw });
  const ls = (x, v) => { if (x.letterSpacing !== undefined) x.letterSpacing = v; };

  const cabe = (x, txt, max, base, peso) => {
    let f = base;
    while (f > 13) { x.font = `${peso} ${f}px ${FF}`; if (x.measureText(txt).width <= max) break; f -= 1; }
    return f;
  };

  const linha = (k, v, o = {}) => add(o.h || 56, (x, y) => {
    x.textAlign = "right";
    x.font = `${o.peso || 700} ${o.fv || 28}px ${FF}`;
    const wv = x.measureText(v).width;
    x.fillStyle = o.cor || C.ink;
    x.fillText(v, W - PAD, y);

    x.textAlign = "left";
    if (o.item) {
      x.fillStyle = C.ink2; cabe(x, k, MAXT - wv - 24, 21, 500);
      x.fillText(k, PAD, y);
    } else {
      x.fillStyle = C.muted; ls(x, "1px");
      x.font = `700 20px ${FF}`;
      x.fillText(k.toUpperCase(), PAD, y);
      ls(x, "0px");
    }
    x.strokeStyle = C.line; x.lineWidth = 1;
    x.beginPath(); x.moveTo(PAD, y + 17.5); x.lineTo(W - PAD, y + 17.5); x.stroke();
  });

  d.resumo.forEach(([k, v]) => linha(k, v, { fv: String(v).length > 22 ? 24 : 28 }));
  for (const secao of d.secoes) {
    add(14, () => {});
    add(50, (x, y) => {
      x.textAlign = "left"; x.font = `800 19px ${FF}`; x.fillStyle = C.ink; ls(x, "1.4px");
      x.fillText(secao.titulo.toUpperCase(), PAD, y); ls(x, "0px");
    });
    secao.linhas.forEach(([k, v]) => linha(k, v, { h: 50, fv: 24, item: k.length > 16 }));
  }
  if (d.obs) add(44, (x, y) => {
    x.textAlign = "left"; x.font = `400 18px ${FF}`; x.fillStyle = C.muted;
    x.fillText(d.obs, PAD, y + 4);
  });

  const HEAD = 118, BAR = 56, TOT = 176, FOOT = 54;
  const H = HEAD + BAR + itens.reduce((s, i) => s + i.h, 0) + 30 + TOT + FOOT;

  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const x = cv.getContext("2d");
  x.textBaseline = "alphabetic";
  x.fillStyle = "#fff"; x.fillRect(0, 0, W, H);

  if (logoImg.naturalWidth) x.drawImage(logoImg, PAD - 10, 12, 92, 92);
  x.textAlign = "left"; x.font = `800 26px ${FF}`;
  const bx = PAD + 92, t1 = "REI DO ", w1 = x.measureText(t1).width;
  x.fillStyle = C.ink; x.fillText(t1, bx, 56);
  x.fillStyle = C.orange; x.fillText("FORRO", bx + w1, 56);
  x.font = `600 15px ${FF}`; x.fillStyle = C.muted; ls(x, "2px");
  x.fillText("FORRO DE PVC", bx, 80);
  x.textAlign = "right"; x.font = `700 16px ${FF}`; x.fillStyle = C.muted;
  x.fillText("ORÇAMENTO", W - PAD, 60);
  ls(x, "0px");

  x.fillStyle = C.ink; x.fillRect(0, HEAD, W, BAR);
  x.textAlign = "left"; x.fillStyle = "#fff"; x.font = `800 22px ${FF}`; ls(x, "3px");
  x.fillText(d.titulo, PAD, HEAD + 37);
  x.textAlign = "right"; x.fillStyle = C.orange;
  x.fillText(`${m2(d.area)} M²`, W - PAD, HEAD + 37);
  ls(x, "0px");

  let y = HEAD + BAR + 46;
  for (const it of itens) { it.draw(x, y); y += it.h; }

  const ty = H - FOOT - TOT;
  x.fillStyle = C.orangeBg; x.fillRect(0, ty, W, TOT);
  x.fillStyle = C.orange; x.fillRect(0, ty, W, 4);
  x.textAlign = "left"; x.font = `800 20px ${FF}`; x.fillStyle = C.ink2; ls(x, "1.2px");
  x.fillText("TOTAL À VISTA", PAD, ty + 62);
  x.fillStyle = C.muted; x.fillText("TOTAL NO CARTÃO", PAD, ty + 130);
  ls(x, "0px");
  x.textAlign = "right";
  x.font = `800 54px ${FF}`; x.fillStyle = C.orangeDk;
  x.fillText(`R$ ${brl(d.totalVista)}`, W - PAD, ty + 70);
  x.font = `700 36px ${FF}`; x.fillStyle = C.ink2;
  x.fillText(`R$ ${brl(d.totalCartao)}`, W - PAD, ty + 136);

  x.fillStyle = C.ink; x.fillRect(0, H - FOOT, W, FOOT);
  x.textAlign = "center"; x.font = `600 16px ${FF}`; x.fillStyle = "#a8aeb8";
  x.fillText("Valores sujeitos a confirmação das medidas no local.", W / 2, H - 20);

  return cv;
}

const paraBlob = (cv) => new Promise((r) => cv.toBlob(r, "image/png"));

function nomeArquivo(d) {
  const acentos = new RegExp("[\\u0300-\\u036f]", "g");
  const slug = (s) => String(s).toLowerCase().normalize("NFD").replace(acentos, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `orcamento-${slug(d.titulo)}-${slug(d.forro)}-${slug(m2(d.area))}m2.png`;
}

function baixar(blob, nome) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/** Copia o PNG para a área de transferência; sem suporte, baixa o arquivo. */
export async function copiarImagem(doc) {
  await logoPronta;
  const blob = await paraBlob(desenhar(doc));
  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return "copiada";
  } catch {
    baixar(blob, nomeArquivo(doc));
    return "baixada";
  }
}

export async function baixarImagem(doc) {
  await logoPronta;
  baixar(await paraBlob(desenhar(doc)), nomeArquivo(doc));
  return "baixada";
}

export async function copiarTexto(doc) {
  try {
    await navigator.clipboard.writeText(doc.texto);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = doc.texto;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
  return "copiado";
}

export { brl, m2, qtd, cent };
