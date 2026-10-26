"""
Carrega a tabela vigente (a mesma do gerador de orçamentos em docs/).

    python manage.py carregar_catalogo
"""
from decimal import Decimal

from django.core.management.base import BaseCommand

from apps.catalogo.models import Acabamento, Estrutura, Forro, Material

D = Decimal

FORROS = [
    # nome,                        mat_vista, mat_cartao, inst_vista, inst_cartao
    ("BRANCO GERMINADO",           "22.90", "24.70", "50.00", "54.00"),
    ("BRANCO LISO FOSCO",          "24.00", "25.90", "54.00", "58.30"),
    ("BRANCO LISO BRILHOSO",       "33.80", "36.50", "64.00", "69.00"),
    ("CEDRO T1 LISO",              "41.00", "44.30", "71.00", "76.50"),
    ("FREIJÓ GERMINADO",           "41.00", "44.30", "71.00", "76.50"),
    ("MOGNO GERMINADO",            "41.00", "44.30", "71.00", "76.50"),
    ("FREIJÓ T1 LISO",             "41.00", "44.30", "71.00", "76.50"),
    ("MOGNO LISO",                 "43.60", "47.00", "74.00", "79.90"),
    ("CEREJEIRA LISO",             "43.60", "47.00", "74.00", "79.90"),
    ("GUARUBA LISO",               "43.60", "47.00", "74.00", "79.90"),
    ("ADESIVADO IPÊ COLONIAL",     "46.00", "49.70", "80.00", "86.40"),
    ("ADESIVADO FREIJÓ COLONIAL",  "46.00", "49.70", "80.00", "86.40"),
]

# O ripão é cotado e lançado por dúzia, igual ao gerador do Pages:
# meia dúzia é 0,5 e sai por R$ 75,00 no Cutiuba.
# comissão = R$ por unidade de lançamento, para quem trouxe o cliente
MATERIAIS = [
    # nome,          rótulo,                grupo,        unidade,  preço,       cotação, comissão
    ("Perfil 6 m",   "Perfil 6 m",          "",           "und",   D("25.00"),  None,    D("1.00")),
    ("Moldura 6 m",  "Moldura 6 m",         "",           "und",   D("40.00"),  None,    D("1.00")),
    ("Sanca 6 m",    "Sanca 6 m",           "",           "und",   D("50.00"),  None,    D("1.00")),
    ("Cutiuba",      "Ripão 4 m Cutiuba",   "Ripão 4 m",  "dúzia", D("150.00"), None,    D("5.00")),
    ("Cupiuba",      "Ripão 4 m Cupiuba",   "Ripão 4 m",  "dúzia", D("180.00"), None,    D("5.00")),
    ("Prego 2 × 12", "Prego 2 × 12",        "Pregos",     "kg",    D("30.00"),  None,    D("0")),
    ("Prego 1 × 16", "Prego 1 × 16",        "Pregos",     "kg",    D("40.00"),  None,    D("0")),
]

ACABAMENTOS = [
    ("Acabamento normal (Perfil)", "0.00"),
    ("Moldura (4 cm)", "4.00"),
    ("Sanca (8 cm)", "8.00"),
]

# estrutura do forro no Instalado: a padrão já está no preço do m²
ESTRUTURAS = [
    ("Ripão Cutiuba (padrão)", "0.00"),
    ("Ripão Cupiuba", "5.00"),
    ("Plastilon", "15.00"),
]


class Command(BaseCommand):
    help = "Carrega forros, materiais e acabamentos da tabela vigente."

    def handle(self, *args, **options):
        for i, (nome, mv, mc, iv, ic) in enumerate(FORROS):
            Forro.objects.update_or_create(
                nome=nome,
                defaults={
                    "ordem": i,
                    "preco_material_vista": D(mv),
                    "preco_material_cartao": D(mc),
                    "preco_instalado_vista": D(iv),
                    "preco_instalado_cartao": D(ic),
                    "ativo": True,
                },
            )
        self.stdout.write(self.style.SUCCESS(f"{len(FORROS)} forros"))

        for i, (nome, rotulo, grupo, unid, preco, cot, comissao) in enumerate(MATERIAIS):
            Material.objects.update_or_create(
                rotulo=rotulo,
                defaults={
                    "nome": nome,
                    "grupo": grupo,
                    "ordem": i,
                    "unidade": unid,
                    "preco": preco,
                    "unidade_cotacao": cot[0] if cot else "",
                    "preco_cotacao": cot[1] if cot else None,
                    "comissao": comissao,
                    "ativo": True,
                },
            )
        self.stdout.write(self.style.SUCCESS(f"{len(MATERIAIS)} materiais"))

        for i, (nome, acr) in enumerate(ACABAMENTOS):
            Acabamento.objects.update_or_create(
                nome=nome, defaults={"acrescimo_m2": D(acr), "ordem": i, "ativo": True}
            )
        self.stdout.write(self.style.SUCCESS(f"{len(ACABAMENTOS)} acabamentos"))

        for i, (nome, acr) in enumerate(ESTRUTURAS):
            Estrutura.objects.update_or_create(
                nome=nome, defaults={"acrescimo_m2": D(acr), "ordem": i, "ativo": True}
            )
        self.stdout.write(self.style.SUCCESS(f"{len(ESTRUTURAS)} estruturas"))
