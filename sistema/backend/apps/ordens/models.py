import re
from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models, transaction
from django.utils import timezone

CENTAVO = Decimal("0.01")

# Comissão de quem trouxe o cliente: R$ 2,00 por m² orçado.
# Ex.: 55 m² × 2 = R$ 110,00.
COMISSAO_POR_M2 = Decimal("2.00")


class StatusOS(models.TextChoices):
    # O valor "gerada" fica como está no banco; o rótulo é o que a equipe lê.
    GERADA = "gerada", "Agendado"
    EM_EXECUCAO = "em_execucao", "Em execução"
    FINALIZADA = "finalizada", "Finalizada"
    CANCELADA = "cancelada", "Cancelada"


class TipoServico(models.TextChoices):
    """Espelha o tipo do orçamento e define o prefixo do número da O.S."""

    MATERIAL = "material", "Fornecimento de Material"
    INSTALADO = "instalado", "Instalação Completa"


# Transições válidas. Qualquer outra é recusada no serviço de mudança de status.
TRANSICOES = {
    StatusOS.GERADA: {StatusOS.EM_EXECUCAO, StatusOS.CANCELADA},
    StatusOS.EM_EXECUCAO: {StatusOS.FINALIZADA, StatusOS.CANCELADA},
    StatusOS.FINALIZADA: set(),
    StatusOS.CANCELADA: set(),
}


class TipoAgendamento(models.TextChoices):
    ENTREGA = "entrega", "Entrega"
    INSTALACAO = "instalacao", "Instalação"


class Turno(models.TextChoices):
    MANHA = "manha", "Manhã"
    TARDE = "tarde", "Tarde"


class Modalidade(models.TextChoices):
    """Como o cliente fecha o serviço — o orçamento já traz os dois valores."""

    VISTA = "vista", "À vista"
    CARTAO = "cartao", "No cartão"


class FormaPagamento(models.TextChoices):
    DINHEIRO = "dinheiro", "Dinheiro"
    PIX = "pix", "PIX"
    DEBITO = "debito", "Cartão de débito"
    CREDITO = "credito", "Cartão de crédito"
    TRANSFERENCIA = "transferencia", "Transferência"
    BOLETO = "boleto", "Boleto"
    CHEQUE = "cheque", "Cheque"


class OrdemServico(models.Model):
    numero = models.CharField(max_length=24, unique=True, editable=False)

    # Guardado na própria O.S. para que número, card e imagem continuem corretos
    # mesmo sem orçamento vinculado.
    tipo = models.CharField(max_length=12, choices=TipoServico.choices, default=TipoServico.INSTALADO)

    orcamento = models.OneToOneField(
        "orcamentos.Orcamento", on_delete=models.PROTECT, related_name="ordem_servico", null=True, blank=True
    )
    cliente = models.ForeignKey("clientes.Cliente", on_delete=models.PROTECT, related_name="ordens")
    endereco = models.ForeignKey(
        "clientes.Endereco",
        on_delete=models.PROTECT,
        related_name="ordens",
        help_text="Endereço da obra / instalação / entrega.",
    )

    # Quem trouxe o cliente — base da comissão. Preenchido com o usuário logado
    # ao gerar a O.S.; só a diretoria pode corrigir depois.
    vendedor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="ordens_como_vendedor"
    )

    status = models.CharField(max_length=12, choices=StatusOS.choices, default=StatusOS.GERADA)

    # Os dois valores do orçamento ficam guardados; `valor_total` é o que será
    # cobrado de fato e segue a modalidade escolhida no fechamento.
    valor_vista = models.DecimalField(max_digits=11, decimal_places=2, null=True, blank=True)
    valor_cartao = models.DecimalField(max_digits=11, decimal_places=2, null=True, blank=True)
    modalidade = models.CharField(max_length=8, choices=Modalidade.choices, blank=True)

    valor_total = models.DecimalField(max_digits=11, decimal_places=2)
    desconto = models.DecimalField(max_digits=11, decimal_places=2, default=0)

    observacoes = models.TextField("observações", blank=True)

    criado_por = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="ordens_criadas")
    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    finalizada_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="ordens_finalizadas", null=True, blank=True
    )
    finalizada_em = models.DateTimeField(null=True, blank=True)
    cancelada_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="ordens_canceladas", null=True, blank=True
    )
    cancelada_em = models.DateTimeField(null=True, blank=True)
    motivo_cancelamento = models.TextField(blank=True)

    # Controle da diretoria: a comissão nasce em aberto quando o serviço é
    # finalizado e só sai da lista quando a diretoria marca como paga.
    comissao_paga = models.BooleanField(default=False)
    comissao_paga_em = models.DateTimeField(null=True, blank=True)
    comissao_paga_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="comissoes_pagas", null=True, blank=True
    )

    class Meta:
        ordering = ["-criado_em"]
        verbose_name = "ordem de serviço"
        verbose_name_plural = "ordens de serviço"
        indexes = [
            models.Index(fields=["status", "-criado_em"]),
            models.Index(fields=["vendedor", "-criado_em"]),
        ]

    def __str__(self):
        return f"{self.numero} — {self.cliente}"

    @staticmethod
    def _proximo_numero(tipo):
        """
        OS-MAT-20260002 para fornecimento de material, OS-SERV-20260003 para
        instalação. A sequência é anual e única entre os dois tipos, para não
        existirem duas O.S. com o mesmo final no mesmo ano.
        """
        ano = timezone.localdate().year
        sufixo = "MAT" if tipo == TipoServico.MATERIAL else "SERV"
        final = re.compile(rf"{ano}(\d{{4}})$")

        seq = 0
        for numero in OrdemServico.objects.values_list("numero", flat=True):
            achado = final.search(numero)
            if achado:
                seq = max(seq, int(achado.group(1)))
        return f"OS-{sufixo}-{ano}{seq + 1:04d}"

    def save(self, *args, **kwargs):
        if not self.numero:
            self.numero = self._proximo_numero(self.tipo)
        return super().save(*args, **kwargs)

    # --------------------------------------------------------------- comissão
    @property
    def area_m2(self):
        """A metragem orçada — base da comissão e da ficha do pedido."""
        return self.orcamento.area_m2 if self.orcamento_id else None

    @property
    def comissao_valor(self):
        area = self.area_m2
        if not area or self.status == StatusOS.CANCELADA:
            return Decimal("0.00")
        return (area * COMISSAO_POR_M2).quantize(CENTAVO)

    @property
    def comissao_em_aberto(self):
        """Serviço entregue e comissão ainda não repassada."""
        return self.status == StatusOS.FINALIZADA and not self.comissao_paga

    # --------------------------------------------------------------- financeiro
    @property
    def valor_liquido(self):
        return (self.valor_total - self.desconto).quantize(CENTAVO)

    @property
    def total_pago(self):
        return sum((p.valor for p in self.pagamentos.all()), Decimal("0")).quantize(CENTAVO)

    @property
    def saldo(self):
        return (self.valor_liquido - self.total_pago).quantize(CENTAVO)

    @property
    def quitada(self):
        return self.saldo <= 0

    def aplicar_modalidade(self, modalidade):
        """
        Troca o valor cobrado para o da modalidade escolhida. O desconto continua
        separado, porque o preço pode ser negociado por fora da tabela.
        """
        modalidade = Modalidade(modalidade)
        referencia = self.valor_cartao if modalidade == Modalidade.CARTAO else self.valor_vista
        if referencia is None:
            raise ValidationError(
                {"modalidade": "Esta O.S. não tem valor de referência para essa modalidade."}
            )
        self.modalidade = modalidade
        self.valor_total = referencia
        return self

    # --------------------------------------------------------------- atraso
    @property
    def data_limite(self):
        """O último compromisso agendado: é o que define se a O.S. atrasou."""
        datas = [a.data for a in self.agendamentos.all()]
        return max(datas) if datas else None

    @property
    def atrasado(self):
        if self.status in (StatusOS.FINALIZADA, StatusOS.CANCELADA):
            return False
        limite = self.data_limite
        return bool(limite and limite < timezone.localdate())

    @property
    def dias_atraso(self):
        return (timezone.localdate() - self.data_limite).days if self.atrasado else 0

    # --------------------------------------------------------------- agenda
    @property
    def agendamento_entrega(self):
        return self.agendamentos.filter(tipo=TipoAgendamento.ENTREGA).first()

    @property
    def agendamento_instalacao(self):
        return self.agendamentos.filter(tipo=TipoAgendamento.INSTALACAO).first()

    # --------------------------------------------------------------- transição
    @transaction.atomic
    def mudar_status(self, novo, usuario, observacao=""):
        """
        Única porta de entrada para mudança de status: valida a transição,
        checa a permissão e registra no histórico.
        """
        novo = StatusOS(novo)
        if novo == self.status:
            return self
        if novo not in TRANSICOES[StatusOS(self.status)]:
            raise ValidationError(
                f"Não é possível passar de '{self.get_status_display()}' para '{novo.label}'."
            )
        if novo == StatusOS.FINALIZADA and not usuario.pode_finalizar_os:
            raise ValidationError("Apenas a diretoria pode finalizar uma O.S.")
        if novo == StatusOS.CANCELADA and not usuario.e_diretor:
            raise ValidationError("Apenas a diretoria pode cancelar uma O.S.")
        if novo == StatusOS.FINALIZADA and self.saldo > 0:
            raise ValidationError(
                f"Saldo em aberto de R$ {self.saldo}. Registre os pagamentos antes de finalizar."
            )

        anterior = self.status
        self.status = novo
        agora = timezone.now()
        if novo == StatusOS.FINALIZADA:
            self.finalizada_por, self.finalizada_em = usuario, agora
        elif novo == StatusOS.CANCELADA:
            self.cancelada_por, self.cancelada_em = usuario, agora
            self.motivo_cancelamento = observacao
        self.save()

        HistoricoOS.objects.create(
            ordem=self, de_status=anterior, para_status=novo, usuario=usuario, observacao=observacao
        )
        return self


class Agendamento(models.Model):
    """
    Entrega e instalação ocupam vagas distintas no mesmo turno. O limite por turno
    vem da ConfiguracaoAgenda e é checado no clean().
    """

    ordem = models.ForeignKey(OrdemServico, on_delete=models.CASCADE, related_name="agendamentos")
    tipo = models.CharField(max_length=12, choices=TipoAgendamento.choices)
    data = models.DateField()
    turno = models.CharField(max_length=6, choices=Turno.choices)
    hora = models.TimeField(null=True, blank=True, help_text="Opcional, quando há hora marcada.")

    responsavel = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, related_name="agendamentos", null=True, blank=True
    )
    concluido = models.BooleanField(default=False)
    concluido_em = models.DateTimeField(null=True, blank=True)
    observacoes = models.TextField("observações", blank=True)

    class Meta:
        ordering = ["data", "turno"]
        constraints = [
            models.UniqueConstraint(fields=["ordem", "tipo"], name="um_agendamento_por_tipo_na_os")
        ]
        indexes = [models.Index(fields=["data", "turno", "tipo"])]

    def __str__(self):
        return f"{self.get_tipo_display()} {self.data:%d/%m} ({self.get_turno_display()})"

    def clean(self):
        cfg = ConfiguracaoAgenda.obter()

        if self.data.weekday() in cfg.dias_sem_atendimento_lista:
            raise ValidationError({"data": "Não há atendimento neste dia da semana."})

        if Bloqueio.objects.filter(data=self.data).filter(models.Q(turno="") | models.Q(turno=self.turno)).exists():
            raise ValidationError({"data": "Data bloqueada na agenda."})

        limite = cfg.capacidade()
        ocupadas = (
            Agendamento.objects.filter(data=self.data, turno=self.turno)
            .exclude(pk=self.pk)
            .exclude(ordem__status=StatusOS.CANCELADA)
            .count()
        )
        if ocupadas >= limite:
            raise ValidationError(
                {"turno": f"Turno cheio: {ocupadas} de {limite} vagas já ocupadas."}
            )

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)


class Pagamento(models.Model):
    ordem = models.ForeignKey(OrdemServico, on_delete=models.CASCADE, related_name="pagamentos")
    forma = models.CharField(max_length=16, choices=FormaPagamento.choices)
    valor = models.DecimalField(max_digits=11, decimal_places=2)
    parcelas = models.PositiveSmallIntegerField(default=1)
    data = models.DateField(default=timezone.localdate)
    observacao = models.CharField("observação", max_length=160, blank=True)

    registrado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="pagamentos_registrados"
    )
    registrado_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["data", "id"]

    def __str__(self):
        return f"{self.get_forma_display()} R$ {self.valor}"

    def clean(self):
        if self.valor <= 0:
            raise ValidationError({"valor": "O valor deve ser maior que zero."})


class HistoricoOS(models.Model):
    ordem = models.ForeignKey(OrdemServico, on_delete=models.CASCADE, related_name="historico")
    de_status = models.CharField(max_length=12, choices=StatusOS.choices)
    para_status = models.CharField(max_length=12, choices=StatusOS.choices)
    usuario = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    em = models.DateTimeField(auto_now_add=True)
    observacao = models.TextField("observação", blank=True)

    class Meta:
        ordering = ["em"]
        verbose_name = "histórico da O.S."
        verbose_name_plural = "histórico das O.S."

    def __str__(self):
        return f"{self.ordem.numero}: {self.de_status} → {self.para_status}"


class Bloqueio(models.Model):
    """Feriado, folga ou indisponibilidade — some das vagas livres na agenda."""

    data = models.DateField()
    turno = models.CharField(max_length=6, choices=Turno.choices, blank=True, help_text="Vazio = dia inteiro.")
    motivo = models.CharField(max_length=120)
    criado_por = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")

    class Meta:
        ordering = ["data"]
        verbose_name = "bloqueio de agenda"
        verbose_name_plural = "bloqueios de agenda"

    def __str__(self):
        return f"{self.data:%d/%m} {self.get_turno_display() or 'dia inteiro'} — {self.motivo}"


class ConfiguracaoAgenda(models.Model):
    """
    Registro único com a capacidade da agenda.

    A vaga é do turno, não do tipo: entrega e instalação disputam as mesmas
    vagas, porque é a mesma equipe que sai. 2 por turno = 4 por dia.
    """

    capacidade_turno = models.PositiveSmallIntegerField(
        default=2, help_text="Compromissos por turno, somando entregas e instalações."
    )
    dias_sem_atendimento = models.CharField(
        max_length=20, default="6", help_text="Dias da semana sem atendimento, separados por vírgula (0=seg … 6=dom)."
    )

    class Meta:
        verbose_name = "configuração da agenda"
        verbose_name_plural = "configuração da agenda"

    def __str__(self):
        return "Configuração da agenda"

    @classmethod
    def obter(cls):
        cfg, _ = cls.objects.get_or_create(pk=1)
        return cfg

    @property
    def dias_sem_atendimento_lista(self):
        return [int(d) for d in self.dias_sem_atendimento.split(",") if d.strip().isdigit()]

    def capacidade(self, tipo=None):
        """O limite é do turno; o tipo não muda a conta."""
        return self.capacidade_turno
