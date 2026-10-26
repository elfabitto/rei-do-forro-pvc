from decimal import Decimal

from django.db import models


class Forro(models.Model):
    """Uma linha da grade de catálogo, com os quatro preços por m²."""

    nome = models.CharField(max_length=80, unique=True)
    ordem = models.PositiveSmallIntegerField(default=0)

    preco_material_vista = models.DecimalField("só o forro — à vista", max_digits=9, decimal_places=2)
    preco_material_cartao = models.DecimalField("só o forro — cartão", max_digits=9, decimal_places=2)
    preco_instalado_vista = models.DecimalField("instalado — à vista", max_digits=9, decimal_places=2)
    preco_instalado_cartao = models.DecimalField("instalado — cartão", max_digits=9, decimal_places=2)

    cor_amostra = models.CharField(
        max_length=200, blank=True, help_text="Valor CSS de background para a amostra na tela."
    )
    ativo = models.BooleanField(default=True)

    class Meta:
        ordering = ["ordem", "nome"]

    def __str__(self):
        return self.nome

    def preco_m2(self, tipo, forma):
        """tipo: material|instalado · forma: vista|cartao"""
        return getattr(self, f"preco_{tipo}_{forma}")


class Material(models.Model):
    """
    Material avulso do orçamento de Material.

    `unidade` e `preco` são SEMPRE a unidade em que a quantidade é lançada e o preço dela.
    `unidade_cotacao`/`preco_cotacao` só documentam a cotação de origem quando ela é outra —
    hoje nenhum material usa isso: o ripão é cotado e lançado por dúzia (meia dúzia é 0,5).
    """

    nome = models.CharField(max_length=80)
    rotulo = models.CharField("rótulo no orçamento", max_length=120)
    grupo = models.CharField(max_length=60, blank=True, help_text="Ex.: Ripão 4 m, Pregos")
    ordem = models.PositiveSmallIntegerField(default=0)

    unidade = models.CharField("unidade de lançamento", max_length=12, default="und")
    preco = models.DecimalField("preço da unidade de lançamento", max_digits=9, decimal_places=4)

    unidade_cotacao = models.CharField(max_length=12, blank=True)
    preco_cotacao = models.DecimalField(max_digits=9, decimal_places=2, null=True, blank=True)

    # Comissão do vendedor na O.S. de Material, por unidade de lançamento
    # (perfil R$ 1,00/und, ripão R$ 5,00/dúzia). Congelada no item do orçamento.
    comissao = models.DecimalField("comissão por unidade", max_digits=7, decimal_places=2, default=0)

    ativo = models.BooleanField(default=True)

    class Meta:
        ordering = ["ordem", "nome"]
        verbose_name = "material"
        verbose_name_plural = "materiais"

    def __str__(self):
        return self.rotulo

    @property
    def tem_cotacao_diferente(self):
        return bool(self.unidade_cotacao) and self.unidade_cotacao != self.unidade


class Acabamento(models.Model):
    """
    Acréscimo por m² no orçamento Instalado. O acabamento normal (perfil) existe
    com acréscimo zero para que a O.S. sempre registre o que foi combinado.
    """

    nome = models.CharField(max_length=60, unique=True)
    acrescimo_m2 = models.DecimalField("acréscimo por m²", max_digits=7, decimal_places=2, default=Decimal("0"))
    ordem = models.PositiveSmallIntegerField(default=0)
    ativo = models.BooleanField(default=True)

    class Meta:
        ordering = ["ordem", "nome"]

    def __str__(self):
        if self.acrescimo_m2:
            return f"{self.nome} (+ R$ {self.acrescimo_m2}/m²)"
        return self.nome


class Estrutura(models.Model):
    """
    Estrutura que segura o forro (ripão), no orçamento Instalado — como o
    acabamento: a padrão vem com acréscimo zero (já inclusa no preço do m²) e
    as outras somam um valor por m².
    """

    nome = models.CharField(max_length=60, unique=True)
    acrescimo_m2 = models.DecimalField("acréscimo por m²", max_digits=7, decimal_places=2, default=Decimal("0"))
    ordem = models.PositiveSmallIntegerField(default=0)
    ativo = models.BooleanField(default=True)

    class Meta:
        ordering = ["ordem", "nome"]

    def __str__(self):
        if self.acrescimo_m2:
            return f"{self.nome} (+ R$ {self.acrescimo_m2}/m²)"
        return self.nome
