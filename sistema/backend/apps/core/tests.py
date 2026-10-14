"""
Testes de API: garantem que os endpoints que o React consome existem,
respondem e respeitam as permissões.
"""
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.catalogo.models import Acabamento, Forro, Material
from apps.clientes.models import Cliente, Endereco
from apps.ordens.models import ConfiguracaoAgenda, OrdemServico, StatusOS, TaxasCartao

D = Decimal
Usuario = get_user_model()


class ApiBase(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.diretor = Usuario.objects.create_user("alan", password="x", papel="diretor", first_name="Alan")
        cls.vendedor = Usuario.objects.create_user("marcos", password="x", papel="vendedor", first_name="Marcos")

        cls.forro = Forro.objects.create(
            nome="BRANCO LISO BRILHOSO",
            preco_material_vista=D("33.80"), preco_material_cartao=D("36.50"),
            preco_instalado_vista=D("64.00"), preco_instalado_cartao=D("69.00"),
        )
        cls.sanca = Acabamento.objects.create(nome="Sanca (8 cm)", acrescimo_m2=D("8.00"))
        cls.cliente = Cliente.objects.create(nome="Maria Souza", telefone="(66) 99988-1122",
                                             criado_por=cls.vendedor)
        cls.endereco = Endereco.objects.create(cliente=cls.cliente, logradouro="Rua das Palmeiras",
                                               numero="180", bairro="Jardim Aeroporto",
                                               link_localizacao="https://maps.app.goo.gl/x")


class AutenticacaoTest(ApiBase):
    def test_api_exige_login(self):
        self.assertEqual(self.client.get("/api/ordens-servico/").status_code, 401)

    def test_token_e_eu(self):
        r = self.client.post("/api/token/", {"username": "alan", "password": "x"}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertIn("access", r.data)

        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {r.data['access']}")
        eu = self.client.get("/api/eu/")
        self.assertEqual(eu.status_code, 200)
        self.assertEqual(eu.data["papel"], "diretor")
        self.assertTrue(eu.data["permissoes"]["finalizarOS"])

    def test_permissoes_do_vendedor_vem_restritas(self):
        self.client.force_authenticate(self.vendedor)
        eu = self.client.get("/api/eu/").data
        self.assertFalse(eu["permissoes"]["finalizarOS"])
        self.assertFalse(eu["permissoes"]["verFinanceiro"])
        self.assertFalse(eu["permissoes"]["trocarVendedor"])


class OrcamentoApiTest(ApiBase):
    def test_cria_instalado_com_sanca(self):
        self.client.force_authenticate(self.vendedor)
        r = self.client.post("/api/orcamentos/", {
            "cliente": self.cliente.id, "tipo": "instalado", "area_m2": "23",
            "forro": self.forro.id, "acabamento": self.sanca.id,
        }, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data["total_vista"], "1656.00")
        self.assertEqual(r.data["total_cartao"], "1771.00")
        # vendedor é o próprio usuário logado
        self.assertEqual(r.data["vendedor"], self.vendedor.id)

    def test_material_recusa_acabamento(self):
        self.client.force_authenticate(self.vendedor)
        r = self.client.post("/api/orcamentos/", {
            "cliente": self.cliente.id, "tipo": "material", "area_m2": "23",
            "forro": self.forro.id, "acabamento": self.sanca.id,
        }, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("acabamento", r.data)

    def test_material_com_itens_soma_tudo(self):
        self.client.force_authenticate(self.vendedor)
        r = self.client.post("/api/orcamentos/", {
            "cliente": self.cliente.id, "tipo": "material", "area_m2": "23", "forro": self.forro.id,
            "itens": [{"descricao": "Perfil 6 m", "unidade": "und",
                       "quantidade": "10", "preco_unitario": "25.00"}],
        }, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data["total_vista"], "1027.40")   # 777,40 + 250,00

    def test_instalado_abaixo_de_20m2_soma_taxa_de_logistica(self):
        self.client.force_authenticate(self.vendedor)
        base = {"cliente": self.cliente.id, "tipo": "instalado", "forro": self.forro.id}
        r = self.client.post("/api/orcamentos/", {**base, "area_m2": "19.99"}, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data["taxa_logistica"], "80.00")
        self.assertEqual(r.data["total_vista"], "1359.36")   # 19,99 × 64,00 + 80,00
        self.assertEqual(r.data["total_cartao"], "1459.31")  # 19,99 × 69,00 + 80,00

        r = self.client.post("/api/orcamentos/", {**base, "area_m2": "20"}, format="json")
        self.assertEqual(r.data["taxa_logistica"], "0.00")
        self.assertEqual(r.data["total_vista"], "1280.00")

    def test_material_abaixo_de_20m2_nao_tem_taxa(self):
        self.client.force_authenticate(self.vendedor)
        r = self.client.post("/api/orcamentos/", {
            "cliente": self.cliente.id, "tipo": "material", "area_m2": "10", "forro": self.forro.id,
        }, format="json")
        self.assertEqual(r.data["taxa_logistica"], "0.00")
        self.assertEqual(r.data["total_vista"], "338.00")


class OrdemServicoApiTest(ApiBase):
    def nova(self, vendedor=None, criado_por=None):
        dono = vendedor or self.vendedor
        return OrdemServico.objects.create(
            cliente=self.cliente, endereco=self.endereco,
            vendedor=dono, criado_por=criado_por or dono, valor_total=D("1000.00"),
        )

    def test_vendedor_ve_a_os_alheia_mas_nao_a_altera(self):
        """A lista é da equipe inteira; mexer continua sendo de quem lançou."""
        alheia = self.nova(vendedor=self.diretor)
        self.client.force_authenticate(self.vendedor)

        self.assertEqual(self.client.get("/api/painel/").status_code, 403)

        lista = self.client.get("/api/ordens-servico/").data
        self.assertEqual(lista["count"], 1)
        self.assertFalse(lista["results"][0]["pode_editar"])

        r = self.client.patch(f"/api/ordens-servico/{alheia.id}/",
                              {"observacoes": "não deveria entrar"}, format="json")
        self.assertEqual(r.status_code, 403)

    def test_vendedor_ve_a_os_que_ele_lancou_para_outro(self):
        """Lançou a O.S., continua enxergando — mesmo que a comissão seja de outro."""
        self.nova(vendedor=self.diretor, criado_por=self.vendedor)
        self.client.force_authenticate(self.vendedor)
        lista = self.client.get("/api/ordens-servico/").data
        self.assertEqual(lista["count"], 1)

    def test_diretor_ve_financeiro_no_painel(self):
        self.nova()
        self.client.force_authenticate(self.diretor)
        painel = self.client.get("/api/painel/").data
        self.assertEqual(painel["atual"]["vendas"], 1)
        self.assertEqual(painel["atual"]["valor"], D("1000.00"))
        self.assertEqual(painel["por_vendedor"][0]["nome"], "Marcos")
        self.assertEqual(len(painel["semana"]["dias"]), 7)

        # filtro por dia: ontem não teve venda
        ontem = (timezone.localdate() - timedelta(days=1)).isoformat()
        r = self.client.get("/api/painel/", {"de": ontem}).data
        self.assertEqual((r["periodo"]["de"], r["periodo"]["dias"]), (timezone.localdate() - timedelta(days=1), 1))
        self.assertEqual(r["atual"]["vendas"], 0)
        self.assertEqual(r["anterior"]["vendas"], 0)

        cal = self.client.get("/api/painel/calendario/", {"mes": "2026-02"}).data
        self.assertEqual(cal["mes"], "2026-02")

    def test_vendedor_nao_finaliza_pela_api(self):
        os_ = self.nova()
        self.client.force_authenticate(self.vendedor)
        r = self.client.post(f"/api/ordens-servico/{os_.id}/finalizar/", {}, format="json")
        self.assertEqual(r.status_code, 403)

    def test_diretor_finaliza_lancando_pagamento(self):
        os_ = self.nova()
        self.client.force_authenticate(self.diretor)
        r = self.client.post(f"/api/ordens-servico/{os_.id}/finalizar/", {
            "pagamentos": [{"forma": "pix", "valor": "1000.00"}],
            "observacao": "Pago no ato",
        }, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data["status"], StatusOS.FINALIZADA)
        self.assertEqual(r.data["saldo"], "0.00")

    def com_referencia(self):
        os_ = self.nova()
        os_.valor_vista, os_.valor_cartao = D("1000.00"), D("1100.00")
        os_.save()
        self.client.force_authenticate(self.diretor)
        return os_

    def test_cartao_repassa_a_taxa_da_maquininha_ao_cliente(self):
        """1.500 no dinheiro; os 500 restantes em 3x a 6,10% viram 532,48 na maquininha."""
        taxas = TaxasCartao.obter()
        taxas.credito = {**taxas.credito, "3": "6.10"}
        taxas.save()
        os_ = self.com_referencia()
        os_.valor_vista = D("2000.00")
        os_.save()
        r = self.client.post(f"/api/ordens-servico/{os_.id}/finalizar/", {
            "pagamentos": [{"forma": "dinheiro", "valor": "1500.00"},
                           {"forma": "credito", "valor": "500.00", "parcelas": 3}],
        }, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data["modalidade"], "misto")
        cartao = r.data["pagamentos"][1]
        self.assertEqual(cartao["acrescimo"], "32.48")          # 500 / (1 − 0,061) − 500
        self.assertEqual(cartao["valor"], "532.48")
        self.assertEqual(r.data["valor_total"], "2032.48")      # à vista + acréscimo do cliente
        self.assertEqual(r.data["saldo"], "0.00")

    def test_cartao_a_menos_nao_finaliza_e_nada_fica_gravado(self):
        os_ = self.com_referencia()
        r = self.client.post(f"/api/ordens-servico/{os_.id}/finalizar/", {
            "pagamentos": [{"forma": "pix", "valor": "400.00"},
                           {"forma": "credito", "valor": "500.00"}],
        }, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertEqual(os_.pagamentos.count(), 0)

    def test_so_diretor_altera_as_taxas(self):
        self.client.force_authenticate(self.vendedor)
        self.assertEqual(self.client.get("/api/taxas-cartao/").status_code, 200)
        r = self.client.put("/api/taxas-cartao/", {"debito": "1.10", "credito": {"1": "3"}}, format="json")
        self.assertEqual(r.status_code, 403)
        self.client.force_authenticate(self.diretor)
        r = self.client.put("/api/taxas-cartao/", {"debito": "1.10", "credito": {"1": "3,5"}}, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data["credito"], {"1": "3.50"})

    def test_formas_antigas_nao_sao_aceitas(self):
        os_ = self.com_referencia()
        r = self.client.post(f"/api/ordens-servico/{os_.id}/finalizar/", {
            "pagamentos": [{"forma": "boleto", "valor": "1000.00"}],
        }, format="json")
        self.assertEqual(r.status_code, 400)

    def test_vendedor_nao_troca_quem_trouxe_o_cliente(self):
        os_ = self.nova()
        self.client.force_authenticate(self.vendedor)
        r = self.client.patch(f"/api/ordens-servico/{os_.id}/",
                              {"vendedor": self.diretor.id}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("vendedor", r.data)

    def test_diretor_troca_quem_trouxe_o_cliente(self):
        os_ = self.nova()
        self.client.force_authenticate(self.diretor)
        r = self.client.patch(f"/api/ordens-servico/{os_.id}/",
                              {"vendedor": self.diretor.id}, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data["vendedor"], self.diretor.id)


class AgendaApiTest(ApiBase):
    def test_disponibilidade_traz_vagas_de_entrega_e_instalacao(self):
        cfg = ConfiguracaoAgenda.obter()
        cfg.dias_sem_atendimento = "6"
        cfg.save()

        self.client.force_authenticate(self.vendedor)
        hoje = timezone.localdate()
        r = self.client.get("/api/agenda/disponibilidade/",
                            {"de": str(hoje), "ate": str(hoje + timedelta(days=13))})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data["dias"]), 14)

        util = next(d for d in r.data["dias"] if d["atende"])
        self.assertEqual(len(util["turnos"]), 2)                            # manhã e tarde
        self.assertEqual(util["turnos"][0]["instalacoes"]["livre"], 2)      # 2 equipes por turno
        self.assertEqual(util["entregas"]["livre"], 4)                      # 4 entregas por dia

        domingos = [d for d in r.data["dias"] if not d["atende"]]
        self.assertTrue(domingos, "deveria haver ao menos um domingo em 14 dias")

    def test_disponibilidade_de_instalacao_diz_onde_termina(self):
        self.client.force_authenticate(self.vendedor)
        hoje = timezone.localdate()
        seg = hoje + timedelta(days=(7 - hoje.weekday()) % 7 or 7)
        r = self.client.get("/api/agenda/disponibilidade/", {
            "de": str(seg), "ate": str(seg), "tipo": "instalacao", "area": "30",
        })
        self.assertEqual(r.data["duracao_dias"], 1.5)
        manha = r.data["dias"][0]["turnos"][0]
        self.assertTrue(manha["disponivel"])
        self.assertEqual(manha["termina"]["data"], str(seg + timedelta(days=1)))
        self.assertEqual(manha["termina"]["turno"], "manha")


class GerarOSDoOrcamentoTest(ApiBase):
    """Converter orçamento em O.S. agendando no mesmo passo (Instalado: só a instalação)."""

    def orcamento(self):
        self.client.force_authenticate(self.vendedor)
        return self.client.post("/api/orcamentos/", {
            "cliente": self.cliente.id, "tipo": "instalado", "area_m2": "23",
            "forro": self.forro.id, "acabamento": self.sanca.id,
        }, format="json").data

    def dia_util(self, somar):
        d = timezone.localdate() + timedelta(days=somar)
        return str(d + timedelta(days=1) if d.weekday() == 6 else d)

    def test_gera_os_herdando_cliente_e_valor_do_orcamento(self):
        orc = self.orcamento()
        r = self.client.post("/api/ordens-servico/", {
            "orcamento": orc["id"], "endereco": self.endereco.id,
            "agendar_instalacao": {"data": self.dia_util(3), "turno": "tarde"},
        }, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data["valor_total"], "1656.00")        # herdado do orçamento
        self.assertEqual(r.data["cliente"], self.cliente.id)
        self.assertEqual(r.data["cliente_detalhe"]["nome"], "Maria Souza")
        self.assertEqual(len(r.data["agendamentos"]), 1)
        self.assertEqual(r.data["agendamentos"][0]["dias"], 1.0)  # 23 m² = 1 dia
        # o orçamento passa a constar como convertido
        self.assertEqual(self.client.get(f"/api/orcamentos/{orc['id']}/").data["status"], "convertido")

    def test_instalado_nao_agenda_entrega_separada(self):
        r = self.client.post("/api/ordens-servico/", {
            "orcamento": self.orcamento()["id"], "endereco": self.endereco.id,
            "agendar_entrega": {"data": self.dia_util(2), "turno": "manha"},
        }, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("agendar_entrega", r.data)

    def test_turno_cheio_desfaz_a_os_inteira(self):
        cfg = ConfiguracaoAgenda.obter()
        cfg.capacidade_instalacao = 1
        cfg.save()
        dia = self.dia_util(2)

        primeira = self.client.post("/api/ordens-servico/", {
            "orcamento": self.orcamento()["id"], "endereco": self.endereco.id,
            "agendar_instalacao": {"data": dia, "turno": "manha"},
        }, format="json")
        self.assertEqual(primeira.status_code, 201, primeira.data)
        antes = OrdemServico.objects.count()

        segunda = self.client.post("/api/ordens-servico/", {
            "orcamento": self.orcamento()["id"], "endereco": self.endereco.id,
            "agendar_instalacao": {"data": dia, "turno": "manha"},
        }, format="json")
        self.assertEqual(segunda.status_code, 400)
        self.assertIn("agendar_instalacao", segunda.data)
        # nada de O.S. órfã criada sem agendamento
        self.assertEqual(OrdemServico.objects.count(), antes)

    def test_modalidade_escolhida_define_o_valor_cobrado(self):
        """O cliente escolhe à vista ou cartão já na geração do serviço."""
        orc = self.orcamento()
        r = self.client.post("/api/ordens-servico/", {
            "orcamento": orc["id"], "endereco": self.endereco.id, "modalidade": "cartao",
            "agendar_instalacao": {"data": self.dia_util(2), "turno": "manha"},
        }, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data["modalidade"], "cartao")
        self.assertEqual(r.data["valor_total"], r.data["valor_cartao"])
        self.assertEqual(r.data["valor_total"], "1771.00")

    def test_tipo_e_numero_vem_do_orcamento(self):
        orc = self.orcamento()
        r = self.client.post("/api/ordens-servico/", {
            "orcamento": orc["id"], "endereco": self.endereco.id, "modalidade": "vista",
            "agendar_instalacao": {"data": self.dia_util(2), "turno": "manha"},
        }, format="json")
        self.assertEqual(r.data["tipo"], "instalado")
        self.assertTrue(r.data["numero"].startswith("OS-SERV-"), r.data["numero"])


class OSFinalizadaMixin:
    """Cria uma O.S. de instalação (55 m²) e finaliza no PIX."""

    def finalizada(self):
        self.client.force_authenticate(self.vendedor)
        orc = self.client.post("/api/orcamentos/", {
            "cliente": self.cliente.id, "tipo": "instalado", "area_m2": "55",
            "forro": self.forro.id, "acabamento": self.sanca.id,
        }, format="json").data
        os_ = self.client.post("/api/ordens-servico/", {
            "orcamento": orc["id"], "endereco": self.endereco.id, "modalidade": "vista",
        }, format="json").data

        self.client.force_authenticate(self.diretor)
        self.client.post(f"/api/ordens-servico/{os_['id']}/finalizar/", {
            "pagamentos": [{"forma": "pix", "valor": os_["valor_total"]}],
        }, format="json")
        return os_


class ComissoesApiTest(OSFinalizadaMixin, ApiBase):
    """A aba Comissões: finalizados, em aberto a pagar, baixa pela diretoria."""

    def test_lista_traz_a_comissao_em_aberto(self):
        self.finalizada()
        r = self.client.get("/api/comissoes/", {"situacao": "aberto"})
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data["resumo"]["aberto"], D("110.00"))   # 55 m² × 2
        self.assertEqual(len(r.data["itens"]), 1)
        self.assertFalse(r.data["itens"][0]["paga"])

    def test_diretor_da_baixa_e_sai_do_aberto(self):
        os_ = self.finalizada()
        r = self.client.post(f"/api/ordens-servico/{os_['id']}/pagar_comissao/", {}, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertTrue(r.data["comissao_paga"])

        resumo = self.client.get("/api/comissoes/").data["resumo"]
        self.assertEqual(resumo["aberto"], D("0"))
        self.assertEqual(resumo["pago"], D("110.00"))

    def test_diretor_paga_tudo_de_um_vendedor_de_uma_vez(self):
        self.finalizada()
        self.finalizada()
        r = self.client.post("/api/comissoes/pagar/", {"vendedor": self.vendedor.id}, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data["pagas"], 2)
        self.assertEqual(r.data["total"], D("220.00"))
        resumo = self.client.get("/api/comissoes/").data["resumo"]
        self.assertEqual((resumo["aberto"], resumo["pago"]), (D("0"), D("220.00")))

        self.client.force_authenticate(self.vendedor)
        r = self.client.post("/api/comissoes/pagar/", {"vendedor": self.vendedor.id}, format="json")
        self.assertEqual(r.status_code, 403)

    def test_vendedor_nao_da_baixa(self):
        os_ = self.finalizada()
        self.client.force_authenticate(self.vendedor)
        r = self.client.post(f"/api/ordens-servico/{os_['id']}/pagar_comissao/", {}, format="json")
        self.assertEqual(r.status_code, 403)

    def test_ciclo_da_comissao(self):
        """Orçamento não conta; O.S. aberta = agendada; finalizada = a receber; baixa = paga."""
        self.client.force_authenticate(self.vendedor)
        orc = self.client.post("/api/orcamentos/", {
            "cliente": self.cliente.id, "tipo": "instalado", "area_m2": "30",
            "forro": self.forro.id, "acabamento": self.sanca.id,
        }, format="json").data
        self.assertEqual(self.client.get("/api/comissoes/").data["resumo"]["servicos"], 0)

        os_ = self.client.post("/api/ordens-servico/", {
            "orcamento": orc["id"], "endereco": self.endereco.id, "modalidade": "vista",
        }, format="json").data
        r = self.client.get("/api/comissoes/").data
        self.assertEqual(r["resumo"]["agendada"], D("60.00"))     # 30 m² × 2
        self.assertEqual(r["itens"][0]["situacao"], "agendada")

        self.client.force_authenticate(self.diretor)
        self.client.post(f"/api/ordens-servico/{os_['id']}/finalizar/", {
            "pagamentos": [{"forma": "pix", "valor": os_["valor_total"]}],
        }, format="json")
        self.client.force_authenticate(self.vendedor)
        r = self.client.get("/api/comissoes/").data
        self.assertEqual((r["resumo"]["agendada"], r["resumo"]["aberto"]), (D("0"), D("60.00")))

        self.client.force_authenticate(self.diretor)
        self.client.post(f"/api/ordens-servico/{os_['id']}/pagar_comissao/", {}, format="json")
        r = self.client.get("/api/comissoes/", {"situacao": "paga"}).data
        self.assertEqual(r["itens"][0]["situacao_display"], "Paga")

    def test_os_cancelada_nao_gera_comissao(self):
        self.client.force_authenticate(self.vendedor)
        orc = self.client.post("/api/orcamentos/", {
            "cliente": self.cliente.id, "tipo": "instalado", "area_m2": "30",
            "forro": self.forro.id, "acabamento": self.sanca.id,
        }, format="json").data
        os_ = self.client.post("/api/ordens-servico/", {
            "orcamento": orc["id"], "endereco": self.endereco.id,
        }, format="json").data
        self.client.force_authenticate(self.diretor)
        OrdemServico.objects.get(pk=os_["id"]).mudar_status(StatusOS.CANCELADA, self.diretor, "Desistiu")
        self.assertEqual(self.client.get("/api/comissoes/").data["resumo"]["servicos"], 0)

    def test_comissao_de_material_e_item_a_item(self):
        """Forro 25 m² (25) + 5 perfis (5) + 2,5 dúzias de ripão (12,50) + serviço 25 m² (50)."""
        perfil = Material.objects.create(nome="Perfil", rotulo="Perfil 6 m", unidade="und",
                                         preco=D("25"), comissao=D("1.00"))
        ripao = Material.objects.create(nome="Cutiuba", rotulo="Ripão 4 m Cutiuba", unidade="dúzia",
                                        preco=D("150"), comissao=D("5.00"))
        prego = Material.objects.create(nome="Prego", rotulo="Prego 2 × 12", unidade="kg",
                                        preco=D("30"))
        self.client.force_authenticate(self.vendedor)
        orc = self.client.post("/api/orcamentos/", {
            "cliente": self.cliente.id, "tipo": "material", "area_m2": "25", "forro": self.forro.id,
            "itens": [
                {"material": perfil.id, "descricao": "Perfil 6 m", "unidade": "und",
                 "quantidade": "5", "preco_unitario": "25"},
                {"material": ripao.id, "descricao": "Ripão 4 m Cutiuba", "unidade": "dúzia",
                 "quantidade": "2.5", "preco_unitario": "150"},
                {"material": prego.id, "descricao": "Prego 2 × 12", "unidade": "kg",
                 "quantidade": "2", "preco_unitario": "30"},
                {"descricao": "Serviço", "unidade": "serviço", "quantidade": "1", "preco_unitario": "625"},
            ],
        }, format="json").data
        self.client.post("/api/ordens-servico/", {
            "orcamento": orc["id"], "endereco": self.endereco.id, "modalidade": "vista",
        }, format="json")
        item = self.client.get("/api/comissoes/").data["itens"][0]
        self.assertEqual(item["valor"], D("92.50"))
        self.assertEqual(len(item["detalhe"]), 4)          # prego não tem comissão

        # mudar a tabela depois não mexe na comissão de quem já vendeu
        perfil.comissao = D("9.00")
        perfil.save()
        self.assertEqual(self.client.get("/api/comissoes/").data["itens"][0]["valor"], D("92.50"))

    def test_parametro_novo_vale_so_para_os_nova(self):
        self.finalizada()                                  # 55 m² × R$ 2,00 = 110
        r = self.client.put("/api/parametros-comissao/", {"instalado_m2": "3.00"}, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        self.finalizada()                                  # 55 m² × R$ 3,00 = 165
        valores = sorted(i["valor"] for i in self.client.get("/api/comissoes/").data["itens"])
        self.assertEqual(valores, [D("110.00"), D("165.00")])

        self.client.force_authenticate(self.vendedor)
        r = self.client.put("/api/parametros-comissao/", {"instalado_m2": "9"}, format="json")
        self.assertEqual(r.status_code, 403)

    def test_vendedor_ve_so_as_proprias_comissoes(self):
        self.finalizada()
        self.client.force_authenticate(self.vendedor)
        r = self.client.get("/api/comissoes/")
        self.assertEqual(r.status_code, 200)
        self.assertTrue(all(i["vendedor"] == self.vendedor.id for i in r.data["itens"]))


class ItemOutroApiTest(ApiBase):
    """Item "Outro" pela API: vale nos dois tipos; catálogo, só no Material."""

    def setUp(self):
        self.client.force_authenticate(self.vendedor)

    def test_instalado_aceita_item_avulso(self):
        r = self.client.post("/api/orcamentos/", {
            "cliente": self.cliente.id, "tipo": "instalado", "area_m2": "23",
            "forro": self.forro.id, "acabamento": self.sanca.id,
            "itens": [{"descricao": "Retirada do forro antigo", "unidade": "verba",
                       "quantidade": "1", "preco_unitario": "250.00"}],
        }, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data["total_vista"], "1906.00")     # 1656 + 250
        self.assertEqual(r.data["itens"][0]["total"], "250.00")

    def test_instalado_recusa_material_de_catalogo(self):
        material = Material.objects.create(nome="Perfil 6 m", rotulo="Perfil 6 m",
                                           unidade="und", preco=D("25.00"))
        r = self.client.post("/api/orcamentos/", {
            "cliente": self.cliente.id, "tipo": "instalado", "area_m2": "23",
            "forro": self.forro.id, "acabamento": self.sanca.id,
            "itens": [{"material": material.id, "descricao": "Perfil 6 m", "unidade": "und",
                       "quantidade": "10", "preco_unitario": "25.00"}],
        }, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("itens", r.data)

    def test_material_aceita_catalogo_e_avulso_juntos(self):
        material = Material.objects.create(nome="Perfil 6 m", rotulo="Perfil 6 m",
                                           unidade="und", preco=D("25.00"))
        r = self.client.post("/api/orcamentos/", {
            "cliente": self.cliente.id, "tipo": "material", "area_m2": "23",
            "forro": self.forro.id,
            "itens": [
                {"material": material.id, "descricao": "Perfil 6 m", "unidade": "und",
                 "quantidade": "10", "preco_unitario": "25.00"},
                {"descricao": "Frete", "unidade": "verba",
                 "quantidade": "1", "preco_unitario": "100.00"},
            ],
        }, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data["total_vista"], "1127.40")     # 777,40 + 250 + 100
