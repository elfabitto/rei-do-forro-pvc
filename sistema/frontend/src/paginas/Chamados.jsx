/**
 * Sugestões e melhorias — chamados para o TI.
 *
 * Qualquer pessoa abre um chamado e acompanha os próprios; enquanto está
 * aberto, ela ainda pode editar. O TI vê todos, muda o status
 * e responde — quem abriu recebe o aviso no sino.
 */
import { useMemo, useState } from "react";
import { api, dataHora } from "../api";
import { useAuth } from "../auth";
import { BotaoAcao, Campo, Estado, Gaveta, useApi } from "../componentes";
import Icone from "../icones";

const CATEGORIAS = [
  { valor: "sugestao", rotulo: "Sugestão", dica: "uma ideia nova para o sistema" },
  { valor: "melhoria", rotulo: "Melhoria", dica: "algo que já existe e pode ficar melhor" },
  { valor: "problema", rotulo: "Problema / erro", dica: "algo que não funciona como deveria" },
  { valor: "duvida", rotulo: "Dúvida", dica: "como faço tal coisa?" },
];
const PRIORIDADES = [["baixa", "Baixa"], ["media", "Média"], ["alta", "Alta"]];
const STATUS = [["aberto", "Aberto"], ["em_andamento", "Em andamento"], ["concluido", "Concluído"],
                ["recusado", "Não será feito"]];
const TELAS = ["Painel", "Orçamentos", "Ordens de Serviço", "Agenda", "Comissões", "Financeiro", "Clientes",
               "Tabela de preços", "Parâmetros", "Usuários", "Recibo / documentos", "Celular", "Outra"];

function FormChamado({ chamado, ti, aoFechar, aoSalvar }) {
  const novo = !chamado?.id;
  const [c, setC] = useState(() => chamado?.id ? { ...chamado }
    : { titulo: "", descricao: "", categoria: "sugestao", prioridade: "media", tela: "" });
  const [erro, setErro] = useState("");
  const campo = (k) => ({ value: c[k] ?? "", onChange: (e) => setC((s) => ({ ...s, [k]: e.target.value })) });
  const doAutor = novo || chamado.pode_editar;   // o servidor já diz quem pode (autor com chamado aberto, ou o TI)

  async function salvar() {
    setErro("");
    try {
      if (!c.titulo.trim()) throw new Error("Dê um título curto ao chamado.");
      if (!c.descricao.trim()) throw new Error("Descreva a sugestão ou o problema.");
      const corpo = { titulo: c.titulo.trim(), descricao: c.descricao.trim(), categoria: c.categoria,
                      prioridade: c.prioridade, tela: c.tela };
      if (ti && !novo) Object.assign(corpo, { status: c.status, resposta: c.resposta });
      if (novo) await api.post("/chamados/", corpo);
      else await api.patch(`/chamados/${c.id}/`, corpo);
      aoSalvar();
      aoFechar();
      return novo ? "enviado" : "salvo";
    } catch (e) {
      setErro(e.message);
      throw e;
    }
  }

  async function excluir() {
    if (!window.confirm(`Excluir o chamado #${c.numero}?`)) return "";
    await api.delete(`/chamados/${c.id}/`);
    aoSalvar();
    aoFechar();
    return "excluído";
  }

  return (
    <Gaveta titulo={novo ? "Novo chamado" : `Chamado #${c.numero}`} aoFechar={aoFechar}
            rodape={
              <div className="btnrow">
                <BotaoAcao classe="btn p" aoClicar={salvar}>{novo ? "Enviar ao TI" : "Salvar"}</BotaoAcao>
                <button className="btn" onClick={aoFechar}>Cancelar</button>
                {!novo && chamado.pode_editar && (
                  <BotaoAcao classe="btn vermelho" aoClicar={excluir}><Icone nome="lixo" tamanho={15} /> Excluir</BotaoAcao>
                )}
              </div>
            }>
      <section className="sec">
        {erro && <div className="erro">{erro}</div>}
        {!novo && <p className="nota" style={{ marginTop: 0 }}>Aberto por <b>{c.autor_nome}</b> em {dataHora(c.criado_em)}</p>}
        <Campo rotulo="Tipo">
          <div className="catChamado">
            {CATEGORIAS.map((k) => (
              <button key={k.valor} type="button" disabled={!doAutor}
                      className={`${k.valor}${c.categoria === k.valor ? " on" : ""}`}
                      onClick={() => setC((s) => ({ ...s, categoria: k.valor }))}>
                <b>{k.rotulo}</b><small>{k.dica}</small>
              </button>
            ))}
          </div>
        </Campo>
        <Campo rotulo="Título"><input {...campo("titulo")} disabled={!doAutor} autoFocus={novo}
                                       placeholder="Ex.: Filtrar clientes por bairro" maxLength={120} /></Campo>
        <Campo rotulo="Descrição" dica="Conte o que acontece, onde e como deveria ser. Quanto mais detalhe, melhor.">
          <textarea rows={5} {...campo("descricao")} disabled={!doAutor} />
        </Campo>
        <div className="two">
          <Campo rotulo="Tela do sistema">
            <select {...campo("tela")} disabled={!doAutor}>
              <option value="">—</option>
              {TELAS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Urgência">
            <select {...campo("prioridade")} disabled={!doAutor}>
              {PRIORIDADES.map(([k, r]) => <option key={k} value={k}>{r}</option>)}
            </select>
          </Campo>
        </div>
      </section>

      {!novo && (ti ? (
        <section className="sec">
          <h4>Resposta do TI</h4>
          <Campo rotulo="Situação">
            <select {...campo("status")}>{STATUS.map(([k, r]) => <option key={k} value={k}>{r}</option>)}</select>
          </Campo>
          <Campo rotulo="Resposta para quem abriu" dica="Quem abriu o chamado é avisado no sino.">
            <textarea rows={4} {...campo("resposta")} />
          </Campo>
        </section>
      ) : c.resposta && (
        <section className="sec">
          <h4>Resposta do TI</h4>
          <div className="respostaTi">{c.resposta}<small>{c.respondido_por_nome} · {dataHora(c.respondido_em)}</small></div>
        </section>
      ))}
    </Gaveta>
  );
}

export default function Chamados() {
  const { pode } = useAuth();
  const ti = pode("atenderChamados");
  const { dados, erro, carregando, recarregar } = useApi("/chamados/");
  const [filtro, setFiltro] = useState("ativos");
  const [editando, setEditando] = useState(null);
  const todos = dados || [];

  const conta = (s) => todos.filter((c) => c.status === s).length;
  const lista = useMemo(() => todos.filter((c) =>
    filtro === "todos" ? true : filtro === "ativos" ? ["aberto", "em_andamento"].includes(c.status) : c.status === filtro),
  [todos, filtro]);

  return (
    <div className="pagina">
      <div className="painelTopo">
        <div>
          <h1>Sugestões e melhorias</h1>
          <p className="sub">{ti ? "Chamados da equipe para o TI — responda e mude a situação" :
            "Mande ideias, melhorias ou problemas para o TI e acompanhe a resposta"}</p>
        </div>
        <div className="olhos">
          <button className="btn p" onClick={() => setEditando({})}><Icone nome="mais" tamanho={15} /> Novo chamado</button>
        </div>
      </div>

      <div className="filtrosChamado mb">
        {[["ativos", "Em aberto", conta("aberto") + conta("em_andamento")], ["aberto", "Aguardando", conta("aberto")],
          ["em_andamento", "Em andamento", conta("em_andamento")], ["concluido", "Concluídos", conta("concluido")],
          ["recusado", "Não será feito", conta("recusado")], ["todos", "Todos", todos.length]].map(([k, r, n]) => (
          <button key={k} className={`chip${filtro === k ? " on" : ""}`} onClick={() => setFiltro(k)}>
            {r} <span className="qtd">{n}</span>
          </button>
        ))}
      </div>

      <Estado carregando={carregando && !dados} erro={erro}
              vazio={lista.length === 0 ? (todos.length ? "Nenhum chamado nesta situação." :
                "Nenhum chamado ainda. Tem uma ideia para o sistema? Clique em Novo chamado.") : null}>
        <div className="chamados">
          {lista.map((c) => (
            <button key={c.id} type="button" className={`chamado st-${c.status}`} onClick={() => setEditando(c)}>
              <div className="topo">
                <span className="num">#{c.numero}</span>
                <span className={`catTag ${c.categoria}`}>{c.categoria_display}</span>
                {c.prioridade === "alta" && <span className="urgente">Urgente</span>}
                <span className={`stTag ${c.status}`}>{c.status_display}</span>
              </div>
              <b className="tit">{c.titulo}</b>
              <p className="desc">{c.descricao}</p>
              {c.resposta && <div className="resp"><Icone nome="chamado" tamanho={13} /> {c.resposta}</div>}
              <div className="rodape">
                {ti && <span><Icone nome="usuario" tamanho={13} /> {c.autor_nome}</span>}
                {c.tela && <span>{c.tela}</span>}
                <span>{dataHora(c.criado_em)}</span>
              </div>
            </button>
          ))}
        </div>
      </Estado>

      {editando && (
        <FormChamado chamado={editando} ti={ti} aoFechar={() => setEditando(null)} aoSalvar={recarregar} />
      )}
    </div>
  );
}
