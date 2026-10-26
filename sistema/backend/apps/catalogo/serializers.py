from rest_framework import serializers

from .models import Acabamento, Estrutura, Forro, Material


class ForroSerializer(serializers.ModelSerializer):
    class Meta:
        model = Forro
        fields = "__all__"


class MaterialSerializer(serializers.ModelSerializer):
    tem_cotacao_diferente = serializers.BooleanField(read_only=True)

    class Meta:
        model = Material
        fields = "__all__"


class AcabamentoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Acabamento
        fields = "__all__"


class EstruturaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Estrutura
        fields = "__all__"
