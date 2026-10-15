# Hospedagem — colocar o sistema no ar (grátis)

> Condições dos planos gratuitos conferidas em outubro de 2026. Elas mudam: confira
> antes de depender delas.

## Como fica

| Peça | Onde | Custo |
|---|---|---|
| Sistema inteiro — API Django **e** telas React, num endereço só | **Render**, plano Free | grátis |
| Banco de dados (Postgres) | **Supabase**, plano Free | grátis |
| Manter o servidor acordado | **UptimeRobot** (ou cron-job.org) | grátis |
| Backup diário do banco | **GitHub Actions** (`.github/workflows/backup-banco.yml`) | grátis |

O site estático do GitHub Pages (`docs/`) não faz parte disso e não é afetado.

No Render, o build (`sistema/build.sh`) compila o React, instala o Django e aplica as
migrations. Depois o Django entrega a API em `/api`, o admin em `/admin` e as telas do
React em todo o resto. Cada `git push` no `main` publica sozinho.

### Limites que importam

- **Render Free dorme após 15 min sem acesso.** O primeiro acesso depois disso leva
  cerca de 1 minuto. O monitoramento (passo 5) evita isso, acessando o sistema a cada
  5 minutos. O plano dá 750 horas por mês, o suficiente para ficar ligado o mês todo.
- **Supabase Free:** 500 MB de banco (sobra para anos de orçamentos), **pausa após 7
  dias sem uso** (o monitoramento também conta como uso) e **não guarda backup**. Por
  isso existe o backup diário do passo 6.
- Se a espera ou os limites incomodarem: Render Starter (~US$ 7/mês, nunca dorme) e
  Supabase Pro (~US$ 25/mês, backup incluso). Não muda nada no código.

### Por que tudo nos EUA (Virgínia) e não em São Paulo

Cada tela faz várias consultas ao banco. O servidor do Render mais perto do Brasil fica
na Virgínia. Com o banco em São Paulo, **cada consulta** atravessaria esse caminho (≈120 ms
cada), e o Painel, com dezenas de consultas, levaria segundos. Com servidor e banco
lado a lado na Virgínia, as consultas são quase instantâneas e só a ida e volta do
celular até o servidor (≈130 ms, uma vez por tela) fica longa.

---

## Passo a passo

### 1. Supabase — criar o banco

1. Em <https://supabase.com>, entre e clique em **New project**.
2. **Region: East US (North Virginia)**. Guarde a **senha do banco** que você definir.
3. Com o projeto criado, clique em **Connect** (no topo) → aba **Connection string** →
   **URI**. Você vai precisar de dois endereços do **pooler** (`…pooler.supabase.com`):
   - **Transaction pooler**, porta **6543**: este é o `DATABASE_URL`.
   - **Session pooler**, porta **5432**: este é o `DATABASE_URL_MIGRACAO`.

   Troque `[YOUR-PASSWORD]` pela senha do banco. **Não use** o endereço
   `db.<ref>.supabase.co`: ele só funciona em IPv6, e o Render não alcança.

### 2. Carregar o catálogo e a equipe (uma vez, do seu computador)

No PowerShell, dentro de `sistema/backend`, com o endereço **Session pooler (5432)**:

```powershell
$env:DATABASE_URL = "postgresql://postgres.<ref>:<senha>@aws-0-us-east-1.pooler.supabase.com:5432/postgres"
.venv\Scripts\python.exe manage.py migrate
.venv\Scripts\python.exe manage.py carregar_catalogo   # forros, materiais, acabamentos e comissões
.venv\Scripts\python.exe manage.py criar_equipe --senha "<senha inicial>"   # Felipe, Luciene (diretoria) e Jessica
Remove-Item Env:DATABASE_URL                           # volta a usar o SQLite local
```

A senha inicial vai na linha de comando, nunca no código (o repositório é público).
Quem não está na equipe do comando é removido do banco. Cada um troca a senha no primeiro
acesso, e a diretoria pode redefinir em **Usuários**.

> Os dados do seu computador hoje (orçamentos e O.S. de teste) **não** vão para o banco
> novo, e o sistema começa limpo. Se você alterou preços na Tabela de preços localmente,
> confira-os de novo depois de publicar.

### 3. Render — publicar o sistema

1. Em <https://render.com>, entre com a conta do GitHub.
2. **New → Blueprint** e escolha o repositório `rei-do-forro-pvc`. O Render lê o
   `render.yaml` da raiz e monta o serviço `reidoforro` (plano Free, Virgínia).
3. Ele pede as duas variáveis marcadas para preencher:
   - `DATABASE_URL`: o **Transaction pooler (6543)**
   - `DATABASE_URL_MIGRACAO`: o **Session pooler (5432)**

   O resto (chave secreta, `DEBUG=False`, versões do Python e do Node) já vem pronto.
4. **Apply**. O primeiro build leva uns 5 minutos. No fim aparece o endereço, algo
   como `https://rei-do-forro.onrender.com` (o endereço é fixado quando o serviço é criado; trocar o nome depois não muda).

### 4. Primeiro acesso

Abra o endereço no celular, entre como `felipe.marques` com a senha inicial e **troque a senha**.
Para instalar como aplicativo, use o menu do navegador → **Adicionar à tela inicial**.

### 5. Manter acordado (UptimeRobot)

1. Em <https://uptimerobot.com>, crie uma conta grátis.
2. **New monitor** → tipo **HTTP(s)** → URL `https://<seu-endereço>.onrender.com/api/saude/`
   → intervalo **5 minutos**.

A rota `/api/saude/` não pede login e responde `{"ok": true, "banco": "ok"}`. Se o banco
cair, ela responde erro 503, e o UptimeRobot avisa você por e-mail.

### 6. Backup diário (GitHub Actions)

No GitHub do repositório: **Settings → Secrets and variables → Actions → New repository
secret**. Crie dois:

| Secret | Valor |
|---|---|
| `SUPABASE_DB_URL` | o **Session pooler (5432)** |
| `BACKUP_SENHA` | uma senha longa. **Guarde fora do computador**: sem ela o backup não abre |

Depois, em **Actions → Backup do banco → Run workflow**, rode uma vez para testar. A partir
daí roda sozinho todo dia às 03:00 e guarda os últimos 30 dias.

O repositório é público, por isso o arquivo sai **criptografado**. Quem baixar sem a
senha não consegue abrir.

> O GitHub desliga agendamentos de repositório público que fica **60 dias sem nenhum
> commit**. Se isso acontecer, ele avisa por e-mail; é só reativar em Actions.

#### Restaurar um backup

1. Em **Actions → Backup do banco**, abra a execução do dia e baixe o arquivo
   (vem zipado; extraia o `banco-AAAA-MM-DD.dump.gpg`).
2. Abra com a senha e restaure no banco (precisa do `gpg` e do cliente do Postgres 17):

```bash
gpg --output banco.dump --decrypt banco-AAAA-MM-DD.dump.gpg
pg_restore --clean --if-exists --no-owner --dbname "<Session pooler 5432>" banco.dump
```

---

## Dia a dia

- **Publicar mudanças:** `git push` no `main`. O Render refaz o build e aplica as
  migrations sozinho. Mudanças só no `docs/` não republicam o sistema.
- **Ver erros:** painel do Render → serviço → **Logs**.
- **Admin do Django:** `https://<seu-endereço>.onrender.com/admin/`.
- Sem `DATABASE_URL`, o sistema **não sobe** com `DEBUG=False`: o erro aparece no log do Render
  em vez de o sistema rodar com um banco vazio e temporário.
