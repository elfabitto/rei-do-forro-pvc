"""
"Sem ripão": o abatimento passa a ser R$ 100,00 por dúzia de ripão (era R$ 150,00).
Na mesma proporção de 1 dúzia a cada 10 m², − R$ 10,00 por m².
"""
from decimal import Decimal

from django.db import migrations

NOME = "Sem ripão (cliente já tem a estrutura)"


def ajustar(apps, schema_editor):
    apps.get_model("catalogo", "Estrutura").objects.filter(nome=NOME).update(acrescimo_m2=Decimal("-10.00"))


def voltar(apps, schema_editor):
    apps.get_model("catalogo", "Estrutura").objects.filter(nome=NOME).update(acrescimo_m2=Decimal("-15.00"))


class Migration(migrations.Migration):
    dependencies = [("catalogo", "0010_forros_marmorizados")]

    operations = [migrations.RunPython(ajustar, voltar)]
