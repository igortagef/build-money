import { Landmark } from "lucide-react";
import { bancoPorId } from "@/lib/banks";
import { cn } from "./ui";

/**
 * Ícone da conta: quando há banco escolhido, um quadradinho na COR do banco com
 * a sigla (não é o logotipo — ver comentário em lib/banks.ts). Sem banco, um
 * ícone neutro de instituição. Puramente decorativo.
 */
export function BankIcon({
  bankId,
  size = "md",
  className,
}: {
  bankId?: string | null;
  size?: "sm" | "md";
  className?: string;
}) {
  const banco = bancoPorId(bankId);
  const dims = size === "sm" ? "size-8 text-[10px]" : "size-10 text-xs";

  if (!banco) {
    return (
      <span
        className={cn(
          "grid shrink-0 place-items-center rounded-lg bg-primary-subtle text-primary-text",
          dims,
          className,
        )}
        aria-hidden
      >
        <Landmark className={size === "sm" ? "size-4" : "size-5"} />
      </span>
    );
  }

  return (
    <span
      className={cn("grid shrink-0 place-items-center rounded-lg font-bold leading-none", dims, className)}
      style={{ background: banco.cor, color: banco.corTexto ?? "#fff" }}
      aria-hidden
      title={banco.nome}
    >
      {banco.sigla}
    </span>
  );
}
