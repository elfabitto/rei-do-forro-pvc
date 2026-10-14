import { useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./auth";
import Icone from "./icones";
import { LOGO } from "./logo";
import Agenda from "./paginas/Agenda";
import Catalogo from "./paginas/Catalogo";
import Clientes from "./paginas/Clientes";
import Comissoes from "./paginas/Comissoes";
import Login from "./paginas/Login";
import OrcamentoNovo from "./paginas/OrcamentoNovo";
import Orcamentos from "./paginas/Orcamentos";
import OrdemNova from "./paginas/OrdemNova";
import OrdensServico from "./paginas/OrdensServico";
import Painel from "./paginas/Painel";
import Parametros from "./paginas/Parametros";
import Chamados from "./paginas/Chamados";
import Financeiro from "./paginas/Financeiro";
import Home from "./paginas/Home";
import Usuarios from "./paginas/Usuarios";
import Sino from "./Sino";

/* `so` restringe o item a uma permissão calculada pelo backend. */
const MENU = [
  { grupo: "Operação" },
  { to: "/inicio", rotulo: "Início", icone: "casa" },
  { to: "/painel", rotulo: "Painel", icone: "painel", so: "verPainel" },
  { to: "/orcamentos", rotulo: "Orçamentos", icone: "orcamento" },
  { to: "/ordens", rotulo: "Ordens de Serviço", icone: "ordem" },
  { to: "/agenda", rotulo: "Agenda", icone: "agenda" },
  // cada um vê as próprias; a diretoria vê todas e dá a baixa
  { to: "/comissoes", rotulo: "Comissões", icone: "comissao" },
  { to: "/financeiro", rotulo: "Financeiro", icone: "financeiro", so: "verFinanceiro" },
  { grupo: "Cadastros" },
  { to: "/clientes", rotulo: "Clientes", icone: "clientes" },
  { to: "/catalogo", rotulo: "Tabela de preços", icone: "precos" },
  { to: "/usuarios", rotulo: "Usuários", icone: "equipe", so: "gerirUsuarios" },
  { to: "/parametros", rotulo: "Parâmetros", icone: "ajustes", so: "verFinanceiro" },
  { grupo: "Suporte" },
  { to: "/chamados", rotulo: "Sugestões e melhorias", icone: "chamado" },
];

/** Abaixo disto o menu vira gaveta sobreposta e começa recolhido. */
const ESTREITO = 900;
const ehEstreito = () => window.innerWidth < ESTREITO;

/** Tira os itens sem permissão e os títulos de grupo que ficaram vazios. */
function menuVisivel(pode) {
  const itens = MENU.filter((m) => m.grupo || !m.so || pode(m.so));
  return itens.filter((m, i) => {
    if (!m.grupo) return true;
    const resto = itens.slice(i + 1);
    const proximoGrupo = resto.findIndex((p) => p.grupo);
    return (proximoGrupo === -1 ? resto : resto.slice(0, proximoGrupo)).length > 0;
  });
}

export default function App() {
  const { usuario, carregando, sair, pode } = useAuth();
  const local = useLocation();

  // No desktop o menu fica sempre aberto na lateral; no celular, recolhido.
  const [aberto, setAberto] = useState(() => !ehEstreito());

  useEffect(() => {
    const aoRedimensionar = () => setAberto(!ehEstreito());
    window.addEventListener("resize", aoRedimensionar);
    return () => window.removeEventListener("resize", aoRedimensionar);
  }, []);

  // navegou no celular: recolhe de volta
  useEffect(() => {
    if (ehEstreito()) setAberto(false);
  }, [local.pathname]);

  if (carregando) return <div className="carregando">Carregando…</div>;
  if (!usuario) return <Login />;

  const iniciais = (usuario.nome || usuario.username)
    .split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();

  return (
    <div className={`app${aberto ? " comMenu" : ""}`}>
      {aberto && <div className="menuScrim" onClick={() => setAberto(false)} />}

      <aside className={aberto ? "aberto" : ""}>
        <div className="logo">
          <img src={LOGO} alt="" />
          <div className="n">REI DO <i>FORRO</i><s>Gestão</s></div>
          <button className="fecharMenu" onClick={() => setAberto(false)} aria-label="Recolher menu">
            <Icone nome="fechar" tamanho={17} />
          </button>
        </div>
        <nav>
          {menuVisivel(pode).map((m, i) =>
            m.grupo ? (
              <div className="grp" key={`g${i}`}>{m.grupo}</div>
            ) : (
              <NavLink key={m.to} to={m.to} end={m.fim}
                       className={({ isActive }) => (isActive ? "on" : "")}>
                <Icone nome={m.icone} />
                <span>{m.rotulo}</span>
              </NavLink>
            )
          )}
        </nav>
      </aside>

      <main>
        <header className="top">
          <button className="abrirMenu" onClick={() => setAberto(true)} aria-label="Abrir menu">
            <Icone nome="menu" tamanho={20} />
          </button>

          <div className="marcaTopo">
            <img src={LOGO} alt="" />
            <span>REI DO <i>FORRO</i></span>
          </div>

          <div className="quem">
            <div className="avatar">{iniciais}</div>
            <div className="quemTexto">
              <b>{usuario.nome}</b>
              <span className="papel">{usuario.papel}</span>
            </div>
          </div>
          <Sino />
          <button className="btn sairBtn" onClick={sair}>
            <Icone nome="sair" tamanho={16} />
            <span>Sair</span>
          </button>
        </header>

        <Routes>
          {/* entrada: Início (botões grandes) — só a diretoria no computador abre no Painel */}
          <Route path="/" element={<Navigate to={pode("verPainel") && !ehEstreito() ? "/painel" : "/inicio"} replace />} />
          <Route path="/inicio" element={<Home />} />
          <Route path="/painel" element={pode("verPainel") ? <Painel /> : <Navigate to="/inicio" replace />} />
          <Route path="/orcamentos" element={<Orcamentos />} />
          <Route path="/orcamentos/novo" element={<OrcamentoNovo />} />
          <Route path="/orcamentos/:id/editar" element={<OrcamentoNovo />} />
          <Route path="/ordens" element={<OrdensServico />} />
          <Route path="/ordens/nova" element={<OrdemNova />} />
          <Route path="/agenda" element={<Agenda />} />
          <Route path="/parametros" element={<Parametros />} />
          <Route path="/comissoes" element={<Comissoes />} />
          <Route path="/financeiro" element={pode("verFinanceiro") ? <Financeiro /> : <Navigate to="/" replace />} />
          <Route path="/usuarios" element={pode("gerirUsuarios") ? <Usuarios /> : <Navigate to="/" replace />} />
          <Route path="/chamados" element={<Chamados />} />
          <Route path="/clientes" element={<Clientes />} />
          <Route path="/catalogo" element={<Catalogo />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
