from django.conf import settings
from django.db import connection
from django.http import FileResponse, Http404, JsonResponse
from django.views.decorators.cache import never_cache


def saude(request):
    """
    Para o monitoramento (UptimeRobot/cron-job) manter o servidor acordado.
    Sem login e leve: um SELECT 1 confirma que o banco responde — e conta como
    uso do Supabase, que pausa projeto gratuito parado há uma semana.
    """
    try:
        with connection.cursor() as c:
            c.execute("SELECT 1")
        banco = "ok"
    except Exception:  # noqa: BLE001 — o monitoramento só precisa saber que falhou
        banco = "erro"
    return JsonResponse({"ok": banco == "ok", "banco": banco}, status=200 if banco == "ok" else 503)


@never_cache
def app_react(request, caminho=""):
    """Qualquer rota das telas (/orcamentos, /ordens/…) abre o index.html do React."""
    index = getattr(settings, "FRONTEND_DIST", None)
    index = index / "index.html" if index else None
    if not index or not index.is_file():
        raise Http404("Telas não compiladas — rode `npm run build` em sistema/frontend.")
    return FileResponse(open(index, "rb"), content_type="text/html; charset=utf-8")
