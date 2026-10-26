/**
 * Usuários — cadastro da equipe, exclusivo da diretoria.
 *
 * Ninguém é apagado: desativar tira o acesso e mantém o nome nos orçamentos,
 * O.S. e comissões antigas. A senha só é digitada, nunca mostrada.
 */
import { useMemo, useState } from "react";
import { api, dataHora } from "../api";
import { useAuth } from "../auth";
import { BotaoAcao, Campo, Estado, Gaveta, useApi } from "../componentes";
import Icone from "../icones";
import Telefone from "../Telefone";
import { erroEmail, erroTelefone, nomeProprio, telefone } from "../mascaras";

const PAPEIS = [
  { valor: "diretor", rotulo: "Diretor", plural: "Diretores",
    dica: "Tudo: painel, financeiro, finaliza e cancela O.S., dá baixa em comissões, cadastra usuários." },
  { valor: "ti", rotulo: "TI", plural: "TI",
    dica: "O mesmo acesso da diretoria e, só ele, atende e responde os chamados." },
  { valor: "administrativo", rotulo: "Administrativo", plural: "Administrativos",
    dica: "Vê todas as vendas e o financeiro; não finaliza O.S. nem cadastra usuários." },
  { valor: "vendedor", rotulo: "Vendedor", plural: "Vendedores",
    dica: "Faz orçamentos e O.S.; vê só as próprias comissões." },
];
const ROTULO = Object.fromEntries(PAPEIS.map((p) => [p.valor, p.rotulo]));

function FormUsuario({ usuario, eu, aoFechar, aoSalvar }) {
  const novo = !usuario?.id;
  const [u, setU] = useState(() => usuario?.id ? { ...usuario, senha: "" }
    : { first_name: "", last_name: "", username: "", email: "", telefone: "", papel: "vendedor", is_active: true, senha: "" });
  const [ver, setVer] = useState(false);
  const [erro, setErro] = useState("");
  const [erros, setErros] = useState({});
  const souEu = !novo && u.id === eu.id;
  const campo = (k, { mascara, aoSair } = {}) => ({
    value: u[k] ?? "",
    onChange: (e) => {
      const v = mascara ? mascara(e.target.value) : e.target.value;
      setU((s) => ({ ...s, [k]: v }));
      if (erros[k]) setErros((x) => ({ ...x, [k]: undefined }));
    },
    onBlur: aoSair ? () => setU((s) => ({ ...s, [k]: aoSair(s[k]) })) : undefined,
    "aria-invalid": erros[k] ? true : undefined,
  });

  async function salvar() {
    setErro("");
    try {
      const e = {};
      if (!u.first_name.trim()) e.first_name = "Informe o nome.";
      if (u.username.trim().length < 3) e.username = "Login com pelo menos 3 letras.";
      if (novo && u.senha.length < 8) e.senha = "Mínimo 8 caracteres.";
      if (!novo && u.senha && u.senha.length < 8) e.senha = "Mínimo 8 caracteres.";
      const tel = erroTelefone(u.telefone, false);
      if (tel) e.telefone = tel;
      const mail = erroEmail(u.email);
      if (mail) e.email = mail;
      setErros(e);
      if (Object.keys(e).length) throw new Error("Confira os campos destacados.");
      const corpo = { first_name: nomeProprio(u.first_name), last_name: nomeProprio(u.last_name), username: u.username.trim(),
                      email: u.email.trim(), telefone: u.telefone.trim(), papel: u.papel, is_active: u.is_active };
      if (u.senha) corpo.senha = u.senha;
      if (novo) await api.post("/usuarios/", corpo);
      else await api.patch(`/usuarios/${u.id}/`, corpo);
      aoSalvar();
      aoFechar();
      return "salvo";
    } catch (e) {
      const d = e.dados && typeof e.dados === "object" && !e.dados.detail ? e.dados : null;
      if (d) setErros(Object.fromEntries(Object.entries(d).map(([k, v]) => [k === "senha" ? "senha" : k, [].concat(v).join(" ")])));
      setErro(d ? "Confira os campos destacados." : e.message);
      throw e;
    }
  }

  return (
    <Gaveta titulo={novo ? "Novo usuário" : u.nome || u.username} aoFechar={aoFechar}
            rodape={
              <div className="btnrow">
                <BotaoAcao classe="btn p" aoClicar={salvar}>{novo ? "Cadastrar" : "Salvar"}</BotaoAcao>
                <button className="btn" onClick={aoFechar}>Cancelar</button>
              </div>
            }>
      <section className="sec">
        <h4>Dados</h4>
        {erro && <div className="erro">{erro}</div>}
        <div className="two">
          <Campo rotulo="Nome" obrigatorio erro={erros.first_name}>
            <input {...campo("first_name", { aoSair: nomeProprio })} autoFocus={novo} maxLength={150} />
          </Campo>
          <Campo rotulo="Sobrenome"><input {...campo("last_name", { aoSair: nomeProprio })} maxLength={150} /></Campo>
        </div>
        <div className="two">
          <Campo rotulo="Telefone (WhatsApp)" erro={erros.telefone}>
            <input {...campo("telefone", { mascara: telefone })} inputMode="tel" placeholder="(94) 99999-0000" />
          </Campo>
          <Campo rotulo="E-mail" erro={erros.email}>
            <input type="email" inputMode="email" autoCapitalize="none" {...campo("email")} />
          </Campo>
        </div>
      </section>

      <section className="sec">
        <h4>Acesso</h4>
        <Campo rotulo="Login" obrigatorio erro={erros.username}
               dica="Letras minúsculas e números, sem espaço nem acento (ex.: jessica).">
          <input {...campo("username", { mascara: (v) => v.toLowerCase().normalize("NFD").replace(/[^a-z0-9._]/g, "").slice(0, 30) })}
                 autoCapitalize="none" autoCorrect="off" spellCheck={false} />
        </Campo>
        <Campo rotulo={novo ? "Senha inicial" : "Nova senha"} obrigatorio={novo} erro={erros.senha}
               dica={novo ? "Mínimo 8 caracteres; passe para a pessoa trocar depois."
                 : "Deixe em branco para manter a senha atual."}>
          <div className="senhaCampo">
            <input type={ver ? "text" : "password"} {...campo("senha")} autoComplete="new-password" />
            <button type="button" className="btn" onClick={() => setVer((v) => !v)} title={ver ? "Esconder" : "Mostrar"}>
              <Icone nome="olho" tamanho={15} />
            </button>
          </div>
        </Campo>
        <Campo rotulo="Função">
          <div className="papeis">
            {PAPEIS.map((p) => (
              <button key={p.valor} type="button" disabled={souEu && !["diretor", "ti"].includes(p.valor)}
                      className={`${p.valor}${u.papel === p.valor ? " on" : ""}`}
                      onClick={() => setU((s) => ({ ...s, papel: p.valor }))}>
                <b>{p.rotulo}</b><small>{p.dica}</small>
              </button>
            ))}
          </div>
        </Campo>
        {!novo && (
          <label className="check">
            <input type="checkbox" checked={u.is_active} disabled={souEu}
                   onChange={(e) => setU((s) => ({ ...s, is_active: e.target.checked }))} />
            Acesso ativo {souEu && <small style={{ color: "var(--muted)" }}>(você não pode desativar o próprio acesso)</small>}
          </label>
        )}
      </section>
    </Gaveta>
  );
}

export default function Usuarios() {
  const { usuario: eu } = useAuth();
  const [inativos, setInativos] = useState(false);
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState(null);
  const { dados, erro, carregando, recarregar } = useApi("/usuarios/", { todos: 1 });

  const todos = dados || [];
  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const ordem = { diretor: 0, ti: 1, administrativo: 2, vendedor: 3 };
    return todos
      .filter((u) => (inativos || u.is_active) && (!q || `${u.nome} ${u.username} ${u.email}`.toLowerCase().includes(q)))
      .sort((a, b) => (b.is_active - a.is_active) || (ordem[a.papel] ?? 9) - (ordem[b.papel] ?? 9) || a.nome.localeCompare(b.nome));
  }, [todos, inativos, busca]);
  const ativos = todos.filter((u) => u.is_active);
  const qtd = (p) => ativos.filter((u) => u.papel === p).length;

  return (
    <div className="pagina">
      <div className="painelTopo">
        <div>
          <h1>Usuários</h1>
          <p className="sub">Quem acessa o sistema e o que cada um pode fazer</p>
        </div>
        <div className="olhos">
          <button className="btn p" onClick={() => setEditando({})}><Icone nome="mais" tamanho={15} /> Novo usuário</button>
        </div>
      </div>

      <div className="resumoPapeis mb">
        {PAPEIS.map((p) => (
          <div key={p.valor} className={`rp ${p.valor}`}><b>{qtd(p.valor)}</b><span>{qtd(p.valor) === 1 ? p.rotulo : p.plural}</span></div>
        ))}
        <div className="rp inativo"><b>{todos.length - ativos.length}</b><span>{todos.length - ativos.length === 1 ? "Inativo" : "Inativos"}</span></div>
      </div>

      <div className="card">
        <header>
          <h2>Equipe</h2>
          <div className="filtros">
            <label className="check" style={{ margin: 0 }}>
              <input type="checkbox" checked={inativos} onChange={(e) => setInativos(e.target.checked)} /> Mostrar inativos
            </label>
            <input className="busca" value={busca} placeholder="Buscar nome ou login" onChange={(e) => setBusca(e.target.value)} />
          </div>
        </header>
        <Estado carregando={carregando} erro={erro} vazio={lista.length === 0 ? "Ninguém encontrado." : null}>
          <div className="tw">
            <table className="usuTab">
              <thead><tr><th>Nome</th><th>Login</th><th>Função</th><th>Contato</th><th>Último acesso</th><th>Situação</th></tr></thead>
              <tbody>
                {lista.map((u) => (
                  <tr key={u.id} className={u.is_active ? "" : "inativo"} onClick={() => setEditando(u)} title="Clique para editar">
                    <td>
                      <span className="usuNome">
                        <span className={`avatarMini ${u.papel}`}>{(u.nome || u.username).split(" ").slice(0, 2).map((p) => p[0]).join("").toUpperCase()}</span>
                        <b>{u.nome}</b>{u.id === eu.id && <small className="voce">você</small>}
                      </span>
                    </td>
                    <td className="mono">{u.username}</td>
                    <td><span className={`papelTag ${u.papel}`}>{u.papel_display || ROTULO[u.papel] || u.papel}</span></td>
                    <td>{u.telefone ? <Telefone numero={u.telefone} /> : "—"}{u.email && <div className="sub2">{u.email}</div>}</td>
                    <td>{u.last_login ? dataHora(u.last_login) : <span style={{ color: "var(--muted)" }}>nunca entrou</span>}</td>
                    <td>{u.is_active ? <span className="tag t-finalizada">Ativo</span> : <span className="tag t-perdido">Inativo</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Estado>
      </div>

      {editando && <FormUsuario usuario={editando} eu={eu} aoFechar={() => setEditando(null)} aoSalvar={recarregar} />}
    </div>
  );
}
