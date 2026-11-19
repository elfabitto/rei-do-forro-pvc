"""
Materiais do orçamento de Material em dois grupos, na ordem da tela:

- Acabamentos: Perfil 6 m, Perfil adesivado, Moldura 6 m, Sanca 6 m, Emenda H, Emenda Flexível
- Estrutura: Plastilon, Ripão 4 m Cutiuba, Ripão 4 m Cupiuba
- Pregos: como estão, no fim

Perfil, moldura e sanca passam a ter cor (Branco, Mogno…). Perfil adesivado e as
duas emendas são novos: perfil adesivado R$ 40,00 a vara, emendas R$ 35,00 cada.
"""
from decimal import Decimal

from django.db import migrations

ACABAMENTOS = "Acabamentos"
ESTRUTURA = "Estrutura"

# rótulo → (grupo, nome na tela, tem cor); a ordem da lista é a ordem na tela
ORDEM = [
    ("Perfil 6 m", ACABAMENTOS, "Perfil 6 m", True),
    ("Perfil adesivado", ACABAMENTOS, "Perfil adesivado", False),
    ("Moldura 6 m", ACABAMENTOS, "Moldura 6 m", True),
    ("Sanca 6 m", ACABAMENTOS, "Sanca 6 m", True),
    ("Emenda H", ACABAMENTOS, "Emenda H", False),
    ("Emenda Flexível", ACABAMENTOS, "Emenda Flexível", False),
    ("Plastilon", ESTRUTURA, "Plastilon", False),
    ("Ripão 4 m Cutiuba", ESTRUTURA, "Ripão 4 m Cutiuba", False),
    ("Ripão 4 m Cupiuba", ESTRUTURA, "Ripão 4 m Cupiuba", False),
]

# os novos: (rótulo, unidade, preço, comissão por unidade)
NOVOS = [
    ("Perfil adesivado", "und", Decimal("40.00"), Decimal("1.00")),   # a vara
    ("Emenda H", "und", Decimal("35.00"), Decimal("0")),
    ("Emenda Flexível", "und", Decimal("35.00"), Decimal("0")),
]


def organizar(apps, schema_editor):
    Material = apps.get_model("catalogo", "Material")
    for rotulo, unidade, preco, comissao in NOVOS:
        if not Material.objects.filter(rotulo=rotulo).exists():
            Material.objects.create(nome=rotulo, rotulo=rotulo, unidade=unidade, preco=preco, comissao=comissao)
    posicao = 0
    for rotulo, grupo, nome, tem_cor in ORDEM:
        m = Material.objects.filter(rotulo=rotulo).first()
        if not m:
            continue
        m.grupo, m.nome, m.tem_cor, m.ordem = grupo, nome, tem_cor, posicao
        m.save(update_fields=["grupo", "nome", "tem_cor", "ordem"])
        posicao += 1
    # o resto (pregos e o que mais houver) vem depois, na ordem que já tinha
    rotulos = [r for r, *_ in ORDEM]
    for m in Material.objects.exclude(rotulo__in=rotulos).order_by("ordem", "id"):
        m.ordem = posicao
        m.save(update_fields=["ordem"])
        posicao += 1


def desfazer(apps, schema_editor):
    Material = apps.get_model("catalogo", "Material")
    Material.objects.filter(rotulo__in=[r for r, *_ in NOVOS], itens__isnull=True).delete()
    Material.objects.filter(grupo=ACABAMENTOS).update(grupo="")
    Material.objects.filter(rotulo="Plastilon").update(grupo="")
    for rotulo, nome in (("Ripão 4 m Cutiuba", "Cutiuba"), ("Ripão 4 m Cupiuba", "Cupiuba")):
        Material.objects.filter(rotulo=rotulo).update(grupo="Ripão 4 m", nome=nome)


class Migration(migrations.Migration):
    dependencies = [("catalogo", "0007_material_tem_cor")]

    operations = [migrations.RunPython(organizar, desfazer)]
