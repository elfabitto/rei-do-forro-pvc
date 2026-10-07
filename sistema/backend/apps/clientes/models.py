from django.conf import settings
from django.db import models


class Cliente(models.Model):
    nome = models.CharField(max_length=160)
    telefone = models.CharField(max_length=20)
    telefone_alt = models.CharField("telefone alternativo", max_length=20, blank=True)
    documento = models.CharField("CPF/CNPJ", max_length=20, blank=True)
    email = models.EmailField(blank=True)
    observacoes = models.TextField("observações", blank=True)

    criado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="clientes_criados"
    )
    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["nome"]

    def __str__(self):
        return self.nome

    @property
    def endereco_principal(self):
        return self.enderecos.filter(principal=True).first() or self.enderecos.first()


class Endereco(models.Model):
    """
    Endereço da obra / instalação / entrega. Um cliente pode ter vários
    (a casa dele e a obra, por exemplo).
    """

    cliente = models.ForeignKey(Cliente, on_delete=models.CASCADE, related_name="enderecos")
    apelido = models.CharField(max_length=60, blank=True, help_text="Ex.: Obra do centro")

    logradouro = models.CharField(max_length=160)
    numero = models.CharField("número", max_length=20, blank=True)
    complemento = models.CharField(max_length=120, blank=True)
    bairro = models.CharField(max_length=80)
    cidade = models.CharField(max_length=80, default="Rondonópolis")
    uf = models.CharField(max_length=2, default="MT")
    cep = models.CharField(max_length=9, blank=True)

    ponto_referencia = models.CharField("ponto de referência", max_length=160, blank=True)
    link_localizacao = models.URLField(
        "localização",
        blank=True,
        max_length=500,
        help_text="Link de localização que o cliente mandou pelo WhatsApp.",
    )

    principal = models.BooleanField(default=True)
    criado_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "endereço"
        verbose_name_plural = "endereços"
        ordering = ["-principal", "bairro"]

    def __str__(self):
        partes = [self.logradouro]
        if self.numero:
            partes.append(self.numero)
        if self.complemento:
            partes.append(self.complemento)
        return f"{', '.join(partes)} — {self.bairro}"

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        if self.principal:
            # só um principal por cliente
            Endereco.objects.filter(cliente=self.cliente).exclude(pk=self.pk).update(principal=False)
