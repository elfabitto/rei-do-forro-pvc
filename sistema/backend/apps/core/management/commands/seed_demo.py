"""
Popula o banco com dados de demonstração para rodar o React localmente.

    python manage.py carregar_catalogo
    python manage.py criar_equipe
    python manage.py seed_demo

Usa a equipe real criada por `criar_equipe`. Para limpar e recomeçar,
apague o db.sqlite3 e rode os três comandos de novo.
"""
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.catalogo.models import Acabamento, Forro, Material
from apps.clientes.models import Cliente, Endereco
from apps.orcamentos.models import Orcamento, OrcamentoItem, StatusOrcamento, TipoOrcamento
from apps.ordens.models import (
    Agendamento,
    ConfiguracaoAgenda,
    OrdemServico,
    Pagamento,
    StatusOS,
    TipoAgendamento,
    Turno,
)

D = Decimal
Usuario = get_user_model()


def dia_util(base, somar):
    """Avança `somar` dias e pula domingo, que não é agendável."""
    d = base + timedelta(days=somar)
    return d + timedelta(days=1) if d.weekday() == 6 else d


class Command(BaseCommand):
    help = "Cria usuários, clientes, orçamentos e O.S. de demonstração."

    def handle(self, *args, **options):
        if not Forro.objects.exists():
            self.stderr.write(self.style.ERROR("Rode antes: python manage.py carregar_catalogo"))
            return

        hoje = timezone.localdate()
        cfg = ConfiguracaoAgenda.obter()

        # ------------------------------------------------------------ equipe
        diretor = Usuario.objects.filter(papel="diretor").first()
        vendedores = list(Usuario.objects.filter(papel="vendedor").order_by("first_name"))
        if not diretor or not vendedores:
            self.stderr.write(self.style.ERROR("Rode antes: python manage.py criar_equipe"))
            return
        vendedor = vendedores[0]
        segunda = vendedores[1] if len(vendedores) > 1 else vendedor
        self.stdout.write(self.style.SUCCESS(
            f"Equipe: {diretor.get_full_name()} (diretor) e {len(vendedores)} vendedor(es)"
        ))

        # ------------------------------------------------------------ clientes
        dados_clientes = [
            ("Maria Souza", "(66) 99988-1122", "Rua das Palmeiras", "180",
             "Casa dos fundos", "Jardim Aeroporto", "https://maps.app.goo.gl/exemplo1"),
            ("Construtora Vale", "(66) 3421-7788", "Av. Brasil", "1450",
             "Sala 3 — prédio azul", "Centro", "https://maps.app.goo.gl/exemplo2"),
            ("João Pedro Alves", "(66) 99615-0043", "Rua 7 de Setembro", "62",
             "", "Vila Nova", ""),
            ("Rosana Martins", "(66) 99204-8890", "Rua Ipê Amarelo", "305",
             "Apto 201, bloco B", "Parque das Águas", "https://maps.app.goo.gl/exemplo3"),
        ]
        clientes = []
        for nome, fone, rua, numero, compl, bairro, mapa in dados_clientes:
            c, _ = Cliente.objects.get_or_create(
                nome=nome, defaults={"telefone": fone, "criado_por": vendedor}
            )
            Endereco.objects.get_or_create(
                cliente=c, logradouro=rua,
                defaults={"numero": numero, "complemento": compl, "bairro": bairro,
                          "link_localizacao": mapa, "principal": True},
            )
            clientes.append(c)
        self.stdout.write(self.style.SUCCESS(f"{len(clientes)} clientes"))

        # ------------------------------------------------------------ orçamentos
        brilhoso = Forro.objects.get(nome="BRANCO LISO BRILHOSO")
        fosco = Forro.objects.get(nome="BRANCO LISO FOSCO")
        mogno = Forro.objects.get(nome="MOGNO LISO")
        sanca = Acabamento.objects.get(nome__startswith="Sanca")
        perfil = Acabamento.objects.get(nome__startswith="Acabamento normal")
        perfil_6m = Material.objects.get(rotulo="Perfil 6 m")
        ripao = Material.objects.get(rotulo__startswith="Ripão 4 m Cutiuba")

        if Orcamento.objects.exists():
            self.stdout.write(self.style.WARNING("Orçamentos já existem — nada a criar."))
            return

        o1 = Orcamento.objects.create(
            cliente=clientes[0], tipo=TipoOrcamento.INSTALADO, area_m2=D("23"),
            forro=brilhoso, acabamento=sanca, vendedor=vendedor, criado_por=vendedor,
        )
        o2 = Orcamento.objects.create(
            cliente=clientes[1], tipo=TipoOrcamento.MATERIAL, area_m2=D("84"),
            forro=fosco, vendedor=diretor, criado_por=diretor,
            observacoes="Entregar na obra, falar com o encarregado Paulo.",
        )
        OrcamentoItem.objects.create(orcamento=o2, material=perfil_6m, descricao=perfil_6m.rotulo,
                                     unidade="und", quantidade=D("24"), preco_unitario=perfil_6m.preco)
        OrcamentoItem.objects.create(orcamento=o2, material=ripao, descricao=ripao.rotulo,
                                     unidade="und", quantidade=D("36"), preco_unitario=ripao.preco)
        o2.save()

        o3 = Orcamento.objects.create(
            cliente=clientes[2], tipo=TipoOrcamento.INSTALADO, area_m2=D("31.5"),
            forro=mogno, acabamento=perfil, vendedor=segunda, criado_por=segunda,
        )
        o4 = Orcamento.objects.create(
            cliente=clientes[3], tipo=TipoOrcamento.INSTALADO, area_m2=D("18"),
            forro=brilhoso, acabamento=perfil, vendedor=vendedor, criado_por=vendedor,
        )
        o4.status = StatusOrcamento.PERDIDO
        o4.save()
        self.stdout.write(self.style.SUCCESS("4 orçamentos"))

        # ------------------------------------------------------------ O.S.
        # 1) finalizada e quitada
        os1 = OrdemServico.objects.create(
            orcamento=o1, cliente=clientes[0], endereco=clientes[0].endereco_principal,
            vendedor=vendedor, criado_por=vendedor, valor_total=o1.total_vista,
            valor_vista=o1.total_vista, valor_cartao=o1.total_cartao,
            observacoes="Sanca na sala e no corredor.",
        )
        Agendamento.objects.create(ordem=os1, tipo=TipoAgendamento.ENTREGA,
                                   data=dia_util(hoje, -6), turno=Turno.MANHA)
        Agendamento.objects.create(ordem=os1, tipo=TipoAgendamento.INSTALACAO,
                                   data=dia_util(hoje, -5), turno=Turno.TARDE)
        Pagamento.objects.create(ordem=os1, forma="pix", valor=os1.valor_total,
                                 registrado_por=diretor, data=dia_util(hoje, -5))
        os1.mudar_status(StatusOS.EM_EXECUCAO, vendedor, "Saiu para entrega")
        os1.mudar_status(StatusOS.FINALIZADA, diretor, "Pago no ato")
        o1.status = StatusOrcamento.CONVERTIDO
        o1.save()

        # 2) em execução, com saldo em aberto
        os2 = OrdemServico.objects.create(
            orcamento=o2, cliente=clientes[1], endereco=clientes[1].endereco_principal,
            vendedor=diretor, criado_por=diretor, valor_total=o2.total_vista,
            valor_vista=o2.total_vista, valor_cartao=o2.total_cartao,
            observacoes="Somente material.",
        )
        Agendamento.objects.create(ordem=os2, tipo=TipoAgendamento.ENTREGA,
                                   data=dia_util(hoje, 0), turno=Turno.MANHA)
        Pagamento.objects.create(ordem=os2, forma="transferencia", valor=D("1600.00"),
                                 registrado_por=diretor, data=hoje - timedelta(days=1))
        os2.mudar_status(StatusOS.EM_EXECUCAO, diretor, "Material separado")
        o2.status = StatusOrcamento.CONVERTIDO
        o2.save()

        # 3) recém-gerada, agendada para a semana que vem
        os3 = OrdemServico.objects.create(
            orcamento=o3, cliente=clientes[2], endereco=clientes[2].endereco_principal,
            vendedor=vendedor, criado_por=vendedor, valor_total=o3.total_vista,
            valor_vista=o3.total_vista, valor_cartao=o3.total_cartao,
        )
        Agendamento.objects.create(ordem=os3, tipo=TipoAgendamento.ENTREGA,
                                   data=dia_util(hoje, 3), turno=Turno.TARDE)
        Agendamento.objects.create(ordem=os3, tipo=TipoAgendamento.INSTALACAO,
                                   data=dia_util(hoje, 4), turno=Turno.MANHA)
        o3.status = StatusOrcamento.CONVERTIDO
        o3.save()

        # 4) ATRASADA: data já passou e ninguém finalizou
        o5 = Orcamento.objects.create(
            cliente=clientes[3], tipo=TipoOrcamento.INSTALADO, area_m2=D("26"),
            forro=brilhoso, acabamento=sanca, vendedor=segunda, criado_por=segunda,
        )
        os4 = OrdemServico.objects.create(
            orcamento=o5, cliente=clientes[3], endereco=clientes[3].endereco_principal,
            vendedor=segunda, criado_por=segunda,
            valor_total=o5.total_vista, valor_vista=o5.total_vista, valor_cartao=o5.total_cartao,
            observacoes="Cliente não estava em casa na data combinada.",
        )
        Agendamento.objects.create(ordem=os4, tipo=TipoAgendamento.ENTREGA,
                                   data=dia_util(hoje, -4), turno=Turno.MANHA)
        os4.mudar_status(StatusOS.EM_EXECUCAO, segunda, "Saiu para entrega")
        o5.status = StatusOrcamento.CONVERTIDO
        o5.save()

        self.stdout.write(self.style.SUCCESS("4 ordens de serviço (uma delas atrasada)"))
        self.stdout.write(self.style.SUCCESS(
            f"Agenda: {cfg.capacidade_entrega} entregas e {cfg.capacidade_instalacao} instalações por turno"
        ))
        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("Pronto. Entre com os usuários criados por criar_equipe."))
