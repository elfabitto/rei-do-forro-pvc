import { useState } from "react";
import { useAuth } from "../auth";
import Icone from "../icones";

export default function Login() {
  const { entrar } = useAuth();
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [verSenha, setVerSenha] = useState(false);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function submeter(e) {
    e.preventDefault();
    setErro("");
    setEnviando(true);
    try {
      await entrar(usuario, senha);
    } catch {
      setErro("Usuário ou senha inválidos.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="login">
      <div className="card">
        <div className="marca">
          <b>REI DO <i>FORRO</i></b>
          <span>Gestão</span>
        </div>
        <form className="body" onSubmit={submeter}>
          {erro && <div className="erro">{erro}</div>}
          <label className="f">
            <span>Usuário</span>
            <input value={usuario} onChange={(e) => setUsuario(e.target.value)}
                   autoFocus autoComplete="username" />
          </label>
          <label className="f">
            <span>Senha</span>
            <div className="senhaCampo">
              <input type={verSenha ? "text" : "password"} value={senha} onChange={(e) => setSenha(e.target.value)}
                     autoComplete="current-password" />
              <button type="button" className="btn" onClick={() => setVerSenha((v) => !v)}
                      title={verSenha ? "Esconder senha" : "Mostrar senha"}
                      aria-label={verSenha ? "Esconder senha" : "Mostrar senha"} aria-pressed={verSenha}>
                <Icone nome="olho" tamanho={15} />
              </button>
            </div>
          </label>
          <button className="btn p" style={{ width: "100%" }} disabled={enviando}>
            {enviando ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
