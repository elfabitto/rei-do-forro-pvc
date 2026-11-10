"""
"Sem ripão": o cliente já tem a estrutura. Abate a dúzia do ripão padrão na
proporção da área — R$ 150,00 a dúzia para cada 10 m² = R$ 15,00 por m².
"""
from decimal import Decimal

from django.db import migrations

NOME = "Sem ripão (cliente já tem a estrutura)"


def criar(apps, schema_editor):
    Estrutura = apps.get_model("catalogo", "Estrutura")
    ordem = (Estrutura.objects.order_by("-ordem").values_list("ordem", flat=True).first() or 0) + 1
    Estrutura.objects.get_or_create(nome=NOME, defaults={"acrescimo_m2": Decimal("-15.00"), "ordem": ordem})


def apagar(apps, schema_editor):
    apps.get_model("catalogo", "Estrutura").objects.filter(nome=NOME).delete()


class Migration(migrations.Migration):
    dependencies = [("catalogo", "0005_material_plastilon")]

    operations = [migrations.RunPython(criar, apagar)]
