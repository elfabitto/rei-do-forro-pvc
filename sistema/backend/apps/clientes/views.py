from django.db.models import Q
from rest_framework import viewsets

from apps.core.formatos import digitos

from .models import Cliente, Endereco
from .serializers import ClienteSerializer, EnderecoSerializer


class ClienteViewSet(viewsets.ModelViewSet):
    queryset = Cliente.objects.prefetch_related("enderecos", "ordens")
    serializer_class = ClienteSerializer
    search_fields = ["nome", "telefone", "documento", "enderecos__bairro"]
    ordering_fields = ["nome", "criado_em"]

    def get_queryset(self):
        """?fone=99881122 acha o telefone ignorando parênteses, espaço e traço."""
        qs = super().get_queryset()
        fone = digitos(self.request.query_params.get("fone"))
        if fone:
            padrao = r"\D*".join(fone)
            qs = qs.filter(Q(telefone__regex=padrao) | Q(telefone_alt__regex=padrao))
        return qs

    def perform_create(self, serializer):
        serializer.save(criado_por=self.request.user)


class EnderecoViewSet(viewsets.ModelViewSet):
    queryset = Endereco.objects.select_related("cliente")
    serializer_class = EnderecoSerializer
    filterset_fields = ["cliente", "bairro"]
