from decimal import Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from rest_framework import serializers

from apps.clientes.serializers import ClienteResumoSerializer, EnderecoSerializer
from apps.contas.serializers import UsuarioSerializer

from .models import (
    Agendamento,
    Bloqueio,
    FormaPagamento,
    HistoricoOS,
    Modalidade,
    OrdemServico,
    Pagamento,
    StatusOS,
    TipoAgendamento,
    Turno,
)


class AgendamentoSerializer(serializers.ModelSerializer):
    tipo_display = serializers.CharField(source="get_tipo_display", read_only=True)
    turno_display = serializers.CharField(source="get_turno_display", read_only=True)

    # contexto do compromisso, para a lista da agenda não precisar de outra chamada
    os_numero = serializers.CharField(source="ordem.numero", read_only=True)
    os_status = serializers.CharField(source="ordem.status", read_only=True)
    os_status_display = serializers.CharField(source="ordem.get_status_display", read_only=True)
    atrasado = serializers.BooleanField(source="ordem.atrasado", read_only=True)
    cliente_nome = serializers.CharField(source="ordem.cliente.nome", read_only=True)
    cliente_telefone = serializers.CharField(source="ordem.cliente.telefone", read_only=True)
    bairro = serializers.CharField(source="ordem.endereco.bairro", read_only=True)
    endereco_resumo = serializers.CharField(source="ordem.endereco.__str__", read_only=True)

    class Meta:
        model = Agendamento
        fields = ["id", "ordem", "tipo", "tipo_display", "data", "turno", "turno_display",
                  "hora", "responsavel", "concluido", "concluido_em", "observacoes",
                  "os_numero", "os_status", "os_status_display", "atrasado",
                  "cliente_nome", "cliente_telefone", "bairro", "endereco_resumo"]

    def validate(self, attrs):
        # roda o clean() do modelo (capacidade do turno, bloqueios, dia sem atendimento)
        instancia = Agendamento(**{**_campos_atuais(self.instance), **attrs})
        instancia.pk = self.instance.pk if self.instance else None
        try:
            instancia.clean()
        except DjangoValidationError as e:
            raise serializers.ValidationError(e.message_dict or e.messages)
        return attrs


def _campos_atuais(instancia):
    if not instancia:
        return {}
    return {
        "ordem": instancia.ordem,
        "tipo": instancia.tipo,
        "data": instancia.data,
        "turno": instancia.turno,
    }


class PagamentoSerializer(serializers.ModelSerializer):
    forma_display = serializers.CharField(source="get_forma_display", read_only=True)
    registrado_por_nome = serializers.CharField(source="registrado_por.get_full_name", read_only=True)

    class Meta:
        model = Pagamento
        fields = ["id", "ordem", "forma", "forma_display", "valor", "parcelas", "data",
                  "observacao", "registrado_por", "registrado_por_nome", "registrado_em"]
        read_only_fields = ["registrado_por", "registrado_em"]


class HistoricoSerializer(serializers.ModelSerializer):
    usuario_nome = serializers.CharField(source="usuario.get_full_name", read_only=True)
    de_display = serializers.CharField(source="get_de_status_display", read_only=True)
    para_display = serializers.CharField(source="get_para_status_display", read_only=True)

    class Meta:
        model = HistoricoOS
        fields = ["id", "de_status", "de_display", "para_status", "para_display",
                  "usuario", "usuario_nome", "em", "observacao"]


class OrdemServicoListaSerializer(serializers.ModelSerializer):
    # `cliente` é o id (gravável); `cliente_detalhe` é o objeto aninhado (leitura).
    cliente_detalhe = ClienteResumoSerializer(source="cliente", read_only=True)
    vendedor_nome = serializers.CharField(source="vendedor.get_full_name", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    entrega = serializers.SerializerMethodField()
    instalacao = serializers.SerializerMethodField()
    saldo = serializers.DecimalField(max_digits=11, decimal_places=2, read_only=True)
    atrasado = serializers.BooleanField(read_only=True)
    dias_atraso = serializers.IntegerField(read_only=True)
    modalidade_display = serializers.CharField(source="get_modalidade_display", read_only=True, default="")

    class Meta:
        model = OrdemServico
        fields = ["id", "numero", "cliente", "cliente_detalhe", "vendedor", "vendedor_nome",
                  "status", "status_display", "valor_total", "valor_vista", "valor_cartao",
                  "modalidade", "modalidade_display", "desconto", "saldo",
                  "entrega", "instalacao", "criado_em", "atrasado", "dias_atraso"]

    def get_entrega(self, obj):
        a = obj.agendamento_entrega
        return AgendamentoSerializer(a).data if a else None

    def get_instalacao(self, obj):
        a = obj.agendamento_instalacao
        return AgendamentoSerializer(a).data if a else None


class AgendarSerializer(serializers.Serializer):
    """Data + turno enviados junto da criação da O.S."""

    data = serializers.DateField()
    turno = serializers.ChoiceField(choices=Turno.choices)


class OrdemServicoSerializer(OrdemServicoListaSerializer):
    endereco_detalhe = EnderecoSerializer(source="endereco", read_only=True)
    vendedor_detalhe = UsuarioSerializer(source="vendedor", read_only=True)
    pagamentos = PagamentoSerializer(many=True, read_only=True)
    historico = HistoricoSerializer(many=True, read_only=True)
    agendamentos = AgendamentoSerializer(many=True, read_only=True)
    total_pago = serializers.DecimalField(max_digits=11, decimal_places=2, read_only=True)
    valor_liquido = serializers.DecimalField(max_digits=11, decimal_places=2, read_only=True)
    orcamento_numero = serializers.CharField(source="orcamento.numero", read_only=True, default=None)

    # Agendar no mesmo passo em que a O.S. nasce — é como acontece no balcão.
    agendar_entrega = AgendarSerializer(write_only=True, required=False, allow_null=True)
    agendar_instalacao = AgendarSerializer(write_only=True, required=False, allow_null=True)

    class Meta(OrdemServicoListaSerializer.Meta):
        fields = OrdemServicoListaSerializer.Meta.fields + [
            "orcamento", "orcamento_numero", "endereco", "endereco_detalhe",
            "vendedor_detalhe", "observacoes",
            "pagamentos", "historico", "agendamentos",
            "total_pago", "valor_liquido", "criado_por", "finalizada_por", "finalizada_em",
            "cancelada_por", "cancelada_em", "motivo_cancelamento",
            "agendar_entrega", "agendar_instalacao",
        ]
        read_only_fields = ["numero", "criado_por", "finalizada_por", "finalizada_em",
                            "cancelada_por", "cancelada_em", "status"]
        extra_kwargs = {
            # omitido = o próprio usuário logado (ver perform_create da view)
            "vendedor": {"required": False},
            # omitidos = vêm do orçamento vinculado (ver validate).
            # Precisam ser required=False aqui porque o DRF valida campo a campo
            # antes de chamar validate(), onde o preenchimento acontece.
            "valor_total": {"required": False},
            "cliente": {"required": False},
        }

    def validate(self, attrs):
        """A O.S. herda cliente e valor do orçamento quando não vierem explícitos."""
        orcamento = attrs.get("orcamento") or getattr(self.instance, "orcamento", None)
        if orcamento:
            attrs.setdefault("cliente", orcamento.cliente)
            attrs.setdefault("valor_total", orcamento.total_vista)
            # guarda as duas referências: a modalidade é escolhida só no fechamento
            attrs.setdefault("valor_vista", orcamento.total_vista)
            attrs.setdefault("valor_cartao", orcamento.total_cartao)
        if not self.instance:
            faltando = {
                campo: "Informe o valor ou vincule um orçamento."
                for campo in ("cliente", "valor_total")
                if not attrs.get(campo)
            }
            if faltando:
                raise serializers.ValidationError(faltando)
        return attrs

    @transaction.atomic
    def create(self, validated):
        """
        Transação única: se o turno estiver cheio, a O.S. inteira é desfeita em vez
        de ficar criada sem agendamento.
        """
        entrega = validated.pop("agendar_entrega", None)
        instalacao = validated.pop("agendar_instalacao", None)
        ordem = super().create(validated)

        for dados, tipo in ((entrega, TipoAgendamento.ENTREGA),
                            (instalacao, TipoAgendamento.INSTALACAO)):
            if not dados:
                continue
            try:
                Agendamento.objects.create(ordem=ordem, tipo=tipo, **dados)
            except DjangoValidationError as e:
                campo = "agendar_entrega" if tipo == TipoAgendamento.ENTREGA else "agendar_instalacao"
                raise serializers.ValidationError({campo: e.messages})
        return ordem

    def validate_vendedor(self, valor):
        """
        Quem trouxe o cliente só pode ser alterado pela diretoria — é a base da comissão.
        Na criação o default é o próprio usuário logado (ver perform_create da view).
        """
        usuario = self.context["request"].user
        if self.instance and self.instance.vendedor_id != valor.id and not usuario.pode_trocar_vendedor:
            raise serializers.ValidationError(
                "Apenas a diretoria pode alterar quem trouxe o cliente."
            )
        return valor


class MudarStatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=StatusOS.choices)
    observacao = serializers.CharField(required=False, allow_blank=True, default="")


class PagamentoEntradaSerializer(serializers.Serializer):
    """Pagamento enviado dentro do fechamento — a O.S. já é a da própria rota."""

    forma = serializers.ChoiceField(choices=FormaPagamento.choices)
    valor = serializers.DecimalField(max_digits=11, decimal_places=2, min_value=Decimal("0.01"))
    parcelas = serializers.IntegerField(required=False, default=1, min_value=1)
    observacao = serializers.CharField(required=False, allow_blank=True, default="")


class FinalizarSerializer(serializers.Serializer):
    """Fechamento: escolhe a modalidade e lança os pagamentos recebidos."""

    modalidade = serializers.ChoiceField(choices=Modalidade.choices, required=False)
    desconto = serializers.DecimalField(max_digits=11, decimal_places=2, required=False)
    observacao = serializers.CharField(required=False, allow_blank=True, default="")
    pagamentos = PagamentoEntradaSerializer(many=True, required=False)


class ReagendarSerializer(serializers.Serializer):
    """Remarcação de um compromisso que atrasou."""

    data = serializers.DateField()
    turno = serializers.ChoiceField(choices=Turno.choices)


class BloqueioSerializer(serializers.ModelSerializer):
    class Meta:
        model = Bloqueio
        fields = ["id", "data", "turno", "motivo", "criado_por"]
        read_only_fields = ["criado_por"]
