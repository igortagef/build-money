/**
 * Bancos brasileiros comuns, para o seletor ao cadastrar uma conta.
 *
 * IMPORTANTE: NÃO usamos os logotipos oficiais (são marcas registradas). Cada
 * banco é representado pela sua COR de marca + uma SIGLA curta — reconhecível de
 * relance, sem reproduzir a marca. Dado puro; pode ser usado no cliente.
 */
export type Banco = {
  id: string;
  nome: string;
  cor: string; // cor de fundo do ícone (aproximada à identidade)
  corTexto?: string; // texto sobre a cor (padrão branco)
  sigla: string; // 2–3 caracteres
};

export const BANCOS: Banco[] = [
  { id: "nubank", nome: "Nubank", cor: "#820AD1", sigla: "Nu" },
  { id: "itau", nome: "Itaú", cor: "#EC7000", sigla: "It" },
  { id: "bradesco", nome: "Bradesco", cor: "#CC092F", sigla: "Bra" },
  { id: "santander", nome: "Santander", cor: "#EC0000", sigla: "St" },
  { id: "bb", nome: "Banco do Brasil", cor: "#FAE128", corTexto: "#0038A8", sigla: "BB" },
  { id: "caixa", nome: "Caixa", cor: "#1C5FA8", sigla: "CX" },
  { id: "inter", nome: "Inter", cor: "#FF7A00", sigla: "In" },
  { id: "c6", nome: "C6 Bank", cor: "#242424", sigla: "C6" },
  { id: "btg", nome: "BTG Pactual", cor: "#04162E", sigla: "BTG" },
  { id: "picpay", nome: "PicPay", cor: "#11C76F", sigla: "PP" },
  { id: "mercadopago", nome: "Mercado Pago", cor: "#009EE3", sigla: "MP" },
  { id: "sicoob", nome: "Sicoob", cor: "#003641", sigla: "Sic" },
  { id: "sicredi", nome: "Sicredi", cor: "#3B7A2A", sigla: "Sc" },
  { id: "pagbank", nome: "PagBank", cor: "#0FA47F", sigla: "Pg" },
  { id: "neon", nome: "Neon", cor: "#00A9E0", sigla: "Ne" },
  { id: "original", nome: "Original", cor: "#1B7A3D", sigla: "Or" },
];

export function bancoPorId(id?: string | null): Banco | undefined {
  if (!id) return undefined;
  return BANCOS.find((b) => b.id === id);
}
