from django.contrib import admin

from .models import Cliente, Endereco


class EnderecoInline(admin.StackedInline):
    model = Endereco
    extra = 0


@admin.register(Cliente)
class ClienteAdmin(admin.ModelAdmin):
    list_display = ["nome", "telefone", "documento", "criado_em"]
    search_fields = ["nome", "telefone", "documento"]
    inlines = [EnderecoInline]

    def save_model(self, request, obj, form, change):
        if not change:
            obj.criado_por = request.user
        super().save_model(request, obj, form, change)
