from decimal import ROUND_HALF_UP, Decimal

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models, transaction
from django.utils import timezone

CENTAVO = Decimal("0.01")

# Instalação abaixo de 20 m² paga a logística/frete à parte.
AREA_MINIMA_SEM_TAXA = Decimal("20")
TAXA_LOGISTICA = Decimal("80.00")

# O valor "no cartão" do orçamento é o crédito nesse número de parcelas, com a
# taxa cadastrada em Parâmetros (TaxasCartao): o mesmo que sai na finalização.
PARCELAS_ORCAMENTO = 5

# "Sem forro": o cliente já tem forro e material, o orçamento é só da instalação, por m².
# R$ 25,00 é o padrão (o mesmo sugerido para o Serviço do orçamento de Material); muda por orçamento.
PRECO_SERVICO_M2 = Decimal("25.00")
SEM_FORRO = "Sem forro (cliente já tem)"

# cores de perfil, moldura e sanca no orçamento de Material — a 1ª é a padrão
CORES_MATERIAL = ["Branco", "Mogno", "Guaruba", "Cerejeira", "Bege", "Cinza"]
COR_PADRAO = CORES_MATERIAL[0]


def area_do_compartimento(c):
    """Largura × comprimento arredondado ao centavo — a mesma conta da tela."""
    return (Decimal(str(c["largura"])) * Decimal(str(c["comprimento"]))).quantize(CENTAVO, ROUND_HALF_UP)


def nome_do_compartimento(c, posicao):
    """O nome digitado; sem nome, a posição ("Área 2") — igual ao documento da tela e à O.S."""
    return c.get("nome") or f"Área {posicao}"


def area_dos_compartimentos(compartimentos):
    return sum((area_do_compartimento(c) for c in compartimentos), Decimal("0"))


class TipoOrcamento(models.TextChoices):
    MATERIAL = "material", "Material (só o forro)"
    INSTALADO = "instalado", "Instalação completa"


class StatusOrcamento(models.TextChoices):
    ABERTO = "aberto", "Em aberto"
    CONVERTIDO = "convertido", "Convertido em Serviço"
    PERDIDO = "perdido", "Perdido"


class Orcamento(models.Model):
    numero = models.CharField(max_length=16, unique=True, editable=False)

    cliente = models.ForeignKey(
        "clientes.Cliente", on_delete=models.PROTECT, related_name="orcamentos", null=True, blank=True
    )
    tipo = models.CharField(max_length=12, choices=TipoOrcamento.choices)

    # Medida do 1º forro (`forro`): área direta, compartimentos (largura × comprimento de cada um)
    # ou por folha (folha de 20 cm de largura). Lista de {nome, largura, comprimento}.
    # Orçamentos de nov/2026 podem ter `forro` num compartimento (outro forro só nele) —
    # o formato antigo de dois forros, que continua valendo na conta.
    compartimentos = models.JSONField(default=list, blank=True)
    # Os outros tipos de forro do orçamento, cada um com a sua medida:
    # [{forro, area_m2, compartimentos, tamanho_folha, quantidade_folhas}]. Vazio = um forro só.
    # `area_m2` do orçamento é a soma de todos.
    forros_adicionais = models.JSONField(default=list, blank=True)
    # Com mais de um forro: área, m², total e medida de cada um, congelados no cálculo —
    # [{forro, nome, area_m2, preco_m2_vista, preco_m2_cartao, total_vista, ambientes,
    #   compartimentos, tamanho_folha, quantidade_folhas}]. Vazio quando é um forro só.
    por_forro = models.JSONField(default=list, blank=True)
    largura = models.DecimalField(max_digits=7, decimal_places=2, null=True, blank=True)
    comprimento = models.DecimalField(max_digits=7, decimal_places=2, null=True, blank=True)
    tamanho_folha = models.DecimalField("tamanho da folha (m)", max_digits=7, decimal_places=2, null=True, blank=True)
    quantidade_folhas = models.PositiveIntegerField("quantidade de folhas", null=True, blank=True)
    area_m2 = models.DecimalField("área (m²)", max_digits=9, decimal_places=2, validators=[MinValueValidator(Decimal("0.01"))])

    # vazio = "Sem forro": só a instalação (tipo Instalado), cobrada por `preco_servico_m2`
    forro = models.ForeignKey("catalogo.Forro", on_delete=models.PROTECT, related_name="orcamentos",
                              null=True, blank=True)
    preco_servico_m2 = models.DecimalField("m² da instalação (sem forro)", max_digits=9, decimal_places=2,
                                           null=True, blank=True)
    # estrutura (ripão) do Instalado; vazio = a padrão, sem acréscimo (orçamentos antigos)
    estrutura = models.ForeignKey(
        "catalogo.Estrutura", on_delete=models.PROTECT, related_name="orcamentos", null=True, blank=True,
    )
    acabamento = models.ForeignKey(
        "catalogo.Acabamento",
        on_delete=models.PROTECT,
        related_name="orcamentos",
        null=True,
        blank=True,
        help_text="Só se aplica ao tipo Instalado.",
    )

    # Fotografia dos preços na data do orçamento: mudar a tabela depois
    # não pode alterar um orçamento já enviado ao cliente.
    preco_m2_vista = models.DecimalField(max_digits=9, decimal_places=2)
    preco_m2_cartao = models.DecimalField(max_digits=9, decimal_places=2)
    taxa_logistica = models.DecimalField("taxa de logística", max_digits=9, decimal_places=2, default=0)
    # "Sem ripão" (estrutura de acréscimo negativo): quanto saiu do total — registrado na O.S.
    abatimento_estrutura = models.DecimalField(max_digits=11, decimal_places=2, default=0)
    # desconto em R$ dado já no orçamento: abate do à vista, e o cartão sai do valor já com desconto
    desconto = models.DecimalField(max_digits=11, decimal_places=2, default=0)
    total_vista = models.DecimalField(max_digits=11, decimal_places=2, default=0)
    total_cartao = models.DecimalField(max_digits=11, decimal_places=2, default=0)

    status = models.CharField(max_length=12, choices=StatusOrcamento.choices, default=StatusOrcamento.ABERTO)
    validade_dias = models.PositiveSmallIntegerField(default=15)
    observacoes = models.TextField("observações", blank=True)

    # quem trouxe o cliente — base da comissão, herdada pela O.S.
    vendedor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="orcamentos_como_vendedor"
    )
    criado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="orcamentos_criados"
    )
    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-criado_em"]
        verbose_name = "orçamento"
        verbose_name_plural = "orçamentos"
        indexes = [
            models.Index(fields=["status", "-criado_em"]),
            models.Index(fields=["vendedor", "-criado_em"]),
        ]

    def __str__(self):
        return f"{self.numero} — {self.cliente or 'sem cliente'}"

    # ------------------------------------------------------------------ número
    @staticmethod
    def _proximo_numero():
        ano = timezone.localdate().year
        prefixo = f"ORC-{ano}-"
        ultimo = (
            Orcamento.objects.filter(numero__startswith=prefixo).order_by("-numero").values_list("numero", flat=True).first()
        )
        seq = int(ultimo.rsplit("-", 1)[1]) + 1 if ultimo else 1
        return f"{prefixo}{seq:04d}"

    # ------------------------------------------------------------------ cálculo
    @staticmethod
    def no_cartao(valor, parcelas=PARCELAS_ORCAMENTO):
        """O valor à vista passado no crédito (5x por padrão): valor ÷ (1 − taxa cadastrada)."""
        from apps.ordens.models import FormaPagamento, TaxasCartao

        return valor + TaxasCartao.obter().acrescimo(valor, FormaPagamento.CREDITO, parcelas)

    def precos_vigentes(self, forro=None):
        """
        Preço do m² a aplicar, já com os acréscimos de acabamento e estrutura quando
        Instalado. `forro` é um dos outros forros do orçamento; sem ele, o 1º.
        Acabamento e estrutura valem para a casa toda.
        """
        if not (forro or self.forro_id):   # sem forro: só a instalação, sem acabamento nem estrutura
            vista = self.preco_servico_m2 or PRECO_SERVICO_M2
            return vista, self.no_cartao(vista)
        vista = (forro or self.forro).preco_m2(self.tipo, "vista")
        if self.tipo == TipoOrcamento.INSTALADO:
            vista += (self.acabamento.acrescimo_m2 if self.acabamento_id else 0) \
                + (self.estrutura.acrescimo_m2 if self.estrutura_id else 0)
        return vista, self.no_cartao(vista)

    def grupos_de_forro(self):
        """
        Um grupo por tipo de forro, o 1º primeiro: [{forro, area, ambientes, compartimentos,
        tamanho_folha, quantidade_folhas}]. Um grupo só = orçamento de um forro.
        """
        from apps.catalogo.models import Forro

        adicionais = self.forros_adicionais or []
        compartimentos = self.compartimentos or []
        if not self.forro_id:
            return [{"forro": None, "area": self.area_m2}]
        de_outro = lambda c: c.get("forro") and c["forro"] != self.forro_id   # noqa: E731 — formato antigo
        if not adicionais and not any(de_outro(c) for c in compartimentos):
            return [{"forro": self.forro, "area": self.area_m2}]

        outros = Forro.objects.in_bulk({b["forro"] for b in adicionais} | {c["forro"] for c in compartimentos
                                                                            if de_outro(c)})
        grupos = {}

        def grupo(forro):
            return grupos.setdefault(forro.id, {"forro": forro, "area": Decimal("0"), "ambientes": [],
                                                "compartimentos": [], "tamanho_folha": None,
                                                "quantidade_folhas": None})

        def medir(g, comps):
            for i, c in enumerate(comps, 1):
                g["area"] += area_do_compartimento(c)
                g["ambientes"].append(nome_do_compartimento(c, i))
                g["compartimentos"].append({k: c[k] for k in ("nome", "largura", "comprimento") if k in c})

        principal = grupo(self.forro)
        if compartimentos:
            medir(principal, [c for c in compartimentos if not de_outro(c)])
            for fid in dict.fromkeys(c["forro"] for c in compartimentos if de_outro(c)):
                if fid in outros:
                    medir(grupo(outros[fid]), [c for c in compartimentos if c.get("forro") == fid])
        else:
            # área em m² ou folhas: o 1º forro fica com o que sobra da área total
            principal["area"] = self.area_m2 - sum((Decimal(b["area_m2"]) for b in adicionais), Decimal("0"))
            if self.tamanho_folha and self.quantidade_folhas:
                principal["tamanho_folha"] = str(self.tamanho_folha)
                principal["quantidade_folhas"] = self.quantidade_folhas
        for b in adicionais:
            if b["forro"] not in outros:
                continue
            g = grupo(outros[b["forro"]])
            if b.get("compartimentos"):
                medir(g, b["compartimentos"])
            else:
                g["area"] += Decimal(b["area_m2"])
                g["tamanho_folha"], g["quantidade_folhas"] = b.get("tamanho_folha"), b.get("quantidade_folhas")
        return [g for g in grupos.values() if g["area"] > 0]

    def recalcular(self):
        """
        Refaz os totais a partir do m² (de cada forro, quando há mais de um) e dos itens. O acabamento só entra no
        Instalado; no Material as peças são cobradas por unidade na lista de itens.
        Abaixo de 20 m² soma a taxa de logística (frete), no Instalado e no Material.
        O total no cartão é o total à vista (já com desconto) em 5x na maquininha.
        """
        if self.tipo == TipoOrcamento.MATERIAL:
            self.acabamento = None
            self.estrutura = None   # no Material o ripão entra como peça, por dúzia
        if self.forro_id:
            self.preco_servico_m2 = None
        else:   # sem forro: o cliente já tem tudo, só a instalação
            self.acabamento = self.estrutura = None
            self.preco_servico_m2 = self.preco_servico_m2 or PRECO_SERVICO_M2
            self.forros_adicionais = []

        self.preco_m2_vista, self.preco_m2_cartao = self.precos_vigentes()
        self.taxa_logistica = (
            TAXA_LOGISTICA
            if self.area_m2 < AREA_MINIMA_SEM_TAXA
            else Decimal("0")
        )

        # cada forro pelo seu m² (ex.: branco na sala, cedro no beiral); um forro só = área × m²
        grupos = self.grupos_de_forro()
        self.por_forro = []
        if len(grupos) > 1:
            for g in grupos:
                forro, area = g["forro"], g["area"]
                vista, cartao = self.precos_vigentes(forro)
                self.por_forro.append({
                    "forro": forro.id, "nome": forro.nome, "area_m2": str(area),
                    "preco_m2_vista": str(vista.quantize(CENTAVO)), "preco_m2_cartao": str(cartao.quantize(CENTAVO)),
                    "total_vista": str((area * vista).quantize(CENTAVO)), "ambientes": g["ambientes"],
                    "compartimentos": g["compartimentos"], "tamanho_folha": g["tamanho_folha"],
                    "quantidade_folhas": g["quantidade_folhas"],
                })
            forro_vista = sum((Decimal(g["total_vista"]) for g in self.por_forro), Decimal("0"))
        else:
            forro_vista = (self.area_m2 * self.preco_m2_vista).quantize(CENTAVO)
        abate = self.estrutura.acrescimo_m2 if self.estrutura_id and self.estrutura.acrescimo_m2 < 0 else 0
        self.abatimento_estrutura = (self.area_m2 * -abate).quantize(CENTAVO) if abate else Decimal("0")

        # Antes do primeiro save não há PK, logo não há itens para somar — o
        # serializer cria os itens e chama save() de novo para fechar o total.
        itens = Decimal("0")
        if self.pk:
            itens = sum((i.total for i in self.itens.all()), Decimal("0")).quantize(CENTAVO)

        desconto = self.desconto or Decimal("0")
        self.subtotal_vista = forro_vista + itens + self.taxa_logistica   # antes do desconto
        self.total_vista = max(Decimal("0"), self.subtotal_vista - desconto)
        self.total_cartao = self.no_cartao(self.total_vista)
        return self

    def save(self, *args, **kwargs):
        if not self.numero:
            with transaction.atomic():
                self.numero = self._proximo_numero()
                self.recalcular()
                return super().save(*args, **kwargs)
        self.recalcular()
        return super().save(*args, **kwargs)

    @property
    def convertido(self):
        return self.status == StatusOrcamento.CONVERTIDO


class OrcamentoItem(models.Model):
    """Material avulso do orçamento de Material, com preço congelado na data."""

    orcamento = models.ForeignKey(Orcamento, on_delete=models.CASCADE, related_name="itens")
    material = models.ForeignKey("catalogo.Material", on_delete=models.PROTECT, related_name="itens", null=True, blank=True)

    descricao = models.CharField("descrição", max_length=160)
    unidade = models.CharField(max_length=12)
    quantidade = models.DecimalField(max_digits=9, decimal_places=2)
    preco_unitario = models.DecimalField(max_digits=9, decimal_places=4)
    total = models.DecimalField(max_digits=11, decimal_places=2, default=0)
    # comissão por unidade, copiada do material quando o item é gravado
    comissao_unitaria = models.DecimalField(max_digits=7, decimal_places=2, default=0)
    # cor do perfil, da moldura ou da sanca (material com tem_cor); vazio nos demais
    cor = models.CharField(max_length=20, blank=True)

    class Meta:
        ordering = ["id"]
        verbose_name = "item do orçamento"
        verbose_name_plural = "itens do orçamento"

    def __str__(self):
        return f"{self.descricao} — {self.quantidade} {self.unidade}"

    def save(self, *args, **kwargs):
        if self.material and not self.descricao:
            self.descricao = self.material.rotulo
            self.unidade = self.material.unidade
            self.preco_unitario = self.material.preco
        if self.material and not self.pk:
            self.comissao_unitaria = self.material.comissao
        # só perfil, moldura e sanca têm cor; sem escolha, sai na padrão (Branco)
        tem_cor = bool(self.material and self.material.tem_cor)
        self.cor = (self.cor or COR_PADRAO) if tem_cor else ""
        self.total = (self.quantidade * self.preco_unitario).quantize(CENTAVO)
        return super().save(*args, **kwargs)
