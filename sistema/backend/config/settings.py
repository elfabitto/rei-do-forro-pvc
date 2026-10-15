"""
Configuração do sistema Rei do Forro.

Banco: Postgres do Supabase (região São Paulo) em produção, SQLite no desenvolvimento
quando DATABASE_URL não estiver definida.

Atenção ao pooler do Supabase: a porta 6543 é o pgbouncer em modo *transaction*, que
não suporta conexão persistente nem server-side cursor. Por isso CONN_MAX_AGE fica em 0
e DISABLE_SERVER_SIDE_CURSORS em True quando a URL aponta para o pooler. As migrations
rodam pela porta 5432 do pooler (modo session) — veja sistema/HOSPEDAGEM.md.

Em produção (Render) o Django serve também as telas do React: o build do Vite
(frontend/dist) sai pela raiz via WhiteNoise, e qualquer rota que não seja da API,
do admin ou de arquivo estático devolve o index.html (config/urls.py).
"""
from datetime import timedelta
from pathlib import Path

import dj_database_url
from decouple import Csv, config

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = config("SECRET_KEY", default="dev-inseguro-trocar-em-producao")
DEBUG = config("DEBUG", default=True, cast=bool)
ALLOWED_HOSTS = config("ALLOWED_HOSTS", default="localhost,127.0.0.1", cast=Csv())
CSRF_TRUSTED_ORIGINS = config("CSRF_TRUSTED_ORIGINS", default="", cast=Csv())

# o Render informa o próprio endereço público (ex.: reidoforro.onrender.com)
RENDER_HOST = config("RENDER_EXTERNAL_HOSTNAME", default="")
if RENDER_HOST:
    ALLOWED_HOSTS.append(RENDER_HOST)
    CSRF_TRUSTED_ORIGINS.append(f"https://{RENDER_HOST}")

if not DEBUG:
    # o HTTPS termina no Render; o Django confia no cabeçalho do proxy
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    SECURE_HSTS_SECONDS = 60 * 60 * 24 * 30

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # terceiros
    "rest_framework",
    "django_filters",
    "corsheaders",
    # locais
    "apps.core",
    "apps.contas",
    "apps.clientes",
    "apps.catalogo",
    "apps.orcamentos",
    "apps.ordens",
    "apps.financeiro",
    "apps.comunicacao",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

# ----------------------------------------------------------------- banco
DATABASE_URL = config("DATABASE_URL", default="")

if DATABASE_URL:
    _db = dj_database_url.parse(DATABASE_URL, conn_max_age=0, ssl_require=True)
    # pooler do Supabase em modo transaction
    if ":6543" in DATABASE_URL:
        _db["DISABLE_SERVER_SIDE_CURSORS"] = True
        _db["CONN_MAX_AGE"] = 0
    DATABASES = {"default": _db}
elif not DEBUG:
    # em produção, sem banco configurado é erro — não pode cair num SQLite que se apaga a cada deploy
    from django.core.exceptions import ImproperlyConfigured
    raise ImproperlyConfigured("DATABASE_URL não definida: configure o banco (Supabase) nas variáveis do serviço.")
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }

AUTH_USER_MODEL = "contas.Usuario"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "pt-br"
TIME_ZONE = "America/Belem"   # Belém e região: UTC-3, sem horário de verão
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}
# telas do React já compiladas (npm run build). No desenvolvimento a pasta não
# existe e quem serve as telas é o Vite, na porta 5173.
FRONTEND_DIST = BASE_DIR.parent / "frontend" / "dist"
if FRONTEND_DIST.is_dir():
    WHITENOISE_ROOT = FRONTEND_DIST
    # arquivos de /assets/ têm hash no nome: podem ficar em cache para sempre
    WHITENOISE_IMMUTABLE_FILE_TEST = lambda caminho, url: url.startswith("/assets/")  # noqa: E731
    # o Python não conhece .webmanifest; sem isto o atalho do celular sai como arquivo genérico
    WHITENOISE_MIMETYPES = {".webmanifest": "application/manifest+json"}

MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ----------------------------------------------------------------- API
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ],
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 50,
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(hours=8),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=14),
    "ROTATE_REFRESH_TOKENS": True,
    "UPDATE_LAST_LOGIN": True,   # "último acesso" na tela de Usuários
}

CORS_ALLOWED_ORIGINS = config(
    "CORS_ALLOWED_ORIGINS",
    default="http://localhost:5173,http://127.0.0.1:5173",
    cast=Csv(),
)

# erros 500 aparecem no log do Render (sem DEBUG, o Django não mostraria em lugar nenhum)
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "loggers": {"django.request": {"handlers": ["console"], "level": "ERROR"}},
}

# ----------------------------------------------------------------- regras do negócio
# Capacidade padrão da agenda; a ConfiguracaoAgenda no banco pode sobrescrever.
# A vaga é do turno: entrega e instalação disputam as mesmas 2 vagas.
AGENDA_CAPACIDADE_TURNO = config("AGENDA_CAPACIDADE_TURNO", default=2, cast=int)
# 6 = domingo, no padrão do Python (Monday=0)
AGENDA_DIAS_SEM_ATENDIMENTO = config("AGENDA_DIAS_SEM_ATENDIMENTO", default="6", cast=Csv(int))
