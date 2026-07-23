import "server-only";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  accounts,
  assetKinds,
  assets,
  assetSnapshots,
  auditLog,
  budgets,
  bankStatementLines,
  categories,
  categoryRules,
  costCenters,
  creditCardStatements,
  goalContributions,
  goals,
  installmentPlans,
  invites,
  ledgerMembers,
  ledgers,
  recurringRules,
  reimbursableParticipants,
  reimbursables,
  transactionSplits,
  transactions,
  userAchievements,
  userProgress,
  users,
} from "@/db/schema";

/**
 * Portabilidade de dados (LGPD, art. 18): a pessoa tem direito de EXPORTAR tudo
 * o que é seu e de EXCLUIR a conta. Aqui reunimos, num único objeto, todos os
 * dados dos espaços que o usuário possui — sem segredos (hash de senha, segredo
 * de 2FA, tokens de reset ficam de fora).
 */
export async function exportarDados(userId: string) {
  const [perfil] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      criadoEm: users.createdAt,
      emailVerificadoEm: users.emailVerifiedAt,
      doisFatoresAtivo: users.totpEnabledAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  // Só os espaços que a pessoa POSSUI (os compartilhados pertencem ao dono).
  const meusLedgers = await db.select().from(ledgers).where(eq(ledgers.ownerId, userId));
  const ledgerIds = meusLedgers.map((l) => l.id);

  const doLedger = <T>(tabela: { ledgerId: unknown }, q: (ids: string[]) => Promise<T>) =>
    ledgerIds.length ? q(ledgerIds) : Promise.resolve([] as unknown as T);

  const [
    membros,
    contas,
    cats,
    centros,
    txs,
    orcamentos,
    recorrencias,
    planos,
    faturas,
    linhasExtrato,
    regras,
    rachas,
    tiposBem,
    bens,
    metas,
    progresso,
    conquistas,
    auditoria,
  ] = await Promise.all([
    doLedger(ledgerMembers, (ids) => db.select().from(ledgerMembers).where(inArray(ledgerMembers.ledgerId, ids))),
    doLedger(accounts, (ids) => db.select().from(accounts).where(inArray(accounts.ledgerId, ids))),
    doLedger(categories, (ids) => db.select().from(categories).where(inArray(categories.ledgerId, ids))),
    doLedger(costCenters, (ids) => db.select().from(costCenters).where(inArray(costCenters.ledgerId, ids))),
    doLedger(transactions, (ids) => db.select().from(transactions).where(inArray(transactions.ledgerId, ids))),
    doLedger(budgets, (ids) => db.select().from(budgets).where(inArray(budgets.ledgerId, ids))),
    doLedger(recurringRules, (ids) => db.select().from(recurringRules).where(inArray(recurringRules.ledgerId, ids))),
    doLedger(installmentPlans, (ids) => db.select().from(installmentPlans).where(inArray(installmentPlans.ledgerId, ids))),
    doLedger(creditCardStatements, (ids) => db.select().from(creditCardStatements).where(inArray(creditCardStatements.ledgerId, ids))),
    doLedger(bankStatementLines, (ids) => db.select().from(bankStatementLines).where(inArray(bankStatementLines.ledgerId, ids))),
    doLedger(categoryRules, (ids) => db.select().from(categoryRules).where(inArray(categoryRules.ledgerId, ids))),
    doLedger(reimbursables, (ids) => db.select().from(reimbursables).where(inArray(reimbursables.ledgerId, ids))),
    doLedger(assetKinds, (ids) => db.select().from(assetKinds).where(inArray(assetKinds.ledgerId, ids))),
    doLedger(assets, (ids) => db.select().from(assets).where(inArray(assets.ledgerId, ids))),
    doLedger(goals, (ids) => db.select().from(goals).where(inArray(goals.ledgerId, ids))),
    db.select().from(userProgress).where(eq(userProgress.userId, userId)),
    db.select().from(userAchievements).where(eq(userAchievements.userId, userId)),
    db.select().from(auditLog).where(eq(auditLog.userId, userId)),
  ]);

  // Filhos que dependem de ids já carregados.
  const txIds = txs.map((t) => t.id);
  const rachaIds = rachas.map((r) => r.id);
  const metaIds = metas.map((m) => m.id);
  const bemIds = bens.map((b) => b.id);

  const [rateios, participantes, contribuicoes, snapshots] = await Promise.all([
    txIds.length ? db.select().from(transactionSplits).where(inArray(transactionSplits.transactionId, txIds)) : [],
    rachaIds.length ? db.select().from(reimbursableParticipants).where(inArray(reimbursableParticipants.reimbursableId, rachaIds)) : [],
    metaIds.length ? db.select().from(goalContributions).where(inArray(goalContributions.goalId, metaIds)) : [],
    bemIds.length ? db.select().from(assetSnapshots).where(inArray(assetSnapshots.assetId, bemIds)) : [],
  ]);

  return {
    exportadoEm: new Date().toISOString(),
    aviso: "Exportação de dados pessoais do Build Money. Não contém senhas nem segredos de segurança.",
    perfil,
    espacos: meusLedgers,
    membros,
    contas,
    categorias: cats,
    centrosDeCusto: centros,
    lancamentos: txs,
    rateios,
    orcamentos,
    recorrencias,
    parcelamentos: planos,
    faturas,
    linhasDeExtrato: linhasExtrato,
    regrasDeCategoria: regras,
    rachas,
    participantesDeRacha: participantes,
    tiposDeBem: tiposBem,
    bens,
    fotosDeBem: snapshots,
    metas,
    contribuicoesDeMeta: contribuicoes,
    progresso,
    conquistas,
    auditoria,
    convitesQueUsei: await db.select().from(invites).where(eq(invites.usedByUserId, userId)),
  };
}

/**
 * Exclui a conta e TODOS os dados dela. Os espaços que a pessoa possui são
 * apagados em cascata (o schema tem onDelete cascade a partir de ledgers e de
 * users), então basta remover os ledgers próprios e o usuário.
 *
 * Não deixamos rastro pessoal: mesmo o log de auditoria referente ao usuário é
 * desvinculado pelo onDelete set null.
 */
export async function excluirConta(userId: string): Promise<void> {
  await db.transaction(async (trx) => {
    const meus = await trx.select({ id: ledgers.id }).from(ledgers).where(eq(ledgers.ownerId, userId));
    const ledgerIds = meus.map((l) => l.id);

    if (ledgerIds.length) {
      // Algumas FKs são RESTRICT (lançamento→conta, rateio→lançamento,
      // racha→conta) e travariam o cascade do espaço. Então apagamos essas
      // dependências na ORDEM certa antes de derrubar o ledger; o resto
      // (contas, categorias, orçamentos, etc.) cai por cascade.
      const txs = await trx
        .select({ id: transactions.id })
        .from(transactions)
        .where(inArray(transactions.ledgerId, ledgerIds));
      const txIds = txs.map((t) => t.id);

      const rachas = await trx
        .select({ id: reimbursables.id })
        .from(reimbursables)
        .where(inArray(reimbursables.ledgerId, ledgerIds));
      const rachaIds = rachas.map((r) => r.id);

      if (txIds.length) await trx.delete(transactionSplits).where(inArray(transactionSplits.transactionId, txIds));
      if (rachaIds.length) await trx.delete(reimbursableParticipants).where(inArray(reimbursableParticipants.reimbursableId, rachaIds));
      await trx.delete(transactions).where(inArray(transactions.ledgerId, ledgerIds));
      await trx.delete(reimbursables).where(inArray(reimbursables.ledgerId, ledgerIds));

      await trx.delete(ledgers).where(inArray(ledgers.id, ledgerIds));
    }

    // Participação em espaços de terceiros (não apaga o espaço alheio).
    await trx.delete(ledgerMembers).where(eq(ledgerMembers.userId, userId));
    // Enfim, o usuário — cascade leva 2FA, tokens, progresso, conquistas.
    await trx.delete(users).where(eq(users.id, userId));
  });
}
