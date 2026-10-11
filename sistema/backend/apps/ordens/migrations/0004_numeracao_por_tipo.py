"""
Acerta as O.S. que já existiam: copia o tipo do orçamento vinculado e troca a
numeração antiga (OS-2026-0001) pela que separa material de serviço
(OS-MAT-20260001 / OS-SERV-20260002). A sequência segue a ordem de criação.
"""
from django.db import migrations


def aplicar(apps, schema_editor):
    OrdemServico = apps.get_model("ordens", "OrdemServico")

    por_ano = {}
    for os_ in OrdemServico.objects.select_related("orcamento").order_by("id"):
        tipo = os_.orcamento.tipo if os_.orcamento_id else "instalado"
        os_.tipo = tipo

        ano = os_.criado_em.year
        seq = por_ano[ano] = por_ano.get(ano, 0) + 1
        sufixo = "MAT" if tipo == "material" else "SERV"
        os_.numero = f"OS-{sufixo}-{ano}{seq:04d}"
        os_.save(update_fields=["tipo", "numero"])


def desfazer(apps, schema_editor):
    """A numeração antiga não é reconstruível item a item; volta ao padrão anual."""
    OrdemServico = apps.get_model("ordens", "OrdemServico")
    por_ano = {}
    for os_ in OrdemServico.objects.order_by("id"):
        ano = os_.criado_em.year
        seq = por_ano[ano] = por_ano.get(ano, 0) + 1
        os_.numero = f"OS-{ano}-{seq:04d}"
        os_.save(update_fields=["numero"])


class Migration(migrations.Migration):
    dependencies = [("ordens", "0003_ordemservico_comissao_paga_and_more")]
    operations = [migrations.RunPython(aplicar, desfazer)]
