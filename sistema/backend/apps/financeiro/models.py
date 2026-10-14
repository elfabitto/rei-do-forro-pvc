"""
Financeiro: o livro-caixa da empresa — tudo o que entra e tudo o que sai.

Dois lançamentos nascem sozinhos e ficam travados (a origem manda neles):
- cada pagamento de O.S. finalizada vira uma ENTRADA, pelo valor líquido
  (o acréscimo do cartão fica com a maquininha);
- cada baixa de comissão vira uma SAÍDA, pelo valor da comissão.
O resto (aluguel, combustível, compra de material…) a diretoria lança à mão.
"""
from decimal import Decimal

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models
from django.utils import timezone


class Tipo(models.TextChoices):
    ENTRADA = "entrada", "Entrada"
    SAIDA = "saida", "Saída"


class Origem(models.TextChoices):
    MANUAL = "manual", "Manual"
    VENDA = "venda", "Venda finalizada"
    COMISSAO = "comissao", "Baixa de comissão"


class Categoria(models.TextChoices):
    # entradas
    VENDA = "venda", "Venda / serviço"
    OUTRA_ENTRADA = "outra_entrada", "Outra entrada"
    # saídas
    COMISSAO = "comissao", "Comissão"
    MATERIAL = "material", "Compra de material"
    FRETE = "frete", "Frete / combustível"
    SALARIO = "salario", "Salários e diárias"
    ALUGUEL = "aluguel", "Aluguel e contas"
    IMPOSTO = "imposto", "Impostos e taxas"
    FERRAMENTA = "ferramenta", "Ferramentas e manutenção"
    MARKETING = "marketing", "Marketing"
    OUTRA_SAIDA = "outra_saida", "Outra saída"


CATEGORIAS_ENTRADA = {Categoria.VENDA, Categoria.OUTRA_ENTRADA}
CATEGORIAS_SAIDA = set(Categoria) - CATEGORIAS_ENTRADA


class Lancamento(models.Model):
    tipo = models.CharField(max_length=8, choices=Tipo.choices)
    categoria = models.CharField(max_length=16, choices=Categoria.choices)
    descricao = models.CharField("descrição", max_length=200)
    valor = models.DecimalField(max_digits=11, decimal_places=2, validators=[MinValueValidator(Decimal("0.01"))])
    data = models.DateField(default=timezone.localdate)
    forma = models.CharField("forma de pagamento", max_length=16, blank=True)
    observacao = models.CharField("observação", max_length=240, blank=True)

    origem = models.CharField(max_length=10, choices=Origem.choices, default=Origem.MANUAL)
    ordem = models.ForeignKey("ordens.OrdemServico", on_delete=models.PROTECT, null=True, blank=True,
                              related_name="lancamentos")
    # entrada automática: um lançamento por pagamento (some junto se o pagamento sair)
    pagamento = models.OneToOneField("ordens.Pagamento", on_delete=models.CASCADE, null=True, blank=True,
                                     related_name="lancamento")
    # saída automática: de quem é a comissão
    favorecido = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True,
                                   related_name="lancamentos_recebidos")

    criado_por = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "lançamento"
        verbose_name_plural = "lançamentos"
        ordering = ["-data", "-id"]
        constraints = [
            # uma saída de comissão por O.S.
            models.UniqueConstraint(fields=["ordem"], condition=models.Q(origem="comissao"),
                                    name="uma_comissao_por_os"),
        ]

    def __str__(self):
        return f"{self.get_tipo_display()} {self.valor} — {self.descricao}"

    @property
    def automatico(self):
        return self.origem != Origem.MANUAL
