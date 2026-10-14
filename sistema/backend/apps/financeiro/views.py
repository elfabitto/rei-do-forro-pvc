from collections import defaultdict
from datetime import date
from decimal import Decimal

from django.db.models import Sum
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from apps.core.permissions import PodeVerFinanceiro
from apps.ordens.painel import _escala

from .models import CATEGORIAS_ENTRADA, Categoria, Lancamento, Origem, Tipo
from .serializers import LancamentoSerializer

ZERO = Decimal("0")


def _data(texto, padrao):
    try:
        return date.fromisoformat(texto) if texto else padrao
    except ValueError:
        return padrao


def _periodo(params):
    """Padrão: o mês corrente."""
    hoje = timezone.localdate()
    de = _data(params.get("de"), hoje.replace(day=1))
    ate = _data(params.get("ate"), hoje)
    if de > ate:
        de, ate = ate, de
    return de, ate


class LancamentoViewSet(viewsets.ModelViewSet):
    """
    Livro-caixa. Lista o período (?de=&ate=, padrão o mês). Automáticos
    (venda finalizada e baixa de comissão) não se editam aqui — mexe-se na origem.
    """

    serializer_class = LancamentoSerializer
    permission_classes = [PodeVerFinanceiro]
    pagination_class = None
    filterset_fields = ["tipo", "categoria", "origem"]
    search_fields = ["descricao", "observacao", "ordem__numero"]

    def get_queryset(self):
        qs = Lancamento.objects.select_related("ordem", "criado_por")
        if self.action == "list":
            de, ate = _periodo(self.request.query_params)
            qs = qs.filter(data__range=(de, ate))
        return qs

    def perform_create(self, serializer):
        serializer.save(criado_por=self.request.user, origem=Origem.MANUAL)

    def _so_manual(self, obj):
        if obj.automatico:
            raise PermissionDenied(
                "Lançamento automático: para mudar, estorne a comissão ou ajuste o pagamento da O.S."
            )

    def perform_update(self, serializer):
        self._so_manual(serializer.instance)
        serializer.save()

    def perform_destroy(self, instance):
        self._so_manual(instance)
        instance.delete()

    @action(detail=False)
    def resumo(self, request):
        de, ate = _periodo(request.query_params)
        todos = Lancamento.objects.all()
        no_periodo = list(todos.filter(data__range=(de, ate)))

        def soma(qs, tipo):
            return qs.filter(tipo=tipo).aggregate(v=Sum("valor"))["v"] or ZERO

        antes = todos.filter(data__lt=de)
        saldo_anterior = soma(antes, Tipo.ENTRADA) - soma(antes, Tipo.SAIDA)
        entradas = sum((l.valor for l in no_periodo if l.tipo == Tipo.ENTRADA), ZERO)
        saidas = sum((l.valor for l in no_periodo if l.tipo == Tipo.SAIDA), ZERO)

        cats = defaultdict(lambda: {"valor": ZERO, "qtd": 0})
        for l in no_periodo:
            cats[l.categoria]["valor"] += l.valor
            cats[l.categoria]["qtd"] += 1
        rotulos = dict(Categoria.choices)

        escala, pontos = _escala(de, ate)
        serie = [{"rotulo": r, "de": a, "ate": b, "entradas": ZERO, "saidas": ZERO} for a, b, r in pontos]
        for l in no_periodo:
            for p in serie:
                if p["de"] <= l.data <= p["ate"]:
                    p["entradas" if l.tipo == Tipo.ENTRADA else "saidas"] += l.valor
                    break
        acumulado = saldo_anterior
        for p in serie:
            acumulado += p["entradas"] - p["saidas"]
            p["saldo"] = acumulado

        return Response({
            "periodo": {"de": de, "ate": ate},
            "entradas": entradas,
            "saidas": saidas,
            "resultado": entradas - saidas,
            "saldo_anterior": saldo_anterior,
            "saldo_final": saldo_anterior + entradas - saidas,
            "automaticos": sum(1 for l in no_periodo if l.origem != Origem.MANUAL),
            "por_categoria": sorted(
                ({"categoria": k, "rotulo": rotulos.get(k, k),
                  "tipo": Tipo.ENTRADA if k in CATEGORIAS_ENTRADA else Tipo.SAIDA, **v}
                 for k, v in cats.items()), key=lambda r: -r["valor"]),
            "serie": {"escala": escala, "pontos": serie},
            "categorias": [{"valor": k, "rotulo": r,
                            "tipo": Tipo.ENTRADA if k in CATEGORIAS_ENTRADA else Tipo.SAIDA}
                           for k, r in Categoria.choices],
        })
