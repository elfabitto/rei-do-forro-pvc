"""Financeiro automático, avisos ao vendedor, chamados e cadastro de usuários."""
from decimal import Decimal as D

from apps.comunicacao.models import Chamado, Notificacao
from apps.contas.models import Usuario
from apps.core.tests import ApiBase, OSFinalizadaMixin
from apps.financeiro.models import Lancamento


class FinanceiroAutomaticoTest(OSFinalizadaMixin, ApiBase):
    def test_venda_finalizada_entra_no_caixa_e_avisa_o_vendedor(self):
        os_ = self.finalizada()
        entradas = Lancamento.objects.filter(tipo="entrada", origem="venda")
        self.assertEqual(entradas.count(), 1)
        self.assertEqual(entradas[0].valor, D(str(os_["valor_total"])))
        aviso = Notificacao.objects.get(usuario=self.vendedor)
        self.assertEqual(aviso.tipo, "os_finalizada")
        self.assertIn("R$ 110,00", aviso.mensagem)

    def test_cartao_entra_pelo_liquido(self):
        self.client.force_authenticate(self.vendedor)
        orc = self.client.post("/api/orcamentos/", {
            "cliente": self.cliente.id, "tipo": "instalado", "area_m2": "55", "forro": self.forro.id,
        }, format="json").data
        os_ = self.client.post("/api/ordens-servico/", {
            "orcamento": orc["id"], "endereco": self.endereco.id, "modalidade": "vista",
        }, format="json").data
        self.client.force_authenticate(self.diretor)
        r = self.client.post(f"/api/ordens-servico/{os_['id']}/finalizar/", {
            "pagamentos": [{"forma": "credito", "valor": os_["valor_total"], "parcelas": 3}],
        }, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        l = Lancamento.objects.get(origem="venda")
        self.assertEqual(l.valor, D(str(os_["valor_total"])))      # o acréscimo fica com a maquininha
        self.assertIn("3x", l.forma)

    def test_baixa_de_comissao_vira_saida_e_estorno_desfaz(self):
        os_ = self.finalizada()
        r = self.client.post("/api/comissoes/pagar/", {"vendedor": self.vendedor.id}, format="json")
        self.assertEqual(r.data["pagas"], 1)
        saida = Lancamento.objects.get(tipo="saida")
        self.assertEqual((saida.categoria, saida.valor, saida.favorecido), ("comissao", D("110.00"), self.vendedor))
        self.assertTrue(Notificacao.objects.filter(usuario=self.vendedor, tipo="comissao_paga").exists())

        # automático não se edita pela tela do financeiro
        self.assertEqual(self.client.delete(f"/api/lancamentos/{saida.id}/").status_code, 403)

        self.client.post(f"/api/ordens-servico/{os_['id']}/estornar_comissao/")
        self.assertFalse(Lancamento.objects.filter(tipo="saida").exists())

    def test_lancamento_manual_e_resumo(self):
        self.finalizada()
        r = self.client.post("/api/lancamentos/", {
            "tipo": "saida", "categoria": "frete", "descricao": "Diesel", "valor": "250.00",
        }, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        r = self.client.post("/api/lancamentos/", {
            "tipo": "entrada", "categoria": "frete", "descricao": "errado", "valor": "1",
        }, format="json")
        self.assertEqual(r.status_code, 400)

        resumo = self.client.get("/api/lancamentos/resumo/").data
        self.assertEqual(resumo["saidas"], D("250.00"))
        self.assertEqual(resumo["resultado"], resumo["entradas"] - D("250.00"))

        self.client.force_authenticate(self.vendedor)
        self.assertEqual(self.client.get("/api/lancamentos/").status_code, 403)


class NotificacaoApiTest(OSFinalizadaMixin, ApiBase):
    def test_ler_notificacoes(self):
        self.finalizada()
        self.client.force_authenticate(self.vendedor)
        r = self.client.get("/api/notificacoes/").data
        self.assertEqual(r["nao_lidas"], 1)
        self.client.post(f"/api/notificacoes/{r['itens'][0]['id']}/ler/")
        self.assertEqual(self.client.get("/api/notificacoes/").data["nao_lidas"], 0)


class ChamadoApiTest(OSFinalizadaMixin, ApiBase):
    """Chamados são do TI: a diretoria não atende."""

    def test_fluxo_do_chamado(self):
        from apps.contas.models import Usuario
        ti = Usuario.objects.create_user("fabio.lima", papel="ti", first_name="Fábio")

        self.client.force_authenticate(self.vendedor)
        r = self.client.post("/api/chamados/", {
            "titulo": "Filtro por bairro", "descricao": "Queria filtrar clientes por bairro",
            "categoria": "melhoria",
        }, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        cid = r.data["id"]
        self.assertTrue(Notificacao.objects.filter(usuario=ti, tipo="chamado").exists())
        self.assertFalse(Notificacao.objects.filter(usuario=self.diretor, tipo="chamado").exists())

        # vendedor não muda o status
        r = self.client.patch(f"/api/chamados/{cid}/", {"status": "concluido"}, format="json")
        self.assertEqual(r.status_code, 403)

        # nem a diretoria — ela nem vê o chamado dos outros
        self.client.force_authenticate(self.diretor)
        r = self.client.patch(f"/api/chamados/{cid}/", {"status": "concluido"}, format="json")
        self.assertEqual(r.status_code, 404)

        self.client.force_authenticate(ti)
        r = self.client.patch(f"/api/chamados/{cid}/", {"status": "em_andamento",
                                                         "resposta": "Entra na próxima versão."}, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data["respondido_por_nome"], "Fábio")
        self.assertTrue(Notificacao.objects.filter(usuario=self.vendedor, tipo="chamado").exists())

        # cada um só vê os próprios; o TI vê todos
        Chamado.objects.create(titulo="do diretor", descricao="x", autor=self.diretor)
        self.client.force_authenticate(self.vendedor)
        self.assertEqual(len(self.client.get("/api/chamados/").data), 1)
        self.client.force_authenticate(ti)
        self.assertEqual(len(self.client.get("/api/chamados/").data), 2)

    def test_ti_tem_acesso_de_diretor(self):
        from apps.contas.models import Usuario
        ti = Usuario.objects.create_user("fabio.lima", papel="ti")
        self.assertTrue(ti.e_diretor and ti.pode_ver_financeiro and ti.pode_finalizar_os)
        self.assertTrue(ti.pode_atender_chamados)
        self.assertFalse(self.diretor.pode_atender_chamados)


class UsuarioCadastroTest(OSFinalizadaMixin, ApiBase):
    def test_diretoria_cadastra_e_desativa(self):
        self.client.force_authenticate(self.diretor)
        r = self.client.post("/api/usuarios/", {
            "username": "Paula", "first_name": "Paula", "papel": "vendedor", "senha": "forro#2026x",
        }, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        self.assertNotIn("senha", r.data)
        paula = Usuario.objects.get(username="paula")
        self.assertTrue(paula.check_password("forro#2026x"))

        r = self.client.post("/api/usuarios/", {"username": "x", "papel": "instalador", "senha": "forro#2026x"},
                             format="json")
        self.assertEqual(r.status_code, 400)

        self.client.delete(f"/api/usuarios/{paula.id}/")
        paula.refresh_from_db()
        self.assertFalse(paula.is_active)
        self.assertEqual(len(self.client.get("/api/usuarios/", {"todos": 1}).data),
                         Usuario.objects.count())

        r = self.client.patch(f"/api/usuarios/{self.diretor.id}/", {"is_active": False}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_vendedor_nao_cadastra(self):
        self.client.force_authenticate(self.vendedor)
        r = self.client.post("/api/usuarios/", {"username": "y", "papel": "diretor", "senha": "forro#2026x"},
                             format="json")
        self.assertEqual(r.status_code, 403)
