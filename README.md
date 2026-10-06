# Rei do Forro — Gerador de Orçamentos

Página estática, sem dependências, para gerar orçamentos de forro de PVC.

## Arquivos

| Arquivo | Função |
|---|---|
| `index.html` | A página inteira (HTML + CSS + JS) |
| `logo-data.js` | Logo embutida como data URI, usada na tela e no PNG exportado |
| `logo-rf.jpeg` | Logo original |
| `gerar-logo-data.js` | Regera `logo-data.js` quando a logo mudar (`node gerar-logo-data.js`) |

A logo é embutida em base64 porque o navegador bloqueia a exportação de um `canvas` que
contenha imagem de outra origem — com o data URI, o PNG é gerado inclusive abrindo o
`index.html` direto do disco, sem servidor.

## Como usar

1. Escolha **Área em m²** ou **Largura × Comprimento** (a área é calculada automaticamente).
2. Selecione o **tipo de forro** no menu suspenso.
3. Escolha o **acabamento**:
   - **Acabamento normal (Perfil)** — padrão, já incluso no preço
   - **Moldura (4 cm)** — soma R$ 4,00/m²
   - **Sanca (8 cm)** — soma R$ 8,00/m²
4. São gerados dois orçamentos — **Só o forro** e **Instalação completa**.

O acréscimo do acabamento entra no preço do m² nas duas modalidades, à vista e no cartão.

### Botões de cada orçamento

| Botão | O que faz |
|---|---|
| **Copiar imagem** | Copia o PNG para a área de transferência — é só colar no WhatsApp |
| **Copiar texto** | Copia o orçamento formatado para o WhatsApp (negrito `*assim*`) |
| **Baixar PNG** | Salva a imagem (ex.: `orcamento-branco-liso-brilhoso-so-o-forro-23m2.png`) |
| **WhatsApp** | Abre o WhatsApp com o texto já preenchido |

A imagem é desenhada por `canvas` no próprio navegador (1000px de largura), sem biblioteca externa.
Em navegadores sem suporte a copiar imagem para a área de transferência (Firefox, alguns iOS),
**Copiar imagem** faz o download no lugar.

## Publicar no GitHub Pages

```bash
git init
git add .
git commit -m "Gerador de orçamentos Rei do Forro"
git branch -M main
git remote add origin https://github.com/<usuario>/<repo>.git
git push -u origin main
```

Depois: **Settings → Pages → Source: Deploy from a branch → Branch: `main` / `(root)`**.
A página fica em `https://<usuario>.github.io/<repo>/`.

## Atualizar preços

A tabela fica no array `CATALOGO`, no `<script>` do `index.html`:

```js
{ nome:"BRANCO LISO BRILHOSO", forroVista:33.80, forroCartao:36.50, instVista:64.00, instCartao:69.00, cor:"..." }
```

`cor` é apenas o quadradinho de amostra na tela (qualquer valor CSS de `background`).
Os valores de moldura e sanca ficam nos `value` dos rádios de acabamento, no HTML.

## Tabela vigente (R$/m²)

| Forro | Só o forro (à vista / cartão) | Instalado (à vista / cartão) |
|---|---|---|
| Branco Germinado | 22,90 / 24,70 | 50,00 / 54,00 |
| Branco Liso Fosco | 24,00 / 25,90 | 54,00 / 58,30 |
| Branco Liso Brilhoso | 33,80 / 36,50 | 64,00 / 69,00 |
| Cedro T1 Liso | 41,00 / 44,30 | 71,00 / 76,50 |
| Freijó Germinado | 41,00 / 44,30 | 71,00 / 76,50 |
| Mogno Germinado | 41,00 / 44,30 | 71,00 / 76,50 |
| Freijó T1 Liso | 41,00 / 44,30 | 71,00 / 76,50 |
| Mogno Liso | 43,60 / 47,00 | 74,00 / 79,90 |
| Cerejeira Liso | 43,60 / 47,00 | 74,00 / 79,90 |
| Guaruba Liso | 43,60 / 47,00 | 74,00 / 79,90 |
| Adesivado Ipê Colonial | 46,00 / 49,70 | 80,00 / 86,40 |
| Adesivado Freijó Colonial | 46,00 / 49,70 | 80,00 / 86,40 |

Fonte: grade de catálogo da empresa (`GRADE-CATALOGO-2K.png`).
