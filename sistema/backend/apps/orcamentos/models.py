from decimal import Decimal

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models, transaction
from django.utils import timezone

CENTAVO = Decimal("0.01")

# Instalação abaixo de 20 m² paga a logística/frete à parte.
AREA_MINIMA_SEM_TAXA = Decimal("20")
TAXA_LOGISTICA = Decimal("80.00")


class TipoOrcamento(models.TextChoices):
    MATERIAL = "material", "Material (só o forro)"
    INSTALADO = "instalado", "Instalação completa"


class StatusOrcamento(models.TextChoices):
    ABERTO = "aberto", "Em aberto"
    CONVERTIDO = "convertido", "Convertido em Serviço"
    PERDIDO = "perdido", "Perdido"


class Orcamento(models.Model):
    numero = models.CharField(max_length=16, unique=True, editable=False)

    cliente = models.ForeignKey(
        "clientes.Cliente", on_delete=models.PROTECT, related_name="orcamentos", null=True, blank=True
    )
    tipo = models.CharField(max_length=12, choices=TipoOrcamento.choices)

    # medida: área direta, largura × comprimento ou por folha (folha de 20 cm de largura)
    largura = models.DecimalField(max_digits=7, decimal_places=2, null=True, blank=True)
    comprimento = models.DecimalField(max_digits=7, decimal_places=2, null=True, blank=True)
    tamanho_folha = models.DecimalField("tamanho da folha (m)", max_digits=7, decimal_places=2, null=True, blank=True)
    quantidade_folhas = models.PositiveIntegerField("quantidade de folhas", null=True, blank=True)
    area_m2 = models.DecimalField("área (m²)", max_digits=9, decimal_places=2, validators=[MinValueValidator(Decimal("0.01"))])

    forro = models.ForeignKey("catalogo.Forro", on_delete=models.PROTECT, related_name="orcamentos")
    acabamento = models.ForeignKey(
        "catalogo.Acabamento",
        on_delete=models.PROTECT,
        related_name="orcamentos",
        null=True,
        blank=True,
        help_text="Só se aplica ao tipo Instalado.",
    )

    # Fotografia dos preços na data do orçamento: mudar a tabela depois
    # não pode alterar um orçamento já enviado ao cliente.
    preco_m2_vista = models.DecimalField(max_digits=9, decimal_places=2)
    preco_m2_cartao = models.DecimalField(max_digits=9, decimal_places=2)
    taxa_logistica = models.DecimalField("taxa de logística", max_digits=9, decimal_places=2, default=0)
    total_vista = models.DecimalField(max_digits=11, decimal_places=2, default=0)
    total_cartao = models.DecimalField(max_digits=11, decimal_places=2, default=0)

    status = models.CharField(max_length=12, choices=StatusOrcamento.choices, default=StatusOrcamento.ABERTO)
    validade_dias = models.PositiveSmallIntegerField(default=15)
    observacoes = models.TextField("observações", blank=True)

    # quem trouxe o cliente — base da comissão, herdada pela O.S.
    vendedor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="orcamentos_como_vendedor"
    )
    criado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="orcamentos_criados"
    )
    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-criado_em"]
        verbose_name = "orçamento"
        verbose_name_plural = "orçamentos"
        indexes = [
            models.Index(fields=["status", "-criado_em"]),
            models.Index(fields=["vendedor", "-criado_em"]),
        ]

    def __str__(self):
        return f"{self.numero} — {self.cliente or 'sem cliente'}"

    # ------------------------------------------------------------------ número
    @staticmethod
    def _proximo_numero():
        ano = timezone.localdate().year
        prefixo = f"ORC-{ano}-"
        ultimo = (
            Orcamento.objects.filter(numero__startswith=prefixo).order_by("-numero").values_list("numero", flat=True).first()
        )
        seq = int(ultimo.rsplit("-", 1)[1]) + 1 if ultimo else 1
        return f"{prefixo}{seq:04d}"

    # ------------------------------------------------------------------ cálculo
    def precos_vigentes(self):
        """Preço do m² a aplicar, já com o acréscimo do acabamento quando Instalado."""
        vista = self.forro.preco_m2(self.tipo, "vista")
        cartao = self.forro.preco_m2(self.tipo, "cartao")
        if self.tipo == TipoOrcamento.INSTALADO and self.acabamento_id:
            acrescimo = self.acabamento.acrescimo_m2
            vista += acrescimo
            cartao += acrescimo
        return vista, cartao

    def recalcular(self):
        """
        Refaz os totais a partir do m² e dos itens. O acabamento só entra no
        Instalado; no Material as peças são cobradas por unidade na lista de itens.
        Instalado abaixo de 20 m² soma a taxa de logística.
        """
        if self.tipo == TipoOrcamento.MATERIAL:
            self.acabamento = None

        self.preco_m2_vista, self.preco_m2_cartao = self.precos_vigentes()
        self.taxa_logistica = (
            TAXA_LOGISTICA
            if self.tipo == TipoOrcamento.INSTALADO and self.area_m2 < AREA_MINIMA_SEM_TAXA
            else Decimal("0")
        )

        forro_vista = (self.area_m2 * self.preco_m2_vista).quantize(CENTAVO)
        forro_cartao = (self.area_m2 * self.preco_m2_cartao).quantize(CENTAVO)

        # Antes do primeiro save não há PK, logo não há itens para somar — o
        # serializer cria os itens e chama save() de novo para fechar o total.
        itens = Decimal("0")
        if self.pk:
            itens = sum((i.total for i in self.itens.all()), Decimal("0")).quantize(CENTAVO)

        self.total_vista = forro_vista + itens + self.taxa_logistica
        self.total_cartao = forro_cartao + itens + self.taxa_logistica
        return self

    def save(self, *args, **kwargs):
        if not self.numero:
            with transaction.atomic():
                self.numero = self._proximo_numero()
                self.recalcular()
                return super().save(*args, **kwargs)
        self.recalcular()
        return super().save(*args, **kwargs)

    @property
    def convertido(self):
        return self.status == StatusOrcamento.CONVERTIDO


class OrcamentoItem(models.Model):
    """Material avulso do orçamento de Material, com preço congelado na data."""

    orcamento = models.ForeignKey(Orcamento, on_delete=models.CASCADE, related_name="itens")
    material = models.ForeignKey("catalogo.Material", on_delete=models.PROTECT, related_name="itens", null=True, blank=True)

    descricao = models.CharField("descrição", max_length=160)
    unidade = models.CharField(max_length=12)
    quantidade = models.DecimalField(max_digits=9, decimal_places=2)
    preco_unitario = models.DecimalField(max_digits=9, decimal_places=4)
    total = models.DecimalField(max_digits=11, decimal_places=2, default=0)

    class Meta:
        ordering = ["id"]
        verbose_name = "item do orçamento"
        verbose_name_plural = "itens do orçamento"

    def __str__(self):
        return f"{self.descricao} — {self.quantidade} {self.unidade}"

    def save(self, *args, **kwargs):
        if self.material and not self.descricao:
            self.descricao = self.material.rotulo
            self.unidade = self.material.unidade
            self.preco_unitario = self.material.preco
        self.total = (self.quantidade * self.preco_unitario).quantize(CENTAVO)
        return super().save(*args, **kwargs)
