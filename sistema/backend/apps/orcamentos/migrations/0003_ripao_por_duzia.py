"""
Ripão passa a ser cotado e lançado por dúzia, como no gerador do Pages.

Converte o catálogo (preço da unidade → preço da dúzia) e os itens já lançados
(36 und × R$ 12,50 → 3 dúzias × R$ 150,00). O total de cada item não muda: o que
muda é a unidade em que a quantidade é digitada e lida.
"""
from decimal import Decimal

from django.db import migrations

DUZIA = Decimal("12")


def para_duzia(apps, schema_editor):
    Material = apps.get_model("catalogo", "Material")
    OrcamentoItem = apps.get_model("orcamentos", "OrcamentoItem")

    for material in Material.objects.filter(unidade_cotacao="dúzia").exclude(unidade="dúzia"):
        material.preco = material.preco_cotacao or (material.preco * DUZIA)
        material.unidade = "dúzia"
        material.unidade_cotacao = ""
        material.preco_cotacao = None
        material.save(update_fields=["preco", "unidade", "unidade_cotacao", "preco_cotacao"])

    for item in OrcamentoItem.objects.filter(unidade="und", descricao__istartswith="Ripão"):
        item.quantidade = item.quantidade / DUZIA
        item.preco_unitario = item.preco_unitario * DUZIA
        item.unidade = "dúzia"
        item.save(update_fields=["quantidade", "preco_unitario", "unidade"])


def para_unidade(apps, schema_editor):
    Material = apps.get_model("catalogo", "Material")
    OrcamentoItem = apps.get_model("orcamentos", "OrcamentoItem")

    for material in Material.objects.filter(unidade="dúzia"):
        material.unidade_cotacao = "dúzia"
        material.preco_cotacao = material.preco
        material.preco = material.preco / DUZIA
        material.unidade = "und"
        material.save(update_fields=["preco", "unidade", "unidade_cotacao", "preco_cotacao"])

    for item in OrcamentoItem.objects.filter(unidade="dúzia"):
        item.quantidade = item.quantidade * DUZIA
        item.preco_unitario = item.preco_unitario / DUZIA
        item.unidade = "und"
        item.save(update_fields=["quantidade", "preco_unitario", "unidade"])


class Migration(migrations.Migration):
    dependencies = [
        ("orcamentos", "0002_alter_orcamento_status"),
        ("catalogo", "0001_initial"),
    ]
    operations = [migrations.RunPython(para_duzia, para_unidade)]
