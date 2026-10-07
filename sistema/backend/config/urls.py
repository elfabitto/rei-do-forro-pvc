from django.contrib import admin
from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from apps.catalogo.views import AcabamentoViewSet, ForroViewSet, MaterialViewSet
from apps.clientes.views import ClienteViewSet, EnderecoViewSet
from apps.contas.views import UsuarioViewSet, eu
from apps.orcamentos.views import OrcamentoViewSet
from apps.ordens.views import (
    AgendamentoViewSet,
    OrdemServicoViewSet,
    PagamentoViewSet,
    agenda_disponibilidade,
    painel,
)

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

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include(router.urls)),
    path("api/eu/", eu, name="eu"),
    path("api/painel/", painel, name="painel"),
    path("api/agenda/disponibilidade/", agenda_disponibilidade, name="agenda-disponibilidade"),
    path("api/token/", TokenObtainPairView.as_view(), name="token"),
    path("api/token/refresh/", TokenRefreshView.as_view(), name="token-refresh"),
]
