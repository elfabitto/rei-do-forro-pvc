"""Lançamentos automáticos — chamados pelos eventos da O.S. (apps/ordens/eventos.py)."""
from django.utils import timezone

from .models import Categoria, Lancamento, Origem, Tipo


def brl(v):
    return "R$ " + f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _forma(pg):
    texto = pg.get_forma_display()
    if pg.parcelas and pg.parcelas > 1:
        texto += f" {pg.parcelas}x"
    return texto


def entrada_do_pagamento(pg, usuario):
    """
    Pagamento de O.S. finalizada → entrada. Vale o líquido: o acréscimo do
    cartão é a taxa que a maquininha retém. Idempotente (um por pagamento).
    """
    os_ = pg.ordem
    liquido = pg.valor - (pg.acrescimo or 0)
    if liquido <= 0 or Lancamento.objects.filter(pagamento=pg).exists():
        return None
    obs = f"Cliente pagou {brl(pg.valor)} (taxa da maquininha {brl(pg.acrescimo)})" if pg.acrescimo else ""
    return Lancamento.objects.create(
        tipo=Tipo.ENTRADA, categoria=Categoria.VENDA, origem=Origem.VENDA,
        descricao=f"{os_.numero} — {os_.cliente.nome}"[:200], valor=liquido,
        data=pg.data, forma=_forma(pg)[:40], observacao=obs[:240],
        ordem=os_, pagamento=pg, criado_por=usuario,
    )


def saida_da_comissao(os_, usuario):
    """Baixa de comissão → saída, no dia da baixa. Idempotente (uma por O.S.)."""
    valor = os_.comissao_valor
    if valor <= 0 or Lancamento.objects.filter(ordem=os_, origem=Origem.COMISSAO).exists():
        return None
    quando = timezone.localtime(os_.comissao_paga_em).date() if os_.comissao_paga_em else timezone.localdate()
    nome = os_.vendedor.get_full_name() or os_.vendedor.username
    return Lancamento.objects.create(
        tipo=Tipo.SAIDA, categoria=Categoria.COMISSAO, origem=Origem.COMISSAO,
        descricao=f"Comissão {nome} — {os_.numero}"[:200], valor=valor, data=quando,
        ordem=os_, favorecido=os_.vendedor, criado_por=usuario,
    )


def desfazer_comissao(os_):
    Lancamento.objects.filter(ordem=os_, origem=Origem.COMISSAO).delete()
