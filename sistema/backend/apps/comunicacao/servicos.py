from django.contrib.auth import get_user_model

from .models import Notificacao


def notificar(usuario, tipo, titulo, mensagem="", link=""):
    if not usuario or not usuario.is_active:
        return None
    return Notificacao.objects.create(usuario=usuario, tipo=tipo, titulo=titulo[:120],
                                      mensagem=mensagem[:300], link=link)


def notificar_ti(tipo, titulo, mensagem="", link="", exceto=None):
    """Avisa quem atende os chamados."""
    Usuario = get_user_model()
    for u in Usuario.objects.filter(is_active=True, papel="ti"):
        if not exceto or u.pk != exceto.pk:
            notificar(u, tipo, titulo, mensagem, link)
