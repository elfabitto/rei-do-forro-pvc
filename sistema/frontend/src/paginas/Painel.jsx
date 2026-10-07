import { brl, data, num } from "../api";
import { useAuth } from "../auth";
import { Estado, Pilula, linhas, useApi } from "../componentes";
import Icone from "../icones";

/* Colunas empilhadas: convertidos em laranja, o resto em cinza de recuo.
   É a forma de "ênfase" — uma cor e um cinza —, não uma paleta categórica. */
function GraficoConversao({ semanas }) {
  const max = Math.max(...semanas.map((s) => s.total), 1);
  const topo = Math.ceil(max / 5) * 5 || 5;
  const ticks = [0, topo / 2, topo];

  return (
    <>
      <div className="legend">
        <span><i style={{ background: "var(--orange)" }} />Convertidos em O.S.</span>
        <span><i style={{ background: "var(--deemph)" }} />Ainda abertos ou perdidos</span>
      </div>

      <div className="chart">
        <div className="plot">
          {ticks.map((t) => (
            <div key={t} className="gl" style={{ bottom: `${(t / topo) * 100}%` }}>
              <span>{num(t, 0)}</span>
            </div>
          ))}
          <div className="bars">
            {semanas.map((s) => {
              const resto = s.total - s.convertidos;
              const titulo = `Semana de ${data(s.inicio)}: ${s.convertidos} de ${s.total} convertidos`;
              return (
                <div className="bar" key={s.inicio} title={titulo}>
                  {resto > 0 && (
                    <div className="seg rest top" style={{ height: `${(resto / topo) * 100}%` }} />
                  )}
                  <div className={`seg conv${resto > 0 ? "" : " top"}`}
                       style={{ height: `${(s.convertidos / topo) * 100}%` }} />
                </div>
              );
            })}
          </div>
        </div>
        <div className="xaxis">
          {semanas.map((s, i) => (
            <span key={s.inicio}>{i === semanas.length - 1 ? "esta sem." : data(s.inicio).slice(0, 5)}</span>
          ))}
        </div>
      </div>

      <details style={{ marginTop: 16 }}>
        <summary style={{ cursor: "pointer", fontSize: 12, color: "var(--muted)" }}>Ver tabela</summary>
        <div className="tw">
          <table>
            <thead><tr><th>Semana</th><th className="num">Orçamentos</th>
              <th className="num">Convertidos</th><th className="num">Taxa</th></tr></thead>
            <tbody>
              {semanas.map((s) => (
                <tr key={s.inicio}>
                  <td>{data(s.inicio)} a {data(s.fim)}</td>
                  <td className="num">{s.total}</td>
                  <td className="num">{s.convertidos}</td>
                  <td className="num">{s.total ? Math.round((s.convertidos / s.total) * 100) + "%" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}

function Comissoes({ itens }) {
  const max = Math.max(...itens.map((i) => Number(i.valor)), 1);
  return (
    <div className="rank">
      {itens.map((i) => (
        <div className="rk" key={i.usuario}>
          <div className="nm">{i.usuario}</div>
          <div className="tr"><div className="fl" style={{ width: `${(i.valor / max) * 100}%` }} /></div>
          <div className="vl">{brl(i.valor)}</div>
        </div>
      ))}
    </div>
  );
}

export default function Painel() {
  const { pode } = useAuth();
  const painel = useApi("/painel/");
  const proximos = useApi("/agendamentos/", { ordering: "data", page_size: 6 });

  return (
    <div className="pagina">
      <h1>Painel</h1>
      <p className="sub">Visão geral da operação</p>

      <Estado carregando={painel.carregando} erro={painel.erro}>
        {painel.dados && (
          <>
            <div className="cols c-4 mb">
              <div className="tile">
                <div className="lab"><Icone nome="orcamento" tamanho={14} className="ic-azul" /> Orçamentos no mês</div>
                <div className="val">{painel.dados.orcamentos_mes}</div>
                <div className="dl">{painel.dados.convertidos_mes} viraram O.S.</div>
              </div>
              <div className="tile">
                <div className="lab"><Icone nome="grafico" tamanho={14} className="ic-laranja" /> Taxa de conversão</div>
                <div className="val hero">{painel.dados.taxa_conversao}%</div>
                <div className="dl">no mês corrente</div>
              </div>
              <div className="tile">
                <div className="lab"><Icone nome="ordem" tamanho={14} className="ic-laranja" /> O.S. em andamento</div>
                <div className="val">{painel.dados.os_geradas + painel.dados.os_em_execucao}</div>
                <div className="dl">
                  {painel.dados.os_geradas} gerada(s) · {painel.dados.os_em_execucao} em execução
                </div>
              </div>
              {painel.dados.financeiro ? (
                <div className="tile">
                  <div className="lab"><Icone nome="dinheiro" tamanho={14} className="ic-verde" /> A receber</div>
                  <div className="val">{brl(painel.dados.financeiro.a_receber)}</div>
                  <div className="dl">Recebido no mês: {brl(painel.dados.financeiro.faturado_mes)}</div>
                </div>
              ) : (
                <div className="tile">
                  <div className="lab"><Icone nome="dinheiro" tamanho={14} /> Financeiro</div>
                  <div className="val" style={{ fontSize: 18, color: "var(--muted)" }}>restrito</div>
                  <div className="dl">Valores totais são exclusivos da diretoria</div>
                </div>
              )}
            </div>

            <div className="cols c-2 mb">
              <div className="card">
                <header><h2>Orçamentos e conversão</h2><span className="hint">últimas 6 semanas</span></header>
                <div className="body"><GraficoConversao semanas={painel.dados.semanas} /></div>
              </div>

              {pode("verFinanceiro") && painel.dados.comissoes && (
                <div className="card">
                  <header><h2>Por quem trouxe o cliente</h2><span className="hint">base da comissão</span></header>
                  <div className="body"><Comissoes itens={painel.dados.comissoes} /></div>
                </div>
              )}
            </div>
          </>
        )}
      </Estado>

      <div className="card">
        <header><h2>Próximos compromissos</h2></header>
        <Estado carregando={proximos.carregando} erro={proximos.erro}
                vazio={linhas(proximos.dados).length === 0 ? "Nada agendado." : null}>
          <div className="tw">
            <table>
              <thead><tr><th>Quando</th><th>Turno</th><th>Tipo</th><th>O.S.</th></tr></thead>
              <tbody>
                {linhas(proximos.dados).map((a) => (
                  <tr key={a.id}>
                    <td>{data(a.data)}</td>
                    <td>{a.turno_display}</td>
                    <td><Pilula tipo={a.tipo} rotulo={a.tipo_display} /></td>
                    <td>{a.ordem}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Estado>
      </div>
    </div>
  );
}
