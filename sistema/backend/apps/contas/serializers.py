from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from apps.core import formatos

from .models import Papel, Usuario


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
            "gerirUsuarios": obj.e_diretor,
            "atenderChamados": obj.pode_atender_chamados,
            "cancelarOS": obj.e_diretor,
            "excluirOS": obj.e_diretor,
            "abrirExcecao": obj.e_diretor,
            "trocarVendedor": obj.pode_trocar_vendedor,
            "verTudo": obj.pode_ver_tudo,
            "vender": obj.pode_vender,
        }


class UsuarioGestaoSerializer(UsuarioSerializer):
    """Cadastro de usuários pela diretoria. Senha só entra, nunca sai."""

    senha = serializers.CharField(write_only=True, required=False, allow_blank=True, min_length=6)
    papel_display = serializers.CharField(source="get_papel_display", read_only=True)
    papel = serializers.ChoiceField(choices=Papel.choices)

    class Meta(UsuarioSerializer.Meta):
        fields = ["id", "username", "nome", "first_name", "last_name", "email", "papel", "papel_display",
                  "telefone", "is_active", "senha", "last_login", "date_joined"]
        read_only_fields = ["id", "last_login", "date_joined"]

    def validate_first_name(self, v):
        return formatos.nome_proprio(v)

    def validate_last_name(self, v):
        return formatos.nome_proprio(v)

    def validate_telefone(self, v):
        if not (v or "").strip():
            return ""
        try:
            return formatos.telefone(v)
        except ValueError as e:
            raise serializers.ValidationError(str(e))

    def validate_username(self, valor):
        valor = valor.strip().lower()
        existe = Usuario.objects.filter(username__iexact=valor)
        if self.instance:
            existe = existe.exclude(pk=self.instance.pk)
        if existe.exists():
            raise serializers.ValidationError("Já existe um usuário com esse login.")
        return valor

    def validate(self, dados):
        eu = self.context["request"].user
        if self.instance and self.instance.pk == eu.pk:
            if dados.get("is_active") is False:
                raise serializers.ValidationError({"is_active": "Você não pode desativar o próprio acesso."})
            if dados.get("papel", eu.papel) not in (Papel.DIRETOR, Papel.TI) and not eu.is_superuser:
                raise serializers.ValidationError({"papel": "Você não pode tirar o próprio acesso de diretor."})
        if not self.instance and not dados.get("senha"):
            raise serializers.ValidationError({"senha": "Informe uma senha inicial."})
        if dados.get("senha"):
            try:
                validate_password(dados["senha"], Usuario(username=dados.get("username", "")))
            except DjangoValidationError as e:
                raise serializers.ValidationError({"senha": list(e.messages)})
        return dados

    def create(self, dados):
        senha = dados.pop("senha")
        u = Usuario(**dados)
        u.set_password(senha)
        u.save()
        return u

    def update(self, u, dados):
        senha = dados.pop("senha", "")
        for k, v in dados.items():
            setattr(u, k, v)
        if senha:
            u.set_password(senha)
        u.save()
        return u
