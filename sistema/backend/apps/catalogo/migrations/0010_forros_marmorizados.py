"""
Forros Marmorizado Rosa, Azul, Prata e Ouro — na faixa de R$ 41,00 (como o Cedro T1),
logo depois do Freijó T1 Liso. Só cria os que faltam e reposiciona a ordem: preços
que a diretoria já tenha ajustado em Tabela de preços não são tocados.
"""
from decimal import Decimal

from django.db import migrations

NOVOS = [
    # nome,               cor da amostra
    ("MARMORIZADO ROSA",  "linear-gradient(135deg,#f6d3db 20%,#de9fad 50%,#f6d3db 80%)"),
    ("MARMORIZADO AZUL",  "linear-gradient(135deg,#d6e8f4 20%,#9fc2d8 50%,#d6e8f4 80%)"),
    ("MARMORIZADO PRATA", "linear-gradient(135deg,#e3e8ec 20%,#c0c8cf 50%,#e3e8ec 80%)"),
    ("MARMORIZADO OURO",  "linear-gradient(135deg,#e6e7de 20%,#c5c7ba 50%,#e6e7de 80%)"),
]
DEPOIS_DE = "FREIJÓ T1 LISO"


def criar(apps, schema_editor):
    Forro = apps.get_model("catalogo", "Forro")
    for nome, cor in NOVOS:
        Forro.objects.get_or_create(
            nome=nome,
            defaults={
                "preco_material_vista": Decimal("41.00"),
                "preco_material_cartao": Decimal("44.30"),
                "preco_instalado_vista": Decimal("71.00"),
                "preco_instalado_cartao": Decimal("76.50"),
                "cor_amostra": cor,
                "ativo": True,
            },
        )

    # renumera: os novos entram logo depois do Freijó T1 Liso
    nomes_novos = [n for n, _ in NOVOS]
    existentes = list(Forro.objects.exclude(nome__in=nomes_novos).order_by("ordem", "nome"))
    novos = [Forro.objects.get(nome=n) for n in nomes_novos]
    pos = next((i + 1 for i, f in enumerate(existentes) if f.nome == DEPOIS_DE), len(existentes))
    for ordem, forro in enumerate(existentes[:pos] + novos + existentes[pos:]):
        if forro.ordem != ordem:
            forro.ordem = ordem
            forro.save(update_fields=["ordem"])


def apagar(apps, schema_editor):
    Forro = apps.get_model("catalogo", "Forro")
    # orçamento já feito com o forro protege o registro; nesse caso só desativa
    for nome, _ in NOVOS:
        forro = Forro.objects.filter(nome=nome).first()
        if not forro:
            continue
        try:
            forro.delete()
        except Exception:
            forro.ativo = False
            forro.save(update_fields=["ativo"])


class Migration(migrations.Migration):
    dependencies = [("catalogo", "0009_comissao_emendas")]

    operations = [migrations.RunPython(criar, apagar)]
