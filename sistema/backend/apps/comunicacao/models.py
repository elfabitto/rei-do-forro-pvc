"""
Comunicação interna: avisos para cada pessoa (o sino do topo, e no celular por
Web Push) e chamados de sugestão e melhoria para o TI.
"""
from django.conf import settings
from django.db import models


class TipoNotificacao(models.TextChoices):
    OS_FINALIZADA = "os_finalizada", "O.S. finalizada"
    COMISSAO_PAGA = "comissao_paga", "Comissão paga"
    CHAMADO = "chamado", "Chamado"
    ORCAMENTO_NOVO = "orcamento_novo", "Orçamento gerado"
    OS_GERADA = "os_gerada", "Serviço gerado"
    OS_CANCELADA = "os_cancelada", "Serviço cancelado"
    OS_NAO_INICIADA = "os_nao_iniciada", "Serviço não iniciado"
    OS_VENCIDA = "os_vencida", "Serviços vencidos"
    AGENDA_DIA = "agenda_dia", "Agenda do dia"
    VISITA_NOVA = "visita_nova", "Visita técnica agendada"
    VISITA_CONVERTIDA = "visita_convertida", "Visita virou serviço"


class Notificacao(models.Model):
    usuario = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notificacoes")
    tipo = models.CharField(max_length=20, choices=TipoNotificacao.choices)
    titulo = models.CharField("título", max_length=120)
    mensagem = models.CharField(max_length=300, blank=True)
    link = models.CharField(max_length=120, blank=True, help_text="Rota do sistema que a notificação abre.")
    # aviso automático (agenda do dia, serviço não iniciado…): a mesma chave não avisa duas vezes
    chave = models.CharField(max_length=80, blank=True, db_index=True)
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


class AssinaturaPush(models.Model):
    """Um aparelho (navegador/app instalado) que recebe as notificações por Web Push."""

    usuario = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="assinaturas_push")
    endpoint = models.TextField(unique=True)
    p256dh = models.CharField(max_length=200)
    auth = models.CharField(max_length=100)
    aparelho = models.CharField(max_length=200, blank=True)
    criada_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "assinatura de push"
        verbose_name_plural = "assinaturas de push"

    def __str__(self):
        return f"{self.usuario} — {self.aparelho[:40] or 'aparelho'}"


class PreferenciasNotificacao(models.Model):
    """O que cada pessoa desligou no sino. Ligado é o padrão: só guarda o que saiu."""

    usuario = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="pref_notificacoes")
    desligadas = models.JSONField(default=list, blank=True)

    class Meta:
        verbose_name = "preferências de notificação"
        verbose_name_plural = "preferências de notificação"


class ChavesPush(models.Model):
    """
    Par VAPID do Web Push, gerado sozinho no primeiro uso e guardado no banco —
    assim o deploy não precisa de variável nova. Trocar as chaves invalida as
    assinaturas: cada aparelho assina de novo ao abrir o sistema.
    """

    publica = models.TextField()
    privada = models.TextField()
    criada_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "chaves do Web Push"
        verbose_name_plural = "chaves do Web Push"

