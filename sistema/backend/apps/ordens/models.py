import re
from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models, transaction
from django.utils import timezone

CENTAVO = Decimal("0.01")

# Comissão de quem trouxe o cliente — valores iniciais; a diretoria edita em
# Parâmetros (ParametrosComissao) e cada O.S. guarda os que valiam ao nascer.
# Instalação completa: R$ 2,00 por m² orçado (55 m² × 2 = R$ 110,00).
# Material: item a item — forro R$ 1,00/m², cada material pela comissão do
# catálogo (perfil R$ 1,00/und, ripão R$ 5,00/dúzia) e o serviço de
# instalação, quando incluído, R$ 2,00/m².
COMISSAO_POR_M2 = Decimal("2.00")
COMISSAO_MATERIAL_FORRO_M2 = Decimal("1.00")
COMISSAO_MATERIAL_SERVICO_M2 = Decimal("2.00")
UNIDADE_SERVICO = "serviço"   # item "Serviço" do orçamento de Material


def _qtd(n):
    """34.00 → "34"; 2.50 → "2,5" — quantidade como se lê."""
    return f"{Decimal(n).normalize():f}".replace(".", ",")


def _brl(n):
    """1.5 → "R$ 1,50"."""
    return "R$ " + f"{Decimal(n):.2f}".replace(".", ",")


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
    MISTO = "misto", "À vista + cartão"


class FormaPagamento(models.TextChoices):
    DINHEIRO = "dinheiro", "Dinheiro"
    PIX = "pix", "PIX"
    DEBITO = "debito", "Cartão de débito"
    CREDITO = "credito", "Cartão de crédito"
    # As três abaixo não são mais oferecidas no fechamento; ficam para os
    # pagamentos antigos continuarem com o nome certo.
    TRANSFERENCIA = "transferencia", "Transferência"
    BOLETO = "boleto", "Boleto"
    CHEQUE = "cheque", "Cheque"


# O que conta como "à vista" e o que é cartão — a modalidade restringe as formas.
FORMAS_VISTA = {FormaPagamento.PIX, FormaPagamento.DINHEIRO}
FORMAS_CARTAO = {FormaPagamento.CREDITO, FormaPagamento.DEBITO}
FORMAS_ACEITAS = FORMAS_VISTA | FORMAS_CARTAO


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
    # valores de comissão por m² que valiam quando a O.S. foi gerada
    comissao_instalado_m2 = models.DecimalField(max_digits=7, decimal_places=2, default=COMISSAO_POR_M2)
    comissao_forro_m2 = models.DecimalField(max_digits=7, decimal_places=2, default=COMISSAO_MATERIAL_FORRO_M2)
    comissao_servico_m2 = models.DecimalField(max_digits=7, decimal_places=2,
                                              default=COMISSAO_MATERIAL_SERVICO_M2)
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
        if not self.pk:
            p = ParametrosComissao.obter()
            self.comissao_instalado_m2 = p.instalado_m2
            self.comissao_forro_m2 = p.material_forro_m2
            self.comissao_servico_m2 = p.material_servico_m2
        return super().save(*args, **kwargs)

    # --------------------------------------------------------------- comissão
    @property
    def area_m2(self):
        """A metragem orçada — base da comissão e da ficha do pedido."""
        return self.orcamento.area_m2 if self.orcamento_id else None

    @property
    def comissao_detalhe(self):
        """
        De onde vem a comissão, linha a linha: [(descrição, base, valor)].
        Instalação completa é uma linha só (área × R$ 2,00); Material soma item a item.
        """
        area = self.area_m2
        if not area:
            return []
        if self.tipo != TipoServico.MATERIAL:
            m2 = self.comissao_instalado_m2
            return [(f"Instalação {_qtd(area)} m² × {_brl(m2)}", area, (area * m2).quantize(CENTAVO))]

        forro = self.comissao_forro_m2
        linhas = [(f"Forro {_qtd(area)} m² × {_brl(forro)}", area, (area * forro).quantize(CENTAVO))]
        for item in self.orcamento.itens.all():
            if item.material_id and item.comissao_unitaria:
                valor = (item.quantidade * item.comissao_unitaria).quantize(CENTAVO)
                linhas.append((f"{item.descricao} {_qtd(item.quantidade)} {item.unidade} "
                               f"× {_brl(item.comissao_unitaria)}", item.quantidade, valor))
            elif not item.material_id and item.unidade == UNIDADE_SERVICO:
                servico = self.comissao_servico_m2
                linhas.append((f"Instalação {_qtd(area)} m² × {_brl(servico)}", area,
                               (area * servico).quantize(CENTAVO)))
        return linhas

    @property
    def comissao_valor(self):
        if self.status == StatusOS.CANCELADA:
            return Decimal("0.00")
        return sum((v for _, _, v in self.comissao_detalhe), Decimal("0.00")).quantize(CENTAVO)

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

    @property
    def valor_base_fechamento(self):
        """
        No fechamento o preço é sempre o à vista; o que for pago no cartão leva
        o acréscimo da maquininha, pago pelo cliente (Pagamento.acrescimo).
        """
        return self.valor_vista if self.valor_vista is not None else self.valor_total

    # --------------------------------------------------------------- atraso
    @property
    def data_limite(self):
        """O fim do último compromisso agendado: é o que define se a O.S. atrasou."""
        datas = [a.data_fim or a.data for a in self.agendamentos.all()]
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
        if novo == StatusOS.FINALIZADA:
            from .eventos import os_finalizada   # caixa e aviso ao vendedor
            os_finalizada(self, usuario)
        return self


class Agendamento(models.Model):
    """
    Entrega ocupa um dia; instalação ocupa de 1 a 6 dias úteis conforme a área,
    contados em turnos. As regras de vaga estão em `agenda.py` e são conferidas
    no clean().
    """

    ordem = models.ForeignKey(OrdemServico, on_delete=models.CASCADE, related_name="agendamentos")
    tipo = models.CharField(max_length=12, choices=TipoAgendamento.choices)
    data = models.DateField()
    turno = models.CharField(max_length=6, choices=Turno.choices)
    hora = models.TimeField(null=True, blank=True, help_text="Opcional, quando há hora marcada.")

    # Período calculado ao gravar: quantos turnos o serviço toma, onde termina e
    # cada turno ocupado ("2026-10-13:manha"). Guardado para que um bloqueio
    # criado depois não mude, sem aviso, o que já foi combinado com o cliente.
    duracao_turnos = models.PositiveSmallIntegerField(default=1)
    data_fim = models.DateField(null=True, blank=True)
    turno_fim = models.CharField(max_length=6, choices=Turno.choices, blank=True)
    ocupacao = models.JSONField(default=list, blank=True)

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

    @property
    def dias(self):
        """Duração em dias (1, 1,5 …) — o que a equipe lê."""
        return self.duracao_turnos / 2 if self.tipo == TipoAgendamento.INSTALACAO else 1

    def calcular_periodo(self, grade=None):
        """Preenche duração, fim e turnos ocupados a partir da área do orçamento."""
        from .agenda import Grade, chave, turnos_instalacao

        if self.tipo != TipoAgendamento.INSTALACAO:
            self.duracao_turnos = 1
            self.data_fim, self.turno_fim = self.data, self.turno
            self.ocupacao = [chave(self.data, self.turno)]
            return grade

        self.duracao_turnos = turnos_instalacao(self.ordem.area_m2 if self.ordem_id else None)
        grade = grade or Grade(self.data, self.data, excluir=self.pk)
        periodo = grade.percorrer(self.data, self.turno, self.duracao_turnos)
        self.ocupacao = [chave(d, t) for d, t in periodo]
        if periodo:
            self.data_fim, self.turno_fim = periodo[-1]
        else:
            self.data_fim, self.turno_fim = self.data, self.turno
        return grade

    def clean(self):
        from .agenda import Grade

        grade = Grade(self.data, self.data, excluir=self.pk)
        self.calcular_periodo(grade)
        if self.tipo == TipoAgendamento.INSTALACAO:
            motivo = grade.motivo_instalacao(self.data, self.turno, self.duracao_turnos)
            if motivo:
                raise ValidationError({"turno": motivo})
        else:
            motivo = grade.motivo_entrega(self.data)
            if not motivo and not grade.trabalha(self.data, self.turno):
                motivo = "Turno bloqueado na agenda."
            if motivo:
                raise ValidationError({"data": motivo})

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)


class Pagamento(models.Model):
    ordem = models.ForeignKey(OrdemServico, on_delete=models.CASCADE, related_name="pagamentos")
    forma = models.CharField(max_length=16, choices=FormaPagamento.choices)
    # `valor` é o que o cliente pagou de fato (no cartão, já com o acréscimo);
    # `acrescimo` é a parte que cobre a taxa da maquininha, repassada ao cliente.
    valor = models.DecimalField(max_digits=11, decimal_places=2)
    acrescimo = models.DecimalField("acréscimo do cartão", max_digits=11, decimal_places=2, default=0)
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
    Registro único com a capacidade da agenda (regras em `agenda.py`).

    Instalação: equipes trabalhando ao mesmo tempo, por turno. Entrega: por dia,
    e cada instalação consome uma no dia em que começa (leva o material).
    """

    capacidade_instalacao = models.PositiveSmallIntegerField(
        default=2, help_text="Instalações ao mesmo tempo (equipes), em cada turno."
    )
    capacidade_entrega_dia = models.PositiveSmallIntegerField(
        default=4, help_text="Entregas por dia. Cada instalação ocupa uma no dia em que começa."
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



def _taxas_padrao():
    # Tabela pública do PagBank, Visa/Master, faturamento de R$ 20 a 50 mil/mês,
    # recebimento no mesmo dia. Ponto de partida: a diretoria troca pelas taxas
    # reais da conta (app PagBank) na tela de Tabela de preços.
    return {"1": "3.07", "2": "5.37", "3": "6.10", "4": "6.84", "5": "7.56", "6": "8.26",
            "7": "8.98", "8": "9.68", "9": "10.37", "10": "11.04", "11": "11.73", "12": "12.38"}


class TaxasCartao(models.Model):
    """
    Taxas da maquininha, em % sobre o valor passado. Servem para repassar o
    custo do cartão ao cliente: a loja recebe o valor à vista e o cliente paga
    valor ÷ (1 − taxa). Registro único.
    """

    debito = models.DecimalField("débito (%)", max_digits=5, decimal_places=2, default=Decimal("1.25"))
    credito = models.JSONField("crédito por parcelas (%)", default=_taxas_padrao)
    atualizado_em = models.DateTimeField(auto_now=True)

    PARCELAS_MAX = 12

    class Meta:
        verbose_name = "taxas do cartão"
        verbose_name_plural = "taxas do cartão"

    def __str__(self):
        return "Taxas da maquininha"

    @classmethod
    def obter(cls):
        taxas, _ = cls.objects.get_or_create(pk=1)
        return taxas

    def taxa(self, forma, parcelas=1):
        """Percentual da maquininha para a forma e o número de parcelas (0 fora do cartão)."""
        if forma == FormaPagamento.DEBITO:
            return Decimal(self.debito)
        if forma == FormaPagamento.CREDITO:
            return Decimal(str(self.credito.get(str(parcelas), "0")))
        return Decimal("0")

    def acrescimo(self, base, forma, parcelas=1):
        """Quanto somar a `base` para a loja receber `base` limpo depois da taxa."""
        t = self.taxa(forma, parcelas) / 100
        if t <= 0 or t >= 1:
            return Decimal("0.00")
        return (base / (1 - t) - base).quantize(CENTAVO)


class ParametrosComissao(models.Model):
    """
    Valores de comissão por m², editados pela diretoria em Parâmetros.
    A comissão de cada material fica no próprio material (Material.comissao).
    Mudar aqui só vale para O.S. geradas depois. Registro único.
    """

    instalado_m2 = models.DecimalField("instalação completa (R$/m²)", max_digits=7, decimal_places=2,
                                       default=COMISSAO_POR_M2)
    material_forro_m2 = models.DecimalField("material — forro (R$/m²)", max_digits=7, decimal_places=2,
                                            default=COMISSAO_MATERIAL_FORRO_M2)
    material_servico_m2 = models.DecimalField("material — serviço de instalação (R$/m²)", max_digits=7,
                                              decimal_places=2, default=COMISSAO_MATERIAL_SERVICO_M2)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "parâmetros de comissão"
        verbose_name_plural = "parâmetros de comissão"

    def __str__(self):
        return "Parâmetros de comissão"

    @classmethod
    def obter(cls):
        p, _ = cls.objects.get_or_create(pk=1)
        return p
