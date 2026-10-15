from django.utils import timezone
from rest_framework import status as http, viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Chamado, Notificacao, StatusChamado, TipoNotificacao
from .serializers import ChamadoSerializer, NotificacaoSerializer
from .servicos import notificar, notificar_ti


# ---------------------------------------------------------------- notificações
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def notificacoes(request):
    """As 30 mais recentes de quem está logado, e quantas faltam ler."""
    minhas = Notificacao.objects.filter(usuario=request.user)
    return Response({
        "nao_lidas": minhas.filter(lida_em__isnull=True).count(),
        "itens": NotificacaoSerializer(minhas[:30], many=True).data,
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def ler_notificacao(request, pk):
    n = Notificacao.objects.filter(usuario=request.user, pk=pk).first()
    if not n:
        return Response(status=http.HTTP_404_NOT_FOUND)
    if not n.lida_em:
        n.lida_em = timezone.now()
        n.save(update_fields=["lida_em"])
    return Response(NotificacaoSerializer(n).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def ler_todas(request):
    n = Notificacao.objects.filter(usuario=request.user, lida_em__isnull=True).update(lida_em=timezone.now())
    return Response({"lidas": n})


# -------------------------------------------------------------------- chamados
CAMPOS_DO_AUTOR = {"titulo", "descricao", "categoria", "prioridade", "tela"}
CAMPOS_DO_TI = {"status", "resposta"}


class ChamadoViewSet(viewsets.ModelViewSet):
    """
    Sugestões e melhorias para o TI. Cada um vê e edita (enquanto aberto) os
    próprios; o TI vê todos, muda o status e responde.
    """

    serializer_class = ChamadoSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ["status", "categoria", "prioridade"]
    search_fields = ["titulo", "descricao", "tela"]
    pagination_class = None

    def get_queryset(self):
        qs = Chamado.objects.select_related("autor", "respondido_por")
        if not self.request.user.pode_atender_chamados:
            qs = qs.filter(autor=self.request.user)
        return qs

    def perform_create(self, serializer):
        c = serializer.save(autor=self.request.user, status=StatusChamado.ABERTO, resposta="")
        nome = self.request.user.get_full_name() or self.request.user.username
        notificar_ti(TipoNotificacao.CHAMADO, f"Chamado #{c.numero}: {c.titulo}",
                            f"{nome} abriu um chamado ({c.get_categoria_display().lower()}).",
                            "/chamados", exceto=self.request.user)

    def perform_update(self, serializer):
        c, u = serializer.instance, self.request.user
        campos = set(serializer.validated_data)
        if not u.pode_atender_chamados:
            if c.autor_id != u.id or c.status != StatusChamado.ABERTO:
                raise PermissionDenied("Só dá para editar o próprio chamado enquanto está aberto.")
            if campos & CAMPOS_DO_TI:
                raise PermissionDenied("Status e resposta são dados pelo TI.")

        antes = (c.status, c.resposta)
        extra = {}
        if "resposta" in campos and serializer.validated_data["resposta"] != c.resposta:
            extra = {"respondido_por": u, "respondido_em": timezone.now()}
        c = serializer.save(**extra)

        if (c.status, c.resposta) != antes and c.autor_id != u.id:
            notificar(c.autor, TipoNotificacao.CHAMADO, f"Chamado #{c.numero}: {c.get_status_display()}",
                      (c.resposta or c.titulo)[:300], "/chamados")

    def perform_destroy(self, instance):
        u = self.request.user
        if not (u.pode_atender_chamados or (instance.autor_id == u.id and instance.status == StatusChamado.ABERTO)):
            raise PermissionDenied("Só dá para excluir o próprio chamado enquanto está aberto.")
        instance.delete()
