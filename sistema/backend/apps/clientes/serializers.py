from rest_framework import serializers

from .models import Cliente, Endereco


class EnderecoSerializer(serializers.ModelSerializer):
    resumo = serializers.CharField(source="__str__", read_only=True)

    class Meta:
        model = Endereco
        fields = ["id", "cliente", "apelido", "logradouro", "numero", "complemento", "bairro",
                  "cidade", "uf", "cep", "ponto_referencia", "link_localizacao", "principal", "resumo"]


class ClienteResumoSerializer(serializers.ModelSerializer):
    bairro = serializers.SerializerMethodField()

    class Meta:
        model = Cliente
        fields = ["id", "nome", "telefone", "bairro"]

    def get_bairro(self, obj):
        e = obj.endereco_principal
        return e.bairro if e else ""


class ClienteSerializer(serializers.ModelSerializer):
    enderecos = EnderecoSerializer(many=True, read_only=True)
    total_ordens = serializers.IntegerField(source="ordens.count", read_only=True)

    class Meta:
        model = Cliente
        fields = ["id", "nome", "telefone", "telefone_alt", "documento", "email", "observacoes",
                  "enderecos", "total_ordens", "criado_por", "criado_em"]
        read_only_fields = ["criado_por", "criado_em"]
