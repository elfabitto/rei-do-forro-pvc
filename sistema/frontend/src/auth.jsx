import { createContext, useContext, useEffect, useState } from "react";
import { api } from "./api";
import { desligarAparelho, sincronizar } from "./push";

const Ctx = createContext(null);

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    if (!api.autenticado()) { setCarregando(false); return; }
    api.get("/eu/")
      .then(setUsuario)
      .catch(() => api.sair())
      .finally(() => setCarregando(false));
  }, []);

  // logado: se o aparelho já tinha permissão de notificar, passa a avisar esta pessoa
  useEffect(() => { if (usuario) sincronizar(); }, [usuario?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const entrar = async (u, s) => setUsuario(await api.entrar(u, s));
  const sair = async () => { await desligarAparelho(); api.sair(); setUsuario(null); };

  /* `pode` lê as permissões que o backend calculou — a interface nunca decide
     sozinha o que o usuário pode fazer, só espelha a regra do servidor. */
  const pode = (acao) => Boolean(usuario?.permissoes?.[acao]);

  return (
    <Ctx.Provider value={{ usuario, carregando, entrar, sair, pode }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
