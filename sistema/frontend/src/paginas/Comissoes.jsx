/**
 * Comissões — controle da diretoria.
 *
 * A regra é simples e única: R$ 2,00 por m² orçado para quem trouxe o cliente,
 * devida quando o serviço é finalizado. "Em aberto" é o que ainda falta
 * repassar; a baixa é manual, feita aqui, e registra quem deu e quando.
 */
import { useState } from "react";
import { api, brl, dataHora, num } from "../api";
import { useAuth } from "../auth";
import { BotaoAcao, Confirmacao, Estado, Etiqueta, linhas, useApi } from "../componentes";
import Icone from "../icones";
import OrdemDetalhe from "./OrdemDetalhe";

const FILTROS = [
  ["aberto", "A pagar"],
  ["pago", "Pagas"],
  ["", "Todas"],
];

export default function Comissoes() {
  const { pode } = useAuth();
  const [situacao, setSituacao] = useState("aberto");
  const [vendedor, setVendedor] = useState("");
  const [aberta, setAberta] = useState(null);
  const [baixando, setBaixando] = useState(null);
  const [erro, setErro] = useState("");

  const params = { ...(situacao ? { situacao } : {}), ...(vendedor ? { vendedor } : {}) };
  const { dados, erro: erroApi, carregando, recarregar } =
    useApi("/comissoes/", params, [situacao, vendedor]);

  const resumo = dados?.resumo;
  const porVendedor = dados?.por_vendedor ?? [];
  const itens = dados?.itens ?? [];

  async function darBaixa() {
    setErro("");
    try {
      await api.post(`/ordens-servico/${baixando.id}/pagar_comissao/`, {});
      setBaixando(null);
      recarregar();
      return "paga";
    } catch (e) {
      setErro(e.message);
      throw e;
    }
  }

  async function estornar(item) {
    setErro("");
    try {
      await api.post(`/ordens-servico/${item.id}/estornar_comissao/`, {});
      recarregar();
      return "estornada";
    } catch (e) {
      setErro(e.message);
      throw e;
    }
  }

  return (
    <div className="pagina">
      <div className="paginaTopo">
        <div>
          <h1>Comissões</h1>
          <p className="sub">
            R$ {num(dados?.por_m2 ?? 2)} por m² de cada serviço finalizado, para quem trouxe o cliente
          </p>
        </div>
      </div>

      {erro && <div className="erro">{erro}</div>}

      <Estado carregando={carregando} erro={erroApi}>
        <div className="comResumo">
          <div className="comCard aberto">
            <span>Em aberto a pagar</span>
            <b>{brl(resumo?.aberto)}</b>
            <small>serviços finalizados ainda não repassados</small>
          </div>
          <div className="comCard pago">
            <span>Já pago</span>
            <b>{brl(resumo?.pago)}</b>
            <small>com baixa registrada</small>
          </div>
          <div className="comCard">
            <span>Serviços finalizados</span>
            <b>{resumo?.servicos ?? 0}</b>
            <small>base do cálculo</small>
          </div>
        </div>

        {porVendedor.length > 0 && (
          <div className="card" style={{ marginBottom: 18 }}>
            <header><h2>Por pessoa</h2></header>
            <div className="tw">
              <table>
                <thead>
                  <tr><th>Quem trouxe</th><th className="num">Serviços</th>
                    <th className="num">A pagar</th><th className="num">Já pago</th></tr>
                </thead>
                <tbody>
                  {porVendedor.map((v) => (
                    <tr key={v.vendedor}
                        className={String(vendedor) === String(v.vendedor) ? "linhaAtrasada" : ""}
                        style={{ cursor: "pointer" }}
                        onClick={() => setVendedor(String(vendedor) === String(v.vendedor) ? "" : String(v.vendedor))}>
                      <td><b>{v.nome}</b></td>
                      <td className="num">{v.ordens}</td>
                      <td className="num" style={{ color: "var(--orange-dk)", fontWeight: 700 }}>
                        {brl(v.aberto)}
                      </td>
                      <td className="num">{brl(v.pago)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {vendedor && (
              <p className="nota" style={{ padding: "0 16px 14px" }}>
                Filtrando por uma pessoa.{" "}
                <button className="lnk" onClick={() => setVendedor("")}>mostrar todos</button>
              </p>
            )}
          </div>
        )}

        <div className="barraFiltros">
          {FILTROS.map(([k, r]) => (
            <button key={k} className={`chip${situacao === k ? " on" : ""}`}
                    onClick={() => setSituacao(k)}>{r}</button>
          ))}
          <span className="contagem">{itens.length} serviço(s)</span>
        </div>

        <div className="card">
          <Estado vazio={itens.length === 0 ? "Nenhuma comissão com esse filtro." : null}>
            <div className="tw">
              <table>
                <thead>
                  <tr><th>Serviço</th><th>Cliente</th><th>Quem trouxe</th>
                    <th className="num">Área</th><th className="num">Comissão</th>
                    <th>Finalizado</th><th>Situação</th><th /></tr>
                </thead>
                <tbody>
                  {itens.map((i) => (
                    <tr key={i.id}>
                      <td>
                        <button className="lnk" onClick={() => setAberta(i.id)}>{i.numero}</button>
                        <div className="sub2">{i.tipo_display}</div>
                      </td>
                      <td>{i.cliente}</td>
                      <td>{i.vendedor_nome}</td>
                      <td className="num">{num(i.area_m2)} m²</td>
                      <td className="num"><b>{brl(i.valor)}</b></td>
                      <td className="compacto">{dataHora(i.finalizada_em)}</td>
                      <td>
                        <Etiqueta status={i.paga ? "finalizada" : "gerada"}
                                  rotulo={i.paga ? "Paga" : "A pagar"} />
                        {i.paga && <div className="sub2">{dataHora(i.paga_em)}</div>}
                      </td>
                      <td>
                        {pode("cancelarOS") && (
                          i.paga ? (
                            <BotaoAcao aoClicar={() => estornar(i)}>Estornar</BotaoAcao>
                          ) : (
                            <button className="btn verde" onClick={() => setBaixando(i)}>
                              <Icone nome="dinheiro" tamanho={15} /> Dar baixa
                            </button>
                          )
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Estado>
        </div>
      </Estado>

      {aberta && (
        <OrdemDetalhe id={aberta} aoFechar={() => setAberta(null)} aoMudar={recarregar} />
      )}
      {baixando && (
        <Confirmacao
          titulo="Dar baixa na comissão"
          subtitulo={`${baixando.numero} — ${baixando.vendedor_nome}`}
          aviso={`Confirma o repasse de ${brl(baixando.valor)} referente a ${num(baixando.area_m2)} m²?
                  Fica registrado quem deu a baixa e quando.`}
          rotulo="Confirmar pagamento"
          classe="btn verde"
          aoFechar={() => setBaixando(null)}
          aoConfirmar={darBaixa}
        />
      )}
    </div>
  );
}
