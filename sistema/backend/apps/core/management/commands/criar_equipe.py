"""
Cria a equipe real da empresa e deixa no banco só ela.

    python manage.py criar_equipe --senha "<senha inicial>"

A senha inicial vem pela linha de comando, nunca do código: o repositório é
público. Cada pessoa troca a sua depois (a diretoria redefine em Usuários).
Quem não está na lista é removido — ou só desativado, se já tiver orçamento,
O.S. ou outro registro em seu nome.
"""
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db.models import ProtectedError

Usuario = get_user_model()

EQUIPE = [
    # login,             nome,       sobrenome,  papel
    ("felipe.marques",   "Felipe",   "Marques",  "diretor"),
    ("luciene.marques",  "Luciene",  "Marques",  "diretor"),
    ("jessica.barbosa",  "Jessica",  "Barbosa",  "vendedor"),
    ("fabio.lima",       "Fábio",    "Lima",     "ti"),         # acesso total; o único que atende os chamados
]

# logins antigos que viram os novos (mantém histórico e senha de quem já existia)
RENOMEAR = {"felipe": "felipe.marques", "jessica": "jessica.barbosa"}


class Command(BaseCommand):
    help = "Cria/atualiza os usuários da equipe."

    def add_arguments(self, parser):
        parser.add_argument("--senha", required=True, help="Senha inicial de quem for criado.")
        parser.add_argument("--redefinir-senha", action="store_true",
                            help="Aplica a senha também a quem já existe.")

    def handle(self, *args, **opcoes):
        senha = opcoes["senha"]
        criados, atualizados = 0, 0

        for antigo, novo in RENOMEAR.items():
            if not Usuario.objects.filter(username=novo).exists():
                Usuario.objects.filter(username=antigo).update(username=novo)

        for username, nome, sobrenome, papel in EQUIPE:
            usuario, novo = Usuario.objects.get_or_create(username=username)
            usuario.first_name = nome
            usuario.last_name = sobrenome
            usuario.papel = papel
            usuario.is_active = True
            usuario.is_staff = usuario.is_superuser = papel in ("diretor", "ti")
            if novo or opcoes["redefinir_senha"]:
                usuario.set_password(senha)
            usuario.save()

            criados += novo
            atualizados += not novo
            marca = "novo" if novo else "atualizado"
            self.stdout.write(f"  {username:<18} {usuario.get_full_name():<18} {papel:<10} ({marca})")

        logins = [u for u, *_ in EQUIPE]
        for u in Usuario.objects.exclude(username__in=logins):
            try:
                u.delete()
                self.stdout.write(f"  {u.username:<18} removido")
            except ProtectedError:
                u.is_active = False
                u.save(update_fields=["is_active"])
                self.stdout.write(f"  {u.username:<18} desativado (tem registros no sistema)")

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS(f"{criados} criado(s), {atualizados} atualizado(s)."))
