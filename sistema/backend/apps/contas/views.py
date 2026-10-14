from rest_framework import viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.core.permissions import SomenteDiretor

from .models import Usuario
from .serializers import EuSerializer, UsuarioGestaoSerializer, UsuarioSerializer


class UsuarioViewSet(viewsets.ModelViewSet):
    """
    Listar é livre (o React precisa dos nomes nos seletores) e só traz os
    ativos. O cadastro é da diretoria: com ?todos=1 vê também os inativos.
    Ninguém é apagado — desativar tira o acesso e preserva o histórico.
    """

    serializer_class = UsuarioSerializer
    queryset = Usuario.objects.all()   # o router lê o nome daqui
    filterset_fields = ["papel", "is_active"]
    search_fields = ["username", "first_name", "last_name", "email"]
    pagination_class = None

    def get_queryset(self):
        qs = Usuario.objects.all()
        if not (self.request.user.e_diretor and self.request.query_params.get("todos")):
            qs = qs.filter(is_active=True)
        return qs

    def get_serializer_class(self):
        return UsuarioGestaoSerializer if self.request.user.e_diretor else UsuarioSerializer

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [IsAuthenticated()]
        return [SomenteDiretor()]

    def perform_destroy(self, instance):
        if instance.pk != self.request.user.pk:
            instance.is_active = False
            instance.save(update_fields=["is_active"])


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def eu(request):
    """Usuário logado + permissões, consumido pelo React no boot."""
    return Response(EuSerializer(request.user).data)
