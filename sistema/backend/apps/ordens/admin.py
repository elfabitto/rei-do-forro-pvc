from django.contrib import admin

from .models import (
    Agendamento,
    Bloqueio,
    ConfiguracaoAgenda,
    ParametrosComissao,
    TaxasCartao,
    HistoricoOS,
    OrdemServico,
    Pagamento,
    VisitaTecnica,
)


class AgendamentoInline(admin.TabularInline):
    model = Agendamento
    extra = 0


class PagamentoInline(admin.TabularInline):
    model = Pagamento
    extra = 0
    readonly_fields = ["registrado_por", "registrado_em"]


class HistoricoInline(admin.TabularInline):
    model = HistoricoOS
    extra = 0
    can_delete = False
    readonly_fields = ["de_status", "para_status", "usuario", "em", "observacao"]

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(OrdemServico)
class OrdemServicoAdmin(admin.ModelAdmin):
    list_display = ["numero", "tipo", "cliente", "status", "vendedor", "modalidade",
                    "valor_total", "saldo", "comissao", "comissao_paga", "atrasado", "criado_em"]
    list_filter = ["status", "tipo", "vendedor", "comissao_paga", "criado_em"]
    search_fields = ["numero", "cliente__nome"]
    readonly_fields = ["numero", "criado_por", "criado_em", "finalizada_por", "finalizada_em",
                       "cancelada_por", "cancelada_em", "comissao_paga_por", "comissao_paga_em"]
    inlines = [AgendamentoInline, PagamentoInline, HistoricoInline]

    @admin.display(description="saldo")
    def saldo(self, obj):
        return f"R$ {obj.saldo}"

    @admin.display(description="comissão")
    def comissao(self, obj):
        return f"R$ {obj.comissao_valor}"

    @admin.display(description="atrasado", boolean=True)
    def atrasado(self, obj):
        return obj.atrasado

    def save_model(self, request, obj, form, change):
        if not change:
            obj.criado_por = request.user
        super().save_model(request, obj, form, change)


@admin.register(Agendamento)
class AgendamentoAdmin(admin.ModelAdmin):
    list_display = ["ordem", "tipo", "data", "turno", "data_fim", "turno_fim", "responsavel", "concluido"]
    readonly_fields = ["duracao_turnos", "data_fim", "turno_fim", "ocupacao"]
    list_filter = ["tipo", "turno", "concluido", "data"]
    date_hierarchy = "data"


@admin.register(Bloqueio)
class BloqueioAdmin(admin.ModelAdmin):
    list_display = ["data", "turno", "motivo"]
    list_filter = ["turno"]


@admin.register(ConfiguracaoAgenda)
class ConfiguracaoAgendaAdmin(admin.ModelAdmin):
    list_display = ["__str__", "capacidade_instalacao", "capacidade_entrega_dia", "dias_sem_atendimento"]

    def has_add_permission(self, request):
        return not ConfiguracaoAgenda.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(TaxasCartao)
class TaxasCartaoAdmin(admin.ModelAdmin):
    list_display = ["__str__", "debito", "atualizado_em"]

    def has_add_permission(self, request):
        return not TaxasCartao.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(ParametrosComissao)
class ParametrosComissaoAdmin(admin.ModelAdmin):
    list_display = ["__str__", "instalado_m2", "material_forro_m2", "material_servico_m2"]

    def has_add_permission(self, request):
        return not ParametrosComissao.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(VisitaTecnica)
class VisitaTecnicaAdmin(admin.ModelAdmin):
    list_display = ["numero", "cliente", "data", "turno", "status", "vendedor"]
    list_filter = ["status", "data"]
    search_fields = ["numero", "cliente__nome"]
    raw_id_fields = ["cliente", "endereco", "orcamento"]

