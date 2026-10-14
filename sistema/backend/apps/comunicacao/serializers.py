from rest_framework import serializers

from .models import Chamado, Notificacao


class NotificacaoSerializer(serializers.ModelSerializer):
    lida = serializers.SerializerMethodField()

    class Meta:
        model = Notificacao
        fields = ["id", "tipo", "titulo", "mensagem", "link", "lida", "lida_em", "criada_em"]

    def get_lida(self, obj):
        return obj.lida_em is not None


class ChamadoSerializer(serializers.ModelSerializer):
    categoria_display = serializers.CharField(source="get_categoria_display", read_only=True)
    prioridade_display = serializers.CharField(source="get_prioridade_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    autor_nome = serializers.SerializerMethodField()
    respondido_por_nome = serializers.SerializerMethodField()
    pode_editar = serializers.SerializerMethodField()

    class Meta:
        model = Chamado
        fields = ["id", "numero", "titulo", "descricao", "categoria", "categoria_display", "prioridade",
                  "prioridade_display", "status", "status_display", "tela", "autor", "autor_nome",
                  "resposta", "respondido_por_nome", "respondido_em", "criado_em", "atualizado_em",
                  "pode_editar"]
        read_only_fields = ["numero", "autor", "respondido_em"]

    @staticmethod
    def _nome(u):
        return (u.get_full_name() or u.username) if u else None

    def get_autor_nome(self, obj):
        return self._nome(obj.autor)

    def get_respondido_por_nome(self, obj):
        return self._nome(obj.respondido_por)

    def get_pode_editar(self, obj):
        u = self.context["request"].user
        return u.e_diretor or (obj.autor_id == u.id and obj.status == "aberto")
