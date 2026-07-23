import { db } from "../src/db";
import { users } from "../src/db/schema";
import { eq } from "drizzle-orm";

async function main() {
  const email = process.argv[2] ?? "igortiburske2000@gmail.com";
  const r = await db
    .update(users)
    .set({ isAdmin: true })
    .where(eq(users.email, email.toLowerCase()))
    .returning({ email: users.email, name: users.name, isAdmin: users.isAdmin });
  console.log(r.length ? "PROMOVIDO: " + JSON.stringify(r[0]) : "NENHUM usuário com o email " + email);
  process.exit(0);
}
main();
