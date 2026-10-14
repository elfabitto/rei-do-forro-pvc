from django.contrib import admin

from .models import Lancamento


@admin.register(Lancamento)
class LancamentoAdmin(admin.ModelAdmin):
    list_display = ["data", "tipo", "categoria", "descricao", "valor", "origem", "ordem"]
    list_filter = ["tipo", "categoria", "origem", "data"]
    search_fields = ["descricao", "ordem__numero"]
    date_hierarchy = "data"
