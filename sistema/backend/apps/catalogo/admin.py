from django.contrib import admin

from .models import Acabamento, Estrutura, Forro, Material


@admin.register(Forro)
class ForroAdmin(admin.ModelAdmin):
    list_display = ["nome", "preco_material_vista", "preco_material_cartao",
                    "preco_instalado_vista", "preco_instalado_cartao", "ativo"]
    list_editable = ["preco_material_vista", "preco_material_cartao",
                     "preco_instalado_vista", "preco_instalado_cartao", "ativo"]
    list_filter = ["ativo"]
    search_fields = ["nome"]


@admin.register(Material)
class MaterialAdmin(admin.ModelAdmin):
    list_display = ["rotulo", "grupo", "unidade", "preco", "unidade_cotacao", "preco_cotacao", "ativo"]
    list_editable = ["preco", "ativo"]
    list_filter = ["ativo", "grupo"]


@admin.register(Acabamento)
class AcabamentoAdmin(admin.ModelAdmin):
    list_display = ["nome", "acrescimo_m2", "ativo"]
    list_editable = ["acrescimo_m2", "ativo"]


@admin.register(Estrutura)
class EstruturaAdmin(admin.ModelAdmin):
    list_display = ["nome", "acrescimo_m2", "ativo"]
    list_editable = ["acrescimo_m2", "ativo"]
