from django.utils import timezone
from rest_framework import status as http, viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .models import AssinaturaPush, Chamado, Notificacao, PreferenciasNotificacao, StatusChamado, TipoNotificacao
from .serializers import ChamadoSerializer, NotificacaoSerializer
from .servicos import desligadas, notificar, notificar_ti, opcoes_de


# ---------------------------------------------------------------- notificações
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def notificacoes(request):
    """As 30 mais recentes de quem está logado, e quantas faltam ler."""
    from apps.ordens.rotinas import de_carona

    de_carona()   # avisos de horário rodam de carona com o sino (ver rotinas.py)
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


# ---------------------------------------------------------- push e preferências
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def push_chave(request):
    """Chave pública VAPID: o navegador assina o push com ela."""
    from .push import chaves

    return Response({"chave": chaves()[0]})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def push_assinar(request):
    """Guarda o aparelho para receber os avisos. O mesmo aparelho trocando de login passa para o novo."""
    d = request.data
    endpoint, chaves_ = d.get("endpoint"), d.get("keys") or {}
    if not endpoint or not chaves_.get("p256dh") or not chaves_.get("auth"):
        return Response({"detail": "Assinatura incompleta."}, status=http.HTTP_400_BAD_REQUEST)
    AssinaturaPush.objects.update_or_create(endpoint=endpoint, defaults={
        "usuario": request.user, "p256dh": chaves_["p256dh"], "auth": chaves_["auth"],
        "aparelho": request.META.get("HTTP_USER_AGENT", "")[:200],
    })
    return Response({"ok": True})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def push_cancelar(request):
    AssinaturaPush.objects.filter(endpoint=request.data.get("endpoint", ""), usuario=request.user).delete()
    return Response({"ok": True})


@api_view(["GET", "PUT"])
@permission_classes([IsAuthenticated])
def preferencias(request):
    """As notificações que o perfil pode escolher, cada uma ligada ou desligada."""
    u = request.user
    opcoes = opcoes_de(u)
    if request.method == "PUT":
        ligadas = request.data.get("ligadas") or {}
        validos = {t for t, _, _ in opcoes}
        atuais = desligadas(u)
        for tipo, ligado in ligadas.items():
            if tipo in validos:
                (atuais.discard if ligado else atuais.add)(tipo)
        PreferenciasNotificacao.objects.update_or_create(usuario=u, defaults={"desligadas": sorted(atuais)})
    off = desligadas(u)
    return Response({
        "itens": [{"tipo": t, "rotulo": r, "descricao": d, "ligado": t not in off} for t, r, d in opcoes],
        "aparelhos": AssinaturaPush.objects.filter(usuario=u).count(),
    })


@api_view(["GET", "POST"])
@permission_classes([AllowAny])
def rotinas(request):
    """
    Avisos de horário. Sem login de propósito: o GitHub Actions chama nos horários
    marcados. É inofensivo — cada aviso tem chave e não se repete.
    """
    from apps.ordens.rotinas import executar

    return Response(executar())


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
