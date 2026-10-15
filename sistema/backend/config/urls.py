from django.contrib import admin
from django.urls import include, path, re_path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from apps.catalogo.views import AcabamentoViewSet, ForroViewSet, MaterialViewSet
from apps.clientes.views import ClienteViewSet, EnderecoViewSet
from apps.comunicacao.views import ChamadoViewSet, ler_notificacao, ler_todas, notificacoes
from apps.contas.views import UsuarioViewSet, eu
from apps.core.views import app_react, saude
from apps.financeiro.views import LancamentoViewSet
from apps.orcamentos.views import OrcamentoViewSet
from apps.ordens.views import (
    AgendamentoViewSet,
    OrdemServicoViewSet,
    PagamentoViewSet,
    agenda_disponibilidade,
    taxas_cartao,
    parametros_comissao,
    comissoes,
    pagar_comissoes_vendedor,
)
from apps.ordens.painel import painel, painel_calendario

router = DefaultRouter()
router.register("usuarios", UsuarioViewSet)
router.register("clientes", ClienteViewSet)
router.register("enderecos", EnderecoViewSet)
router.register("forros", ForroViewSet)
router.register("materiais", MaterialViewSet)
router.register("acabamentos", AcabamentoViewSet)
router.register("orcamentos", OrcamentoViewSet)
router.register("ordens-servico", OrdemServicoViewSet)
router.register("agendamentos", AgendamentoViewSet)
router.register("pagamentos", PagamentoViewSet)
router.register("lancamentos", LancamentoViewSet, basename="lancamento")
router.register("chamados", ChamadoViewSet, basename="chamado")

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include(router.urls)),
    path("api/eu/", eu, name="eu"),
    path("api/notificacoes/", notificacoes, name="notificacoes"),
    path("api/notificacoes/ler-todas/", ler_todas, name="notificacoes-ler-todas"),
    path("api/notificacoes/<int:pk>/ler/", ler_notificacao, name="notificacao-ler"),
    path("api/painel/", painel, name="painel"),
    path("api/painel/calendario/", painel_calendario, name="painel-calendario"),
    path("api/comissoes/", comissoes, name="comissoes"),
    path("api/comissoes/pagar/", pagar_comissoes_vendedor, name="comissoes-pagar"),
    path("api/agenda/disponibilidade/", agenda_disponibilidade, name="agenda-disponibilidade"),
    path("api/taxas-cartao/", taxas_cartao, name="taxas-cartao"),
    path("api/parametros-comissao/", parametros_comissao, name="parametros-comissao"),
    path("api/token/", TokenObtainPairView.as_view(), name="token"),
    path("api/token/refresh/", TokenRefreshView.as_view(), name="token-refresh"),
    path("api/saude/", saude, name="saude"),
    # telas do React (produção): tudo que não é API, admin ou arquivo
    re_path(r"^(?!api/|admin|static/|assets/)(?P<caminho>.*)$", app_react, name="app"),
]
