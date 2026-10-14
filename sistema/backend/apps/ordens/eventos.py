"""
O que acontece em volta da O.S. quando ela muda: lançamentos no Financeiro
e avisos para o vendedor. Concentrado aqui para as views não repetirem regra.
"""
from collections import defaultdict
from decimal import Decimal

from apps.comunicacao.models import TipoNotificacao
from apps.comunicacao.servicos import notificar
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
