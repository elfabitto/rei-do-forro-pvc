from django.contrib import admin

from .models import AssinaturaPush, Chamado, Notificacao


@admin.register(Chamado)
class ChamadoAdmin(admin.ModelAdmin):
    list_display = ["numero", "titulo", "categoria", "prioridade", "status", "autor", "criado_em"]
    list_filter = ["status", "categoria", "prioridade"]
    search_fields = ["titulo", "descricao"]


@admin.register(Notificacao)
class NotificacaoAdmin(admin.ModelAdmin):
    list_display = ["usuario", "tipo", "titulo", "criada_em", "lida_em"]
    list_filter = ["tipo"]


@admin.register(AssinaturaPush)
class AssinaturaPushAdmin(admin.ModelAdmin):
    list_display = ["usuario", "aparelho", "criada_em"]
    list_filter = ["usuario"]
