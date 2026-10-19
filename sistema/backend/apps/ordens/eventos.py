"""
O que acontece em volta da O.S. quando ela muda: lançamentos no Financeiro
e avisos para o vendedor e a diretoria. Concentrado aqui para as views não
repetirem regra. Os avisos de horário (agenda do dia, serviço não iniciado,
vencidos) estão em rotinas.py.
"""
from collections import defaultdict
from decimal import Decimal

from apps.comunicacao.models import TipoNotificacao
from apps.comunicacao.servicos import notificar, notificar_gestao
from apps.financeiro import servicos as caixa
from apps.financeiro.servicos import brl


def os_finalizada(os_, usuario):
    for pg in os_.pagamentos.all():
        caixa.entrada_do_pagamento(pg, usuario)
    if os_.vendedor_id and os_.vendedor_id != usuario.id:
        comissao = os_.comissao_valor
        notificar(
            os_.vendedor, TipoNotificacao.OS_FINALIZADA,
            f"{os_.numero} finalizada",
            f"O serviço de {os_.cliente.nome} foi finalizado."
            + (f" Sua comissão de {brl(comissao)} já está a receber." if comissao > 0 else ""),
            "/comissoes",
        )


def pagamento_lancado(pg, usuario):
    """Pagamento lançado depois do fechamento também entra no caixa."""
    if pg.ordem.status == "finalizada":
        caixa.entrada_do_pagamento(pg, usuario)


def comissoes_pagas(ordens, usuario):
    """`ordens` já marcadas como pagas. Uma saída por O.S.; um aviso por vendedor."""
    por_vendedor = defaultdict(list)
    for os_ in ordens:
        caixa.saida_da_comissao(os_, usuario)
        por_vendedor[os_.vendedor].append(os_)
    for vendedor, lista in por_vendedor.items():
        if vendedor.pk == usuario.pk:
            continue
        total = sum((o.comissao_valor for o in lista), Decimal("0"))
        if len(lista) == 1:
            titulo, msg = f"Comissão paga — {lista[0].numero}", f"A diretoria deu baixa em {brl(total)}."
        else:
            titulo = f"{len(lista)} comissões pagas"
            msg = f"A diretoria deu baixa em {brl(total)}: " + ", ".join(o.numero for o in lista[:5])
        notificar(vendedor, TipoNotificacao.COMISSAO_PAGA, titulo, msg, "/comissoes")


def comissao_estornada(os_):
    caixa.desfazer_comissao(os_)


def _nome(u):
    return u.get_full_name() or u.username


def orcamento_novo(orc, usuario):
    notificar_gestao(
        TipoNotificacao.ORCAMENTO_NOVO, f"Novo orçamento {orc.numero}",
        f"{_nome(orc.vendedor)} · {orc.get_tipo_display()} {orc.area_m2} m² · R$ {brl(orc.total_vista)} à vista"
        + (f" · {orc.cliente.nome}" if orc.cliente_id else ""),
        "/orcamentos", exceto=usuario,
    )


def os_gerada(os_, usuario):
    """Diretoria: orçamento virou serviço, com quem vendeu. Vendedor: serviço gerado no nome dele."""
    origem = f"O orçamento {os_.orcamento.numero} virou serviço" if os_.orcamento_id else "Serviço gerado"
    notificar_gestao(
        TipoNotificacao.OS_GERADA, f"{origem}: {os_.numero}",
        f"Venda de {_nome(os_.vendedor)} · {os_.cliente.nome} · R$ {brl(os_.valor_total)}",
        f"/ordens?abrir={os_.id}", exceto=usuario,
    )
    if os_.vendedor_id != usuario.id:
        notificar(
            os_.vendedor, TipoNotificacao.OS_GERADA, f"Serviço gerado no seu nome: {os_.numero}",
            f"{_nome(usuario)} gerou o serviço de {os_.cliente.nome}.", f"/ordens?abrir={os_.id}",
        )
    # orçamento feito numa visita técnica: quem agendou a visita fica sabendo que ela fechou
    visita = getattr(os_.orcamento, "visita", None) if os_.orcamento_id else None
    if visita and visita.vendedor_id != usuario.id:
        notificar(
            visita.vendedor, TipoNotificacao.VISITA_CONVERTIDA, f"Visita {visita.numero} virou serviço",
            f"{os_.cliente.nome} fechou: {os_.numero} · R$ {brl(os_.valor_total)} · gerado por {_nome(usuario)}.",
            f"/visitas?abrir={visita.id}",
        )


def os_cancelada(os_, usuario):
    if os_.vendedor_id and os_.vendedor_id != usuario.id:
        notificar(
            os_.vendedor, TipoNotificacao.OS_CANCELADA, f"{os_.numero} cancelada",
            f"O serviço de {os_.cliente.nome} foi cancelado"
            + (f": {os_.motivo_cancelamento}" if os_.motivo_cancelamento else "."),
            f"/ordens?abrir={os_.id}",
        )


def visita_nova(v, usuario):
    notificar_gestao(
        TipoNotificacao.VISITA_NOVA, f"Visita técnica {v.numero}",
        f"{v.cliente.nome} · {v.endereco.bairro} · {v.data:%d/%m} ({v.get_turno_display().lower()}) "
        f"· agendou: {_nome(v.vendedor)}",
        f"/visitas?abrir={v.id}", exceto=usuario,
    )

