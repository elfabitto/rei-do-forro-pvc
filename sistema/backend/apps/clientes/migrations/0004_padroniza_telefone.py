"""Põe os telefones já cadastrados no padrão (99) 99999-9999, quando dá."""
from django.db import migrations


def padronizar(apps, schema_editor):
    from apps.core import formatos

    Cliente = apps.get_model("clientes", "Cliente")
    for c in Cliente.objects.all():
        mudou = False
        for campo in ("telefone", "telefone_alt"):
            valor = getattr(c, campo)
            try:
                novo = formatos.telefone(valor) if valor else valor
            except ValueError:
                continue                       # fora do padrão: fica como está para a pessoa corrigir
            if novo != valor:
                setattr(c, campo, novo)
                mudou = True
        if mudou:
            c.save(update_fields=["telefone", "telefone_alt"])


class Migration(migrations.Migration):
    dependencies = [("clientes", "0003_alter_endereco_cidade_alter_endereco_uf")]
    operations = [migrations.RunPython(padronizar, migrations.RunPython.noop)]
