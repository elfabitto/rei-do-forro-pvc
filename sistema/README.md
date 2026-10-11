# Rei do Forro — Sistema de gestão

Django (API) + React (interface). Separado do gerador de orçamentos estático, que
continua em [`../docs/`](../docs/) e é o que vai para o GitHub Pages.

```
sistema/
├── backend/           Django 5.2 + DRF — API, regras de negócio, admin
│   ├── config/        settings, urls, wsgi
│   └── apps/
│       ├── core/      permissões, painel, comandos de seed
│       ├── contas/    usuários e papéis
│       ├── clientes/  clientes e endereços de obra
│       ├── catalogo/  forros, materiais, acabamentos
│       ├── orcamentos/
│       └── ordens/    O.S., agendamento, pagamento, histórico
└── frontend/          React 18 + Vite + React Router
```

## Rodar localmente

**Backend** (porta 8000):

```bash
cd sistema/backend
python -m venv .venv
.venv/Scripts/activate          # Linux/Mac: source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py carregar_catalogo   # tabela de preços vigente
python manage.py seed_demo           # dados de demonstração
python manage.py runserver
```

**Frontend** (porta 5173, com proxy de `/api` para o Django):

```bash
cd sistema/frontend
npm install
npm run dev
```

Entre em http://localhost:5173 com **alan** (diretor), **marcos** (vendedor) ou
**jonas** (instalador) — senha `demo1234`. Trocar de usuário mostra as permissões
mudando na prática. O admin do Django fica em http://localhost:8000/admin/.

Testes:

```bash
cd sistema/backend && python manage.py test apps
```

## Modelo de dados

| Entidade | Papel |
|---|---|
| `Usuario` | papel (diretor / administrativo / vendedor / instalador) e % de comissão |
| `Cliente` · `Endereco` | endereço da obra com complemento, bairro e o link de localização que o cliente manda pelo WhatsApp; um cliente pode ter vários endereços |
| `Forro` · `Material` · `Acabamento` | a tabela de preços, hoje fixa no `docs/index.html` |
| `Orcamento` · `OrcamentoItem` | guarda os preços **congelados na data** — mudar a tabela depois não altera um orçamento já enviado |
| item `Outro` | `OrcamentoItem` sem `material`, unidade `verba`: descrição livre e valor fechado, para o que não cabe na tabela (deslocamento, retirada do forro antigo). Vale nos dois tipos de orçamento; material de catálogo continua exclusivo do tipo Material |
| `OrdemServico` | o pedido virado serviço: cliente, endereço, vendedor, status, valor |
| `Agendamento` | entrega e instalação, cada uma com data e turno |
| `Pagamento` | forma, valor e quem registrou |
| `HistoricoOS` | cada mudança de status, com autor e data |
| `Bloqueio` · `ConfiguracaoAgenda` | feriados e a capacidade por turno |

### Unidades de lançamento

`Material.unidade` é sempre a unidade em que a quantidade é digitada. O ripão é
cotado **e** lançado por **dúzia**, igual ao gerador do Pages: meia dúzia é `0,5`,
3,5 dúzias saem por R$ 525,00 no Cutiuba. Perfil, moldura e sanca vão por unidade;
pregos, por quilo.

### Numeração e tipo

A O.S. herda o tipo do orçamento e o número mostra isso de cara:

| Tipo | Rótulo | Número |
|---|---|---|
| `material` | Fornecimento de Material | `OS-MAT-20260002` |
| `instalado` | Instalação Completa | `OS-SERV-20260003` |

A sequência é anual e única entre os dois tipos, para não existirem duas O.S. com o
mesmo final no mesmo ano.

### Status da O.S.

```
Agendado ──► Em execução ──► Finalizada
   │               │
   └───────┬───────┘
           ▼
       Cancelada
```

Transições fora desse desenho são recusadas no modelo (`mudar_status`), não só na tela.
Finalizar exige **saldo zero**: se o cliente ainda deve, a O.S. não fecha.

### Permissões

| Ação | Vendedor | Instalador | Administrativo | Diretor |
|---|:--:|:--:|:--:|:--:|
| **Ver orçamentos e O.S. de todos** | ✓ | ✓ | ✓ | ✓ |
| Criar orçamento e O.S. | ✓ | — | ✓ | ✓ |
| Editar / converter / dar como perdido | só os seus | — | ✓ | ✓ |
| Marcar "em execução" | só os seus | ✓ | ✓ | ✓ |
| Agendar / reagendar | só os seus | — | ✓ | ✓ |
| Ver valores e financeiro | — | — | ✓ | ✓ |
| Registrar pagamento | — | — | — | ✓ |
| **Finalizar O.S.** | — | — | — | ✓ |
| Cancelar O.S. | — | — | — | ✓ |
| **Alterar quem trouxe o cliente** | — | — | — | ✓ |
| Dar baixa em comissão | — | — | — | ✓ |
| Alterar a tabela de preços | — | — | — | ✓ |

A lista é da equipe inteira — o instalador precisa saber o que está marcado e o
vendedor acompanha o movimento da loja. O que muda é **agir**: `DonoOuSuperior`
barra no servidor a escrita em registro alheio, não só escondendo o botão. Cada
registro traz `pode_editar`, e é dele que a interface tira o estado dos botões.

A regra mora nas propriedades `pode_*` do modelo `Usuario`; `apps/core/permissions.py`
só traduz para o DRF e o React apenas espelha o que `/api/eu/` devolve — a interface
nunca decide sozinha o que o usuário pode fazer.

### Comissão

`OrdemServico.vendedor` é **quem trouxe o cliente**. No lançamento vem o usuário
logado; só a diretoria pode corrigir depois — é o caso de o diretor lançar a O.S.
a pedido do funcionário. A troca é barrada no serializer, não só escondendo o botão.

O valor é **R$ 2,00 por m² orçado** (`COMISSAO_POR_M2`): 55 m² × 2 = R$ 110,00.
Nasce devida quando o serviço é **finalizado** e fica *em aberto* até a diretoria dar
baixa em `POST /api/ordens-servico/{id}/pagar_comissao/`, que registra quem deu e
quando. Serviço cancelado não gera comissão. A aba **Comissões** mostra o total a
pagar, o já pago e a lista por pessoa.

### Agenda

A vaga é **do turno**, não do tipo: entrega e instalação disputam o mesmo limite,
porque é a mesma equipe que sai. O padrão é **2 por turno — 4 por dia**, configurável
em `ConfiguracaoAgenda`. Domingo não é agendável e feriados entram como `Bloqueio`.
Cancelar uma O.S. devolve a vaga.

`GET /api/agenda/disponibilidade/?de=&ate=` devolve, por dia e turno, quantas vagas
restam — é o que o calendário desenha como "2 vagas" ou "lotado". Marcar é feito no
próprio mês (`src/calendario.jsx`), não em menu suspenso: a disponibilidade de cada
data é justamente o que a pessoa precisa ver para escolher.

Instalação só é agendada quando o orçamento é de instalação; fornecimento de material
tem entrega e ponto.

## Principais endpoints

| Método | Rota | O quê |
|---|---|---|
| POST | `/api/token/` | login, devolve access + refresh |
| GET | `/api/eu/` | usuário logado + permissões |
| GET | `/api/painel/` | números do dashboard (financeiro só para quem pode) |
| GET | `/api/agenda/disponibilidade/` | vagas livres por dia e turno |
| — | `/api/orcamentos/` · `/api/ordens-servico/` · `/api/clientes/` · `/api/agendamentos/` · `/api/pagamentos/` · `/api/forros/` · `/api/materiais/` | CRUD |
| GET | `/api/comissoes/?situacao=aberto\|pago` | comissões apuradas, em aberto e pagas |
| POST | `/api/ordens-servico/{id}/finalizar/` | lança pagamentos e fecha a O.S. (diretoria) |
| POST | `/api/ordens-servico/{id}/mudar_status/` | transição validada |
| POST | `/api/ordens-servico/{id}/pagar_comissao/` | baixa da comissão (diretoria) |
| POST | `/api/ordens-servico/{id}/reagendar/{ag}/` | remarca um compromisso |

## O que ainda falta

- relatório de comissões por período com exportação
- notificação do compromisso do dia para o instalador
- migração do banco local para o Supabase (ver `HOSPEDAGEM.md`)
