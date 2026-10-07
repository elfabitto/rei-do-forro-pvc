from rest_framework import viewsets

from .models import Cliente, Endereco
from .serializers import ClienteSerializer, EnderecoSerializer


class ClienteViewSet(viewsets.ModelViewSet):
    queryset = Cliente.objects.prefetch_related("enderecos", "ordens")
    serializer_class = ClienteSerializer
    search_fields = ["nome", "telefone", "documento", "enderecos__bairro"]
    ordering_fields = ["nome", "criado_em"]

    def perform_create(self, serializer):
        serializer.save(criado_por=self.request.user)


class EnderecoViewSet(viewsets.ModelViewSet):
    queryset = Endereco.objects.select_related("cliente")
    serializer_class = EnderecoSerializer
    filterset_fields = ["cliente", "bairro"]
