from datetime import date, timedelta

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Count, DecimalField, Q, Sum
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework import status as http, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.core.permissions import SomenteDiretor
from apps.orcamentos.models import Orcamento, StatusOrcamento

from .models import (
    Agendamento,
    ConfiguracaoAgenda,
    OrdemServico,
    Pagamento,
    StatusOS,
    Turno,
)
from .serializers import (
    AgendamentoSerializer,
    FinalizarSerializer,
    MudarStatusSerializer,
    OrdemServicoListaSerializer,
    OrdemServicoSerializer,
    PagamentoSerializer,
    ReagendarSerializer,
)

ZERO = Coalesce(Sum("valor"), 0, output_field=DecimalField(max_digits=12, decimal_places=2))


class OrdemServicoViewSet(viewsets.ModelViewSet):
    queryset = OrdemServico.objects.select_related(
        "cliente", "endereco", "vendedor", "orcamento", "criado_por"
    ).prefetch_related("agendamentos", "pagamentos", "historico__usuario")
    filterset_fields = ["status", "vendedor", "cliente"]
    search_fields = ["numero", "cliente__nome", "endereco__bairro"]
    ordering_fields = ["criado_em", "numero", "valor_total"]

    def get_serializer_class(self):
        return OrdemServicoListaSerializer if self.action == "list" else OrdemServicoSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        if not self.request.user.pode_ver_tudo:
            qs = qs.filter(Q(vendedor=self.request.user) | Q(criado_por=self.request.user))
        return qs

    def perform_create(self, serializer):
        """
        Quem trouxe o cliente é, por padrão, o usuário logado. A diretoria pode
        informar outro já na criação — é o caso de lançar a O.S. a pedido do funcionário.
        """
        usuario = self.request.user
        vendedor = serializer.validated_data.get("vendedor")
        if not vendedor or not usuario.pode_trocar_vendedor:
            vendedor = usuario
        os_ = serializer.save(criado_por=usuario, vendedor=vendedor)

        if os_.orcamento_id:
            Orcamento.objects.filter(pk=os_.orcamento_id).update(status=StatusOrcamento.CONVERTIDO)

    # ------------------------------------------------------------------ ações
    @action(detail=True, methods=["post"])
    def mudar_status(self, request, pk=None):
        os_ = self.get_object()
        s = MudarStatusSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        try:
            os_.mudar_status(s.validated_data["status"], request.user, s.validated_data["observacao"])
        except DjangoValidationError as e:
            raise ValidationError(e.messages)
        return Response(OrdemServicoSerializer(os_, context={"request": request}).data)

    @action(detail=True, methods=["post"], permission_classes=[SomenteDiretor])
    def finalizar(self, request, pk=None):
        """
        Fecha a O.S.: escolhe a modalidade (à vista ou cartão), aplica desconto
        se houver e lança os pagamentos recebidos. É o momento em que a diretoria
        confere o que o cliente pagou e encerra o serviço.
        """
        os_ = self.get_object()
        dados = FinalizarSerializer(data=request.data)
        dados.is_valid(raise_exception=True)
        v = dados.validated_data

        try:
            if v.get("modalidade"):
                os_.aplicar_modalidade(v["modalidade"])
            if v.get("desconto") is not None:
                os_.desconto = v["desconto"]
            if v.get("modalidade") or v.get("desconto") is not None:
                os_.save()
        except DjangoValidationError as e:
            raise ValidationError(e.message_dict if hasattr(e, "message_dict") else e.messages)

        for p in v.get("pagamentos", []):
            Pagamento.objects.create(
                ordem=os_, forma=p["forma"], valor=p["valor"],
                parcelas=p.get("parcelas", 1), observacao=p.get("observacao", ""),
                registrado_por=request.user,
            )

        try:
            os_.refresh_from_db()
            if os_.status == StatusOS.GERADA:
                os_.mudar_status(StatusOS.EM_EXECUCAO, request.user, "Fechamento direto")
            os_.refresh_from_db()
            os_.mudar_status(StatusOS.FINALIZADA, request.user, v.get("observacao", ""))
        except DjangoValidationError as e:
            raise ValidationError(e.messages)
        return Response(OrdemServicoSerializer(os_, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path=r"reagendar/(?P<agendamento>\d+)")
    def reagendar(self, request, pk=None, agendamento=None):
        """Remarca um compromisso — a saída para a O.S. que atrasou."""
        os_ = self.get_object()
        item = os_.agendamentos.filter(pk=agendamento).first()
        if not item:
            raise ValidationError({"agendamento": "Compromisso não encontrado nesta O.S."})

        dados = ReagendarSerializer(data=request.data)
        dados.is_valid(raise_exception=True)
        item.data = dados.validated_data["data"]
        item.turno = dados.validated_data["turno"]
        try:
            item.save()
        except DjangoValidationError as e:
            raise ValidationError(e.message_dict if hasattr(e, "message_dict") else e.messages)

        os_.refresh_from_db()
        return Response(OrdemServicoSerializer(os_, context={"request": request}).data)


class AgendamentoViewSet(viewsets.ModelViewSet):
    queryset = Agendamento.objects.select_related("ordem__cliente", "ordem__endereco", "responsavel")
    serializer_class = AgendamentoSerializer
    filterset_fields = ["tipo", "turno", "data", "concluido", "ordem"]

    def get_queryset(self):
        qs = super().get_queryset().exclude(ordem__status=StatusOS.CANCELADA)
        de, ate = self.request.query_params.get("de"), self.request.query_params.get("ate")
        if de:
            qs = qs.filter(data__gte=de)
        if ate:
            qs = qs.filter(data__lte=ate)
        return qs


class PagamentoViewSet(viewsets.ModelViewSet):
    queryset = Pagamento.objects.select_related("ordem", "registrado_por")
    serializer_class = PagamentoSerializer
    permission_classes = [SomenteDiretor]
    filterset_fields = ["ordem", "forma"]

    def perform_create(self, serializer):
        serializer.save(registrado_por=self.request.user)


# --------------------------------------------------------------------- agenda
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def agenda_disponibilidade(request):
    """
    Mapa de ocupação para o calendário: por dia e turno, quantas vagas de entrega
    e de instalação ainda existem. É o que o React desenha como "2 vagas" / "lotado".
    """
    hoje = timezone.localdate()
    de = date.fromisoformat(request.query_params.get("de", str(hoje)))
    ate = date.fromisoformat(request.query_params.get("ate", str(hoje + timedelta(days=45))))

    cfg = ConfiguracaoAgenda.obter()
    sem_atendimento = cfg.dias_sem_atendimento_lista

    # A vaga é do turno: entrega e instalação disputam o mesmo limite.
    ocupacao = (
        Agendamento.objects.filter(data__range=(de, ate))
        .exclude(ordem__status=StatusOS.CANCELADA)
        .values("data", "turno")
        .annotate(n=Count("id"))
    )
    mapa = {(o["data"], o["turno"]): o["n"] for o in ocupacao}
    limite = cfg.capacidade()

    dias = []
    d = de
    while d <= ate:
        if d.weekday() in sem_atendimento:
            dias.append({"data": str(d), "atende": False, "turnos": [], "livre_total": 0})
        else:
            turnos = []
            for turno, rotulo in Turno.choices:
                usado = mapa.get((d, turno), 0)
                turnos.append({
                    "turno": turno,
                    "turno_display": rotulo,
                    "usado": usado,
                    "total": limite,
                    "livre": max(0, limite - usado),
                })
            dias.append({
                "data": str(d),
                "atende": True,
                "turnos": turnos,
                "livre_total": sum(t["livre"] for t in turnos),
            })
        d += timedelta(days=1)

    return Response({"de": str(de), "ate": str(ate), "capacidade_turno": limite, "dias": dias})


# --------------------------------------------------------------------- painel
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def painel(request):
    """Números do dashboard. O bloco financeiro só vai para quem pode vê-lo."""
    user = request.user
    hoje = timezone.localdate()
    inicio_mes = hoje.replace(day=1)

    orcs = Orcamento.objects.all()
    oss = OrdemServico.objects.all()
    if not user.pode_ver_tudo:
        orcs = orcs.filter(vendedor=user)
        oss = oss.filter(Q(vendedor=user) | Q(criado_por=user))

    no_mes = orcs.filter(criado_em__date__gte=inicio_mes)
    convertidos = no_mes.filter(status=StatusOrcamento.CONVERTIDO).count()
    total_mes = no_mes.count()

    # série das últimas 6 semanas para o gráfico de conversão
    semanas = []
    for k in range(5, -1, -1):
        fim = hoje - timedelta(days=7 * k)
        ini = fim - timedelta(days=6)
        faixa = orcs.filter(criado_em__date__range=(ini, fim))
        semanas.append({
            "inicio": str(ini),
            "fim": str(fim),
            "total": faixa.count(),
            "convertidos": faixa.filter(status=StatusOrcamento.CONVERTIDO).count(),
        })

    dados = {
        "orcamentos_mes": total_mes,
        "convertidos_mes": convertidos,
        "taxa_conversao": round(convertidos / total_mes * 100) if total_mes else 0,
        "os_geradas": oss.filter(status=StatusOS.GERADA).count(),
        "os_em_execucao": oss.filter(status=StatusOS.EM_EXECUCAO).count(),
        "semanas": semanas,
    }

    if user.pode_ver_financeiro:
        ativas = OrdemServico.objects.exclude(status=StatusOS.CANCELADA)
        total = ativas.aggregate(v=Coalesce(Sum("valor_total"), 0,
                                            output_field=DecimalField(max_digits=12, decimal_places=2)))["v"]
        pago = Pagamento.objects.filter(ordem__in=ativas).aggregate(v=ZERO)["v"]
        dados["financeiro"] = {
            "a_receber": total - pago,
            "recebido": pago,
            "faturado_mes": Pagamento.objects.filter(data__gte=inicio_mes).aggregate(v=ZERO)["v"],
        }
        dados["comissoes"] = [
            {
                "usuario": r["vendedor__first_name"] or r["vendedor__username"],
                "ordens": r["n"],
                "valor": r["total"],
            }
            for r in ativas.values("vendedor__first_name", "vendedor__username")
            .annotate(n=Count("id"), total=Coalesce(Sum("valor_total"), 0,
                      output_field=DecimalField(max_digits=12, decimal_places=2)))
            .order_by("-total")
        ]

    return Response(dados)
