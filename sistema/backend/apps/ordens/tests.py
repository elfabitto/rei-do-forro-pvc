from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import TestCase
from django.utils import timezone

from apps.clientes.models import Cliente, Endereco

from .models import (
    Agendamento,
    ConfiguracaoAgenda,
    OrdemServico,
    Pagamento,
    StatusOS,
    TipoAgendamento,
    TipoServico,
    Turno,
)

D = Decimal
Usuario = get_user_model()


def proxima_segunda(a_partir_de=None):
    d = a_partir_de or timezone.localdate()
    return d + timedelta(days=(7 - d.weekday()) % 7 or 7)


class BaseOS(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.diretor = Usuario.objects.create_user("alan", papel="diretor", first_name="Alan")
        cls.vendedor = Usuario.objects.create_user("marcos", papel="vendedor", first_name="Marcos")
        cls.instalador = Usuario.objects.create_user("jonas", papel="instalador", first_name="Jonas")

        cls.cliente = Cliente.objects.create(nome="Maria Souza", telefone="(66) 99988-1122",
                                             criado_por=cls.vendedor)
        cls.endereco = Endereco.objects.create(cliente=cls.cliente, logradouro="Rua das Palmeiras",
                                               numero="180", bairro="Jardim Aeroporto")

    def nova_os(self, valor="1000.00", vendedor=None):
        return OrdemServico.objects.create(
            cliente=self.cliente, endereco=self.endereco,
            vendedor=vendedor or self.vendedor, criado_por=self.vendedor,
            valor_total=D(valor),
        )


class PermissoesTest(BaseOS):
    def test_so_diretor_finaliza(self):
        os_ = self.nova_os()
        os_.mudar_status(StatusOS.EM_EXECUCAO, self.vendedor)
        Pagamento.objects.create(ordem=os_, forma="pix", valor=D("1000.00"),
                                 registrado_por=self.diretor)
        with self.assertRaises(ValidationError):
            os_.mudar_status(StatusOS.FINALIZADA, self.vendedor)
        os_.mudar_status(StatusOS.FINALIZADA, self.diretor)
        self.assertEqual(os_.status, StatusOS.FINALIZADA)
        self.assertEqual(os_.finalizada_por, self.diretor)

    def test_nao_finaliza_com_saldo_em_aberto(self):
        os_ = self.nova_os()
        os_.mudar_status(StatusOS.EM_EXECUCAO, self.diretor)
        Pagamento.objects.create(ordem=os_, forma="pix", valor=D("400.00"),
                                 registrado_por=self.diretor)
        with self.assertRaisesMessage(ValidationError, "Saldo em aberto"):
            os_.mudar_status(StatusOS.FINALIZADA, self.diretor)

    def test_so_diretor_cancela(self):
        os_ = self.nova_os()
        with self.assertRaises(ValidationError):
            os_.mudar_status(StatusOS.CANCELADA, self.vendedor)
        os_.mudar_status(StatusOS.CANCELADA, self.diretor, "Cliente desistiu")
        self.assertEqual(os_.motivo_cancelamento, "Cliente desistiu")

    def test_permissoes_por_papel(self):
        self.assertTrue(self.diretor.pode_finalizar_os)
        self.assertTrue(self.diretor.pode_trocar_vendedor)
        self.assertFalse(self.vendedor.pode_finalizar_os)
        self.assertFalse(self.vendedor.pode_trocar_vendedor)
        self.assertFalse(self.vendedor.pode_ver_financeiro)
        self.assertFalse(self.instalador.pode_vender)


class TransicaoTest(BaseOS):
    def test_gerada_nao_pula_direto_para_finalizada(self):
        os_ = self.nova_os()
        with self.assertRaisesMessage(ValidationError, "Não é possível passar"):
            os_.mudar_status(StatusOS.FINALIZADA, self.diretor)

    def test_finalizada_e_terminal(self):
        os_ = self.nova_os()
        os_.mudar_status(StatusOS.EM_EXECUCAO, self.diretor)
        Pagamento.objects.create(ordem=os_, forma="dinheiro", valor=D("1000.00"),
                                 registrado_por=self.diretor)
        os_.mudar_status(StatusOS.FINALIZADA, self.diretor)
        with self.assertRaises(ValidationError):
            os_.mudar_status(StatusOS.CANCELADA, self.diretor)

    def test_historico_registra_cada_passo(self):
        os_ = self.nova_os()
        os_.mudar_status(StatusOS.EM_EXECUCAO, self.vendedor, "Saiu para entrega")
        h = os_.historico.first()
        self.assertEqual(h.de_status, StatusOS.GERADA)
        self.assertEqual(h.para_status, StatusOS.EM_EXECUCAO)
        self.assertEqual(h.usuario, self.vendedor)


class FinanceiroTest(BaseOS):
    def test_saldo_desconta_pagamentos_e_desconto(self):
        os_ = self.nova_os("1500.00")
        os_.desconto = D("100.00")
        os_.save()
        Pagamento.objects.create(ordem=os_, forma="pix", valor=D("600.00"),
                                 registrado_por=self.diretor)
        self.assertEqual(os_.valor_liquido, D("1400.00"))
        self.assertEqual(os_.total_pago, D("600.00"))
        self.assertEqual(os_.saldo, D("800.00"))
        self.assertFalse(os_.quitada)


class AgendaTest(BaseOS):
    def setUp(self):
        self.cfg = ConfiguracaoAgenda.obter()
        self.cfg.capacidade_turno = 2          # 2 por turno = 4 por dia
        self.cfg.dias_sem_atendimento = "6"    # domingo
        self.cfg.save()
        self.dia = proxima_segunda()

    def test_turno_cheio_recusa_novo_agendamento(self):
        for _ in range(2):
            Agendamento.objects.create(ordem=self.nova_os(), tipo=TipoAgendamento.ENTREGA,
                                       data=self.dia, turno=Turno.MANHA)
        with self.assertRaisesMessage(ValidationError, "Turno cheio"):
            Agendamento.objects.create(ordem=self.nova_os(), tipo=TipoAgendamento.ENTREGA,
                                       data=self.dia, turno=Turno.MANHA)

    def test_entrega_e_instalacao_disputam_a_mesma_vaga(self):
        """É a mesma equipe que sai: lotar o turno com entregas bloqueia instalação."""
        for _ in range(2):
            Agendamento.objects.create(ordem=self.nova_os(), tipo=TipoAgendamento.ENTREGA,
                                       data=self.dia, turno=Turno.MANHA)
        with self.assertRaisesMessage(ValidationError, "Turno cheio"):
            Agendamento.objects.create(ordem=self.nova_os(), tipo=TipoAgendamento.INSTALACAO,
                                       data=self.dia, turno=Turno.MANHA)

    def test_quatro_vagas_por_dia(self):
        """2 de manhã + 2 à tarde."""
        for turno in (Turno.MANHA, Turno.TARDE):
            for _ in range(2):
                Agendamento.objects.create(ordem=self.nova_os(), tipo=TipoAgendamento.ENTREGA,
                                           data=self.dia, turno=turno)
        self.assertEqual(Agendamento.objects.filter(data=self.dia).count(), 4)
        with self.assertRaisesMessage(ValidationError, "Turno cheio"):
            Agendamento.objects.create(ordem=self.nova_os(), tipo=TipoAgendamento.INSTALACAO,
                                       data=self.dia, turno=Turno.TARDE)

    def test_domingo_nao_e_agendavel(self):
        domingo = self.dia + timedelta(days=6)
        self.assertEqual(domingo.weekday(), 6)
        with self.assertRaisesMessage(ValidationError, "Não há atendimento"):
            Agendamento.objects.create(ordem=self.nova_os(), tipo=TipoAgendamento.ENTREGA,
                                       data=domingo, turno=Turno.MANHA)

    def test_os_cancelada_libera_a_vaga(self):
        self.cfg.capacidade_turno = 1
        self.cfg.save()
        a = self.nova_os()
        Agendamento.objects.create(ordem=a, tipo=TipoAgendamento.INSTALACAO,
                                   data=self.dia, turno=Turno.TARDE)
        a.mudar_status(StatusOS.CANCELADA, self.diretor, "Desistiu")
        livre = Agendamento.objects.create(ordem=self.nova_os(), tipo=TipoAgendamento.INSTALACAO,
                                           data=self.dia, turno=Turno.TARDE)
        self.assertIsNotNone(livre.pk)

    def test_uma_entrega_e_uma_instalacao_por_os(self):
        os_ = self.nova_os()
        Agendamento.objects.create(ordem=os_, tipo=TipoAgendamento.ENTREGA,
                                   data=self.dia, turno=Turno.MANHA)
        with self.assertRaises(Exception):
            Agendamento.objects.create(ordem=os_, tipo=TipoAgendamento.ENTREGA,
                                       data=self.dia, turno=Turno.TARDE)


class AtrasoTest(BaseOS):
    """Atrasada é a O.S. cuja data agendada passou sem finalizar nem cancelar."""

    def setUp(self):
        cfg = ConfiguracaoAgenda.obter()
        cfg.capacidade_turno = 2
        cfg.dias_sem_atendimento = ""   # sem restrição, para poder agendar no passado
        cfg.save()

    def agendada_em(self, dias):
        os_ = self.nova_os()
        Agendamento.objects.create(ordem=os_, tipo=TipoAgendamento.ENTREGA,
                                   data=timezone.localdate() + timedelta(days=dias),
                                   turno=Turno.MANHA)
        os_.refresh_from_db()
        return os_

    def test_data_passada_sem_finalizar_fica_atrasada(self):
        os_ = self.agendada_em(-3)
        self.assertTrue(os_.atrasado)
        self.assertEqual(os_.dias_atraso, 3)

    def test_agendada_para_o_futuro_nao_atrasa(self):
        self.assertFalse(self.agendada_em(5).atrasado)

    def test_finalizada_nao_conta_como_atrasada(self):
        os_ = self.agendada_em(-3)
        os_.mudar_status(StatusOS.EM_EXECUCAO, self.diretor)
        Pagamento.objects.create(ordem=os_, forma="pix", valor=D("1000.00"),
                                 registrado_por=self.diretor)
        os_.mudar_status(StatusOS.FINALIZADA, self.diretor)
        self.assertFalse(os_.atrasado)

    def test_cancelada_nao_conta_como_atrasada(self):
        os_ = self.agendada_em(-3)
        os_.mudar_status(StatusOS.CANCELADA, self.diretor, "Desistiu")
        self.assertFalse(os_.atrasado)

    def test_sem_agendamento_nao_atrasa(self):
        self.assertFalse(self.nova_os().atrasado)


class ModalidadeTest(BaseOS):
    """O valor cobrado segue a modalidade escolhida no fechamento."""

    def com_valores(self):
        os_ = self.nova_os()
        os_.valor_vista = D("1656.00")
        os_.valor_cartao = D("1771.00")
        os_.save()
        return os_

    def test_a_vista_usa_o_valor_a_vista(self):
        os_ = self.com_valores().aplicar_modalidade("vista")
        self.assertEqual(os_.valor_total, D("1656.00"))

    def test_cartao_usa_o_valor_do_cartao(self):
        os_ = self.com_valores().aplicar_modalidade("cartao")
        self.assertEqual(os_.valor_total, D("1771.00"))

    def test_desconto_continua_separado_da_modalidade(self):
        os_ = self.com_valores().aplicar_modalidade("cartao")
        os_.desconto = D("71.00")
        os_.save()
        self.assertEqual(os_.valor_liquido, D("1700.00"))

    def test_sem_referencia_recusa_a_modalidade(self):
        os_ = self.nova_os()     # nasceu sem orçamento, sem os dois valores
        with self.assertRaises(ValidationError):
            os_.aplicar_modalidade("cartao")


class NumeracaoTest(BaseOS):
    """OS-MAT-… para material, OS-SERV-… para instalação, sequência anual única."""

    def test_prefixo_segue_o_tipo(self):
        ano = timezone.localdate().year
        material = OrdemServico.objects.create(
            cliente=self.cliente, endereco=self.endereco, vendedor=self.vendedor,
            criado_por=self.vendedor, valor_total=D("100.00"), tipo=TipoServico.MATERIAL,
        )
        servico = self.nova_os()
        self.assertEqual(material.numero, f"OS-MAT-{ano}0001")
        self.assertEqual(servico.numero, f"OS-SERV-{ano}0002")

    def test_sequencia_nao_se_repete_entre_os_tipos(self):
        numeros = {self.nova_os().numero for _ in range(3)}
        self.assertEqual(len(numeros), 3)


class ComissaoTest(BaseOS):
    """R$ 2,00 por m² orçado para quem trouxe o cliente."""

    def com_orcamento(self, area="55.00"):
        from apps.catalogo.models import Forro
        from apps.orcamentos.models import Orcamento

        forro = Forro.objects.create(
            nome="Branco Liso", preco_material_vista=D("33.80"), preco_material_cartao=D("36.50"),
            preco_instalado_vista=D("64.00"), preco_instalado_cartao=D("69.00"),
        )
        orcamento = Orcamento.objects.create(
            tipo="instalado", area_m2=D(area), forro=forro,
            preco_m2_vista=D("64.00"), preco_m2_cartao=D("69.00"),
            vendedor=self.vendedor, criado_por=self.vendedor,
        )
        os_ = self.nova_os(valor=str(orcamento.total_vista))
        os_.orcamento = orcamento
        os_.save()
        return os_

    def test_valor_e_a_area_vezes_dois(self):
        self.assertEqual(self.com_orcamento("55.00").comissao_valor, D("110.00"))

    def test_sem_orcamento_nao_ha_comissao(self):
        self.assertEqual(self.nova_os().comissao_valor, D("0.00"))

    def test_cancelada_nao_gera_comissao(self):
        os_ = self.com_orcamento()
        os_.mudar_status(StatusOS.CANCELADA, self.diretor, "desistiu")
        self.assertEqual(os_.comissao_valor, D("0.00"))

    def test_em_aberto_so_depois_de_finalizar(self):
        os_ = self.com_orcamento()
        self.assertFalse(os_.comissao_em_aberto)
        os_.mudar_status(StatusOS.EM_EXECUCAO, self.diretor)
        Pagamento.objects.create(ordem=os_, forma="pix", valor=os_.valor_liquido,
                                 registrado_por=self.diretor)
        os_.mudar_status(StatusOS.FINALIZADA, self.diretor)
        self.assertTrue(os_.comissao_em_aberto)

        os_.comissao_paga = True
        self.assertFalse(os_.comissao_em_aberto)
