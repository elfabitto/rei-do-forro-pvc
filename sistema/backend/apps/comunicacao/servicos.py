"""
Quem recebe o quê. Todo aviso passa por `notificar`: respeita o que a pessoa
desligou no sino, não repete aviso automático (mesma `chave`) e empurra para o
celular por Web Push.

Perfis no catálogo: "vendedor" (vendedor e administrativo) e "gestao"
(diretoria). O TI vê e escolhe tudo.
"""
from django.contrib.auth import get_user_model

from .models import Notificacao, PreferenciasNotificacao, TipoNotificacao as T

# (tipo, rótulo, descrição, perfis que podem escolher)
CATALOGO = [
    (T.OS_FINALIZADA, "Serviço finalizado", "Um serviço seu foi finalizado — com o valor da comissão a receber.",
     {"vendedor"}),
    (T.COMISSAO_PAGA, "Comissão paga", "A diretoria deu baixa no pagamento da sua comissão.", {"vendedor"}),
    (T.OS_GERADA, "Serviço gerado", "Um orçamento virou serviço, com o nome de quem vendeu.", {"vendedor", "gestao"}),
    (T.OS_CANCELADA, "Serviço cancelado", "Um serviço seu foi cancelado.", {"vendedor"}),
    (T.ORCAMENTO_NOVO, "Orçamento gerado", "Alguém da equipe gerou um orçamento.", {"gestao"}),
    (T.VISITA_NOVA, "Visita técnica agendada", "Uma visita técnica (orçamento presencial) foi marcada.",
     {"gestao"}),
    (T.VISITA_CONVERTIDA, "Visita virou serviço", "A visita técnica que você agendou foi concluída e virou serviço.",
     {"vendedor"}),
    (T.AGENDA_DIA, "Agenda do dia", "De manhã: entregas, instalações e visitas de hoje.",
     {"vendedor", "gestao"}),
    (T.OS_NAO_INICIADA, "Serviço não iniciado", "Serviço marcado para hoje que ainda não foi iniciado.",
     {"vendedor", "gestao"}),
    (T.OS_VENCIDA, "Serviços vencidos", "Serviços com a data passada e ainda não iniciados.", {"gestao"}),
    (T.CHAMADO, "Chamados", "Resposta do TI aos seus chamados (e, para o TI, chamado novo).",
     {"vendedor", "gestao"}),
]
ROTULOS = {t: (r, d) for t, r, d, _ in CATALOGO}
# mesma chave, sentido diferente para o vendedor
DESCRICAO_VENDEDOR = {T.OS_GERADA: "Alguém (da diretoria) gerou um serviço no seu nome."}


def perfil(usuario):
    if usuario.papel == "ti":
        return "ti"
    return "gestao" if usuario.papel == "diretor" else "vendedor"


def opcoes_de(usuario):
    """O que a pessoa pode ligar/desligar, conforme o perfil."""
    p = perfil(usuario)
    return [(t, r, DESCRICAO_VENDEDOR.get(t, d) if p == "vendedor" else d)
            for t, r, d, perfis in CATALOGO if p == "ti" or p in perfis]


def desligadas(usuario):
    pref = PreferenciasNotificacao.objects.filter(usuario=usuario).first()
    return set(pref.desligadas) if pref else set()


def notificar(usuario, tipo, titulo, mensagem="", link="", chave=""):
    """Cria o aviso (e manda para o celular). None se a pessoa desligou ou se já avisou."""
    if not usuario or not usuario.is_active:
        return None
    if tipo in desligadas(usuario):
        return None
    if chave and Notificacao.objects.filter(usuario=usuario, chave=chave).exists():
        return None
    n = Notificacao.objects.create(usuario=usuario, tipo=tipo, titulo=titulo[:120],
                                   mensagem=mensagem[:300], link=link, chave=chave[:80])
    from .push import enviar

    enviar(n)
    return n


def gestao():
    """Quem recebe os avisos da diretoria: diretores e o TI."""
    return get_user_model().objects.filter(is_active=True, papel__in=("diretor", "ti"))


def notificar_gestao(tipo, titulo, mensagem="", link="", exceto=None, chave=""):
    for u in gestao():
        if not exceto or u.pk != exceto.pk:
            notificar(u, tipo, titulo, mensagem, link, chave)


def notificar_ti(tipo, titulo, mensagem="", link="", exceto=None):
    """Avisa quem atende os chamados."""
    for u in get_user_model().objects.filter(is_active=True, papel="ti"):
        if not exceto or u.pk != exceto.pk:
            notificar(u, tipo, titulo, mensagem, link)
