from rest_framework import serializers

from apps.clientes.serializers import ClienteResumoSerializer
from apps.core.permissions import pode_editar_registro

from .models import Orcamento, OrcamentoItem, TipoOrcamento


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
    itens = OrcamentoItemSerializer(many=True, read_only=True)

    class Meta:
        model = Orcamento
        fields = ["id", "numero", "tipo", "tipo_display", "area_m2", "largura", "comprimento",
                  "tamanho_folha", "quantidade_folhas",
                  "forro_nome", "acabamento_nome", "preco_m2_vista", "preco_m2_cartao",
                  "taxa_logistica", "total_vista", "total_cartao", "observacoes", "itens"]


class OrcamentoSerializer(serializers.ModelSerializer):
    itens = OrcamentoItemSerializer(many=True, required=False)
    cliente_detalhe = ClienteResumoSerializer(source="cliente", read_only=True)
    forro_nome = serializers.CharField(source="forro.nome", read_only=True)
    acabamento_nome = serializers.CharField(source="acabamento.nome", read_only=True, default=None)
    vendedor_nome = serializers.CharField(source="vendedor.get_full_name", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    tipo_display = serializers.CharField(source="get_tipo_display", read_only=True)
    tem_os = serializers.SerializerMethodField()
    os_id = serializers.SerializerMethodField()
    pode_editar = serializers.SerializerMethodField()

    class Meta:
        model = Orcamento
        fields = ["id", "numero", "cliente", "cliente_detalhe", "tipo", "tipo_display",
                  "largura", "comprimento", "tamanho_folha", "quantidade_folhas",
                  "area_m2", "forro", "forro_nome",
                  "acabamento", "acabamento_nome", "preco_m2_vista", "preco_m2_cartao",
                  "taxa_logistica", "total_vista", "total_cartao", "status", "status_display", "validade_dias",
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

    def validate(self, attrs):
        tipo = attrs.get("tipo", getattr(self.instance, "tipo", None))
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

    def create(self, validated):
        itens = validated.pop("itens", [])
        orcamento = Orcamento.objects.create(**validated)
        for item in itens:
            OrcamentoItem.objects.create(orcamento=orcamento, **item)
        orcamento.save()  # recalcula os totais já com os itens
        return orcamento

    def update(self, instancia, validated):
        itens = validated.pop("itens", None)
        for campo, valor in validated.items():
            setattr(instancia, campo, valor)
        if itens is not None:
            instancia.itens.all().delete()
            for item in itens:
                OrcamentoItem.objects.create(orcamento=instancia, **item)
        instancia.save()
        return instancia
