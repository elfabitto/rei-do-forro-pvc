"""
Plastilon como peça do orçamento de Material: vendido por unidade, R$ 27,00.
Entra logo depois de perfil, moldura e sanca (antes do grupo do ripão).
A comissão começa em zero — a diretoria define em Parâmetros.
"""
from decimal import Decimal

from django.db import migrations

ROTULO = "Plastilon"


def criar(apps, schema_editor):
    Material = apps.get_model("catalogo", "Material")
    if Material.objects.filter(rotulo=ROTULO).exists():
        return
    # abre espaço na ordem: o que vinha do ripão em diante desce uma posição
    ripao = Material.objects.filter(grupo="Ripão 4 m").order_by("ordem").first()
    posicao = ripao.ordem if ripao else Material.objects.count()
    for m in Material.objects.filter(ordem__gte=posicao).order_by("-ordem"):
        m.ordem += 1
        m.save(update_fields=["ordem"])
    Material.objects.create(nome="Plastilon", rotulo=ROTULO, grupo="", ordem=posicao,
                            unidade="und", preco=Decimal("27.00"), comissao=Decimal("0"))


def apagar(apps, schema_editor):
    apps.get_model("catalogo", "Material").objects.filter(rotulo=ROTULO).delete()


class Migration(migrations.Migration):
    dependencies = [("catalogo", "0004_carga_estruturas")]

    operations = [migrations.RunPython(criar, apagar)]
