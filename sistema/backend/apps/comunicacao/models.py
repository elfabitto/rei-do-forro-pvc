"""
Comunicação interna: avisos para cada pessoa (o sino do topo) e chamados de
sugestão e melhoria para o TI.
"""
from django.conf import settings
from django.db import models


class TipoNotificacao(models.TextChoices):
    OS_FINALIZADA = "os_finalizada", "O.S. finalizada"
    COMISSAO_PAGA = "comissao_paga", "Comissão paga"
    CHAMADO = "chamado", "Chamado"


class Notificacao(models.Model):
    usuario = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notificacoes")
    tipo = models.CharField(max_length=16, choices=TipoNotificacao.choices)
    titulo = models.CharField("título", max_length=120)
    mensagem = models.CharField(max_length=300, blank=True)
    link = models.CharField(max_length=120, blank=True, help_text="Rota do sistema que a notificação abre.")
    lida_em = models.DateTimeField(null=True, blank=True)
    criada_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "notificação"
        verbose_name_plural = "notificações"
        ordering = ["-criada_em", "-id"]
        indexes = [models.Index(fields=["usuario", "lida_em"])]

    def __str__(self):
        return f"{self.usuario} — {self.titulo}"


class CategoriaChamado(models.TextChoices):
    SUGESTAO = "sugestao", "Sugestão"
    MELHORIA = "melhoria", "Melhoria"
    PROBLEMA = "problema", "Problema / erro"
    DUVIDA = "duvida", "Dúvida"


class Prioridade(models.TextChoices):
    BAIXA = "baixa", "Baixa"
    MEDIA = "media", "Média"
    ALTA = "alta", "Alta"


class StatusChamado(models.TextChoices):
    ABERTO = "aberto", "Aberto"
    EM_ANDAMENTO = "em_andamento", "Em andamento"
    CONCLUIDO = "concluido", "Concluído"
    RECUSADO = "recusado", "Não será feito"


class Chamado(models.Model):
    numero = models.PositiveIntegerField(unique=True, editable=False)
    titulo = models.CharField("título", max_length=120)
    descricao = models.TextField("descrição")
    categoria = models.CharField(max_length=10, choices=CategoriaChamado.choices, default=CategoriaChamado.SUGESTAO)
    prioridade = models.CharField(max_length=6, choices=Prioridade.choices, default=Prioridade.MEDIA)
    status = models.CharField(max_length=14, choices=StatusChamado.choices, default=StatusChamado.ABERTO)
    tela = models.CharField("tela do sistema", max_length=60, blank=True,
                            help_text="Onde está o problema ou a ideia (ex.: Orçamentos).")

    autor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="chamados")
    resposta = models.TextField(blank=True)
    respondido_por = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True,
                                       related_name="+")
    respondido_em = models.DateTimeField(null=True, blank=True)
    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-criado_em"]

    def __str__(self):
        return f"#{self.numero} {self.titulo}"

    def save(self, *args, **kwargs):
        if not self.numero:
            ultimo = Chamado.objects.order_by("-numero").values_list("numero", flat=True).first()
            self.numero = (ultimo or 0) + 1
        return super().save(*args, **kwargs)
