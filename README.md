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

1. **Medida** — informe a área em m² ou largura × comprimento (a área é calculada).
2. **Tipo de forro** — o menu começa em "Selecione o tipo de forro"; nenhum vem marcado.
3. **Tipo de orçamento** — Material ou Instalado. É gerado **um** orçamento por vez, conforme a escolha.
4. A quarta etapa muda conforme o tipo escolhido (veja abaixo).

### Instalado

Preço por m² da coluna *instalado* da tabela, mais o acabamento:

| Acabamento | Acréscimo |
|---|---|
| Acabamento normal (Perfil) | incluso, sem acréscimo |
| Moldura (4 cm) | + R$ 4,00/m² |
| Sanca (8 cm) | + R$ 8,00/m² |

O acréscimo entra no preço do m² tanto à vista quanto no cartão.
**O acabamento não existe no orçamento de Material** — lá cada peça é cobrada por unidade.

### Material

O forro continua pela tabela por m² (coluna *só o forro*), e a pessoa monta a lista de materiais
informando a quantidade de cada item:

| Item | Lançado em | Preço aplicado | Cotação de tabela |
|---|---|---|---|
| Perfil 6 m | und | R$ 25,00 | — |
| Moldura 6 m | und | R$ 40,00 | — |
| Sanca 6 m | und | R$ 50,00 | — |
| Ripão 4 m Cutiuba | **und** | R$ 12,50 | R$ 150,00 a dúzia |
| Ripão 4 m Cupiuba | **und** | R$ 15,00 | R$ 180,00 a dúzia |
| Prego 2 × 12 | kg | R$ 30,00 | — |
| Prego 1 × 16 | kg | R$ 40,00 | — |

A unidade de lançamento aparece ao lado de cada campo. O ripão é cotado por dúzia mas lançado
por **unidade**, com valor proporcional (`preço da dúzia ÷ 12`): 6 un de Cutiuba = R$ 75,00 e
12 un = R$ 150,00, que é a dúzia fechada.

Quem ficar em branco não entra no orçamento. O total à vista e o total no cartão diferem apenas
na parte do forro — a tabela traz preço único para os materiais avulsos. Para cobrar deles o mesmo
acréscimo de cartão que o forro tem (~8%), mude no `index.html`:

```js
const ACRESCIMO_CARTAO_MATERIAIS = 0;      // use 0.08 para 8%
```

Os itens e preços ficam no array `MATERIAIS`, logo acima dessa constante. Nele, `unid` e `preco`
são sempre a unidade de lançamento e o preço dela; `base` é opcional e serve só para exibir a
cotação original quando ela é outra:

```js
{ id:"rip-cut", nome:"Cutiuba", unid:"und", preco:150.00/12, base:{ preco:150.00, unid:"dúzia" } }
```

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
Os acréscimos de moldura e sanca do orçamento *Instalado* ficam nos `value` dos rádios
de acabamento, no HTML. Os materiais avulsos ficam no array `MATERIAIS`.

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
