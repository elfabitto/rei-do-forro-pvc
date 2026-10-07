from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import Usuario


@admin.register(Usuario)
class UsuarioAdmin(UserAdmin):
    list_display = ["username", "get_full_name", "papel", "comissao_percentual", "is_active"]
    list_filter = ["papel", "is_active"]
    fieldsets = UserAdmin.fieldsets + (
        ("Rei do Forro", {"fields": ("papel", "telefone", "comissao_percentual")}),
    )
    add_fieldsets = UserAdmin.add_fieldsets + (
        ("Rei do Forro", {"fields": ("papel", "telefone", "comissao_percentual")}),
    )
