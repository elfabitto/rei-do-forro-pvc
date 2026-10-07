from rest_framework import viewsets

from apps.core.permissions import PodeVender

from .models import Orcamento
from .serializers import OrcamentoSerializer


class OrcamentoViewSet(viewsets.ModelViewSet):
    queryset = Orcamento.objects.select_related(
        "cliente", "forro", "acabamento", "vendedor", "criado_por"
    ).prefetch_related("itens")
    serializer_class = OrcamentoSerializer
    permission_classes = [PodeVender]
    filterset_fields = ["status", "tipo", "vendedor", "cliente"]
    search_fields = ["numero", "cliente__nome", "forro__nome"]
    ordering_fields = ["criado_em", "numero", "total_vista"]

    def get_queryset(self):
        qs = super().get_queryset()
        if not self.request.user.pode_ver_tudo:
            qs = qs.filter(vendedor=self.request.user)
        return qs

    def perform_create(self, serializer):
        usuario = self.request.user
        vendedor = serializer.validated_data.get("vendedor")
        if not vendedor or not usuario.pode_trocar_vendedor:
            vendedor = usuario
        serializer.save(criado_por=usuario, vendedor=vendedor)
