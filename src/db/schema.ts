import {
  pgTable,
  pgEnum,
  text,
  bigint,
  integer,
  boolean,
  timestamp,
  date,
  uuid,
  numeric,
  jsonb,
  index,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

/**
 * Valores monetários são armazenados em centavos (bigint), nunca em float.
 * Conversão para exibição fica em src/lib/money.ts.
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const currencyCode = pgEnum("currency_code", ["BRL", "USD", "EUR"]);

export const accountType = pgEnum("account_type", [
  "checking", // conta corrente
  "savings", // poupança
  "credit_card", // cartão de crédito
  "cash", // espécie / carteira
  "investment", // conta de investimento
]);

export const categoryType = pgEnum("category_type", ["income", "expense"]);

export const transactionType = pgEnum("transaction_type", [
  "income",
  "expense",
  "transfer",
]);

export const transactionStatus = pgEnum("transaction_status", [
  "pending", // previsto / não realizado
  "cleared", // realizado
  "reconciled", // realizado e conciliado com extrato
]);

/**
 * Ciclo de vida de uma fatura de cartão.
 *   open        — ciclo corrente, ainda acumulando compras
 *   closed      — fechada (pela data ou pelo botão); total congelado, a pagar
 *   paid        — quitada
 *   reparcelada — o saldo em aberto foi refinanciado num novo parcelamento
 */
export const statementStatus = pgEnum("statement_status", [
  "open",
  "closed",
  "paid",
  "reparcelada",
]);

export const recurrenceFrequency = pgEnum("recurrence_frequency", [
  "weekly",
  "biweekly",
  "monthly",
  "quarterly",
  "semiannual",
  "annual",
]);

export const goalStatus = pgEnum("goal_status", [
  "active",
  "achieved",
  "abandoned",
]);

export const memberRole = pgEnum("member_role", [
  "owner", // controle total, inclusive excluir o espaço
  "member", // lança e edita
  "viewer", // só consulta
]);

// ---------------------------------------------------------------------------
// Usuários
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  passwordHash: text("password_hash"),
  imageUrl: text("image_url"),
  // Espaço aberto por padrão ao entrar no app.
  defaultLedgerId: uuid("default_ledger_id"),
  // Blocos do painel que o usuário escolheu esconder (ids do catálogo de
  // widgets). Nulo/vazio = mostra tudo. Personalização é por pessoa.
  dashboardHidden: jsonb("dashboard_hidden").$type<string[]>(),

  // --- Segurança ---
  // Administrador do sistema: emite convites. O primeiro usuário cadastrado
  // recebe isto automaticamente (bootstrap).
  isAdmin: boolean("is_admin").notNull().default(false),
  // Segredo TOTP do 2FA, CIFRADO em repouso (ver lib/crypto). Nunca em claro.
  totpSecret: text("totp_secret"),
  // Só depois de confirmar o primeiro código o 2FA passa a valer.
  totpEnabledAt: timestamp("totp_enabled_at", { withTimezone: true }),
  // Confirmação do e-mail (habilita recuperação de senha com segurança).
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  // Sessões emitidas antes desta marca são recusadas — é como derrubamos todos
  // os dispositivos ao trocar senha ou mexer no 2FA.
  sessionsValidFrom: timestamp("sessions_valid_from", { withTimezone: true }),

  // --- Administração de licenças ---
  // Última vez que a pessoa acessou o app (atualizado no máximo 1x/hora, para
  // não escrever a cada request). Alimenta o monitoramento de uso do admin.
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  // Conta desativada pelo admin: bloqueia o login e derruba as sessões. É
  // reversível (reativar limpa a marca). Nunca dá ao admin acesso aos dados da
  // pessoa — só corta o acesso dela.
  deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
  deactivatedReason: text("deactivated_reason"), // "inativado" | "cancelado"

  // Prazo de acesso: a pessoa pode usar até o FIM deste dia (inclusive). Depois,
  // o acesso fica restrito a exportar/excluir os dados (como uma desativação).
  // Nulo = sem prazo. O admin edita isto em dias; a pessoa vê quantos restam.
  accessUntil: date("access_until"),
  // Classificação do tipo de usuário (ver lib/user-classificacao). Nulo = sem.
  classificacao: text("classificacao"),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ---------------------------------------------------------------------------
// Segurança da conta
// ---------------------------------------------------------------------------

/**
 * Convite (licença) para criar conta.
 *
 * O cadastro é FECHADO: sem um código válido e não usado, ninguém entra. É o
 * que transforma "qualquer um que achar a URL" em "as pessoas que eu convidei".
 *
 * Exceção deliberada: se ainda não existe nenhum usuário no sistema, o primeiro
 * cadastro é liberado e vira administrador — senão não haveria como emitir o
 * primeiro convite.
 */
export const invites = pgTable(
  "invites",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: text("code").notNull(),
    // Para quem é (anotação livre do admin: "João", "minha irmã"…).
    nota: text("nota"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    usedByUserId: uuid("used_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    usedAt: timestamp("used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("invites_code_idx").on(t.code)],
);

/**
 * Token de recuperação de senha.
 *
 * O token EM SI nunca é gravado — guardamos o hash. Assim, um vazamento do
 * banco não permite trocar a senha de ninguém. É de uso único (`usedAt`) e
 * expira rápido (`expiresAt`).
 */
export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("password_reset_user_idx").on(t.userId),
    uniqueIndex("password_reset_hash_idx").on(t.tokenHash),
  ],
);

/**
 * Códigos de recuperação do 2FA (para quem perde o celular). Também guardados
 * com hash e de uso único.
 */
export const twoFactorRecoveryCodes = pgTable(
  "two_factor_recovery_codes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("two_factor_codes_user_idx").on(t.userId)],
);

/**
 * Tentativas de autenticação, para travar força bruta.
 *
 * Guardamos o identificador (e-mail tentado) e o IP; a política de bloqueio lê
 * as falhas recentes desta tabela. Vale para login, recuperação e 2FA.
 */
export const authAttempts = pgTable(
  "auth_attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    identifier: text("identifier").notNull(),
    ip: text("ip"),
    kind: text("kind").notNull(), // login | reset | two_factor
    sucesso: boolean("sucesso").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("auth_attempts_lookup_idx").on(t.identifier, t.kind, t.createdAt)],
);

/**
 * Trilha de auditoria das ações sensíveis (login, troca de senha, 2FA, convites,
 * exclusões). Num app que guarda a vida financeira de alguém, poder responder
 * "quem fez o quê e quando" não é luxo.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    ledgerId: uuid("ledger_id"),
    action: text("action").notNull(),
    detail: jsonb("detail").$type<Record<string, unknown>>(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_log_user_idx").on(t.userId, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Espaços financeiros
// ---------------------------------------------------------------------------

/**
 * Um espaço ("ledger") é o dono de todos os dados financeiros: contas,
 * categorias, lançamentos. O usuário acessa um espaço através de uma
 * associação em `ledgerMembers`.
 *
 * Para quem usa sozinho existe exatamente um espaço, criado no cadastro, e a
 * interface não expõe o conceito. A indireção existe para que compartilhar com
 * outra pessoa depois seja adicionar um membro, e não migrar a titularidade de
 * todas as tabelas com dados reais dentro.
 */
export const ledgers = pgTable(
  "ledgers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    // Moeda dos relatórios consolidados deste espaço.
    baseCurrency: currencyCode("base_currency").notNull().default("BRL"),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    isPersonal: boolean("is_personal").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("ledgers_owner_idx").on(t.ownerId)],
);

export const ledgerMembers = pgTable(
  "ledger_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ledgerId: uuid("ledger_id")
      .notNull()
      .references(() => ledgers.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRole("role").notNull().default("owner"),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("ledger_members_ledger_user_idx").on(t.ledgerId, t.userId),
    index("ledger_members_user_idx").on(t.userId),
  ],
);

// ---------------------------------------------------------------------------
// Câmbio
// ---------------------------------------------------------------------------

/**
 * Cotações diárias. Toda transação guarda a taxa usada no momento do
 * lançamento, então esta tabela serve para preencher o padrão e para
 * reavaliar carteiras, não como fonte de verdade de valores já lançados.
 */
export const exchangeRates = pgTable(
  "exchange_rates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    fromCurrency: currencyCode("from_currency").notNull(),
    toCurrency: currencyCode("to_currency").notNull(),
    rate: numeric("rate", { precision: 18, scale: 8 }).notNull(),
    validOn: date("valid_on").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("exchange_rates_pair_date_idx").on(
      t.fromCurrency,
      t.toCurrency,
      t.validOn,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Centros de custo
// ---------------------------------------------------------------------------

/**
 * Agrupa categorias para totalização (ex.: "Casa" reúne Aluguel, Luz, Água).
 * A associação padrão vem de categories.costCenterId; um rateio pode
 * sobrescrever caso a caso.
 */
export const costCenters = pgTable(
  "cost_centers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ledgerId: uuid("ledger_id")
      .notNull()
      .references(() => ledgers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    color: text("color"),
    icon: text("icon"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("cost_centers_ledger_name_idx").on(t.ledgerId, t.name),
    index("cost_centers_ledger_idx").on(t.ledgerId),
  ],
);

// ---------------------------------------------------------------------------
// Categorias
// ---------------------------------------------------------------------------

/**
 * Planos de receita e despesa são separados pelo campo `type` e nunca se
 * misturam na interface. `parentId` permite subcategorias.
 */
export const categories = pgTable(
  "categories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ledgerId: uuid("ledger_id")
      .notNull()
      .references(() => ledgers.id, { onDelete: "cascade" }),
    type: categoryType("type").notNull(),
    name: text("name").notNull(),
    parentId: uuid("parent_id").references((): AnyPgColumn => categories.id, {
      onDelete: "cascade",
    }),
    costCenterId: uuid("cost_center_id").references(() => costCenters.id, {
      onDelete: "set null",
    }),
    color: text("color"),
    icon: text("icon"),
    // Marca as categorias criadas pelo seed, para o usuário distinguir
    // as sugestões padrão das que ele criou.
    isDefault: boolean("is_default").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("categories_ledger_type_name_parent_idx").on(
      t.ledgerId,
      t.type,
      t.name,
      t.parentId,
    ),
    index("categories_ledger_type_idx").on(t.ledgerId, t.type),
  ],
);

// ---------------------------------------------------------------------------
// Contas
// ---------------------------------------------------------------------------

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ledgerId: uuid("ledger_id")
      .notNull()
      .references(() => ledgers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: accountType("type").notNull(),
    currency: currencyCode("currency").notNull().default("BRL"),
    institution: text("institution"),
    // Saldo do dia em que a conta entrou no app; o saldo atual é este
    // valor somado aos lançamentos.
    openingBalance: bigint("opening_balance", { mode: "number" })
      .notNull()
      .default(0),
    openingBalanceDate: date("opening_balance_date"),

    // Somente cartão de crédito
    creditLimit: bigint("credit_limit", { mode: "number" }),
    statementClosingDay: integer("statement_closing_day"), // dia do fechamento
    paymentDueDay: integer("payment_due_day"), // dia do vencimento

    color: text("color"),
    icon: text("icon"),
    includeInNetWorth: boolean("include_in_net_worth").notNull().default(true),
    // A conta-piscina das rachas: valores pagos que serão reembolsados ficam
    // aqui, fora do resultado. Criada sob demanda, uma por espaço, e escondida
    // dos seletores comuns de lançamento.
    isReimbursementPool: boolean("is_reimbursement_pool").notNull().default(false),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("accounts_ledger_idx").on(t.ledgerId)],
);

// ---------------------------------------------------------------------------
// Lançamentos
// ---------------------------------------------------------------------------

/**
 * Todo lançamento tem ao menos um rateio (transactionSplits), mesmo quando é
 * de categoria única. Relatórios sempre agregam a partir dos rateios, o que
 * mantém uma única regra de totalização.
 *
 * Transferências entre contas usam `transferPairId` para ligar as duas pontas
 * e não entram em receita nem em despesa.
 */
export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ledgerId: uuid("ledger_id")
      .notNull()
      .references(() => ledgers.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    // Quem lançou. Só faz diferença em espaço compartilhado, mas gravar desde
    // já evita ter que adivinhar autoria de lançamentos antigos depois.
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    type: transactionType("type").notNull(),
    status: transactionStatus("status").notNull().default("cleared"),

    // Positivo em receita/despesa (o sinal vem de `type`). Em transferências
    // o sinal é explícito: a perna que SAI da conta é negativa, a que ENTRA é
    // positiva. Assim o cálculo de saldo ("else amount") já credita e debita
    // as contas certas sem tratar transferência como caso especial.
    amount: bigint("amount", { mode: "number" }).notNull(),
    currency: currencyCode("currency").notNull(),
    // Valor convertido para a moeda base do usuário na data do lançamento,
    // congelado para que relatórios históricos não mudem com o câmbio.
    amountBase: bigint("amount_base", { mode: "number" }).notNull(),
    exchangeRate: numeric("exchange_rate", { precision: 18, scale: 8 })
      .notNull()
      .default("1"),

    description: text("description").notNull(),
    notes: text("notes"),
    // Data de competência (quando o fato ocorreu).
    date: date("date").notNull(),
    // Data de caixa (quando o dinheiro entrou/saiu). Difere da competência em
    // compras no cartão: a competência é a compra, o caixa é o pagamento da fatura.
    settlementDate: date("settlement_date"),

    counterparty: text("counterparty"),

    transferPairId: uuid("transfer_pair_id"),

    // Origem: parcelamento, recorrência ou importação
    installmentGroupId: uuid("installment_group_id"),
    installmentNumber: integer("installment_number"),
    installmentTotal: integer("installment_total"),
    recurringRuleId: uuid("recurring_rule_id"),

    // Fatura de cartão a que este lançamento pertence, gravada no fechamento
    // (antes disso a fatura é o ciclo calculado pela data de vencimento).
    statementId: uuid("statement_id"),
    // Quando uma parcela em aberto é reparcelada, aponta para o novo plano que
    // a substitui. A parcela original fica no histórico (rastreável), mas sai
    // do "a pagar" e do fluxo — quem paga agora são as novas parcelas.
    supersededByPlanId: uuid("superseded_by_plan_id"),

    // Identidade do lançamento no arquivo importado (FITID do OFX, ou uma chave
    // derivada de data+valor+descrição no CSV). Reimportar o mesmo extrato não
    // duplica: quem já tem external_id igual nesta conta é ignorado.
    externalId: text("external_id"),

    reconciledAt: timestamp("reconciled_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("transactions_ledger_date_idx").on(t.ledgerId, t.date),
    index("transactions_account_date_idx").on(t.accountId, t.date),
    index("transactions_ledger_status_idx").on(t.ledgerId, t.status),
    index("transactions_installment_group_idx").on(t.installmentGroupId),
    /*
     * Uma conta fixa só pode ter UM lançamento por data.
     *
     * A provisão roda toda vez que o usuário abre o app; sem esta trava, uma
     * corrida entre duas abas duplicaria o aluguel do mês. O índice é parcial
     * porque lançamentos avulsos não têm regra e podem repetir data à vontade.
     */
    uniqueIndex("transactions_recurring_date_idx")
      .on(t.recurringRuleId, t.date)
      .where(sql`${t.recurringRuleId} is not null`),
    /*
     * Mesma ideia para importação: um external_id só pode existir uma vez por
     * conta. É a trava final contra reimportar o mesmo extrato — mesmo que a
     * checagem em memória escape numa corrida, o banco recusa a duplicata.
     * Parcial porque lançamentos manuais não têm external_id.
     */
    uniqueIndex("transactions_account_external_idx")
      .on(t.accountId, t.externalId)
      .where(sql`${t.externalId} is not null`),
  ],
);

/**
 * Rateio: divide um lançamento entre categorias. A soma dos `amount` dos
 * rateios precisa ser igual ao `amount` do lançamento — validado na camada
 * de aplicação (src/lib/transactions.ts).
 */
export const transactionSplits = pgTable(
  "transaction_splits",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").references(() => categories.id, {
      onDelete: "restrict",
    }),
    // Sobrescreve o centro de custo herdado da categoria, quando preenchido.
    costCenterId: uuid("cost_center_id").references(() => costCenters.id, {
      onDelete: "set null",
    }),
    amount: bigint("amount", { mode: "number" }).notNull(),
    amountBase: bigint("amount_base", { mode: "number" }).notNull(),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [
    index("transaction_splits_transaction_idx").on(t.transactionId),
    index("transaction_splits_category_idx").on(t.categoryId),
  ],
);

// ---------------------------------------------------------------------------
// Orçamento mensal
// ---------------------------------------------------------------------------

export const budgets = pgTable(
  "budgets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ledgerId: uuid("ledger_id")
      .notNull()
      .references(() => ledgers.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").references(() => categories.id, {
      onDelete: "cascade",
    }),
    costCenterId: uuid("cost_center_id").references(() => costCenters.id, {
      onDelete: "cascade",
    }),
    // Primeiro dia do mês de referência.
    month: date("month").notNull(),
    amount: bigint("amount", { mode: "number" }).notNull(),
    currency: currencyCode("currency").notNull().default("BRL"),
    // Repete o valor para os meses seguintes até ser alterado.
    rollsOver: boolean("rolls_over").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("budgets_ledger_month_category_idx").on(
      t.ledgerId,
      t.month,
      t.categoryId,
    ),
    index("budgets_ledger_month_idx").on(t.ledgerId, t.month),
  ],
);

// ---------------------------------------------------------------------------
// Contas fixas, contas a receber e parcelamentos
// ---------------------------------------------------------------------------

/**
 * Modelo de lançamento que se repete (contas fixas mensais, contas a receber
 * recorrentes). Gera transações com status "pending" à frente, alimentando o
 * fluxo de caixa previsto.
 */
export const recurringRules = pgTable(
  "recurring_rules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ledgerId: uuid("ledger_id")
      .notNull()
      .references(() => ledgers.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    type: transactionType("type").notNull(),
    description: text("description").notNull(),
    amount: bigint("amount", { mode: "number" }).notNull(),
    currency: currencyCode("currency").notNull().default("BRL"),
    frequency: recurrenceFrequency("frequency").notNull().default("monthly"),
    // Dia do mês do vencimento (1-31); ajustado para o último dia em meses curtos.
    dayOfMonth: integer("day_of_month"),
    startDate: date("start_date").notNull(),
    endDate: date("end_date"),
    // Até onde as transações previstas já foram materializadas.
    generatedThrough: date("generated_through"),
    autoConfirm: boolean("auto_confirm").notNull().default(false),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("recurring_rules_ledger_idx").on(t.ledgerId)],
);

/**
 * Compra parcelada. Cada parcela vira uma transação com status "pending" até
 * o fechamento da fatura correspondente.
 */
export const installmentPlans = pgTable(
  "installment_plans",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ledgerId: uuid("ledger_id")
      .notNull()
      .references(() => ledgers.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    totalAmount: bigint("total_amount", { mode: "number" }).notNull(),
    currency: currencyCode("currency").notNull().default("BRL"),
    installmentCount: integer("installment_count").notNull(),
    firstDueDate: date("first_due_date").notNull(),
    purchaseDate: date("purchase_date").notNull(),
    // "purchase" (compra parcelada comum) ou "reparcelamento" (refinanciamento
    // de uma fatura). O reparcelamento carrega a fatura de origem para rastreio.
    kind: text("kind").notNull().default("purchase"),
    sourceStatementId: uuid("source_statement_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("installment_plans_ledger_idx").on(t.ledgerId)],
);

/**
 * Fatura de cartão persistida no fechamento. Antes de fechar, a fatura é apenas
 * o ciclo calculado (pela data de vencimento das compras); ao fechar — manual
 * ou automaticamente na data —, congela-se o total e o conjunto de compras
 * (via transactions.statement_id), espelhando o que o banco faz.
 */
export const creditCardStatements = pgTable(
  "credit_card_statements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ledgerId: uuid("ledger_id")
      .notNull()
      .references(() => ledgers.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    // O ciclo: quando fechou e quando vence. O vencimento identifica a fatura
    // (as compras do ciclo têm settlement_date = due_date).
    closingDate: date("closing_date").notNull(),
    dueDate: date("due_date").notNull(),
    status: statementStatus("status").notNull().default("closed"),
    // Total congelado no fechamento (soma das compras do ciclo, em centavos).
    totalAmount: bigint("total_amount", { mode: "number" }).notNull().default(0),
    // Se reparcelada, o plano de parcelamento que assumiu o saldo.
    reparceladoPlanId: uuid("reparcelado_plan_id"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("cc_statements_account_idx").on(t.accountId),
    // Uma fatura por vencimento em cada cartão: o fechamento (auto + manual)
    // roda em corrida entre abas; a trava impede duplicar o mesmo ciclo.
    uniqueIndex("cc_statements_account_due_idx").on(t.accountId, t.dueDate),
  ],
);

/**
 * Situação de uma linha importada do extrato do banco.
 *   pendente    — esperando conciliação (o padrão ao importar)
 *   conciliada  — casada com um lançamento do app
 *   arquivada   — o usuário decidiu ignorá-la (duplicata, transferência interna…)
 */
export const bankLineStatus = pgEnum("bank_line_status", [
  "pendente",
  "conciliada",
  "arquivada",
]);

/**
 * Linha crua do extrato bancário (OFX), em área de espera.
 *
 * Importar NÃO cria lançamento: a linha fica aqui até o usuário conciliá-la com
 * um lançamento existente ou acatar a criação de um novo. É o que permite a
 * conferência lado a lado — banco à esquerda, app à direita.
 */
export const bankStatementLines = pgTable(
  "bank_statement_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ledgerId: uuid("ledger_id")
      .notNull()
      .references(() => ledgers.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    // Sinal como o banco mostra: negativo = saiu, positivo = entrou.
    amount: bigint("amount", { mode: "number" }).notNull(),
    description: text("description").notNull(),
    // FITID do OFX (ou chave derivada), para não reimportar a mesma linha.
    fitId: text("fit_id"),
    status: bankLineStatus("status").notNull().default("pendente"),
    // Lançamento com que esta linha foi casada.
    transactionId: uuid("transaction_id").references(() => transactions.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("bank_lines_account_status_idx").on(t.accountId, t.status),
    // Reimportar o mesmo extrato não duplica linhas.
    uniqueIndex("bank_lines_account_fit_idx")
      .on(t.accountId, t.fitId)
      .where(sql`${t.fitId} is not null`),
  ],
);

/**
 * Ponto de conferência do saldo com o banco. O usuário informa "no dia D o
 * extrato do banco fecha em R$ X"; guardamos esse número para comparar com o
 * saldo que o app calcula até aquela data. Bateu, está conciliado até ali; não
 * bateu, a diferença é exatamente o que falta acertar.
 *
 * Guardamos histórico (uma linha por conferência), mas na tela mostramos a mais
 * recente por conta.
 */
export const bankBalanceChecks = pgTable(
  "bank_balance_checks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ledgerId: uuid("ledger_id")
      .notNull()
      .references(() => ledgers.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    // Data do saldo informado (o "até quando" do extrato).
    date: date("date").notNull(),
    // Saldo que o banco mostra nessa data, em centavos (com sinal).
    balance: bigint("balance", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("bank_balance_checks_account_idx").on(t.accountId, t.date)],
);

/**
 * Regras de categorização automática (sem IA): quando a descrição de um
 * lançamento contém `pattern`, atribui `category_id`. Aplicadas na importação e
 * na criação avulsa, poupando o trabalho manual repetitivo.
 */
export const categoryRules = pgTable(
  "category_rules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ledgerId: uuid("ledger_id")
      .notNull()
      .references(() => ledgers.id, { onDelete: "cascade" }),
    pattern: text("pattern").notNull(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("category_rules_ledger_idx").on(t.ledgerId)],
);

// ---------------------------------------------------------------------------
// Rachas (valores a reembolsar)
// ---------------------------------------------------------------------------

export const reimbursableStatus = pgEnum("reimbursable_status", [
  "open", // ainda a receber
  "settled", // totalmente reembolsado
]);

/**
 * Tipo de item de patrimônio. Os dois primeiros são investimentos (rendem e
 * entram na análise de rendimentos); os demais são bens que compõem o
 * patrimônio mas não têm "rendimento" no sentido de aplicação.
 */
export const assetKind = pgEnum("asset_kind", [
  "fixed_income", // renda fixa: Tesouro, CDB, LCI/LCA...
  "variable_income", // renda variável: ações, FIIs, cripto...
  "real_estate", // imóveis: casa, terreno, apartamento
  "vehicle", // veículos
  "other", // demais bens
]);

/**
 * Um "racha": um valor que você pagou e vai receber de volta (dividiu a conta,
 * comprou algo para alguém). Não é despesa — é dinheiro emprestado que volta.
 *
 * O movimento no saldo é feito por transferências para a conta-piscina de
 * rachas (isReimbursementPool); esta tabela dá o rastreio individual: quem
 * deve, quanto já voltou, o que falta. As duas visões derivam das mesmas
 * ações, que rodam sempre em transação de banco para não divergirem.
 */
export const reimbursables = pgTable(
  "reimbursables",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ledgerId: uuid("ledger_id")
      .notNull()
      .references(() => ledgers.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    personName: text("person_name"), // compatibilidade; o rastreio real é por participante
    // Valor cheio da compra. `myShare` é a parte que é sua (vira despesa de
    // verdade); `amount` é o que será reembolsado (total − minha parte).
    totalAmount: bigint("total_amount", { mode: "number" }).notNull().default(0),
    myShare: bigint("my_share", { mode: "number" }).notNull().default(0),
    amount: bigint("amount", { mode: "number" }).notNull(), // total a receber
    settledAmount: bigint("settled_amount", { mode: "number" }).notNull().default(0),
    // Conta de onde o dinheiro saiu (e para onde o reembolso volta).
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    currency: currencyCode("currency").notNull().default("BRL"),
    status: reimbursableStatus("status").notNull().default("open"),
    date: date("date").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("reimbursables_ledger_idx").on(t.ledgerId),
    index("reimbursables_ledger_status_idx").on(t.ledgerId, t.status),
  ],
);

/**
 * Cada pessoa que vai reembolsar um racha. Guarda quanto deve e se já pagou,
 * dando o controle individual: quem quitou e quem ainda falta.
 */
export const reimbursableParticipants = pgTable(
  "reimbursable_participants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    reimbursableId: uuid("reimbursable_id")
      .notNull()
      .references(() => reimbursables.id, { onDelete: "cascade" }),
    name: text("name"), // opcional: "Pessoa 1" se em branco
    amount: bigint("amount", { mode: "number" }).notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("reimbursable_participants_racha_idx").on(t.reimbursableId)],
);

export type Reimbursable = typeof reimbursables.$inferSelect;
export type ReimbursableParticipant = typeof reimbursableParticipants.$inferSelect;

// ---------------------------------------------------------------------------
// Patrimônio (investimentos e bens)
// ---------------------------------------------------------------------------

/**
 * Um item de patrimônio: um investimento (renda fixa/variável) ou um bem
 * (imóvel, veículo). Fica separado das `accounts` de propósito: contas são o
 * dinheiro do dia a dia; patrimônio é o que se acumula e valoriza. Somados,
 * dão o patrimônio total.
 *
 * `investedValue` (quanto entrou de dinheiro seu) só é relevante para
 * investimentos, e é a base do cálculo de rendimento. `currentValue` é o
 * valor de hoje — atualizado à mão, gerando um snapshot a cada mudança.
 */
/**
 * Tipos de bem definidos pelo usuário. A lista fixa (imóvel, veículo, outro) não
 * dava conta de tudo que uma pessoa tem; aqui ela cadastra os próprios tipos —
 * "Joias", "Máquina fotográfica", "Participação em empresa" — e usa no
 * patrimônio. Vale só para bens; investimentos seguem com o enum `assetKind`.
 */
export const assetKinds = pgTable(
  "asset_kinds",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ledgerId: uuid("ledger_id")
      .notNull()
      .references(() => ledgers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    // Arquivar em vez de apagar preserva o tipo dos bens já cadastrados com ele.
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("asset_kinds_ledger_idx").on(t.ledgerId)],
);

export const assets = pgTable(
  "assets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ledgerId: uuid("ledger_id")
      .notNull()
      .references(() => ledgers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: assetKind("kind").notNull(),
    // Tipo de bem editável (tabela asset_kinds). Preenchido para bens; nulo para
    // investimentos, cujo tipo vem do enum `kind`.
    assetKindId: uuid("asset_kind_id").references(() => assetKinds.id, {
      onDelete: "set null",
    }),
    // Rótulo livre do tipo, usado quando kind = "other" (ex.: "Joias", "Obra
    // de arte", "Participação em empresa"). Exibido no lugar de "Outro bem".
    customKind: text("custom_kind"),
    // Instituição/corretora ou detalhe (ex.: "Tesouro Selic 2029", "Placa ABC").
    detail: text("detail"),
    investedValue: bigint("invested_value", { mode: "number" }).notNull().default(0),
    currentValue: bigint("current_value", { mode: "number" }).notNull().default(0),
    currency: currencyCode("currency").notNull().default("BRL"),
    notes: text("notes"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("assets_ledger_idx").on(t.ledgerId),
    index("assets_ledger_kind_idx").on(t.ledgerId, t.kind),
  ],
);

/**
 * Histórico do valor de um item. Cada atualização de `currentValue` grava um
 * ponto aqui, e é dele que sai a evolução mensal do patrimônio.
 */
export const assetSnapshots = pgTable(
  "asset_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    value: bigint("value", { mode: "number" }).notNull(),
    date: date("date").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("asset_snapshots_asset_date_idx").on(t.assetId, t.date)],
);

export type Asset = typeof assets.$inferSelect;
export type AssetSnapshot = typeof assetSnapshots.$inferSelect;
export type AssetKind = (typeof assetKind.enumValues)[number];

// ---------------------------------------------------------------------------
// Metas
// ---------------------------------------------------------------------------

export const goals = pgTable(
  "goals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ledgerId: uuid("ledger_id")
      .notNull()
      .references(() => ledgers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    targetAmount: bigint("target_amount", { mode: "number" }).notNull(),
    currency: currencyCode("currency").notNull().default("BRL"),
    // Conta onde o dinheiro da meta é acumulado, quando aplicável.
    accountId: uuid("account_id").references(() => accounts.id, {
      onDelete: "set null",
    }),
    targetDate: date("target_date"),
    startDate: date("start_date").notNull(),
    status: goalStatus("status").notNull().default("active"),
    achievedAt: timestamp("achieved_at", { withTimezone: true }),
    color: text("color"),
    icon: text("icon"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("goals_ledger_idx").on(t.ledgerId)],
);

/** Aportes manuais para a meta, quando não vinculados a uma conta. */
export const goalContributions = pgTable(
  "goal_contributions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    goalId: uuid("goal_id")
      .notNull()
      .references(() => goals.id, { onDelete: "cascade" }),
    transactionId: uuid("transaction_id").references(() => transactions.id, {
      onDelete: "set null",
    }),
    amount: bigint("amount", { mode: "number" }).notNull(),
    date: date("date").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("goal_contributions_goal_idx").on(t.goalId)],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(ledgerMembers),
  ownedLedgers: many(ledgers),
}));

export const ledgersRelations = relations(ledgers, ({ one, many }) => ({
  owner: one(users, { fields: [ledgers.ownerId], references: [users.id] }),
  members: many(ledgerMembers),
  accounts: many(accounts),
  categories: many(categories),
  costCenters: many(costCenters),
  transactions: many(transactions),
  budgets: many(budgets),
  goals: many(goals),
}));

export const ledgerMembersRelations = relations(ledgerMembers, ({ one }) => ({
  ledger: one(ledgers, {
    fields: [ledgerMembers.ledgerId],
    references: [ledgers.id],
  }),
  user: one(users, { fields: [ledgerMembers.userId], references: [users.id] }),
}));

export const accountsRelations = relations(accounts, ({ one, many }) => ({
  ledger: one(ledgers, {
    fields: [accounts.ledgerId],
    references: [ledgers.id],
  }),
  transactions: many(transactions),
}));

export const costCentersRelations = relations(costCenters, ({ one, many }) => ({
  ledger: one(ledgers, {
    fields: [costCenters.ledgerId],
    references: [ledgers.id],
  }),
  categories: many(categories),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  ledger: one(ledgers, {
    fields: [categories.ledgerId],
    references: [ledgers.id],
  }),
  parent: one(categories, {
    fields: [categories.parentId],
    references: [categories.id],
    relationName: "category_parent",
  }),
  children: many(categories, { relationName: "category_parent" }),
  costCenter: one(costCenters, {
    fields: [categories.costCenterId],
    references: [costCenters.id],
  }),
  splits: many(transactionSplits),
}));

export const transactionsRelations = relations(
  transactions,
  ({ one, many }) => ({
    ledger: one(ledgers, {
      fields: [transactions.ledgerId],
      references: [ledgers.id],
    }),
    createdBy: one(users, {
      fields: [transactions.createdByUserId],
      references: [users.id],
    }),
    account: one(accounts, {
      fields: [transactions.accountId],
      references: [accounts.id],
    }),
    splits: many(transactionSplits),
  }),
);

export const transactionSplitsRelations = relations(
  transactionSplits,
  ({ one }) => ({
    transaction: one(transactions, {
      fields: [transactionSplits.transactionId],
      references: [transactions.id],
    }),
    category: one(categories, {
      fields: [transactionSplits.categoryId],
      references: [categories.id],
    }),
    costCenter: one(costCenters, {
      fields: [transactionSplits.costCenterId],
      references: [costCenters.id],
    }),
  }),
);

export const goalsRelations = relations(goals, ({ one, many }) => ({
  ledger: one(ledgers, { fields: [goals.ledgerId], references: [ledgers.id] }),
  account: one(accounts, {
    fields: [goals.accountId],
    references: [accounts.id],
  }),
  contributions: many(goalContributions),
}));

// ---------------------------------------------------------------------------
// Tipos inferidos
// ---------------------------------------------------------------------------

export type User = typeof users.$inferSelect;
export type Ledger = typeof ledgers.$inferSelect;
export type LedgerMember = typeof ledgerMembers.$inferSelect;
export type MemberRole = (typeof memberRole.enumValues)[number];
export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type CostCenter = typeof costCenters.$inferSelect;
export type NewCostCenter = typeof costCenters.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type TransactionSplit = typeof transactionSplits.$inferSelect;
export type NewTransactionSplit = typeof transactionSplits.$inferInsert;
export type Budget = typeof budgets.$inferSelect;
export type Goal = typeof goals.$inferSelect;
export type CurrencyCode = (typeof currencyCode.enumValues)[number];
export type AccountType = (typeof accountType.enumValues)[number];
export type CategoryType = (typeof categoryType.enumValues)[number];
export type RecurrenceFrequency = (typeof recurrenceFrequency.enumValues)[number];
export type RecurringRule = typeof recurringRules.$inferSelect;
export type TransactionStatus = (typeof transactionStatus.enumValues)[number];
export type InstallmentPlan = typeof installmentPlans.$inferSelect;
export type CreditCardStatement = typeof creditCardStatements.$inferSelect;
export type NewCreditCardStatement = typeof creditCardStatements.$inferInsert;
export type StatementStatus = (typeof statementStatus.enumValues)[number];

// ---------------------------------------------------------------------------
// Gamificação
// ---------------------------------------------------------------------------

export const xpKind = pgEnum("xp_kind", [
  "daily_check_in", // abriu o app no dia
  "transaction_logged", // registrou um lançamento
  "transaction_split", // usou rateio (esforço maior, recompensa maior)
  "reconciled_transaction", // conferiu um lançamento com o extrato
  "account_reconciled", // fechou a conciliação de uma conta no mês
  "goal_created",
  "goal_achieved",
  "budget_kept", // fechou o mês dentro do orçamento
  "month_positive", // fechou o mês no azul
  "streak_bonus", // bônus por manter a ofensiva
  "achievement", // XP que acompanha uma conquista
]);

/**
 * Cada concessão de XP é um evento imutável, nunca um contador incrementado.
 *
 * `dedupeKey` é o que impede pagar duas vezes pelo mesmo fato: o check-in do
 * dia 16/07 tem chave "daily:2026-07-16", então clicar de novo não gera XP.
 * O total é sempre a soma dos eventos, o que torna o saldo auditável e
 * reconstruível — importante, porque XP aqui é moeda de um jogo que o usuário
 * leva a sério.
 */
export const xpEvents = pgTable(
  "xp_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ledgerId: uuid("ledger_id")
      .notNull()
      .references(() => ledgers.id, { onDelete: "cascade" }),
    kind: xpKind("kind").notNull(),
    amount: integer("amount").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    label: text("label"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("xp_events_user_dedupe_idx").on(t.userId, t.dedupeKey),
    index("xp_events_user_created_idx").on(t.userId, t.createdAt),
  ],
);

/**
 * Estado derivado, mantido para leitura barata: o painel não pode somar todos
 * os eventos a cada carregamento. `xpEvents` continua sendo a verdade.
 */
export const userProgress = pgTable("user_progress", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  xp: integer("xp").notNull().default(0),
  currentStreak: integer("current_streak").notNull().default(0),
  longestStreak: integer("longest_streak").notNull().default(0),
  // Guardado como data (sem hora) porque a ofensiva conta dias, não horas.
  lastCheckIn: date("last_check_in"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Conquistas desbloqueadas. As definições vivem no código (src/lib/achievements.ts),
 * não no banco: são regras, não dados do usuário.
 */
export const userAchievements = pgTable(
  "user_achievements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ledgerId: uuid("ledger_id")
      .notNull()
      .references(() => ledgers.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    unlockedAt: timestamp("unlocked_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Marcado quando o usuário já viu o aviso de desbloqueio.
    seenAt: timestamp("seen_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("user_achievements_user_code_idx").on(t.userId, t.code),
    index("user_achievements_user_idx").on(t.userId),
  ],
);

export type XpEvent = typeof xpEvents.$inferSelect;
export type XpKind = (typeof xpKind.enumValues)[number];
export type UserProgress = typeof userProgress.$inferSelect;
export type UserAchievement = typeof userAchievements.$inferSelect;
