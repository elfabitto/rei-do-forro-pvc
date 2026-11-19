"""Emenda H e Emenda Flexível: R$ 1,00 de comissão por unidade, como o perfil."""
from decimal import Decimal

from django.db import migrations

EMENDAS = ["Emenda H", "Emenda Flexível"]


def ajustar(apps, schema_editor):
    apps.get_model("catalogo", "Material").objects.filter(rotulo__in=EMENDAS).update(comissao=Decimal("1.00"))


def voltar(apps, schema_editor):
    apps.get_model("catalogo", "Material").objects.filter(rotulo__in=EMENDAS).update(comissao=Decimal("0"))


class Migration(migrations.Migration):
    dependencies = [("catalogo", "0008_materiais_acabamentos_estrutura")]

    operations = [migrations.RunPython(ajustar, voltar)]
