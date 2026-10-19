"""
Web Push: a notificação chega no celular/computador mesmo com o sistema fechado.

O navegador assina com a chave pública VAPID (service worker em /sw.js) e manda
o endpoint para cá; cada aviso novo é empurrado para os aparelhos da pessoa.
As chaves nascem sozinhas no banco no primeiro uso (ChavesPush); se existirem
VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY no ambiente, essas mandam.

O envio roda numa thread depois do commit: a tela não espera o serviço de push
do Google/Apple responder, e aviso que falhou não derruba a ação de ninguém.
"""
import base64
import json
import logging
import threading

from decouple import config
from django.db import transaction

log = logging.getLogger(__name__)
CONTATO = "mailto:contato@reidoforro.com.br"   # exigido pelo protocolo VAPID


def _b64(dados):
    return base64.urlsafe_b64encode(dados).rstrip(b"=").decode()


def chaves():
    """(pública, privada) em base64url — a pública vai para o navegador."""
    pub, priv = config("VAPID_PUBLIC_KEY", default=""), config("VAPID_PRIVATE_KEY", default="")
    if pub and priv:
        return pub, priv

    from .models import ChavesPush

    atual = ChavesPush.objects.order_by("id").first()
    if atual:
        return atual.publica, atual.privada

    from cryptography.hazmat.primitives import serialization
    from py_vapid import Vapid

    v = Vapid()
    v.generate_keys()
    privada = _b64(v.private_key.private_numbers().private_value.to_bytes(32, "big"))
    publica = _b64(v.public_key.public_bytes(serialization.Encoding.X962,
                                             serialization.PublicFormat.UncompressedPoint))
    with transaction.atomic():
        atual = ChavesPush.objects.select_for_update().order_by("id").first()
        if not atual:   # dois processos gerando juntos: fica a primeira
            atual = ChavesPush.objects.create(publica=publica, privada=privada)
    return atual.publica, atual.privada


def _enviar_agora(assinaturas, carga, privada):
    from django.db import connection

    try:
        _empurrar(assinaturas, carga, privada)
    finally:
        connection.close()   # a thread abriu a própria conexão (se apagou assinatura morta)


def _empurrar(assinaturas, carga, privada):
    from pywebpush import WebPushException, webpush

    from .models import AssinaturaPush

    for a in assinaturas:
        try:
            webpush(
                {"endpoint": a["endpoint"], "keys": {"p256dh": a["p256dh"], "auth": a["auth"]}},
                data=json.dumps(carga),
                vapid_private_key=privada,
                vapid_claims={"sub": CONTATO},
                timeout=8,
                ttl=24 * 3600,
            )
        except WebPushException as e:
            # 404/410: o aparelho desinstalou ou revogou — a assinatura morreu
            if e.response is not None and e.response.status_code in (404, 410):
                AssinaturaPush.objects.filter(endpoint=a["endpoint"]).delete()
            else:
                log.warning("push falhou: %s", e)
        except Exception:  # noqa: BLE001 — aviso que falha não pode derrubar nada
            log.exception("push falhou")


def enviar(notificacao):
    """Empurra o aviso para os aparelhos da pessoa, depois que a transação gravar."""
    from .models import AssinaturaPush

    assinaturas = list(AssinaturaPush.objects.filter(usuario_id=notificacao.usuario_id)
                       .values("endpoint", "p256dh", "auth"))
    if not assinaturas:
        return
    carga = {
        "id": notificacao.id,
        "titulo": notificacao.titulo,
        "mensagem": notificacao.mensagem,
        "link": notificacao.link or "/",
        "tipo": notificacao.tipo,
    }
    _, privada = chaves()
    transaction.on_commit(
        lambda: threading.Thread(target=_enviar_agora, args=(assinaturas, carga, privada), daemon=True).start()
    )
