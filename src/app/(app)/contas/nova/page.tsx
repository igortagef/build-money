import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAccess } from "@/lib/auth";
import { AccountForm } from "../account-form";

export const metadata = { title: "Nova conta · Build Money" };

export default async function NovaContaPage() {
  await requireAccess();

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="space-y-3">
        <Link
          href="/contas"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Contas
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Nova conta</h1>
      </div>

      <AccountForm mode="create" />
    </div>
  );
}
