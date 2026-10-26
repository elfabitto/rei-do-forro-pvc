"""Cadastra as estruturas do Instalado (ripão) — a diretoria ajusta os valores em Tabela de preços."""
from decimal import Decimal

from django.db import migrations

ESTRUTURAS = [
    ("Ripão Cutiuba (padrão)", Decimal("0.00")),
    ("Ripão Cupiuba", Decimal("5.00")),
    ("Plastilon", Decimal("15.00")),
]


def criar(apps, schema_editor):
    Estrutura = apps.get_model("catalogo", "Estrutura")
    for ordem, (nome, acrescimo) in enumerate(ESTRUTURAS):
        Estrutura.objects.get_or_create(nome=nome, defaults={"acrescimo_m2": acrescimo, "ordem": ordem})


def apagar(apps, schema_editor):
    Estrutura = apps.get_model("catalogo", "Estrutura")
    Estrutura.objects.filter(nome__in=[n for n, _ in ESTRUTURAS]).delete()


class Migration(migrations.Migration):
    dependencies = [("catalogo", "0003_estrutura")]

    operations = [migrations.RunPython(criar, apagar)]
