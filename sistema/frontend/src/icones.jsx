/**
 * Ícones em SVG inline — sem biblioteca, sem fonte extra.
 *
 * Todos herdam `currentColor`, então a cor vem do contexto: cinza na navegação,
 * branco no item ativo, laranja nos destaques. Onde a cor carrega significado
 * (entrega × instalação, status), ela vem da mesma paleta validada do sistema.
 */
const base = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

const FORMAS = {
  painel: <><rect x="3" y="3" width="7" height="8" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" />
            <rect x="14" y="11" width="7" height="10" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /></>,
  orcamento: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
                <path d="M14 3v5h5" /><path d="M9 13h6M9 17h4" /></>,
  ordem: <><path d="M9 4H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2" />
            <rect x="9" y="2.5" width="6" height="4" rx="1" /><path d="M9 14l2 2 4-4" /></>,
  agenda: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" />
             <rect x="7" y="13.5" width="3" height="3" rx="0.6" /></>,
  clientes: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
               <path d="M16 11.2a3 3 0 0 0 0-6" /><path d="M18 20c0-2.6-1-4.4-2.5-5.2" /></>,
  precos: <><path d="M20.6 12.6 12.4 20.8a2 2 0 0 1-2.8 0l-6.4-6.4a2 2 0 0 1-.6-1.4V5a2 2 0 0 1 2-2h8a2 2 0 0 1 1.4.6l6.6 6.6a2 2 0 0 1 0 2.4z" />
             <circle cx="7.5" cy="7.5" r="1.3" /></>,
  menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
  fechar: <><path d="M6 6l12 12M18 6L6 18" /></>,
  mais: <><path d="M12 5v14M5 12h14" /></>,
  imagem: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9.5" r="1.8" />
             <path d="m3.5 17 5-5 4.5 4.5L16 14l4.5 4.5" /></>,
  copiar: <><rect x="8" y="8" width="13" height="13" rx="2" />
             <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></>,
  baixar: <><path d="M12 3v12M7.5 10.5 12 15l4.5-4.5" /><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></>,
  whatsapp: <><path d="M3.5 20.5 5 16.4A8 8 0 1 1 8.2 19.4z" />
               <path d="M9 9.5c0 3 2.5 5.5 5.5 5.5.6 0 1-.5 1-1l-1.3-.8-1 1a6 6 0 0 1-2.4-2.4l1-1L11 9.5c0-.5-.4-1-1-1-.5 0-1 .4-1 1z" /></>,
  salvar: <><path d="M5 3h11l3 3v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
             <path d="M8 3v6h7V3M8 17h8" /></>,
  fechado: <><circle cx="12" cy="12" r="9" /><path d="m8.5 12.2 2.5 2.5 4.5-5" /></>,
  entrega: <><rect x="1.5" y="6.5" width="13" height="9" rx="1.5" /><path d="M14.5 10h3.2l2.8 3v2.5h-6z" />
              <circle cx="6" cy="18" r="1.8" /><circle cx="17" cy="18" r="1.8" /></>,
  instalacao: <><path d="M15.5 3a5 5 0 0 0-4.6 7l-7 7a1.8 1.8 0 0 0 2.5 2.5l7-7a5 5 0 0 0 6-6.4L16.3 9 14 6.7l2.9-3.5a5 5 0 0 0-1.4-.2z" /></>,
  dinheiro: <><rect x="2.5" y="6" width="19" height="12" rx="2" /><circle cx="12" cy="12" r="2.8" />
               <path d="M6 10v4M18 10v4" /></>,
  calendario: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  relogio: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5.2l3.2 2" /></>,
  area: <><rect x="3.5" y="3.5" width="17" height="17" rx="1.5" strokeDasharray="3 2.4" />
           <path d="M8 16V9h7" /></>,
  usuario: <><circle cx="12" cy="8" r="3.6" /><path d="M4.5 20c0-3.8 3.4-6.2 7.5-6.2s7.5 2.4 7.5 6.2" /></>,
  local: <><path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z" /><circle cx="12" cy="10" r="2.6" /></>,
  sair: <><path d="M14 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h8" /><path d="m16 15 4-3-4-3M20 12H9" /></>,
  grafico: <><path d="M4 20V4" /><path d="M4 20h16" /><rect x="8" y="12" width="3" height="5" rx="0.8" />
              <rect x="13.5" y="8" width="3" height="9" rx="0.8" /></>,
  editar: <><path d="M4 20h4l10-10a2.8 2.8 0 0 0-4-4L4 16z" /><path d="M13.5 6.5 17.5 10.5" /></>,
  olho: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
           <circle cx="12" cy="12" r="3" /></>,
  comissao: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5h5M9.5 14.5h5" />
               <path d="M10.5 7v10M13.5 7v10" /></>,
  enviar: <><path d="M21 3 10.5 13.5" /><path d="M21 3l-6.8 18-3.7-7.5L3 9.8z" /></>,
};

export default function Icone({ nome, tamanho = 18, className = "", ...resto }) {
  const forma = FORMAS[nome];
  if (!forma) return null;
  return (
    <svg className={`ic ${className}`} width={tamanho} height={tamanho} viewBox="0 0 24 24"
         aria-hidden="true" focusable="false" {...base} {...resto}>
      {forma}
    </svg>
  );
}
