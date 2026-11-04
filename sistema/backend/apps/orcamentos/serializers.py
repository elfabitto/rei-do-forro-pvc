from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

from django.db import transaction
from rest_framework import serializers

from apps.clientes.serializers import ClienteResumoSerializer
from apps.core.permissions import pode_editar_registro

from .models import Orcamento, OrcamentoItem, TipoOrcamento


CENTAVO = Decimal("0.01")
MEDIDA_MAXIMA = Decimal("9999")    # metros: barra erro de digitação, cabe em largura/comprimento


def area_dos_compartimentos(compartimentos):
    """Soma de largura × comprimento, cada um arredondado — a mesma conta da tela."""
    return sum(
        ((Decimal(c["largura"]) * Decimal(c["comprimento"])).quantize(CENTAVO, ROUND_HALF_UP) for c in compartimentos),
        Decimal("0"),
    )


class OrcamentoItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrcamentoItem
        fields = ["id", "material", "descricao", "unidade", "quantidade", "preco_unitario", "total"]
        read_only_fields = ["total"]


class OrcamentoResumoSerializer(serializers.ModelSerializer):
    """
    Ficha do pedido que a Ordem de Serviço carrega: é o que alimenta a seção
    "Informações do pedido" na tela e na imagem da O.S.
    """

    tipo_display = serializers.CharField(source="get_tipo_display", read_only=True)
    forro_nome = serializers.CharField(source="forro.nome", read_only=True)
    acabamento_nome = serializers.CharField(source="acabamento.nome", read_only=True, default=None)
    estrutura_nome = serializers.CharField(source="estrutura.nome", read_only=True, default=None)
    itens = OrcamentoItemSerializer(many=True, read_only=True)

    class Meta:
        model = Orcamento
        fields = ["id", "numero", "tipo", "tipo_display", "area_m2", "largura", "comprimento", "compartimentos",
                  "tamanho_folha", "quantidade_folhas",
                  "forro_nome", "acabamento_nome", "estrutura_nome", "preco_m2_vista", "preco_m2_cartao",
                  "taxa_logistica", "desconto", "total_vista", "total_cartao", "observacoes", "itens"]


def _conferir_desconto(orcamento):
    """Depois de somar os itens: o desconto não passa do valor à vista."""
    if orcamento.desconto and orcamento.desconto > orcamento.subtotal_vista:
        raise serializers.ValidationError(
            {"desconto": f"O desconto passa do valor à vista (R$ {orcamento.subtotal_vista})."}
        )


class OrcamentoSerializer(serializers.ModelSerializer):
    itens = OrcamentoItemSerializer(many=True, required=False)
    cliente_detalhe = ClienteResumoSerializer(source="cliente", read_only=True)
    forro_nome = serializers.CharField(source="forro.nome", read_only=True)
    acabamento_nome = serializers.CharField(source="acabamento.nome", read_only=True, default=None)
    estrutura_nome = serializers.CharField(source="estrutura.nome", read_only=True, default=None)
    vendedor_nome = serializers.CharField(source="vendedor.get_full_name", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    tipo_display = serializers.CharField(source="get_tipo_display", read_only=True)
    tem_os = serializers.SerializerMethodField()
    os_id = serializers.SerializerMethodField()
    pode_editar = serializers.SerializerMethodField()
    # orçamento feito numa visita técnica: na criação, liga os dois e traz o cliente dela
    visita = serializers.IntegerField(write_only=True, required=False, allow_null=True)
    visita_numero = serializers.CharField(source="visita.numero", read_only=True, default=None)

    class Meta:
        model = Orcamento
        fields = ["id", "numero", "cliente", "cliente_detalhe", "tipo", "tipo_display",
                  "visita", "visita_numero",
                  "largura", "comprimento", "compartimentos", "tamanho_folha", "quantidade_folhas",
                  "area_m2", "forro", "forro_nome",
                  "acabamento", "acabamento_nome", "estrutura", "estrutura_nome", "preco_m2_vista", "preco_m2_cartao",
                  "taxa_logistica", "desconto", "total_vista", "total_cartao", "status", "status_display",
                  "validade_dias",
                  "observacoes", "vendedor", "vendedor_nome", "criado_por", "criado_em",
                  "itens", "tem_os", "os_id", "pode_editar"]
        read_only_fields = ["numero", "preco_m2_vista", "preco_m2_cartao", "taxa_logistica", "total_vista",
                            "total_cartao", "criado_por", "criado_em"]
        extra_kwargs = {
            # omitido = o próprio usuário logado (ver perform_create da view)
            "vendedor": {"required": False},
        }

    def get_tem_os(self, obj):
        return getattr(obj, "ordem_servico", None).numero if hasattr(obj, "ordem_servico") else None

    def get_os_id(self, obj):
        return getattr(obj, "ordem_servico", None).id if hasattr(obj, "ordem_servico") else None

    def get_pode_editar(self, obj):
        """
        Todo mundo enxerga todos os orçamentos; mexer, só quem lançou e a
        diretoria. A interface espelha esta resposta nos botões.
        """
        pedido = self.context.get("request")
        return bool(pedido and pode_editar_registro(pedido.user, obj))

    def validate_compartimentos(self, valor):
        if not isinstance(valor, list):
            raise serializers.ValidationError("Lista de compartimentos inválida.")
        limpos = []
        for i, c in enumerate(valor, 1):
            try:
                largura, comprimento = Decimal(str(c["largura"])), Decimal(str(c["comprimento"]))
                valido = 0 < largura <= MEDIDA_MAXIMA and 0 < comprimento <= MEDIDA_MAXIMA
            except (KeyError, TypeError, InvalidOperation):
                valido = False
            if not valido:
                raise serializers.ValidationError(f"Compartimento {i}: informe largura e comprimento.")
            limpos.append({
                "nome": str(c.get("nome") or "").strip()[:40],
                "largura": str(largura.quantize(CENTAVO, ROUND_HALF_UP)),
                "comprimento": str(comprimento.quantize(CENTAVO, ROUND_HALF_UP)),
            })
        return limpos

    def validate_desconto(self, valor):
        if valor is not None and valor < 0:
            raise serializers.ValidationError("O desconto não pode ser negativo.")
        return valor

    def validate(self, attrs):
        # com compartimentos, a área sai deles — não do que a tela mandou
        compartimentos = attrs.get("compartimentos")
        if compartimentos:
            attrs["area_m2"] = area_dos_compartimentos(compartimentos)
            um = compartimentos[0] if len(compartimentos) == 1 else None
            attrs["largura"] = Decimal(um["largura"]) if um else None
            attrs["comprimento"] = Decimal(um["comprimento"]) if um else None
        tipo = attrs.get("tipo", getattr(self.instance, "tipo", None))
        if tipo == TipoOrcamento.MATERIAL and attrs.get("estrutura"):
            raise serializers.ValidationError(
                {"estrutura": "A estrutura por m² só existe no orçamento Instalado; "
                              "no Material o ripão entra como peça."}
            )
        if tipo == TipoOrcamento.MATERIAL and attrs.get("acabamento"):
            raise serializers.ValidationError(
                {"acabamento": "Acabamento só existe no orçamento Instalado; "
                               "no Material as peças entram como itens."}
            )
        # Material de catálogo é exclusivo do orçamento de Material. Os itens
        # "Outro" (verba: descrição livre e valor fechado) valem nos dois tipos,
        # para o que não cabe na tabela — deslocamento, retirada do forro antigo.
        if tipo == TipoOrcamento.INSTALADO:
            de_catalogo = [i for i in attrs.get("itens") or [] if i.get("material")]
            if de_catalogo:
                raise serializers.ValidationError(
                    {"itens": "Material de catálogo só existe no orçamento de Material; "
                              "no Instalado use itens avulsos (Outros)."}
                )
        return attrs

    def validate_visita(self, valor):
        if valor is None:
            return None
        from apps.ordens.models import StatusVisita, VisitaTecnica

        visita = VisitaTecnica.objects.filter(pk=valor).first()
        if not visita:
            raise serializers.ValidationError("Visita técnica não encontrada.")
        if visita.status != StatusVisita.AGENDADA:
            raise serializers.ValidationError("Esta visita já foi encerrada.")
        if visita.orcamento_id:
            raise serializers.ValidationError(f"Esta visita já tem o orçamento {visita.orcamento.numero}.")
        # quem vai medir nem sempre é quem agendou: qualquer um que faz orçamento pode
        return visita

    @transaction.atomic
    def create(self, validated):
        itens = validated.pop("itens", [])
        visita = validated.pop("visita", None)
        if visita:
            validated["cliente"] = visita.cliente
        orcamento = Orcamento.objects.create(**validated)
        for item in itens:
            OrcamentoItem.objects.create(orcamento=orcamento, **item)
        orcamento.save()  # recalcula os totais já com os itens
        _conferir_desconto(orcamento)
        if visita:
            visita.orcamento = orcamento
            visita.save(update_fields=["orcamento", "atualizado_em"])
        return orcamento

    @transaction.atomic
    def update(self, instancia, validated):
        itens = validated.pop("itens", None)
        validated.pop("visita", None)   # a ligação com a visita só nasce na criação
        for campo, valor in validated.items():
            setattr(instancia, campo, valor)
        if itens is not None:
            instancia.itens.all().delete()
            for item in itens:
                OrcamentoItem.objects.create(orcamento=instancia, **item)
        instancia.save()
        _conferir_desconto(instancia)
        return instancia
