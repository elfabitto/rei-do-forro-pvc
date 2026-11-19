from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

from django.db import transaction
from rest_framework import serializers

from apps.clientes.serializers import ClienteResumoSerializer
from apps.core.permissions import pode_editar_registro

from .models import (
    CORES_MATERIAL, Orcamento, OrcamentoItem, TipoOrcamento, area_do_compartimento, area_dos_compartimentos,
)


CENTAVO = Decimal("0.01")
MEDIDA_MAXIMA = Decimal("9999")    # metros: barra erro de digitação, cabe em largura/comprimento


def limpar_compartimentos(valor, forros_validos=None, rotulo="Compartimento"):
    """
    [{nome, largura, comprimento}] conferidos e arredondados ao centavo. `forros_validos`
    (ids) aceita o `forro` por compartimento do formato antigo; None = não aceita.
    """
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
            raise serializers.ValidationError(f"{rotulo} {i}: informe largura e comprimento.")
        limpo = {
            "nome": str(c.get("nome") or "").strip()[:40],
            "largura": str(largura.quantize(CENTAVO, ROUND_HALF_UP)),
            "comprimento": str(comprimento.quantize(CENTAVO, ROUND_HALF_UP)),
        }
        if c.get("forro") and forros_validos is not None:
            if not str(c["forro"]).isdigit() or int(c["forro"]) not in forros_validos:
                raise serializers.ValidationError(f"{rotulo} {i}: forro não encontrado.")
            limpo["forro"] = int(c["forro"])
        limpos.append(limpo)
    return limpos


class OrcamentoItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrcamentoItem
        fields = ["id", "material", "descricao", "unidade", "quantidade", "preco_unitario", "total", "cor"]
        read_only_fields = ["total"]

    def validate_cor(self, valor):
        if valor and valor not in CORES_MATERIAL:
            raise serializers.ValidationError(f"Cor inválida. Use: {', '.join(CORES_MATERIAL)}.")
        return valor


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
                  "forro_nome", "forros_adicionais", "por_forro", "acabamento_nome", "estrutura_nome", "abatimento_estrutura",
                  "preco_m2_vista",
                  "preco_m2_cartao", "taxa_logistica", "desconto", "total_vista", "total_cartao", "observacoes",
                  "itens"]


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
                  "area_m2", "forro", "forro_nome", "forros_adicionais", "por_forro",
                  "acabamento", "acabamento_nome", "estrutura", "estrutura_nome", "abatimento_estrutura",
                  "preco_m2_vista", "preco_m2_cartao",
                  "taxa_logistica", "desconto", "total_vista", "total_cartao", "status", "status_display",
                  "validade_dias",
                  "observacoes", "vendedor", "vendedor_nome", "criado_por", "criado_em",
                  "itens", "tem_os", "os_id", "pode_editar"]
        read_only_fields = ["numero", "preco_m2_vista", "preco_m2_cartao", "por_forro", "taxa_logistica",
                            "abatimento_estrutura",
                            "total_vista",
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
        from apps.catalogo.models import Forro

        # formato antigo de dois forros: outro forro marcado num compartimento (ainda aceito
        # de telas abertas antes da atualização; a tela nova manda forros_adicionais)
        ids = {c.get("forro") for c in valor if isinstance(c, dict) and c.get("forro")} \
            if isinstance(valor, list) else set()
        existentes = set(Forro.objects.filter(pk__in=[i for i in ids if str(i).isdigit()])
                         .values_list("pk", flat=True))
        return limpar_compartimentos(valor, existentes)

    def validate_forros_adicionais(self, valor):
        """Os outros tipos de forro, cada um com a sua medida. A área de cada um vem conferida."""
        from apps.catalogo.models import Forro

        if not isinstance(valor, list):
            raise serializers.ValidationError("Lista de forros inválida.")
        limpos, vistos = [], set()
        for n, b in enumerate(valor, 2):   # o 1º forro é o `forro` do orçamento
            if not isinstance(b, dict) or not str(b.get("forro") or "").isdigit():
                raise serializers.ValidationError(f"Forro {n}: escolha o tipo de forro.")
            forro = Forro.objects.filter(pk=int(b["forro"])).first()
            if not forro:
                raise serializers.ValidationError(f"Forro {n}: forro não encontrado.")
            if forro.pk in vistos:
                raise serializers.ValidationError(f"Forro {n}: {forro.nome} já está no orçamento.")
            vistos.add(forro.pk)
            compartimentos = limpar_compartimentos(b.get("compartimentos") or [], rotulo=f"Forro {n} — área")
            tamanho = quantidade = None
            if compartimentos:
                area = area_dos_compartimentos(compartimentos)
            else:
                try:
                    area = Decimal(str(b.get("area_m2"))).quantize(CENTAVO, ROUND_HALF_UP)
                    if b.get("tamanho_folha") and b.get("quantidade_folhas"):
                        tamanho = Decimal(str(b["tamanho_folha"])).quantize(CENTAVO, ROUND_HALF_UP)
                        quantidade = int(b["quantidade_folhas"])
                except (TypeError, ValueError, InvalidOperation):
                    area = Decimal("0")
            if not 0 < area <= Decimal("99999"):
                raise serializers.ValidationError(f"Forro {n} ({forro.nome}): informe a medida.")
            limpos.append({
                "forro": forro.pk, "area_m2": str(area), "compartimentos": compartimentos,
                "tamanho_folha": str(tamanho) if tamanho else None, "quantidade_folhas": quantidade,
            })
        return limpos

    def validate_desconto(self, valor):
        if valor is not None and valor < 0:
            raise serializers.ValidationError("O desconto não pode ser negativo.")
        return valor

    def validate(self, attrs):
        instancia = self.instance
        adicionais = attrs.get("forros_adicionais", getattr(instancia, "forros_adicionais", None) or [])
        soma_adicionais = sum((Decimal(b["area_m2"]) for b in adicionais), Decimal("0"))
        principal = attrs.get("forro") or getattr(instancia, "forro", None)
        repetido = next((b for b in adicionais if principal and b["forro"] == principal.pk), None)
        if repetido:
            raise serializers.ValidationError(
                {"forros_adicionais": f"{principal.nome} já é o primeiro forro do orçamento."})

        # com compartimentos, a área do 1º forro sai deles — não do que a tela mandou;
        # a área do orçamento é a soma de todos os forros
        compartimentos = attrs["compartimentos"] if "compartimentos" in attrs \
            else getattr(instancia, "compartimentos", None)
        if compartimentos:
            if "compartimentos" in attrs:
                self._normalizar_forros(attrs, compartimentos)
                um = compartimentos[0] if len(compartimentos) == 1 else None
                attrs["largura"] = Decimal(um["largura"]) if um else None
                attrs["comprimento"] = Decimal(um["comprimento"]) if um else None
            if "compartimentos" in attrs or "forros_adicionais" in attrs:
                attrs["area_m2"] = area_dos_compartimentos(compartimentos) + soma_adicionais
        elif adicionais and ("area_m2" in attrs or "forros_adicionais" in attrs):
            total = attrs.get("area_m2", getattr(instancia, "area_m2", None)) or Decimal("0")
            if total - soma_adicionais <= 0:
                raise serializers.ValidationError({"area_m2": "Informe a medida do primeiro forro."})
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

    def _normalizar_forros(self, attrs, compartimentos):
        """
        O forro do compartimento só fica gravado quando difere do principal. Se nenhum
        compartimento usa o principal, o principal passa a ser o de maior área.
        """
        principal = attrs.get("forro") or getattr(self.instance, "forro", None)
        principal_id = principal.pk if principal else None
        areas = {}
        for c in compartimentos:
            fid = c.get("forro") or principal_id
            areas[fid] = areas.get(fid, Decimal("0")) + area_do_compartimento(c)
        if principal_id not in areas and areas:
            from apps.catalogo.models import Forro

            principal_id = max(areas, key=lambda k: areas[k])
            attrs["forro"] = Forro.objects.get(pk=principal_id)
        for c in compartimentos:
            if c.get("forro") == principal_id:
                del c["forro"]

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
