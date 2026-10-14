"""
Painel da diretoria: o que a empresa vendeu, recebeu, executou e deve.

Tudo gira em torno de um período (padrão: últimos 7 dias, até hoje). Cada
número vem junto do mesmo número no período anterior de mesmo tamanho, para
a diretoria ver se está subindo ou caindo.

- Venda = O.S. gerada no período (canceladas não contam). m² e R$ saem dela.
- Serviço executado / entrega feita = agendamento do período cuja O.S. já
  foi finalizada. O resto do período é "previsto" (ou "atrasado", se a data
  já passou e a O.S. não fechou).
"""
from calendar import monthrange
from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal

from django.utils import timezone
from rest_framework import status as http
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.orcamentos.models import Orcamento, StatusOrcamento

from .agenda import ler_chave
from .models import (
    Agendamento,
    FormaPagamento,
    OrdemServico,
    Pagamento,
    StatusOS,
    TipoAgendamento,
    TipoServico,
)

ZERO = Decimal("0")
MAX_DIAS = 400
MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]


def _data(texto):
    try:
        return date.fromisoformat(texto) if texto else None
    except ValueError:
        return None


def _periodo(request):
    hoje = timezone.localdate()
    de = _data(request.GET.get("de")) or hoje - timedelta(days=6)
    ate = _data(request.GET.get("ate")) or (de if request.GET.get("de") else hoje)
    if de > ate:
        de, ate = ate, de
    if (ate - de).days >= MAX_DIAS:
        de = ate - timedelta(days=MAX_DIAS - 1)
    return de, ate


def _nome(usuario):
    return usuario.get_full_name() or usuario.username


def _proibido():
    return Response({"detail": "O painel é exclusivo da diretoria."}, status=http.HTTP_403_FORBIDDEN)


def _dias_da_instalacao(ag):
    """Dias que a instalação ocupa (pela grade gravada no agendamento)."""
    dias = {ler_chave(c)[0] for c in (ag.ocupacao or [])}
    return sorted(dias) or [ag.data]


def _vendas(de, ate):
    return list(
        OrdemServico.objects.exclude(status=StatusOS.CANCELADA)
        .filter(criado_em__date__range=(de, ate))
        .select_related("vendedor", "cliente", "orcamento__forro")
        .prefetch_related("orcamento__itens")
    )


def _agendamentos(de, ate):
    """Agendamentos que começam no período (cada serviço conta uma vez)."""
    return list(
        Agendamento.objects.exclude(ordem__status=StatusOS.CANCELADA)
        .filter(data__range=(de, ate))
        .select_related("ordem__cliente")
        .order_by("data", "turno")
    )


def _situacao(ag, hoje):
    if ag.ordem.status == StatusOS.FINALIZADA:
        return "feito"
    fim = ag.data_fim or ag.data
    return "atrasado" if fim < hoje else "previsto"


def _resumo(de, ate, hoje):
    """Os números de cabeçalho de um período — usado no atual e no anterior."""
    vendas = _vendas(de, ate)
    valor = sum((o.valor_total for o in vendas), ZERO)
    m2 = sum((o.area_m2 or ZERO for o in vendas), ZERO)
    recebido = sum((p.valor for p in Pagamento.objects.filter(
        data__range=(de, ate)).exclude(ordem__status=StatusOS.CANCELADA)), ZERO)

    orcs = Orcamento.objects.filter(criado_em__date__range=(de, ate))
    criados = orcs.count()
    convertidos = orcs.filter(status=StatusOrcamento.CONVERTIDO).count()

    ags = _agendamentos(de, ate)
    feitos = defaultdict(int)
    totais = defaultdict(int)
    for a in ags:
        totais[a.tipo] += 1
        if _situacao(a, hoje) == "feito":
            feitos[a.tipo] += 1

    return {
        "vendas": len(vendas),
        "valor": valor,
        "m2": m2,
        "ticket": (valor / len(vendas)).quantize(Decimal("0.01")) if vendas else ZERO,
        "recebido": recebido,
        "orcamentos": criados,
        "convertidos": convertidos,
        "conversao": round(convertidos / criados * 100) if criados else 0,
        "instalacoes": totais[TipoAgendamento.INSTALACAO],
        "instalacoes_feitas": feitos[TipoAgendamento.INSTALACAO],
        "entregas": totais[TipoAgendamento.ENTREGA],
        "entregas_feitas": feitos[TipoAgendamento.ENTREGA],
    }, vendas, ags


def _escala(de, ate):
    """Pontos da linha do tempo: por dia, por semana ou por mês, conforme o tamanho."""
    dias = (ate - de).days + 1
    pontos = []
    if dias <= 45:
        for k in range(dias):
            d = de + timedelta(days=k)
            pontos.append((d, d, f"{d.day:02d}/{d.month:02d}"))
        return "dia", pontos
    if dias <= 190:
        ini = de
        while ini <= ate:
            fim = min(ini + timedelta(days=6), ate)
            pontos.append((ini, fim, f"{ini.day:02d}/{ini.month:02d}"))
            ini = fim + timedelta(days=1)
        return "semana", pontos
    ini = de
    while ini <= ate:
        fim = min(date(ini.year, ini.month, monthrange(ini.year, ini.month)[1]), ate)
        pontos.append((ini, fim, f"{MESES[ini.month - 1]}/{str(ini.year)[2:]}"))
        ini = fim + timedelta(days=1)
    return "mes", pontos


def _semana_vigente(hoje):
    """Segunda a domingo da semana de hoje: instalações em obra e entregas por dia."""
    seg = hoje - timedelta(days=hoje.weekday())
    dom = seg + timedelta(days=6)
    dias = {seg + timedelta(days=k): {"instalacoes": 0, "entregas": 0} for k in range(7)}
    ags = (Agendamento.objects.exclude(ordem__status=StatusOS.CANCELADA)
           .filter(data__lte=dom).exclude(data_fim__lt=seg).exclude(data_fim__isnull=True, data__lt=seg))
    for a in ags:
        if a.tipo == TipoAgendamento.ENTREGA:
            if a.data in dias:
                dias[a.data]["entregas"] += 1
        else:
            for d in _dias_da_instalacao(a):
                if d in dias:
                    dias[d]["instalacoes"] += 1
    return {"de": seg, "ate": dom,
            "dias": [{"data": d, **v} for d, v in sorted(dias.items())]}


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def painel(request):
    if not request.user.e_diretor:
        return _proibido()

    hoje = timezone.localdate()
    de, ate = _periodo(request)
    tamanho = (ate - de).days + 1
    ant_ate = de - timedelta(days=1)
    ant_de = ant_ate - timedelta(days=tamanho - 1)

    atual, vendas, ags = _resumo(de, ate, hoje)
    anterior, _, _ = _resumo(ant_de, ant_ate, hoje)

    # -------------------------------------------------- por vendedor
    pessoas = {}

    def linha(u):
        return pessoas.setdefault(u.id, {
            "id": u.id, "nome": _nome(u), "vendas": 0, "m2": ZERO, "valor": ZERO,
            "comissao_gerada": ZERO, "comissao_recebida": ZERO, "comissao_pendente": ZERO,
        })

    for o in vendas:
        r = linha(o.vendedor)
        r["vendas"] += 1
        r["m2"] += o.area_m2 or ZERO
        r["valor"] += o.valor_total
        r["comissao_gerada"] += o.comissao_valor

    pagas = (OrdemServico.objects.filter(comissao_paga=True, comissao_paga_em__date__range=(de, ate))
             .select_related("vendedor", "orcamento").prefetch_related("orcamento__itens"))
    for o in pagas:
        linha(o.vendedor)["comissao_recebida"] += o.comissao_valor

    pendentes = (OrdemServico.objects.filter(status=StatusOS.FINALIZADA, comissao_paga=False)
                 .select_related("vendedor", "orcamento").prefetch_related("orcamento__itens"))
    for o in pendentes:
        linha(o.vendedor)["comissao_pendente"] += o.comissao_valor

    por_vendedor = sorted(pessoas.values(), key=lambda r: (-r["valor"], -r["vendas"], r["nome"]))

    # -------------------------------------------------- linha do tempo
    escala, pontos = _escala(de, ate)
    serie = [{"rotulo": rot, "de": a, "ate": b, "vendido": ZERO, "recebido": ZERO, "vendas": 0}
             for a, b, rot in pontos]

    def ponto(d):
        for p in serie:
            if p["de"] <= d <= p["ate"]:
                return p
        return None

    for o in vendas:
        p = ponto(timezone.localtime(o.criado_em).date())
        if p:
            p["vendido"] += o.valor_total
            p["vendas"] += 1
    pagamentos = list(Pagamento.objects.filter(data__range=(de, ate))
                      .exclude(ordem__status=StatusOS.CANCELADA))
    for pg in pagamentos:
        p = ponto(pg.data)
        if p:
            p["recebido"] += pg.valor

    # -------------------------------------------------- composições
    formas = defaultdict(lambda: {"valor": ZERO, "qtd": 0})
    for pg in pagamentos:
        formas[pg.forma]["valor"] += pg.valor
        formas[pg.forma]["qtd"] += 1
    rotulo_forma = dict(FormaPagamento.choices)

    tipos = {t: {"tipo": t, "rotulo": r, "vendas": 0, "valor": ZERO, "m2": ZERO}
             for t, r in TipoServico.choices}
    forros = defaultdict(lambda: {"m2": ZERO, "vendas": 0})
    status = defaultdict(int)
    for o in vendas:
        t = tipos[o.tipo]
        t["vendas"] += 1
        t["valor"] += o.valor_total
        t["m2"] += o.area_m2 or ZERO
        status[o.status] += 1
        if o.orcamento_id:
            f = forros[o.orcamento.forro.nome]
            f["m2"] += o.orcamento.area_m2
            f["vendas"] += 1

    orcs = Orcamento.objects.filter(criado_em__date__range=(de, ate))

    # -------------------------------------------------- financeiro em aberto (sem período)
    ativas = list(OrdemServico.objects.exclude(status=StatusOS.CANCELADA).prefetch_related("pagamentos"))
    a_receber = sum((max(o.valor_total - sum((p.valor for p in o.pagamentos.all()), ZERO), ZERO)
                     for o in ativas if o.status != StatusOS.FINALIZADA), ZERO)

    return Response({
        "periodo": {"de": de, "ate": ate, "dias": tamanho, "hoje": hoje,
                    "anterior": {"de": ant_de, "ate": ant_ate}},
        "atual": atual,
        "anterior": anterior,
        "carteira": {
            "a_receber": a_receber,
            "os_agendadas": sum(1 for o in ativas if o.status == StatusOS.GERADA),
            "os_em_execucao": sum(1 for o in ativas if o.status == StatusOS.EM_EXECUCAO),
            "comissao_pendente": sum((r["comissao_pendente"] for r in por_vendedor), ZERO),
        },
        "por_vendedor": por_vendedor,
        "serie": {"escala": escala, "pontos": serie},
        "semana": _semana_vigente(hoje),
        "formas": sorted(({"forma": k, "rotulo": rotulo_forma.get(k, k), **v} for k, v in formas.items()),
                         key=lambda r: -r["valor"]),
        "tipos": list(tipos.values()),
        "status": [{"status": s, "rotulo": r, "qtd": status[s]} for s, r in StatusOS.choices
                   if s != StatusOS.CANCELADA],
        "orcamentos": {
            "criados": orcs.count(),
            "abertos": orcs.filter(status=StatusOrcamento.ABERTO).count(),
            "convertidos": orcs.filter(status=StatusOrcamento.CONVERTIDO).count(),
            "perdidos": orcs.filter(status=StatusOrcamento.PERDIDO).count(),
        },
        "forros": sorted(({"nome": k, **v} for k, v in forros.items()), key=lambda r: -r["m2"])[:6],
        "servicos": [{
            "id": a.id, "ordem": a.ordem_id, "numero": a.ordem.numero, "cliente": a.ordem.cliente.nome,
            "tipo": a.tipo, "data": a.data, "data_fim": a.data_fim, "turno": a.turno,
            "situacao": _situacao(a, hoje),
        } for a in ags],
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def painel_calendario(request):
    """Mês compacto: quantas instalações (em obra) e entregas há em cada dia."""
    if not request.user.e_diretor:
        return _proibido()
    hoje = timezone.localdate()
    try:
        ano, mes = (int(x) for x in request.GET.get("mes", "").split("-"))
        primeiro = date(ano, mes, 1)
    except ValueError:
        primeiro = hoje.replace(day=1)
    ultimo = primeiro.replace(day=monthrange(primeiro.year, primeiro.month)[1])

    dias = defaultdict(lambda: {"instalacoes": 0, "entregas": 0})
    ags = (Agendamento.objects.exclude(ordem__status=StatusOS.CANCELADA)
           .filter(data__lte=ultimo, data__gte=primeiro - timedelta(days=14)))
    for a in ags:
        if a.tipo == TipoAgendamento.ENTREGA:
            if primeiro <= a.data <= ultimo:
                dias[a.data.isoformat()]["entregas"] += 1
        else:
            for d in _dias_da_instalacao(a):
                if primeiro <= d <= ultimo:
                    dias[d.isoformat()]["instalacoes"] += 1
    return Response({"mes": primeiro.strftime("%Y-%m"), "dias": dias})
