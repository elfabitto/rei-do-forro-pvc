from datetime import date, timedelta
from decimal import Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Count, DecimalField, Q, Sum
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework import status as http, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.core.permissions import DonoOuSuperior, SomenteDiretor
from apps.orcamentos.models import Orcamento, StatusOrcamento

from .models import (
    COMISSAO_POR_M2,
    FORMAS_CARTAO,
    FORMAS_VISTA,
    Modalidade,
    ParametrosComissao,
    TaxasCartao,
    Agendamento,
    OrdemServico,
    Pagamento,
    StatusOS,
    StatusVisita,
    TipoAgendamento,
    Turno,
    VisitaTecnica,
)
from . import eventos
from .agenda import Grade, chave, turnos_instalacao
from .serializers import (
    AgendamentoSerializer,
    FinalizarSerializer,
    MudarStatusSerializer,
    OrdemServicoListaSerializer,
    OrdemServicoSerializer,
    PagamentoSerializer,
    PerderVisitaSerializer,
    ReagendarSerializer,
    ParametrosComissaoSerializer,
    TaxasCartaoSerializer,
    VisitaTecnicaSerializer,
)

ZERO = Coalesce(Sum("valor"), 0, output_field=DecimalField(max_digits=12, decimal_places=2))


class OrdemServicoViewSet(viewsets.ModelViewSet):
    """
    Serviço é informação de equipe: todos veem a lista inteira, porque a
    equipe precisa saber o que está marcado. Alterar continua sendo de quem
    lançou e da diretoria; finalizar e cancelar, só da diretoria.
    """

    queryset = OrdemServico.objects.select_related(
        "cliente", "endereco", "vendedor", "orcamento__forro", "orcamento__acabamento", "criado_por"
    ).prefetch_related("agendamentos", "pagamentos", "historico__usuario", "orcamento__itens")
    permission_classes = [DonoOuSuperior]
    filterset_fields = ["status", "vendedor", "cliente", "tipo"]
    search_fields = ["numero", "cliente__nome", "endereco__bairro"]
    ordering_fields = ["criado_em", "numero", "valor_total"]

    def get_serializer_class(self):
        return OrdemServicoListaSerializer if self.action == "list" else OrdemServicoSerializer

    def get_permissions(self):
        # apagar some com a O.S. e com o rastro dela no caixa: só a diretoria
        if self.action == "destroy":
            return [SomenteDiretor()]
        return super().get_permissions()

    @transaction.atomic
    def perform_destroy(self, instance):
        """
        Exclusão definitiva: a O.S. e tudo que ela gerou — lançamentos do
        Financeiro (pagamentos e comissão), pagamentos, agenda, histórico e os
        avisos do sino. O orçamento de origem volta a ficar em aberto (e a visita
        técnica dele, a agendada).
        """
        from apps.comunicacao.models import Notificacao
        from apps.financeiro.models import Lancamento

        Lancamento.objects.filter(Q(ordem=instance) | Q(pagamento__ordem=instance)).delete()
        # avisos da O.S.: os que levam o número no título ou abrem a própria O.S.
        Notificacao.objects.filter(
            Q(titulo__contains=instance.numero) | Q(link=f"/ordens?abrir={instance.id}")
        ).delete()
        if instance.orcamento_id:
            Orcamento.objects.filter(pk=instance.orcamento_id).update(status=StatusOrcamento.ABERTO)
            VisitaTecnica.objects.filter(orcamento_id=instance.orcamento_id).update(status=StatusVisita.AGENDADA)
        instance.delete()   # pagamentos, agendamentos e histórico vão junto (CASCADE)

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
            VisitaTecnica.objects.filter(orcamento_id=os_.orcamento_id).update(status=StatusVisita.CONVERTIDA)
        eventos.os_gerada(os_, usuario)

    # ------------------------------------------------------------------ ações
    # Quem executa o serviço não é necessariamente quem o lançou: qualquer um
    # da equipe pode marcar "em execução". As regras duras (só a diretoria
    # finaliza ou cancela) continuam dentro de `mudar_status` no modelo.
    @action(detail=True, methods=["post"], permission_classes=[IsAuthenticated])
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
    @transaction.atomic
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

        # O preço é o à vista. O que for pago no cartão leva o acréscimo da
        # maquininha, pago pelo cliente: a loja recebe o valor à vista limpo.
        taxas = TaxasCartao.obter()
        novos = []
        for p in v.get("pagamentos", []):
            acrescimo = taxas.acrescimo(p["valor"], p["forma"], p.get("parcelas", 1))
            novos.append((p, acrescimo))

        if v.get("desconto") is not None:
            os_.desconto = v["desconto"]
        acrescimos = sum((a for _, a in novos), Decimal("0")) + sum(
            (pg.acrescimo for pg in os_.pagamentos.all()), Decimal("0"))
        os_.valor_total = os_.valor_base_fechamento + acrescimos

        formas = {p["forma"] for p, _ in novos} | {pg.forma for pg in os_.pagamentos.all()}
        if formas and formas <= FORMAS_VISTA:
            os_.modalidade = Modalidade.VISTA
        elif formas and formas <= FORMAS_CARTAO:
            os_.modalidade = Modalidade.CARTAO
        elif formas:
            os_.modalidade = Modalidade.MISTO
        os_.save()

        for p, acrescimo in novos:
            Pagamento.objects.create(
                ordem=os_, forma=p["forma"], valor=p["valor"] + acrescimo, acrescimo=acrescimo,
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

    @action(detail=True, methods=["post"], permission_classes=[SomenteDiretor])
    @transaction.atomic
    def pagar_comissao(self, request, pk=None):
        """Dá baixa na comissão de quem trouxe o cliente — controle da diretoria."""
        os_ = self.get_object()
        if os_.status != StatusOS.FINALIZADA:
            raise ValidationError({"comissao": "A comissão só é paga depois do serviço finalizado."})
        if os_.comissao_paga:
            raise ValidationError({"comissao": "Esta comissão já foi paga."})
        os_.comissao_paga = True
        os_.comissao_paga_em = timezone.now()
        os_.comissao_paga_por = request.user
        os_.save(update_fields=["comissao_paga", "comissao_paga_em", "comissao_paga_por"])
        eventos.comissoes_pagas([os_], request.user)
        return Response(OrdemServicoSerializer(os_, context={"request": request}).data)

    @action(detail=True, methods=["post"], permission_classes=[SomenteDiretor])
    @transaction.atomic
    def estornar_comissao(self, request, pk=None):
        """Desfaz a baixa, para quando a diretoria marca a comissão errada."""
        os_ = self.get_object()
        eventos.comissao_estornada(os_)
        os_.comissao_paga = False
        os_.comissao_paga_em = None
        os_.comissao_paga_por = None
        os_.save(update_fields=["comissao_paga", "comissao_paga_em", "comissao_paga_por"])
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
        # pelo período: a instalação que começou antes de `de` e ainda está em
        # andamento também aparece
        if de:
            qs = qs.filter(Q(data_fim__gte=de) | Q(data_fim__isnull=True, data__gte=de))
        if ate:
            qs = qs.filter(data__lte=ate)
        return qs


class PagamentoViewSet(viewsets.ModelViewSet):
    queryset = Pagamento.objects.select_related("ordem", "registrado_por")
    serializer_class = PagamentoSerializer
    permission_classes = [SomenteDiretor]
    filterset_fields = ["ordem", "forma"]

    def perform_create(self, serializer):
        pg = serializer.save(registrado_por=self.request.user)
        eventos.pagamento_lancado(pg, self.request.user)


# ------------------------------------------------------------ visitas técnicas
class VisitaTecnicaViewSet(viewsets.ModelViewSet):
    """
    Orçamento presencial. Como os serviços, a lista é da equipe toda; mexer é de
    quem agendou e da diretoria. Excluir, só a diretoria — o normal é dar como
    perdida.
    """

    queryset = VisitaTecnica.objects.select_related(
        "cliente", "endereco", "vendedor", "orcamento__ordem_servico"
    )
    serializer_class = VisitaTecnicaSerializer
    permission_classes = [DonoOuSuperior]
    filterset_fields = ["status", "vendedor", "cliente"]
    search_fields = ["numero", "cliente__nome", "endereco__bairro"]
    ordering_fields = ["data", "criado_em", "numero"]

    def get_permissions(self):
        if self.action == "destroy":
            return [SomenteDiretor()]
        return super().get_permissions()

    def get_queryset(self):
        qs = super().get_queryset()
        p = self.request.query_params
        if p.get("de"):
            qs = qs.filter(data__gte=p["de"])
        if p.get("ate"):
            qs = qs.filter(data__lte=p["ate"])
        return qs

    def perform_create(self, serializer):
        usuario = self.request.user
        vendedor = serializer.validated_data.get("vendedor")
        if not vendedor or not usuario.pode_trocar_vendedor:
            vendedor = usuario
        visita = serializer.save(criado_por=usuario, vendedor=vendedor)
        eventos.visita_nova(visita, usuario)

    @action(detail=True, methods=["post"])
    def perder(self, request, pk=None):
        """O cliente desistiu: a visita sai da agenda e libera a vaga do dia."""
        visita = self.get_object()
        if visita.status != StatusVisita.AGENDADA:
            raise ValidationError({"status": "Só a visita agendada pode ser dada como perdida."})
        dados = PerderVisitaSerializer(data=request.data)
        dados.is_valid(raise_exception=True)
        visita.status = StatusVisita.PERDIDA
        visita.motivo_perda = dados.validated_data["motivo"]
        visita.perdida_em = timezone.now()
        visita.save()
        return Response(VisitaTecnicaSerializer(visita, context={"request": request}).data)


# --------------------------------------------------------------------- agenda
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def agenda_disponibilidade(request):
    """
    Mapa de vagas para o calendário, dia a dia (regras em agenda.py):

    - `entregas`: vagas de entrega do dia (instalação que começa no dia conta).
    - `turnos[].instalacoes`: equipes livres em cada turno.

    Com `tipo=instalacao` e `area` (ou `turnos`), diz também em que turnos uma
    instalação daquele tamanho pode começar e onde ela termina. `excluir` tira da
    conta o próprio agendamento que está sendo remarcado (`excluir_visita`, a
    visita técnica). `tipo=visita` segue a regra da entrega: 1 vaga no dia.
    """
    hoje = timezone.localdate()
    p = request.query_params
    de = date.fromisoformat(p.get("de", str(hoje)))
    ate = date.fromisoformat(p.get("ate", str(hoje + timedelta(days=45))))
    tipo = p.get("tipo", "")
    excluir = p.get("excluir") or None
    excluir_visita = p.get("excluir_visita") or None

    duracao = None
    if tipo == TipoAgendamento.INSTALACAO:
        if p.get("turnos"):
            duracao = max(1, int(p["turnos"]))
        else:
            duracao = turnos_instalacao(Decimal(p["area"]) if p.get("area") else None)

    grade = Grade(de, ate, excluir=excluir, excluir_visita=excluir_visita)
    dias = []
    d = de
    while d <= ate:
        atende = grade.atende(d)
        dia = {
            "data": str(d),
            "atende": atende,
            "entregas": {
                "usado": grade.entregas.get(d, 0),
                "total": grade.cap_entrega,
                "livre": grade.entregas_livres(d) if atende else 0,
                "visitas": grade.visitas.get(d, 0),
            },
            "turnos": [],
        }
        for turno, rotulo in Turno.choices:
            trabalha = grade.trabalha(d, turno)
            t = {
                "turno": turno,
                "turno_display": rotulo,
                "trabalha": trabalha,
                "instalacoes": {
                    "usado": grade.instalacoes.get((d, turno), 0),
                    "total": grade.cap_instalacao,
                    "livre": grade.instalacoes_livres(d, turno) if trabalha else 0,
                },
            }
            if tipo == TipoAgendamento.INSTALACAO:
                motivo = grade.motivo_instalacao(d, turno, duracao)
                t["disponivel"] = motivo is None
                t["motivo"] = motivo or ""
                periodo = grade.percorrer(d, turno, duracao) if trabalha else []
                if periodo:
                    fim_d, fim_t = periodo[-1]
                    t["termina"] = {"data": str(fim_d), "turno": fim_t, "turno_display": Turno(fim_t).label}
                    # cada turno que a instalação tomaria — a tela pinta o prazo no calendário
                    t["periodo"] = [chave(pd, pt) for pd, pt in periodo]
            elif tipo in (TipoAgendamento.ENTREGA, "visita"):
                motivo = grade.motivo_entrega(d) or ("" if trabalha else "Turno bloqueado na agenda.")
                t["disponivel"] = not motivo
                t["motivo"] = motivo
            dia["turnos"].append(t)
        if tipo:
            dia["disponivel"] = any(t["disponivel"] for t in dia["turnos"])
        dias.append(dia)
        d += timedelta(days=1)

    return Response({
        "de": str(de), "ate": str(ate), "tipo": tipo,
        "capacidade_instalacao": grade.cap_instalacao,
        "capacidade_entrega_dia": grade.cap_entrega,
        "duracao_turnos": duracao,
        "duracao_dias": duracao / 2 if duracao else None,
        "dias": dias,
    })


# ------------------------------------------------------------- taxas do cartão
@api_view(["GET", "PUT"])
@permission_classes([IsAuthenticated])
def taxas_cartao(request):
    """Taxas da maquininha: todos leem (o fechamento usa); só a diretoria altera."""
    taxas = TaxasCartao.obter()
    if request.method == "PUT":
        if not request.user.e_diretor:
            return Response({"detail": "Apenas a diretoria altera as taxas."}, status=http.HTTP_403_FORBIDDEN)
        dados = TaxasCartaoSerializer(taxas, data=request.data)
        dados.is_valid(raise_exception=True)
        dados.save()
    return Response(TaxasCartaoSerializer(taxas).data)


@api_view(["GET", "PUT"])
@permission_classes([IsAuthenticated])
def parametros_comissao(request):
    """Comissão por m²: todos leem; só a diretoria altera (vale para O.S. novas)."""
    p = ParametrosComissao.obter()
    if request.method == "PUT":
        if not request.user.e_diretor:
            return Response({"detail": "Apenas a diretoria altera os parâmetros."}, status=http.HTTP_403_FORBIDDEN)
        dados = ParametrosComissaoSerializer(p, data=request.data, partial=True)
        dados.is_valid(raise_exception=True)
        dados.save()
    return Response(ParametrosComissaoSerializer(p).data)


# ----------------------------------------------------------------- comissões
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def comissoes(request):
    """
    Comissões: R$ 2,00 por m² para quem trouxe o cliente. O ciclo segue a O.S.:

    - orçamento sem O.S.: ainda não há comissão;
    - O.S. agendada ou em execução: comissão **agendada** (vai receber);
    - O.S. finalizada: **a receber** — entra para a diretoria pagar;
    - baixa da diretoria (/ordens-servico/<id>/pagar_comissao/): **paga**.

    O.S. cancelada não gera comissão. Quem não vê o financeiro (vendedor)
    enxerga só as próprias.
    """
    user = request.user
    qs = (
        OrdemServico.objects.exclude(status=StatusOS.CANCELADA)
        .select_related("cliente", "vendedor", "orcamento")
        .prefetch_related("agendamentos", "orcamento__itens")
        .order_by("-criado_em")
    )
    if not user.pode_ver_financeiro:
        qs = qs.filter(vendedor=user)

    if (vendedor := request.query_params.get("vendedor")):
        qs = qs.filter(vendedor_id=vendedor)
    if (de := request.query_params.get("de")):
        qs = qs.filter(criado_em__date__gte=de)
    if (ate := request.query_params.get("ate")):
        qs = qs.filter(criado_em__date__lte=ate)

    ROTULOS = {"agendada": "Agendada", "a_receber": "A receber", "paga": "Paga"}
    zero = Decimal("0")
    resumo = {k: zero for k in ROTULOS}
    contagem = {k: 0 for k in ROTULOS}
    itens, por_vendedor = [], {}

    for os_ in qs:
        valor = os_.comissao_valor
        if os_.status != StatusOS.FINALIZADA:
            situacao = "agendada"
        elif os_.comissao_paga:
            situacao = "paga"
        else:
            situacao = "a_receber"

        # quando o serviço acontece: o primeiro compromisso agendado
        datas = sorted(a.data for a in os_.agendamentos.all())
        itens.append({
            "id": os_.id,
            "numero": os_.numero,
            "tipo_display": os_.get_tipo_display(),
            "status_os": os_.status,
            "status_os_display": os_.get_status_display(),
            "cliente": os_.cliente.nome,
            "area_m2": os_.area_m2,
            "valor": valor,
            "detalhe": [{"descricao": d, "valor": v} for d, _, v in os_.comissao_detalhe],
            "vendedor": os_.vendedor_id,
            "vendedor_nome": os_.vendedor.get_full_name() or os_.vendedor.username,
            "agendado_para": datas[0] if datas else None,
            "finalizada_em": os_.finalizada_em,
            "situacao": situacao,
            "situacao_display": ROTULOS[situacao],
            "paga": os_.comissao_paga,
            "paga_em": os_.comissao_paga_em,
        })
        resumo[situacao] += valor
        contagem[situacao] += 1

        linha = por_vendedor.setdefault(
            os_.vendedor_id,
            {"vendedor": os_.vendedor_id,
             "nome": os_.vendedor.get_full_name() or os_.vendedor.username,
             "ordens": 0, "agendada": zero, "aberto": zero, "pago": zero},
        )
        linha["ordens"] += 1
        chave = {"agendada": "agendada", "a_receber": "aberto", "paga": "pago"}[situacao]
        linha[chave] += valor

    # "aberto" e "pago" continuam aceitos (nomes antigos do filtro)
    filtro = {"aberto": "a_receber", "pago": "paga"}.get(
        request.query_params.get("situacao", ""), request.query_params.get("situacao", ""))
    if filtro in ROTULOS:
        itens = [i for i in itens if i["situacao"] == filtro]

    return Response({
        "por_m2": ParametrosComissao.obter().instalado_m2,
        "resumo": {
            "agendada": resumo["agendada"],
            "aberto": resumo["a_receber"],
            "pago": resumo["paga"],
            "total": sum(resumo.values(), zero),
            "contagem": {"agendada": contagem["agendada"], "aberto": contagem["a_receber"],
                         "pago": contagem["paga"]},
            "servicos": sum(contagem.values()),
        },
        "por_vendedor": sorted(por_vendedor.values(), key=lambda v: -(v["aberto"] + v["agendada"])),
        "itens": itens,
    })


@api_view(["POST"])
@permission_classes([SomenteDiretor])
def pagar_comissoes_vendedor(request):
    """
    Baixa de uma vez em tudo o que está a pagar para um vendedor — o que a
    diretoria faz quando acerta com a pessoa. Só entram serviços finalizados.
    """
    vendedor = request.data.get("vendedor")
    if not vendedor:
        raise ValidationError({"vendedor": "Informe de quem são as comissões."})
    pendentes = OrdemServico.objects.filter(
        vendedor_id=vendedor, status=StatusOS.FINALIZADA, comissao_paga=False,
    )
    lista = list(pendentes.select_related("vendedor", "orcamento").prefetch_related("orcamento__itens"))
    total = sum((o.comissao_valor for o in lista), Decimal("0"))
    agora = timezone.now()
    with transaction.atomic():
        for o in lista:
            o.comissao_paga, o.comissao_paga_em, o.comissao_paga_por = True, agora, request.user
            o.save(update_fields=["comissao_paga", "comissao_paga_em", "comissao_paga_por"])
        eventos.comissoes_pagas(lista, request.user)
    return Response({"pagas": len(lista), "total": total})
