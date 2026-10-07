from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.catalogo.models import Acabamento, Forro, Material

from .models import Orcamento, OrcamentoItem, TipoOrcamento

D = Decimal
Usuario = get_user_model()


class BaseCatalogo(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = Usuario.objects.create_user("marcos", papel="vendedor", first_name="Marcos")
        cls.forro = Forro.objects.create(
            nome="BRANCO LISO BRILHOSO",
            preco_material_vista=D("33.80"), preco_material_cartao=D("36.50"),
            preco_instalado_vista=D("64.00"), preco_instalado_cartao=D("69.00"),
        )
        cls.sanca = Acabamento.objects.create(nome="Sanca (8 cm)", acrescimo_m2=D("8.00"))
        cls.perfil = Acabamento.objects.create(nome="Acabamento normal (Perfil)", acrescimo_m2=D("0"))
        cls.ripao = Material.objects.create(
            nome="Cutiuba", rotulo="Ripão 4 m Cutiuba", unidade="und",
            preco=D("150.00") / 12, unidade_cotacao="dúzia", preco_cotacao=D("150.00"),
        )
        cls.cola_perfil = Material.objects.create(nome="Perfil 6 m", rotulo="Perfil 6 m",
                                                  unidade="und", preco=D("25.00"))


class OrcamentoInstaladoTest(BaseCatalogo):
    def test_preco_do_m2_sem_acabamento_vem_da_tabela(self):
        o = Orcamento.objects.create(tipo=TipoOrcamento.INSTALADO, area_m2=D("23"),
                                     forro=self.forro, acabamento=self.perfil,
                                     vendedor=self.user, criado_por=self.user)
        self.assertEqual(o.preco_m2_vista, D("64.00"))
        self.assertEqual(o.total_vista, D("1472.00"))
        self.assertEqual(o.total_cartao, D("1587.00"))

    def test_sanca_soma_8_reais_no_m2_nas_duas_formas(self):
        o = Orcamento.objects.create(tipo=TipoOrcamento.INSTALADO, area_m2=D("23"),
                                     forro=self.forro, acabamento=self.sanca,
                                     vendedor=self.user, criado_por=self.user)
        self.assertEqual(o.preco_m2_vista, D("72.00"))
        self.assertEqual(o.preco_m2_cartao, D("77.00"))
        self.assertEqual(o.total_vista, D("1656.00"))
        self.assertEqual(o.total_cartao, D("1771.00"))

    def test_numero_sequencial_por_ano(self):
        a = Orcamento.objects.create(tipo=TipoOrcamento.INSTALADO, area_m2=D("10"), forro=self.forro,
                                     vendedor=self.user, criado_por=self.user)
        b = Orcamento.objects.create(tipo=TipoOrcamento.INSTALADO, area_m2=D("10"), forro=self.forro,
                                     vendedor=self.user, criado_por=self.user)
        self.assertTrue(a.numero.endswith("0001"))
        self.assertTrue(b.numero.endswith("0002"))


class OrcamentoMaterialTest(BaseCatalogo):
    def test_total_e_forro_mais_itens(self):
        o = Orcamento.objects.create(tipo=TipoOrcamento.MATERIAL, area_m2=D("23"),
                                     forro=self.forro, vendedor=self.user, criado_por=self.user)
        OrcamentoItem.objects.create(orcamento=o, material=self.cola_perfil, descricao="Perfil 6 m",
                                     unidade="und", quantidade=D("10"), preco_unitario=D("25.00"))
        o.save()
        # 23 × 33,80 = 777,40 de forro + 250,00 de perfil
        self.assertEqual(o.total_vista, D("1027.40"))
        # no cartão só o forro muda: 23 × 36,50 = 839,50 + 250,00
        self.assertEqual(o.total_cartao, D("1089.50"))

    def test_ripao_e_proporcional_a_duzia(self):
        """12 unidades têm de fechar exatamente o valor da dúzia."""
        o = Orcamento.objects.create(tipo=TipoOrcamento.MATERIAL, area_m2=D("10"),
                                     forro=self.forro, vendedor=self.user, criado_por=self.user)
        item = OrcamentoItem.objects.create(orcamento=o, material=self.ripao,
                                            descricao=self.ripao.rotulo, unidade="und",
                                            quantidade=D("12"), preco_unitario=self.ripao.preco)
        self.assertEqual(item.total, D("150.00"))

        meia = OrcamentoItem.objects.create(orcamento=o, material=self.ripao,
                                            descricao=self.ripao.rotulo, unidade="und",
                                            quantidade=D("6"), preco_unitario=self.ripao.preco)
        self.assertEqual(meia.total, D("75.00"))

    def test_material_ignora_acabamento(self):
        """No Material as peças são cobradas por unidade; o acabamento por m² não se aplica."""
        o = Orcamento.objects.create(tipo=TipoOrcamento.MATERIAL, area_m2=D("23"), forro=self.forro,
                                     acabamento=self.sanca, vendedor=self.user, criado_por=self.user)
        self.assertIsNone(o.acabamento_id)
        self.assertEqual(o.preco_m2_vista, D("33.80"))
