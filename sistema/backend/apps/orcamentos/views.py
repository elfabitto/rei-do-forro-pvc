from rest_framework import viewsets

from apps.core.permissions import DonoOuSuperior, PodeVender

from .models import Orcamento
from .serializers import OrcamentoSerializer


class OrcamentoViewSet(viewsets.ModelViewSet):
    """
    A lista é aberta: todo mundo vê os orçamentos de todo mundo, porque a
    equipe precisa acompanhar o movimento da loja. Editar, converter em serviço
    ou dar como perdido continua restrito a quem lançou e à diretoria —
    `DonoOuSuperior` garante isso no servidor, não só nos botões.
    """

    queryset = Orcamento.objects.select_related(
        "cliente", "forro", "acabamento", "vendedor", "criado_por"
    ).prefetch_related("itens")
    serializer_class = OrcamentoSerializer
    permission_classes = [PodeVender, DonoOuSuperior]
    filterset_fields = ["status", "tipo", "vendedor", "cliente"]
    search_fields = ["numero", "cliente__nome", "forro__nome"]
    ordering_fields = ["criado_em", "numero", "total_vista"]

    def perform_create(self, serializer):
        usuario = self.request.user
        vendedor = serializer.validated_data.get("vendedor")
        if not vendedor or not usuario.pode_trocar_vendedor:
            vendedor = usuario
        orc = serializer.save(criado_por=usuario, vendedor=vendedor)
        from apps.ordens.eventos import orcamento_novo

        orcamento_novo(orc, usuario)
