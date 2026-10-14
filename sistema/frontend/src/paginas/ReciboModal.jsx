/**
 * Recibo do cliente: abre logo depois de finalizar a O.S. e fica disponível
 * no detalhe de toda O.S. finalizada, para reenviar quando precisar.
 */
import { useEffect, useMemo, useState } from "react";
import { BotaoAcao, Modal } from "../componentes";
import Icone from "../icones";
import {
  baixarReciboPDF, baixarReciboPNG, enviarRecibo, montarRecibo, previaRecibo, whatsDoCliente,
} from "../reciboDoc";

export default function ReciboModal({ os, aoFechar, recemFinalizada = false }) {
  const d = useMemo(() => montarRecibo(os), [os]);
  const [imagem, setImagem] = useState("");

  useEffect(() => {
    let vivo = true;
    previaRecibo(d).then((url) => vivo && setImagem(url));
    return () => { vivo = false; };
  }, [d]);

  const temWhats = Boolean(whatsDoCliente(d.telefone));

  return (
    <Modal
      titulo={recemFinalizada ? "Serviço finalizado ✓" : `Recibo ${os.numero}`}
      subtitulo={recemFinalizada
        ? `Recibo de ${os.cliente_detalhe?.nome ?? "cliente"} pronto para enviar.`
        : "Reenvie ou baixe o recibo do cliente."}
      aoFechar={aoFechar}
      largura={560}
      rodape={
        <div className="btnrow" style={{ padding: 0 }}>
          <button className="btn" onClick={aoFechar}>Fechar</button>
        </div>
      }
    >
      <div className="recibo-acoes">
        <BotaoAcao classe="btn zap" aoClicar={() => enviarRecibo(d, "pdf")}
                   titulo={temWhats ? `WhatsApp ${d.telefone}` : "Cliente sem telefone cadastrado"}>
          <Icone nome="whatsapp" tamanho={15} /> Enviar ao cliente
        </BotaoAcao>
        <BotaoAcao aoClicar={() => baixarReciboPDF(d)}>
          <Icone nome="baixar" tamanho={15} /> Baixar PDF
        </BotaoAcao>
        <BotaoAcao aoClicar={() => baixarReciboPNG(d)}>
          <Icone nome="imagem" tamanho={15} /> Baixar imagem
        </BotaoAcao>
      </div>
      <p className="nota" style={{ marginTop: 6 }}>
        No celular, <b>Enviar ao cliente</b> abre o compartilhamento com o PDF anexado — é só
        escolher a conversa. No computador, o PDF é baixado e a conversa
        {temWhats ? ` com ${d.telefone}` : ""} abre no WhatsApp Web para anexar.
      </p>

      <div className="recibo-previa">
        {imagem ? <img src={imagem} alt={`Recibo ${os.numero}`} /> : <p className="nada">Gerando…</p>}
      </div>
    </Modal>
  );
}
