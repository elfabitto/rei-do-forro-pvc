from rest_framework import serializers

from .models import Usuario


class UsuarioSerializer(serializers.ModelSerializer):
    nome = serializers.SerializerMethodField()

    class Meta:
        model = Usuario
        fields = ["id", "username", "nome", "first_name", "last_name", "email", "papel", "telefone",
                  "comissao_percentual", "is_active"]
        read_only_fields = ["id"]

    def get_nome(self, obj):
        return obj.get_full_name() or obj.username


class EuSerializer(UsuarioSerializer):
    """O que o React precisa saber para montar a interface do usuário logado."""

    permissoes = serializers.SerializerMethodField()

    class Meta(UsuarioSerializer.Meta):
        fields = UsuarioSerializer.Meta.fields + ["permissoes"]

    def get_permissoes(self, obj):
        return {
            "verFinanceiro": obj.pode_ver_financeiro,
            "finalizarOS": obj.pode_finalizar_os,
            "verPainel": obj.e_diretor,
            "cancelarOS": obj.e_diretor,
            "trocarVendedor": obj.pode_trocar_vendedor,
            "verTudo": obj.pode_ver_tudo,
            "vender": obj.pode_vender,
        }
