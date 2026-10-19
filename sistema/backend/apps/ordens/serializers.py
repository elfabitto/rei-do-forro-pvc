from decimal import Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from rest_framework import serializers

from apps.clientes.serializers import ClienteResumoSerializer, EnderecoSerializer
from apps.contas.serializers import UsuarioSerializer
from apps.core.permissions import pode_editar_registro
from apps.orcamentos.serializers import OrcamentoResumoSerializer

from .models import (
    FORMAS_ACEITAS,
    Agendamento,
    Bloqueio,
    FormaPagamento,
    HistoricoOS,
    Modalidade,
    OrdemServico,
    Pagamento,
    StatusOS,
    TipoAgendamento,
    ParametrosComissao,
    TaxasCartao,
    TipoServico,
    Turno,
    VisitaTecnica,
)


class AgendamentoSerializer(serializers.ModelSerializer):
    tipo_display = serializers.CharField(source="get_tipo_display", read_only=True)
    turno_display = serializers.CharField(source="get_turno_display", read_only=True)
    turno_fim_display = serializers.CharField(source="get_turno_fim_display", read_only=True)
    dias = serializers.FloatField(read_only=True)

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
                  "duracao_turnos", "dias", "data_fim", "turno_fim", "turno_fim_display", "ocupacao",
                  "hora", "responsavel", "concluido", "concluido_em", "observacoes",
                  "os_numero", "os_status", "os_status_display", "atrasado",
                  "cliente_nome", "cliente_telefone", "bairro", "endereco_resumo"]
        read_only_fields = ["duracao_turnos", "data_fim", "turno_fim", "ocupacao"]

    def validate(self, attrs):
        # roda o clean() do modelo (vagas, duração da instalação, bloqueios, dia sem atendimento)
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
        fields = ["id", "ordem", "forma", "forma_display", "valor", "acrescimo", "parcelas", "data",
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
    tipo_display = serializers.CharField(source="get_tipo_display", read_only=True)
    entrega = serializers.SerializerMethodField()
    instalacao = serializers.SerializerMethodField()
    saldo = serializers.DecimalField(max_digits=11, decimal_places=2, read_only=True)
    atrasado = serializers.BooleanField(read_only=True)
    dias_atraso = serializers.IntegerField(read_only=True)
    modalidade_display = serializers.CharField(source="get_modalidade_display", read_only=True, default="")
    area_m2 = serializers.DecimalField(max_digits=9, decimal_places=2, read_only=True)
    comissao_valor = serializers.DecimalField(max_digits=11, decimal_places=2, read_only=True)
    comissao_detalhe = serializers.SerializerMethodField()
    pode_editar = serializers.SerializerMethodField()

    class Meta:
        model = OrdemServico
        fields = ["id", "numero", "tipo", "tipo_display", "cliente", "cliente_detalhe",
                  "vendedor", "vendedor_nome", "status", "status_display",
                  "valor_total", "valor_vista", "valor_cartao",
                  "modalidade", "modalidade_display", "desconto", "saldo",
                  "entrega", "instalacao", "criado_em", "atrasado", "dias_atraso",
                  "area_m2", "comissao_valor", "comissao_detalhe", "comissao_paga", "pode_editar"]

    def get_entrega(self, obj):
        a = obj.agendamento_entrega
        return AgendamentoSerializer(a).data if a else None

    def get_instalacao(self, obj):
        a = obj.agendamento_instalacao
        return AgendamentoSerializer(a).data if a else None

    def get_comissao_detalhe(self, obj):
        return [{"descricao": d, "valor": v} for d, _, v in obj.comissao_detalhe]

    def get_pode_editar(self, obj):
        pedido = self.context.get("request")
        return bool(pedido and pode_editar_registro(pedido.user, obj))


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
    # ficha do pedido: área, forro, acabamento, itens e preço do m²
    orcamento_detalhe = OrcamentoResumoSerializer(source="orcamento", read_only=True)
    criado_por_nome = serializers.CharField(source="criado_por.get_full_name", read_only=True)

    # Agendar no mesmo passo em que a O.S. nasce — é como acontece no balcão.
    agendar_entrega = AgendarSerializer(write_only=True, required=False, allow_null=True)
    agendar_instalacao = AgendarSerializer(write_only=True, required=False, allow_null=True)

    class Meta(OrdemServicoListaSerializer.Meta):
        fields = OrdemServicoListaSerializer.Meta.fields + [
            "orcamento", "orcamento_numero", "orcamento_detalhe",
            "endereco", "endereco_detalhe",
            "vendedor_detalhe", "observacoes",
            "pagamentos", "historico", "agendamentos",
            "total_pago", "valor_liquido", "criado_por", "criado_por_nome",
            "finalizada_por", "finalizada_em",
            "cancelada_por", "cancelada_em", "motivo_cancelamento",
            "comissao_paga_em", "agendar_entrega", "agendar_instalacao",
        ]
        read_only_fields = ["numero", "criado_por", "finalizada_por", "finalizada_em",
                            "cancelada_por", "cancelada_em", "status",
                            "comissao_paga", "comissao_paga_em"]
        extra_kwargs = {
            # omitido = o próprio usuário logado (ver perform_create da view)
            "vendedor": {"required": False},
            # omitidos = vêm do orçamento vinculado (ver validate).
            # Precisam ser required=False aqui porque o DRF valida campo a campo
            # antes de chamar validate(), onde o preenchimento acontece.
            "valor_total": {"required": False},
            "cliente": {"required": False},
            "tipo": {"required": False},
        }

    def validate(self, attrs):
        """
        A O.S. herda do orçamento o cliente, o tipo e os dois valores de
        referência. A modalidade é a forma que o cliente escolheu ao fechar —
        ela define qual dos dois valores vai ser cobrado, e pode ser trocada na
        finalização se o cliente mudar de ideia.
        """
        orcamento = attrs.get("orcamento") or getattr(self.instance, "orcamento", None)
        if orcamento:
            attrs.setdefault("cliente", orcamento.cliente)
            attrs.setdefault("tipo", TipoServico(orcamento.tipo))
            attrs.setdefault("valor_vista", orcamento.total_vista)
            attrs.setdefault("valor_cartao", orcamento.total_cartao)

        modalidade = attrs.get("modalidade") or getattr(self.instance, "modalidade", "")
        if modalidade:
            referencia = attrs.get("valor_cartao") if modalidade == Modalidade.CARTAO else attrs.get("valor_vista")
            if referencia is not None:
                attrs["valor_total"] = referencia
        elif orcamento:
            attrs.setdefault("valor_total", orcamento.total_vista)

        if not self.instance and attrs.get("tipo") == TipoServico.INSTALADO and attrs.get("agendar_entrega"):
            raise serializers.ValidationError({
                "agendar_entrega": "A instalação já leva o material: agende só a instalação."
            })

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
        Transação única: se não houver vaga, a O.S. inteira é desfeita em vez
        de ficar criada sem agendamento. Material agenda a entrega; Instalado
        agenda só a instalação, que já consome a vaga de entrega do primeiro dia.
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
    """
    Pagamento enviado dentro do fechamento — a O.S. já é a da própria rota.
    Só PIX, dinheiro, crédito e débito; parcelas só no crédito.
    """

    forma = serializers.ChoiceField(choices=[(f.value, f.label) for f in FormaPagamento if f in FORMAS_ACEITAS])
    # no cartão, o valor à vista que esta forma quita; o acréscimo é calculado aqui
    valor = serializers.DecimalField(max_digits=11, decimal_places=2, min_value=Decimal("0.01"))
    parcelas = serializers.IntegerField(required=False, default=1, min_value=1, max_value=12)

    def validate(self, attrs):
        if attrs["forma"] != FormaPagamento.CREDITO:
            attrs["parcelas"] = 1
        return attrs
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


class TaxasCartaoSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaxasCartao
        fields = ["debito", "credito", "atualizado_em"]
        read_only_fields = ["atualizado_em"]

    def validate_credito(self, valor):
        limpo = {}
        for n in range(1, TaxasCartao.PARCELAS_MAX + 1):
            bruto = valor.get(str(n), valor.get(n))
            if bruto in (None, ""):
                continue
            try:
                taxa = Decimal(str(bruto).replace(",", "."))
            except Exception:
                raise serializers.ValidationError(f"Taxa inválida em {n}x.")
            if not (0 <= taxa < 100):
                raise serializers.ValidationError(f"Taxa de {n}x deve ficar entre 0 e 100%.")
            limpo[str(n)] = str(taxa.quantize(Decimal("0.01")))
        return limpo


class ParametrosComissaoSerializer(serializers.ModelSerializer):
    class Meta:
        model = ParametrosComissao
        fields = ["instalado_m2", "material_forro_m2", "material_servico_m2", "atualizado_em"]
        read_only_fields = ["atualizado_em"]


class VisitaTecnicaSerializer(serializers.ModelSerializer):
    """Visita técnica (orçamento presencial) — card, agenda e detalhe."""

    cliente_detalhe = ClienteResumoSerializer(source="cliente", read_only=True)
    endereco_detalhe = EnderecoSerializer(source="endereco", read_only=True)
    bairro = serializers.CharField(source="endereco.bairro", read_only=True)
    endereco_resumo = serializers.CharField(source="endereco.__str__", read_only=True)
    turno_display = serializers.CharField(source="get_turno_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    vendedor_nome = serializers.CharField(source="vendedor.get_full_name", read_only=True)
    orcamento_numero = serializers.CharField(source="orcamento.numero", read_only=True, default=None)
    atrasada = serializers.BooleanField(read_only=True)
    os_id = serializers.SerializerMethodField()
    os_numero = serializers.SerializerMethodField()
    pode_editar = serializers.SerializerMethodField()

    class Meta:
        model = VisitaTecnica
        fields = ["id", "numero", "cliente", "cliente_detalhe", "endereco", "endereco_detalhe", "bairro",
                  "endereco_resumo", "data", "turno", "turno_display", "status", "status_display",
                  "observacoes", "orcamento", "orcamento_numero", "os_id", "os_numero", "vendedor",
                  "vendedor_nome", "criado_em", "motivo_perda", "perdida_em", "atrasada", "pode_editar"]
        read_only_fields = ["numero", "status", "orcamento", "criado_em", "motivo_perda", "perdida_em"]
        extra_kwargs = {"vendedor": {"required": False}}

    def _os(self, obj):
        orc = obj.orcamento
        return getattr(orc, "ordem_servico", None) if orc else None

    def get_os_id(self, obj):
        os_ = self._os(obj)
        return os_.id if os_ else None

    def get_os_numero(self, obj):
        os_ = self._os(obj)
        return os_.numero if os_ else None

    def get_pode_editar(self, obj):
        return pode_editar_registro(self.context["request"].user, obj)

    def validate(self, attrs):
        from django.utils import timezone

        atual = self.instance
        if atual and atual.status != "agendada" and ({"data", "turno", "cliente", "endereco"} & set(attrs)):
            raise serializers.ValidationError("Visita encerrada: não dá mais para remarcar.")
        data = attrs.get("data")
        if data and data < timezone.localdate() and (not atual or data != atual.data):
            raise serializers.ValidationError({"data": "Escolha uma data de hoje em diante."})
        # roda o clean() do modelo: vaga no dia, turno bloqueado, endereço do cliente
        campos = {f: getattr(atual, f) for f in ("cliente", "endereco", "data", "turno", "status")} if atual else {}
        instancia = VisitaTecnica(**{**campos, **{k: v for k, v in attrs.items()
                                                 if k in ("cliente", "endereco", "data", "turno")}})
        instancia.pk = atual.pk if atual else None
        try:
            instancia.clean()
        except DjangoValidationError as e:
            raise serializers.ValidationError(e.message_dict if hasattr(e, "message_dict") else e.messages)
        return attrs


class PerderVisitaSerializer(serializers.Serializer):
    motivo = serializers.CharField(required=False, allow_blank=True, default="")

