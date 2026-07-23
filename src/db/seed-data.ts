/**
 * Sugestões padrão criadas junto com a conta do usuário. Tudo aqui é
 * editável e removível pelo usuário — são apenas um ponto de partida para
 * ele não começar com a tela vazia.
 */

export type SeedCategory = {
  name: string;
  icon: string;
  children?: string[];
};

export type SeedCostCenter = {
  name: string;
  icon: string;
  color: string;
  description: string;
};

export const DEFAULT_COST_CENTERS: SeedCostCenter[] = [
  {
    name: "Moradia",
    icon: "house",
    color: "#6366f1",
    description: "Tudo que envolve manter a casa",
  },
  {
    name: "Transporte",
    icon: "car",
    color: "#0ea5e9",
    description: "Deslocamento e veículos",
  },
  {
    name: "Alimentação",
    icon: "utensils",
    color: "#f59e0b",
    description: "Mercado e refeições fora",
  },
  {
    name: "Saúde e bem-estar",
    icon: "heart-pulse",
    color: "#ef4444",
    description: "Plano, consultas, farmácia e academia",
  },
  {
    name: "Pessoal e lazer",
    icon: "sparkles",
    color: "#ec4899",
    description: "Gastos com estilo de vida",
  },
  {
    name: "Educação",
    icon: "graduation-cap",
    color: "#8b5cf6",
    description: "Cursos, escola e material",
  },
  {
    name: "Financeiro",
    icon: "landmark",
    color: "#64748b",
    description: "Impostos, tarifas, juros e seguros",
  },
  {
    name: "Trabalho",
    icon: "briefcase",
    color: "#14b8a6",
    description: "Receitas e despesas ligadas à renda",
  },
];

/** Categoria -> centro de custo. Categorias fora deste mapa ficam sem centro. */
export const CATEGORY_COST_CENTER: Record<string, string> = {
  Moradia: "Moradia",
  Transporte: "Transporte",
  Alimentação: "Alimentação",
  Saúde: "Saúde e bem-estar",
  Lazer: "Pessoal e lazer",
  "Cuidados pessoais": "Pessoal e lazer",
  Educação: "Educação",
  "Impostos e taxas": "Financeiro",
  "Serviços financeiros": "Financeiro",
  Salário: "Trabalho",
  "Trabalho autônomo": "Trabalho",
};

export const DEFAULT_EXPENSE_CATEGORIES: SeedCategory[] = [
  {
    name: "Moradia",
    icon: "house",
    children: [
      "Aluguel",
      "Financiamento",
      "Condomínio",
      "IPTU",
      "Energia elétrica",
      "Água",
      "Gás",
      "Internet",
      "Manutenção e reforma",
      "Móveis e decoração",
    ],
  },
  {
    name: "Alimentação",
    icon: "utensils",
    children: [
      "Supermercado",
      "Feira e hortifruti",
      "Restaurante",
      "Delivery",
      "Padaria",
      "Café e lanches",
    ],
  },
  {
    name: "Transporte",
    icon: "car",
    children: [
      "Combustível",
      "Aplicativos de transporte",
      "Transporte público",
      "Estacionamento",
      "Pedágio",
      "Manutenção do veículo",
      "IPVA e licenciamento",
      "Seguro do veículo",
    ],
  },
  {
    name: "Saúde",
    icon: "heart-pulse",
    children: [
      "Plano de saúde",
      "Consultas",
      "Exames",
      "Farmácia",
      "Dentista",
      "Terapia",
      "Academia",
    ],
  },
  {
    name: "Educação",
    icon: "graduation-cap",
    children: [
      "Mensalidade",
      "Cursos",
      "Livros",
      "Material escolar",
      "Idiomas",
    ],
  },
  {
    name: "Lazer",
    icon: "sparkles",
    children: [
      "Streaming",
      "Cinema e teatro",
      "Shows e eventos",
      "Viagens",
      "Hobbies",
      "Bares",
      "Jogos",
    ],
  },
  {
    name: "Cuidados pessoais",
    icon: "shirt",
    children: [
      "Roupas e calçados",
      "Cabeleireiro e estética",
      "Cosméticos",
      "Assinaturas",
    ],
  },
  {
    name: "Serviços financeiros",
    icon: "landmark",
    children: [
      "Tarifas bancárias",
      "Juros e multas",
      "Anuidade de cartão",
      "Seguros",
      "Empréstimos",
    ],
  },
  {
    name: "Impostos e taxas",
    icon: "receipt",
    children: ["Imposto de renda", "INSS", "Outros tributos"],
  },
  {
    name: "Família",
    icon: "users",
    children: ["Filhos", "Pets", "Presentes", "Doações", "Ajuda familiar"],
  },
  {
    name: "Outros",
    icon: "circle-ellipsis",
    children: ["Despesas diversas", "Não identificado"],
  },
];

export const DEFAULT_INCOME_CATEGORIES: SeedCategory[] = [
  {
    name: "Salário",
    icon: "wallet",
    children: [
      "Salário líquido",
      "13º salário",
      "Férias",
      "Participação nos lucros",
      "Bônus",
      "Vale alimentação",
      "Vale transporte",
    ],
  },
  {
    name: "Trabalho autônomo",
    icon: "briefcase",
    children: [
      "Prestação de serviços",
      "Freelance",
      "Pró-labore",
      "Distribuição de lucros",
    ],
  },
  {
    name: "Investimentos",
    icon: "trending-up",
    children: [
      "Rendimentos de renda fixa",
      "Dividendos",
      "Juros sobre capital próprio",
      "Aluguel de imóveis",
      "Venda com lucro",
    ],
  },
  {
    name: "Benefícios",
    icon: "shield-check",
    children: ["Aposentadoria", "Pensão", "Auxílios", "Seguro-desemprego"],
  },
  {
    name: "Eventuais",
    icon: "gift",
    children: [
      "Restituição de imposto",
      "Presentes recebidos",
      "Venda de bens",
      "Reembolsos",
      "Prêmios",
    ],
  },
  {
    name: "Outras receitas",
    icon: "circle-ellipsis",
    children: ["Receitas diversas", "Não identificado"],
  },
];
