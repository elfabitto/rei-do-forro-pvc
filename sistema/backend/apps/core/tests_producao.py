"""Produção: rota de saúde para o monitoramento e o Django entregando as telas do React."""
import tempfile
from pathlib import Path

from django.test import TestCase, override_settings


class SaudeTest(TestCase):
    def test_responde_sem_login(self):
        r = self.client.get("/api/saude/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json(), {"ok": True, "banco": "ok"})


class TelasReactTest(TestCase):
    def setUp(self):
        self.pasta = Path(tempfile.mkdtemp())
        (self.pasta / "index.html").write_text("<div id=root></div>", encoding="utf-8")

    def test_rotas_das_telas_abrem_o_index(self):
        with override_settings(FRONTEND_DIST=self.pasta):
            for rota in ("/", "/orcamentos", "/ordens/nova", "/inicio"):
                r = self.client.get(rota)
                self.assertEqual(r.status_code, 200, rota)
                self.assertIn(b"id=root", b"".join(r.streaming_content))
                self.assertIn("no-cache", r["Cache-Control"])

    def test_api_e_admin_nao_viram_tela(self):
        with override_settings(FRONTEND_DIST=self.pasta):
            self.assertEqual(self.client.get("/api/nao-existe/").status_code, 404)
            self.assertEqual(self.client.get("/admin/").status_code, 302)   # login do admin

    def test_sem_build_da_404(self):
        with override_settings(FRONTEND_DIST=self.pasta / "nada"):
            self.assertEqual(self.client.get("/orcamentos").status_code, 404)
