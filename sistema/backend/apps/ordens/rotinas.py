"""
Avisos de horário — o servidor não tem relógio próprio rodando (o Render
gratuito dorme), então as rotinas rodam quando alguém chama:

- o GitHub Actions bate em /api/rotinas/ nos horários marcados
  (.github/workflows/rotinas.yml) — isso também acorda o servidor;
- e, de carona, a cada consulta do sino (no máximo uma vez a cada 5 minutos).

Tudo é idempotente: cada aviso leva uma `chave` e não se repete.

- Agenda do dia (a partir das 6h): diretoria recebe o resumo do dia; cada
  vendedor, os compromissos dos clientes dele.
- Serviço não iniciado: O.S. que começa hoje e segue "Agendado" depois das 10h
  (manhã) ou das 15h (tarde) — avisa o vendedor e a diretoria.
- Vencidos (a partir das 7h): diretoria recebe a lista de serviços com a data
  passada que nem começaram.
"""
import time
from collections import defaultdict

from django.utils import timezone

from apps.comunicacao.models import TipoNotificacao as T
from apps.comunicacao.servicos import gestao, notificar

from .models import Agendamento, StatusOS, StatusVisita, TipoAgendamento, VisitaTecnica

INTERVALO = 300           # de carona no sino: no máximo uma vez a cada 5 min por processo
LIMITE_TURNO = {"manha": 10, "tarde": 15}
_ultima = 0.0


def de_carona():
    """Chamado pelo sino: roda as rotinas se faz tempo que não rodam."""
    global _ultima
    if time.monotonic() - _ultima < INTERVALO:
        return
    _ultima = time.monotonic()
    try:
        executar()
    except Exception:  # noqa: BLE001 — o sino não pode falhar por causa da rotina
        import logging

        logging.getLogger(__name__).exception("rotinas falharam")


def executar(agora=None):
    agora = timezone.localtime(agora) if agora else timezone.localtime()
    feito = {"agenda_dia": 0, "nao_iniciadas": 0, "vencidas": 0}
    if agora.hour >= 6:
        feito["agenda_dia"] = agenda_do_dia(agora.date())
    feito["nao_iniciadas"] = nao_iniciadas(agora)
    if agora.hour >= 7:
        feito["vencidas"] = vencidas(agora.date())
    return feito


def _plural(n, um, varios):
    return f"{n} {um if n == 1 else varios}"


def agenda_do_dia(hoje):
    ags = list(
        Agendamento.objects.exclude(ordem__status__in=(StatusOS.CANCELADA, StatusOS.FINALIZADA))
        .filter(data__lte=hoje, data_fim__gte=hoje)
        .select_related("ordem__cliente", "ordem__vendedor")
    )
    visitas = list(VisitaTecnica.objects.filter(data=hoje, status=StatusVisita.AGENDADA)
                   .select_related("cliente", "vendedor"))
    if not ags and not visitas:
        return 0

    entregas = [a for a in ags if a.tipo == TipoAgendamento.ENTREGA]
    instalacoes = [a for a in ags if a.tipo == TipoAgendamento.INSTALACAO]
    partes = [p for p in (
        _plural(len(instalacoes), "instalação", "instalações") if instalacoes else "",
        _plural(len(entregas), "entrega", "entregas") if entregas else "",
        _plural(len(visitas), "visita técnica", "visitas técnicas") if visitas else "",
    ) if p]
    resumo = ", ".join(partes)
    nomes = ", ".join(dict.fromkeys([a.ordem.cliente.nome for a in ags] + [v.cliente.nome for v in visitas]))

    enviados = 0
    for u in gestao():
        enviados += bool(notificar(u, T.AGENDA_DIA, f"Agenda de hoje: {resumo}", nomes, "/agenda",
                                   chave=f"agenda:{hoje}"))

    # cada vendedor: só os compromissos dos clientes dele
    por_vendedor = defaultdict(list)
    for a in ags:
        rotulo = "Entrega" if a.tipo == TipoAgendamento.ENTREGA else "Instalação"
        por_vendedor[a.ordem.vendedor].append(f"{rotulo} — {a.ordem.cliente.nome} ({a.get_turno_display().lower()})")
    for v in visitas:
        por_vendedor[v.vendedor].append(f"Visita — {v.cliente.nome} ({v.get_turno_display().lower()})")
    ids_gestao = set(gestao().values_list("id", flat=True))
    for vendedor, itens in por_vendedor.items():
        if vendedor.id in ids_gestao:
            continue   # já recebeu o resumo geral
        enviados += bool(notificar(vendedor, T.AGENDA_DIA, f"Hoje: {_plural(len(itens), 'compromisso', 'compromissos')} seus",
                                   " · ".join(itens), "/agenda", chave=f"agenda:{hoje}"))
    return enviados


def nao_iniciadas(agora):
    hoje = agora.date()
    turnos = [t for t, h in LIMITE_TURNO.items() if agora.hour >= h]
    if not turnos:
        return 0
    ags = (Agendamento.objects.filter(data=hoje, turno__in=turnos, ordem__status=StatusOS.GERADA)
           .select_related("ordem__cliente", "ordem__vendedor"))
    enviados = 0
    for a in ags:
        os_ = a.ordem
        titulo = f"{os_.numero} ainda não foi iniciado"
        msg = (f"{a.get_tipo_display()} de {os_.cliente.nome} marcada para hoje "
               f"({a.get_turno_display().lower()}) segue como Agendado.")
        chave = f"nao_iniciada:{a.id}:{hoje}"
        link = f"/ordens?abrir={os_.id}"
        enviados += bool(notificar(os_.vendedor, T.OS_NAO_INICIADA, titulo, msg, link, chave=chave))
        for u in gestao():
            if u.id != os_.vendedor_id:
                enviados += bool(notificar(u, T.OS_NAO_INICIADA, titulo, msg, link, chave=chave))
    return enviados


def vencidas(hoje):
    """Agendado (nem começou) com o primeiro compromisso antes de hoje."""
    ags = (Agendamento.objects.filter(data__lt=hoje, ordem__status=StatusOS.GERADA)
           .select_related("ordem__cliente").order_by("data"))
    ordens = list(dict.fromkeys(a.ordem for a in ags))
    if not ordens:
        return 0
    lista = ", ".join(f"{o.numero.replace('OS-', '')} ({o.cliente.nome})" for o in ordens[:6])
    if len(ordens) > 6:
        lista += f" e mais {len(ordens) - 6}"
    enviados = 0
    for u in gestao():
        enviados += bool(notificar(
            u, T.OS_VENCIDA, f"{_plural(len(ordens), 'serviço vencido', 'serviços vencidos')} sem iniciar",
            lista, "/ordens", chave=f"vencidas:{hoje}",
        ))
    return enviados
