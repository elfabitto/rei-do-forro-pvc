"""
Cria a equipe real da empresa.

    python manage.py criar_equipe

Usuário = primeiro nome em minúsculas. Senha inicial igual para todos; o
próprio usuário troca depois pelo admin do Django.
"""
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

Usuario = get_user_model()
SENHA_INICIAL = "reidoforro2026"

EQUIPE = [
    # usuário,    nome,       sobrenome,  papel,         comissão %
    ("felipe",    "Felipe",   "Marques",  "diretor",     0),
    ("jessica",   "Jessica",  "",         "vendedor",    3),
    ("lucilene",  "Lucilene", "",         "vendedor",    3),
    ("grace",     "Grace",    "",         "vendedor",    3),
    ("jade",      "Jade",     "",         "vendedor",    3),
    ("fernando",  "Fernando", "",         "instalador",  0),
    ("marcos",    "Marcos",   "",         "instalador",  0),
]


class Command(BaseCommand):
    help = "Cria/atualiza os usuários da equipe."

    def add_arguments(self, parser):
        parser.add_argument("--senha", default=SENHA_INICIAL, help="Senha inicial de todos.")
        parser.add_argument("--redefinir-senha", action="store_true",
                            help="Redefine a senha de quem já existe.")

    def handle(self, *args, **opcoes):
        senha = opcoes["senha"]
        criados, atualizados = 0, 0

        for username, nome, sobrenome, papel, comissao in EQUIPE:
            usuario, novo = Usuario.objects.get_or_create(username=username)
            usuario.first_name = nome
            usuario.last_name = sobrenome
            usuario.papel = papel
            usuario.comissao_percentual = comissao
            usuario.is_active = True
            if papel == "diretor":
                usuario.is_staff = usuario.is_superuser = True
            if novo or opcoes["redefinir_senha"]:
                usuario.set_password(senha)
            usuario.save()

            criados += novo
            atualizados += not novo
            marca = "novo" if novo else "atualizado"
            self.stdout.write(f"  {usuario.get_full_name() or username:<20} {papel:<12} ({marca})")

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS(f"{criados} criado(s), {atualizados} atualizado(s)."))
        if criados:
            self.stdout.write(self.style.WARNING(f"Senha inicial: {senha} — troque no primeiro acesso."))
