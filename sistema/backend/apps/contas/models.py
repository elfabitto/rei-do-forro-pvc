from django.contrib.auth.models import AbstractUser
from django.db import models


class Papel(models.TextChoices):
    DIRETOR = "diretor", "Diretor"
    ADMINISTRATIVO = "administrativo", "Administrativo"
    VENDEDOR = "vendedor", "Vendedor"
    INSTALADOR = "instalador", "Instalador"


class Usuario(AbstractUser):
    """
    O papel concentra as permissões do sistema. Grupos do Django continuam
    disponíveis para exceções pontuais, mas o dia a dia é resolvido aqui.
    """

    papel = models.CharField(max_length=20, choices=Papel.choices, default=Papel.VENDEDOR)
    telefone = models.CharField(max_length=20, blank=True)
    comissao_percentual = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        help_text="Percentual sobre O.S. atribuídas a este usuário.",
    )

    class Meta:
        verbose_name = "usuário"
        verbose_name_plural = "usuários"
        ordering = ["first_name", "username"]

    def __str__(self):
        return self.get_full_name() or self.username

    # --- atalhos de permissão, usados pelas views e pelo serializer ---
    @property
    def e_diretor(self):
        return self.papel == Papel.DIRETOR or self.is_superuser

    @property
    def pode_ver_financeiro(self):
        return self.papel in (Papel.DIRETOR, Papel.ADMINISTRATIVO) or self.is_superuser

    @property
    def pode_finalizar_os(self):
        """Finalizar O.S. e lançar pagamento é exclusivo da diretoria."""
        return self.e_diretor

    @property
    def pode_trocar_vendedor(self):
        """Corrigir quem leva a comissão quando a diretoria lança no lugar do funcionário."""
        return self.e_diretor

    @property
    def pode_ver_tudo(self):
        return self.papel in (Papel.DIRETOR, Papel.ADMINISTRATIVO) or self.is_superuser

    @property
    def pode_vender(self):
        return self.papel in (Papel.DIRETOR, Papel.ADMINISTRATIVO, Papel.VENDEDOR) or self.is_superuser
