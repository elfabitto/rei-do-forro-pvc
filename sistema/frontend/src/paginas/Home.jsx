/**
 * Início — a porta de entrada no celular: botões grandes para o que se faz
 * todo dia. Cada botão traz um número do momento (compromissos de hoje,
 * comissão a receber…) para a pessoa já saber onde precisa olhar.
 *
 * Vendedor: orçamento, O.S., comissões, agenda, clientes e tabela de preços.
 * Diretoria: painel, orçamento, O.S., agenda, financeiro e comissões.
 * Para todos, logo abaixo: agendar visita técnica (orçamento presencial).
 */
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { brl } from "../api";
import { useAuth } from "../auth";
import { useApi } from "../componentes";
import Icone from "../icones";

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function saudacao() {
  const h = new Date().getHours();
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

function Botao({ to, icone, rotulo, info, cor, destaque }) {
  return (
    <Link to={to} className={`homeBtn${destaque ? " destaque" : ""}`} style={{ "--cor": cor }}>
      <span className="ico"><Icone nome={icone} tamanho={30} /></span>
      <b>{rotulo}</b>
      <small>{info ?? " "}</small>
    </Link>
  );
}

export default function Home() {
  const { usuario, pode } = useAuth();
  const diretoria = pode("verPainel");
  const hoje = useMemo(() => iso(new Date()), []);

  const agenda = useApi("/agendamentos/", { de: hoje, ate: hoje, page_size: 1 });
  const agendadas = useApi("/ordens-servico/",
    { status: "gerada", page_size: 1, ...(diretoria ? {} : { vendedor: usuario.id }) });
  const comissoes = useApi("/comissoes/");
  const visitas = useApi("/visitas/", { status: "agendada", de: hoje, page_size: 1 });

  const qtdHoje = agenda.dados?.count;
  const qtdOS = agendadas.dados?.count;
  const aReceber = comissoes.dados?.resumo?.aberto;
  const qtdVisitas = visitas.dados?.count;

  const txtHoje = qtdHoje === undefined ? null : qtdHoje ? `${qtdHoje} hoje` : "nada hoje";
  const txtOS = qtdOS === undefined ? null : qtdOS ? `${qtdOS} agendada${qtdOS > 1 ? "s" : ""}` : "nenhuma agendada";
  const txtCom = aReceber === undefined ? null
    : Number(aReceber) ? `${brl(aReceber)} ${diretoria ? "a pagar" : "a receber"}` : (diretoria ? "nada a pagar" : "nada a receber");

  const nome = (usuario.nome || usuario.username).split(" ")[0];
  const dataTx = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  const data = dataTx[0].toUpperCase() + dataTx.slice(1);   // "Quarta-feira, 14 de outubro"

  const botoes = diretoria ? [
    { to: "/painel", icone: "painel", rotulo: "Painel", info: "números da empresa", cor: "#15161a" },
    { to: "/orcamentos/novo", icone: "mais", rotulo: "Fazer orçamento", info: "novo orçamento", cor: "#ee6a1e", destaque: true },
    { to: "/ordens", icone: "ordem", rotulo: "Ordens de serviço", info: txtOS, cor: "#2a78d6" },
    { to: "/agenda", icone: "agenda", rotulo: "Agenda", info: txtHoje, cor: "#8a5cd6" },
    { to: "/financeiro", icone: "financeiro", rotulo: "Financeiro", info: "entradas e saídas", cor: "#1f9d6b" },
    { to: "/comissoes", icone: "comissao", rotulo: "Comissões", info: txtCom, cor: "#e0a100" },
  ] : [
    { to: "/orcamentos/novo", icone: "mais", rotulo: "Fazer orçamento", info: "novo orçamento", cor: "#ee6a1e", destaque: true },
    { to: "/ordens", icone: "ordem", rotulo: "Ordens de serviço", info: txtOS, cor: "#2a78d6" },
    { to: "/comissoes", icone: "comissao", rotulo: "Comissões", info: txtCom, cor: "#1f9d6b" },
    { to: "/agenda", icone: "agenda", rotulo: "Agenda", info: txtHoje, cor: "#8a5cd6" },
    { to: "/clientes", icone: "clientes", rotulo: "Clientes", info: "cadastro e endereços", cor: "#16a3b8" },
    { to: "/catalogo", icone: "precos", rotulo: "Tabela de preços", info: "forros e materiais", cor: "#e0a100" },
  ];

  return (
    <div className="pagina home">
      <div className="homeTopo">
        <span className="data">{data}</span>
        <h1>{saudacao()}, {nome}!</h1>
        <p>O que vamos fazer agora?</p>
      </div>

      <div className="homeGrade" role="navigation" aria-label="Atalhos">
        {botoes.map((b) => <Botao key={b.to} {...b} />)}
      </div>

      <Link to="/visitas/nova" className="homeVisita">
        <span className="ico"><Icone nome="visita" tamanho={26} /></span>
        <span>
          <b>Agendar visita</b>
          <small>
            Orçamento presencial
            {qtdVisitas ? ` · ${qtdVisitas} visita${qtdVisitas > 1 ? "s" : ""} agendada${qtdVisitas > 1 ? "s" : ""}` : ""}
          </small>
        </span>
        <span className="seta" aria-hidden="true">›</span>
      </Link>

      <Link to="/visitas" className="homeLink">
        <Icone nome="visita" tamanho={18} />
        <span>Ver visitas técnicas</span>
        <span className="seta">›</span>
      </Link>

      <Link to="/orcamentos" className="homeLink">
        <Icone nome="orcamento" tamanho={18} />
        <span>{diretoria ? "Ver orçamentos" : "Ver meus orçamentos"}</span>
        <span className="seta">›</span>
      </Link>
    </div>
  );
}
