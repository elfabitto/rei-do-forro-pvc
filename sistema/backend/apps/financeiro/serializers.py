from rest_framework import serializers

from .models import CATEGORIAS_ENTRADA, Lancamento, Tipo


class LancamentoSerializer(serializers.ModelSerializer):
    tipo_display = serializers.CharField(source="get_tipo_display", read_only=True)
    categoria_display = serializers.CharField(source="get_categoria_display", read_only=True)
    origem_display = serializers.CharField(source="get_origem_display", read_only=True)
    automatico = serializers.BooleanField(read_only=True)
    os_numero = serializers.CharField(source="ordem.numero", read_only=True, default=None)
    criado_por_nome = serializers.SerializerMethodField()

    class Meta:
        model = Lancamento
        fields = ["id", "tipo", "tipo_display", "categoria", "categoria_display", "descricao", "valor", "data",
                  "forma", "observacao", "origem", "origem_display", "automatico", "ordem", "os_numero",
                  "favorecido", "criado_por_nome", "criado_em"]
        read_only_fields = ["origem", "ordem", "favorecido"]

    def get_criado_por_nome(self, obj):
        return obj.criado_por.get_full_name() or obj.criado_por.username

    def validate(self, dados):
        tipo = dados.get("tipo", getattr(self.instance, "tipo", None))
        categoria = dados.get("categoria", getattr(self.instance, "categoria", None))
        if categoria and (categoria in CATEGORIAS_ENTRADA) != (tipo == Tipo.ENTRADA):
            raise serializers.ValidationError({"categoria": "Categoria não combina com o tipo do lançamento."})
        return dados
