"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireAccess } from "@/lib/auth";
import { PAINEL_WIDGET_IDS } from "@/lib/dashboard-widgets";

/** Salva quais blocos do painel o usuário escondeu. */
export async function salvarPainel(hidden: string[]): Promise<{ ok: boolean }> {
  const { userId } = await requireAccess();
  // Só aceita ids do catálogo, para não guardar lixo.
  const limpo = [...new Set(hidden.filter((id) => PAINEL_WIDGET_IDS.includes(id)))];
  await db
    .update(users)
    .set({ dashboardHidden: limpo, updatedAt: new Date() })
    .where(eq(users.id, userId));
  revalidatePath("/");
  return { ok: true };
}
