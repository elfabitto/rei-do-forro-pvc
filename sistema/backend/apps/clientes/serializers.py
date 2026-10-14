from rest_framework import serializers

from apps.core import formatos

from .models import Cliente, Endereco


class EnderecoSerializer(serializers.ModelSerializer):
    resumo = serializers.CharField(source="__str__", read_only=True)

    class Meta:
        model = Endereco
        fields = ["id", "cliente", "apelido", "logradouro", "numero", "complemento", "bairro",
                  "cidade", "uf", "cep", "ponto_referencia", "link_localizacao", "principal", "resumo"]

    def validate_numero(self, v):
        v = (v or "").strip().upper()
        if v in ("SN", "S/N", "S.N", "S/Nº"):
            return "S/N"
        if v and not formatos.digitos(v[:1]):
            raise serializers.ValidationError('Use só o número (ou "S/N").')
        return v

    def validate_cep(self, v):
        d = formatos.digitos(v)
        if not d:
            return ""
        if len(d) != 8:
            raise serializers.ValidationError("CEP tem 8 dígitos.")
        return f"{d[:5]}-{d[5:]}"

    def validate_bairro(self, v):
        return formatos.nome_proprio(v)

    def validate_cidade(self, v):
        if not (v or "").strip():
            raise serializers.ValidationError("Escolha a cidade.")
        try:
            return formatos.cidade(v)
        except ValueError as e:
            raise serializers.ValidationError(str(e))


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

    def validate_nome(self, v):
        v = formatos.nome_proprio(v)
        if len(v) < 3:
            raise serializers.ValidationError("Informe o nome do cliente.")
        return v

    def _telefone(self, v, obrigatorio):
        if not (v or "").strip():
            if obrigatorio:
                raise serializers.ValidationError("Informe o telefone (WhatsApp).")
            return ""
        try:
            return formatos.telefone(v)
        except ValueError as e:
            raise serializers.ValidationError(str(e))

    def validate_telefone(self, v):
        v = self._telefone(v, obrigatorio=True)
        # o mesmo comprador não vira dois cadastros
        outros = Cliente.objects.filter(telefone=v)
        if self.instance:
            outros = outros.exclude(pk=self.instance.pk)
        dono = outros.first()
        if dono:
            raise serializers.ValidationError(
                f"Já existe cliente com este telefone: {dono.nome}. Use o cadastro dele.")
        return v

    def validate_telefone_alt(self, v):
        return self._telefone(v, obrigatorio=False)
