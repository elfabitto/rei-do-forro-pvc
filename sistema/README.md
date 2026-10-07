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
| `OrdemServico` | o pedido virado serviço: cliente, endereço, vendedor, status, valor |
| `Agendamento` | entrega e instalação, cada uma com data e turno |
| `Pagamento` | forma, valor e quem registrou |
| `HistoricoOS` | cada mudança de status, com autor e data |
| `Bloqueio` · `ConfiguracaoAgenda` | feriados e a capacidade por turno |

### Status da O.S.

```
Gerada ──► Em execução ──► Finalizada
   │             │
   └──────┬──────┘
          ▼
      Cancelada
```

Transições fora desse desenho são recusadas no modelo (`mudar_status`), não só na tela.
Finalizar exige **saldo zero**: se o cliente ainda deve, a O.S. não fecha.

### Permissões

| Ação | Vendedor | Instalador | Administrativo | Diretor |
|---|:--:|:--:|:--:|:--:|
| Criar orçamento e O.S. | ✓ | — | ✓ | ✓ |
| Ver O.S. de todos | — | — | ✓ | ✓ |
| Agendar / reagendar | ✓ | — | ✓ | ✓ |
| Ver valores e financeiro | — | — | ✓ | ✓ |
| Registrar pagamento | — | — | — | ✓ |
| **Finalizar O.S.** | — | — | — | ✓ |
| Cancelar O.S. | — | — | — | ✓ |
| **Alterar quem trouxe o cliente** | — | — | — | ✓ |
| Alterar a tabela de preços | — | — | — | ✓ |

Quem não vê tudo enxerga as O.S. em que é o vendedor **ou** que ele mesmo lançou.

A regra mora nas propriedades `pode_*` do modelo `Usuario`; `apps/core/permissions.py`
só traduz para o DRF e o React apenas espelha o que `/api/eu/` devolve — a interface
nunca decide sozinha o que o usuário pode fazer.

### Comissão

`OrdemServico.vendedor` é **quem trouxe o cliente**. No lançamento vem o usuário
logado; só a diretoria pode corrigir depois — é o caso de o diretor lançar a O.S.
a pedido do funcionário. A troca é barrada no serializer, não só escondendo o botão.

### Agenda

Entrega e instalação ocupam **vagas separadas** no mesmo turno: lotar as entregas da
manhã não impede uma instalação no mesmo período. A capacidade padrão é 3 entregas e
2 instalações por turno, configurável em `ConfiguracaoAgenda`. Domingo não é agendável
e feriados entram como `Bloqueio`. Cancelar uma O.S. devolve a vaga.

`GET /api/agenda/disponibilidade/?de=&ate=` devolve, por dia e turno, quantas vagas de
cada tipo restam — é o que o calendário desenha como "2 vagas" ou "lotado".

## Principais endpoints

| Método | Rota | O quê |
|---|---|---|
| POST | `/api/token/` | login, devolve access + refresh |
| GET | `/api/eu/` | usuário logado + permissões |
| GET | `/api/painel/` | números do dashboard (financeiro só para quem pode) |
| GET | `/api/agenda/disponibilidade/` | vagas livres por dia e turno |
| — | `/api/orcamentos/` · `/api/ordens-servico/` · `/api/clientes/` · `/api/agendamentos/` · `/api/pagamentos/` · `/api/forros/` · `/api/materiais/` | CRUD |
| POST | `/api/ordens-servico/{id}/finalizar/` | lança pagamentos e fecha a O.S. (diretoria) |
| POST | `/api/ordens-servico/{id}/mudar_status/` | transição validada |

## O que ainda falta

O que está aqui é a fundação verificada por testes, não o sistema pronto. Falta:

- formulário de orçamento no React (hoje só a listagem) — reaproveitar a lógica de `docs/index.html`
- tela de gerar O.S. a partir do orçamento, e o formulário de agendamento
- gaveta de detalhe da O.S. com finalização e lançamento de pagamento
  (o fluxo existe na API e no protótipo em `../prototipo/`, falta ligar no React)
- cadastro de clientes e endereços pela interface
- relatório de comissões por período
- exportação do orçamento em PNG dentro do sistema
