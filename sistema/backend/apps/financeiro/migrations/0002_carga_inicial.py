"""
Leva para o caixa o que já aconteceu antes do Financeiro existir: pagamentos
das O.S. finalizadas (entradas) e comissões já pagas (saídas).

Usa os modelos de verdade porque a comissão depende da regra item a item do
modelo da O.S. — roda uma vez só, num banco que ainda não tem lançamentos.
"""
from django.db import migrations


def carregar(apps, schema_editor):
    from apps.financeiro import servicos
    from apps.ordens.models import OrdemServico

    for os_ in OrdemServico.objects.filter(status="finalizada").select_related("cliente", "vendedor"):
        quem = os_.finalizada_por or os_.criado_por
        for pg in os_.pagamentos.all():
            servicos.entrada_do_pagamento(pg, pg.registrado_por or quem)
        if os_.comissao_paga:
            servicos.saida_da_comissao(os_, os_.comissao_paga_por or quem)


class Migration(migrations.Migration):
    dependencies = [
        ("financeiro", "0001_initial"),
        ("orcamentos", "0006_comissao_item"),
        ("catalogo", "0002_comissao_material"),
    ]

    operations = [migrations.RunPython(carregar, migrations.RunPython.noop)]
