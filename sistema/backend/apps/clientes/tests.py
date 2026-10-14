from apps.core import formatos
from apps.core.tests import ApiBase


class FormatosTest(ApiBase):
    def test_telefone(self):
        self.assertEqual(formatos.telefone("94999881122"), "(94) 99988-1122")
        self.assertEqual(formatos.telefone("+55 (94) 3322-1100"), "(94) 3322-1100")
        for ruim in ("9999-0000", "94 89988-1122", "00 99988-1122", "949998811223"):
            with self.assertRaises(ValueError):
                formatos.telefone(ruim)

    def test_nome(self):
        self.assertEqual(formatos.nome_proprio("  maria  DA silva "), "Maria da Silva")


class ClienteCadastroTest(ApiBase):
    def test_padroniza_e_barra_duplicado(self):
        self.client.force_authenticate(self.vendedor)
        r = self.client.post("/api/clientes/", {"nome": "joão dos santos", "telefone": "94991234567"}, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual((r.data["nome"], r.data["telefone"]), ("João dos Santos", "(94) 99123-4567"))

        r = self.client.post("/api/clientes/", {"nome": "Outro", "telefone": "(94) 99123-4567"}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("João dos Santos", str(r.data["telefone"]))

        r = self.client.post("/api/clientes/", {"nome": "Ana", "telefone": "1234"}, format="json")
        self.assertEqual(r.status_code, 400)

        achados = self.client.get("/api/clientes/", {"fone": "91234567"}).data["results"]
        self.assertEqual([x["nome"] for x in achados], ["João dos Santos"])

    def test_endereco(self):
        self.client.force_authenticate(self.vendedor)
        r = self.client.post("/api/enderecos/", {"cliente": self.cliente.id, "logradouro": "Rua A", "numero": "sn",
                                                 "bairro": "cidade nova", "cidade": "santa barbara",
                                                 "cep": "68500000"}, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual((r.data["numero"], r.data["bairro"], r.data["cidade"]), ("S/N", "Cidade Nova", "Santa Bárbara"))
        r = self.client.post("/api/enderecos/", {"cliente": self.cliente.id, "logradouro": "Rua B", "bairro": "Centro",
                                                 "cidade": "Marabá"}, format="json")
        self.assertEqual(r.status_code, 400)
