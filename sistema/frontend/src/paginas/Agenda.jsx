import { useMemo, useState } from "react";
import { data } from "../api";
import { Estado, linhas, useApi } from "../componentes";
import Icone from "../icones";
import OrdemDetalhe from "./OrdemDetalhe";

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default function Agenda() {
  const [offset, setOffset] = useState(0);
  const [aberta, setAberta] = useState(null);

  const { inicio, fim, ref } = useMemo(() => {
    const hoje = new Date();
    const ref = new Date(hoje.getFullYear(), hoje.getMonth() + offset, 1);
    const fim = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
    return { inicio: iso(ref), fim: iso(fim), ref };
  }, [offset]);

  const disp = useApi("/agenda/disponibilidade/", { de: inicio, ate: fim }, [inicio, fim]);
  const ags = useApi("/agendamentos/", { de: inicio, ate: fim, page_size: 200 }, [inicio, fim]);

  const porDia = useMemo(() => {
    const m = {};
    for (const a of linhas(ags.dados)) (m[a.data] ??= []).push(a);
    return m;
  }, [ags.dados]);

  const hoje = iso(new Date());
  const dias = disp.dados?.dias ?? [];
  const vazios = ref.getDay();

  const totalMes = linhas(ags.dados).length;

  return (
    <div className="pagina">
      <h1>Agenda</h1>
      <p className="sub">Entregas e instalações por turno — clique num compromisso para abrir a O.S.</p>

      <div className="card">
        <header>
          <h2>{ref.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</h2>
          <span className="hint">{totalMes} compromisso(s) no mês</span>
          <div className="filtros">
            <button className="btn" onClick={() => setOffset((o) => o - 1)}>←</button>
            <button className="btn" onClick={() => setOffset(0)}>Hoje</button>
            <button className="btn" onClick={() => setOffset((o) => o + 1)}>→</button>
          </div>
        </header>

        <div className="body">
          <div className="legend">
            <span><i style={{ background: "var(--s-entrega)" }} />Entrega</span>
            <span><i style={{ background: "var(--s-instalacao)" }} />Instalação</span>
            <span style={{ color: "var(--muted)", fontWeight: 500 }}>
              2 vagas por turno · domingo não é agendável
            </span>
          </div>

          <Estado carregando={disp.carregando || ags.carregando} erro={disp.erro || ags.erro}>
            <div className="cal">
              {DIAS.map((d) => <div className="hd" key={d}>{d}</div>)}
              {Array.from({ length: vazios }, (_, i) => <div className="dy off" key={`v${i}`} />)}

              {dias.map((dia) => {
                const eventos = porDia[dia.data] ?? [];
                const livre = dia.livre_total ?? 0;
                return (
                  <div key={dia.data}
                       className={`dy${dia.data === hoje ? " hoje" : ""}${dia.atende ? "" : " off"}`}>
                    <div className="n">{Number(dia.data.slice(-2))}</div>

                    {eventos.map((e) => (
                      <button className={`ev ${e.tipo}${e.atrasado ? " atrasado" : ""}`} key={e.id}
                              onClick={() => setAberta(e.ordem)}
                              title={`${e.os_numero} · ${e.tipo_display} ${e.turno_display}
`
                                     + `${e.cliente_nome} — ${e.bairro}`}>
                        <Icone nome={e.tipo === "entrega" ? "entrega" : "instalacao"} tamanho={12} />
                        {" "}{e.turno_display} · {String(e.cliente_nome ?? "").split(" ")[0]}
                      </button>
                    ))}

                    {dia.atende && (
                      <div className={`vaga${livre ? "" : " cheio"}`}>
                        {livre ? `${livre} vaga${livre === 1 ? "" : "s"}` : "lotado"}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Estado>
        </div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <header><h2>Compromissos do mês</h2></header>
        <Estado carregando={ags.carregando} erro={ags.erro}
                vazio={totalMes === 0 ? "Nada agendado neste mês." : null}>
          <div className="tw">
            <table>
              <thead>
                <tr><th>Data</th><th>Turno</th><th>Tipo</th><th>Cliente</th>
                  <th>Bairro</th><th>Endereço</th><th>O.S.</th><th /></tr>
              </thead>
              <tbody>
                {linhas(ags.dados).map((a) => (
                  <tr key={a.id} className={a.atrasado ? "linhaAtrasada" : ""}
                      onClick={() => setAberta(a.ordem)} style={{ cursor: "pointer" }}>
                    <td>
                      {data(a.data)}
                      {a.atrasado && <div className="sub2 atraso">atrasado</div>}
                    </td>
                    <td>{a.turno_display}</td>
                    <td><span className={`pill p-${a.tipo}`}>{a.tipo_display}</span></td>
                    <td><b>{a.cliente_nome}</b><div className="sub2">{a.cliente_telefone}</div></td>
                    <td>{a.bairro}</td>
                    <td className="compacto">{a.endereco_resumo}</td>
                    <td className="compacto">{a.os_numero}</td>
                    <td><button className="lnk">ver detalhes</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Estado>
      </div>

      {aberta && (
        <OrdemDetalhe id={aberta} aoFechar={() => setAberta(null)}
                      aoMudar={() => { disp.recarregar(); ags.recarregar(); }} />
      )}
    </div>
  );
}
