# Hospedagem

> Preços conferidos até meados de 2026 — confirme antes de contratar, mudam com frequência.

## Resposta curta

**Supabase: sim, boa escolha.** **Render: funciona, mas o plano gratuito não serve
para uso diário** — e, se for pagar, há opção melhor para o Brasil.

## Supabase

Encaixa bem porque com Django você usa só o Postgres gerenciado, que é o pedaço
mais chato de administrar. Vantagens concretas:

- **Região São Paulo** (`sa-east-1`) — para Rondonópolis é a menor latência disponível.
- Backup automático, painel de SQL, e um Storage pronto para quando quiser guardar
  foto da obra junto da O.S.
- Gratuito até 500 MB de banco. Pro ~US$ 25/mês quando apertar.

Dois pontos de atenção:

1. **Use o `auth` do Django, não o Supabase Auth.** Misturar os dois gera trabalho sem
   retorno — o projeto já tem usuários, papéis e permissões no Django. Do Supabase,
   use só o banco (e o Storage depois).
2. **Pooler x conexão direta.** A porta `6543` é o pgbouncer em modo *transaction*, que
   não aceita conexão persistente nem cursor do lado do servidor. Rode as *migrations*
   pela porta `5432` (direta) e deixe a aplicação na `6543`. O `settings.py` já detecta
   isso e ajusta `CONN_MAX_AGE` e `DISABLE_SERVER_SIDE_CURSORS` sozinho.
3. No plano gratuito, o projeto **pausa após 7 dias sem acesso**. Em uso diário isso
   nunca dispara, mas é bom saber antes de depender dele.

## Onde rodar o Django

| Opção | Custo inicial | Dorme? | Região BR | Observação |
|---|---|---|---|---|
| **Render Free** | US$ 0 | **sim, após 15 min** (~50 s para acordar) | não | Inviável: o vendedor abre o sistema e espera quase um minuto |
| **Render Starter** | ~US$ 7/mês | não | não | Simples, suporte nativo a Django. Latência maior (EUA) |
| **Fly.io** | ~US$ 3–5/mês | opcional | **sim (GRU)** | Mais rápido para o Brasil; exige Docker e um pouco mais de configuração |
| **Railway** | ~US$ 5/mês de crédito | não | não | Mais fácil que o Fly, Postgres junto se quiser |
| **Hostinger VPS** | ~US$ 5–8/mês | não | varia | O destino que você já tem em mente |

**Vercel não serve para o Django.** É excelente para a parte React, mas o backend
teria de virar funções serverless — reescrita grande, sem ganho.

## O que eu faria

```
React  →  Cloudflare Pages ou Vercel   (grátis, rápido, build automático)
Django →  Render Starter (simples) ou Fly.io GRU (mais rápido daqui)
Banco  →  Supabase, região São Paulo
```

Separar o React do Django é o que dá flexibilidade: a interface é um monte de
arquivos estáticos e pode morar em qualquer lugar de graça; só o Django precisa
de servidor.

**Para começar com o menor atrito:** Render Starter + Supabase. É um painel só,
deploy direto do GitHub, e o Django roda sem adaptação. Quando a latência incomodar
ou a conta crescer, migrar para Fly.io ou para o VPS da Hostinger é trocar o
`Dockerfile` de lugar — o código não muda.

**Não use o Render Free** para isso. 50 segundos de espera na primeira venda do dia
acaba com a adoção do sistema pela equipe.

## Migrar para a Hostinger depois

O projeto já está preparado:

- `gunicorn` e `whitenoise` nas dependências — servem a aplicação e os estáticos sem Nginx extra.
- Toda a configuração sai de variáveis de ambiente (`.env.example`), nada fixo no código.
- `DATABASE_URL` aponta para onde você quiser: Supabase ou um Postgres no próprio VPS.

Na prática: VPS da Hostinger com Docker, um container para o Django e o React servido
como estático. Se quiser trazer o banco junto, é um `pg_dump` do Supabase restaurado
no VPS — mas manter o banco no Supabase é menos trabalho de manutenção e backup.

## Custo estimado para começar

| Item | Mês |
|---|---|
| Supabase | US$ 0 (grátis até 500 MB) |
| Render Starter | ~US$ 7 |
| Cloudflare Pages (React) | US$ 0 |
| **Total** | **~US$ 7/mês** (~R$ 40) |

Dá para começar em US$ 0 com o Render Free apenas para *testar em equipe*, aceitando
a demora do primeiro acesso. Para uso real, o Starter é o mínimo.
