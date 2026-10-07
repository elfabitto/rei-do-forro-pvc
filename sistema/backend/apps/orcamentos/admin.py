from django.contrib import admin

from .models import Orcamento, OrcamentoItem


class ItemInline(admin.TabularInline):
    model = OrcamentoItem
    extra = 0
    readonly_fields = ["total"]


@admin.register(Orcamento)
class OrcamentoAdmin(admin.ModelAdmin):
    list_display = ["numero", "cliente", "tipo", "forro", "area_m2", "total_vista", "status", "vendedor"]
    list_filter = ["status", "tipo", "vendedor"]
    search_fields = ["numero", "cliente__nome"]
    readonly_fields = ["numero", "preco_m2_vista", "preco_m2_cartao", "total_vista", "total_cartao"]
    inlines = [ItemInline]

    def save_model(self, request, obj, form, change):
        if not change:
            obj.criado_por = request.user
            if not obj.vendedor_id:
                obj.vendedor = request.user
        super().save_model(request, obj, form, change)
