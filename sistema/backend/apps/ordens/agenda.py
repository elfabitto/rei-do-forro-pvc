"""
Regras de capacidade da agenda.

- Instalação: no máximo `capacidade_instalacao` (2) ocupando o mesmo turno — são
  as equipes. Dura de 1 a 6 dias conforme a área, contados em meios-dias (turnos)
  e só em dias úteis (seg a sáb, sem bloqueio). Termina ao meio-dia? A tarde fica
  livre para outra instalação.
- Entrega: no máximo `capacidade_entrega_dia` (4) por dia. A instalação leva o
  material, então consome 1 dessas vagas no dia em que começa. O turno da
  entrega é informativo; o limite é do dia.
- Visita técnica (orçamento presencial): também ocupa 1 vaga de entrega no dia.
- Exceção: a gestão abre vagas a mais num dia lotado (ExcecaoAgenda) — somam
  entregas no dia ou equipes nos turnos do dia.

Tudo que a tela mostra como vaga sai daqui, e é a mesma conta que o modelo
confere ao gravar.
"""
from datetime import date, timedelta
from decimal import Decimal

# (até m², dias). Acima do último degrau: 6 dias.
TABELA_DIAS = [
    (Decimal("25"), Decimal("1")),
    (Decimal("30"), Decimal("1.5")),
    (Decimal("40"), Decimal("2")),
    (Decimal("45"), Decimal("2.5")),
    (Decimal("60"), Decimal("3")),
    (Decimal("65"), Decimal("3.5")),
    (Decimal("80"), Decimal("4")),
    (Decimal("85"), Decimal("4.5")),
    (Decimal("100"), Decimal("5")),
]
DIAS_ACIMA = Decimal("6")

TURNOS = ("manha", "tarde")


def dias_instalacao(area):
    """Dias de serviço para a área (1, 1,5 … 6). Sem área, conta 1 dia."""
    if not area:
        return Decimal("1")
    area = Decimal(str(area))
    for limite, dias in TABELA_DIAS:
        if area <= limite:
            return dias
    return DIAS_ACIMA


def turnos_instalacao(area):
    """A mesma duração em turnos (meios-dias): 1,5 dia = 3 turnos."""
    return int(dias_instalacao(area) * 2)


def chave(dia, turno):
    return f"{dia.isoformat()}:{turno}"


def ler_chave(texto):
    d, t = texto.split(":")
    return date.fromisoformat(d), t


class Grade:
    """
    Fotografia da ocupação num intervalo de datas. Monta uma vez e responde
    quantas perguntas forem precisas — a tela do mês faz dezenas.
    """

    # folga para trás: uma instalação iniciada antes de `de` ainda pode ocupar o intervalo
    FOLGA = 21

    def __init__(self, de, ate, excluir=None, excluir_visita=None):
        from .models import (
            Agendamento, Bloqueio, ConfiguracaoAgenda, ExcecaoAgenda, StatusOS, StatusVisita, TipoAgendamento,
            TipoExcecao, VisitaTecnica,
        )

        self.cfg = ConfiguracaoAgenda.obter()
        self.sem_atendimento = set(self.cfg.dias_sem_atendimento_lista)
        self.de, self.ate = de, ate

        # bloqueios até bem depois de `ate`: a instalação que começa no fim do mês
        # atravessa para o seguinte
        fim_bloqueios = ate + timedelta(days=self.FOLGA * 2)
        self.bloqueios = set()
        for b in Bloqueio.objects.filter(data__range=(de - timedelta(days=self.FOLGA), fim_bloqueios)):
            for t in ([b.turno] if b.turno else TURNOS):
                self.bloqueios.add((b.data, t))

        qs = (
            Agendamento.objects.filter(data__lte=fim_bloqueios, data_fim__gte=de - timedelta(days=1))
            .exclude(ordem__status=StatusOS.CANCELADA)
        )
        if excluir:
            qs = qs.exclude(pk=excluir)

        # vagas de exceção abertas pela gestão: entregas por dia, equipes por dia
        self.extra_entrega, self.extra_instalacao = {}, {}
        for e in ExcecaoAgenda.objects.filter(data__range=(de - timedelta(days=self.FOLGA), fim_bloqueios)):
            self.extra_entrega[e.data] = self.extra_entrega.get(e.data, 0) + e.vagas
            if e.tipo == TipoExcecao.INSTALACAO:
                self.extra_instalacao[e.data] = self.extra_instalacao.get(e.data, 0) + e.vagas

        self.instalacoes = {}     # (data, turno) -> nº de instalações ocupando
        self.entregas = {}        # data -> entregas + instalações que começam no dia + visitas
        self.visitas = {}         # data -> visitas técnicas (já somadas em `entregas`)
        for a in qs.only("tipo", "data", "turno", "ocupacao"):
            self.entregas[a.data] = self.entregas.get(a.data, 0) + 1
            if a.tipo == TipoAgendamento.INSTALACAO:
                for k in a.ocupacao or [chave(a.data, a.turno)]:
                    d, t = ler_chave(k)
                    self.instalacoes[(d, t)] = self.instalacoes.get((d, t), 0) + 1

        # a visita perdida libera a vaga; a convertida já aconteceu e segue contando no dia dela
        visitas = VisitaTecnica.objects.filter(data__range=(de, fim_bloqueios)).exclude(status=StatusVisita.PERDIDA)
        if excluir_visita:
            visitas = visitas.exclude(pk=excluir_visita)
        for d in visitas.values_list("data", flat=True):
            self.entregas[d] = self.entregas.get(d, 0) + 1
            self.visitas[d] = self.visitas.get(d, 0) + 1

    # ------------------------------------------------------------ calendário
    def atende(self, dia):
        return dia.weekday() not in self.sem_atendimento

    def trabalha(self, dia, turno):
        return self.atende(dia) and (dia, turno) not in self.bloqueios

    def percorrer(self, dia, turno, n):
        """Os `n` turnos úteis a partir de (dia, turno), pulando domingo e bloqueios."""
        saida = []
        i = TURNOS.index(turno)
        limite = dia + timedelta(days=60)
        while len(saida) < n and dia <= limite:
            t = TURNOS[i]
            if self.trabalha(dia, t):
                saida.append((dia, t))
            i += 1
            if i == len(TURNOS):
                i = 0
                dia += timedelta(days=1)
        return saida

    # ------------------------------------------------------------ vagas
    @property
    def cap_instalacao(self):
        return self.cfg.capacidade_instalacao

    @property
    def cap_entrega(self):
        return self.cfg.capacidade_entrega_dia

    def cap_entrega_dia(self, dia):
        return self.cap_entrega + self.extra_entrega.get(dia, 0)

    def cap_instalacao_dia(self, dia):
        return self.cap_instalacao + self.extra_instalacao.get(dia, 0)

    def entregas_livres(self, dia):
        return max(0, self.cap_entrega_dia(dia) - self.entregas.get(dia, 0))

    def instalacoes_livres(self, dia, turno):
        return max(0, self.cap_instalacao_dia(dia) - self.instalacoes.get((dia, turno), 0))

    def motivo_entrega(self, dia):
        """None se cabe uma entrega no dia; senão, o porquê."""
        if not self.atende(dia):
            return "Não há atendimento neste dia da semana."
        if all((dia, t) in self.bloqueios for t in TURNOS):
            return "Data bloqueada na agenda."
        if not self.entregas_livres(dia):
            usado = self.entregas.get(dia, 0)
            return (f"Dia cheio: {usado} de {self.cap_entrega_dia(dia)} entregas já marcadas "
                    "(instalação e visita técnica contam como entrega).")
        return None

    def motivo_instalacao(self, dia, turno, n):
        """None se uma instalação de `n` turnos pode começar em (dia, turno)."""
        if not self.trabalha(dia, turno):
            return "Turno sem atendimento ou bloqueado na agenda."
        if not self.entregas_livres(dia):
            return (f"Sem vaga de entrega em {dia:%d/%m}: a instalação leva o material "
                    f"e ocupa 1 das {self.cap_entrega_dia(dia)} entregas do dia.")
        periodo = self.percorrer(dia, turno, n)
        if len(periodo) < n:
            return "Não há dias úteis suficientes para concluir a instalação."
        for d, t in periodo:
            if not self.instalacoes_livres(d, t):
                rotulo = "manhã" if t == "manha" else "tarde"
                return (f"Equipes ocupadas em {d:%d/%m} ({rotulo}): já há "
                        f"{self.cap_instalacao_dia(d)} instalações nesse turno.")
        return None
