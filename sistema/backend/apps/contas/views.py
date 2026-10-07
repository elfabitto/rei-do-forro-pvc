from rest_framework import viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.core.permissions import SomenteDiretor

from .models import Usuario
from .serializers import EuSerializer, UsuarioSerializer


class UsuarioViewSet(viewsets.ModelViewSet):
    queryset = Usuario.objects.filter(is_active=True)
    serializer_class = UsuarioSerializer
    filterset_fields = ["papel", "is_active"]

    def get_permissions(self):
        # listar é livre (o React precisa dos nomes); mexer é da diretoria
        if self.action in ("list", "retrieve"):
            return [IsAuthenticated()]
        return [SomenteDiretor()]


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def eu(request):
    """Usuário logado + permissões, consumido pelo React no boot."""
    return Response(EuSerializer(request.user).data)
