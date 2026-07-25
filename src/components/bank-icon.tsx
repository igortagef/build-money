import { Landmark } from "lucide-react";
import { cn } from "./ui";

/**
 * Ícone da conta: um glifo neutro de instituição. Puramente decorativo.
 *
 * Antes mostrava um quadradinho na cor do banco com a sigla, mas isso parecia um
 * logotipo falso (a marca oficial não pode ser usada). Agora é sempre neutro. A
 * prop `bankId` é aceita por compatibilidade com quem chama, mas ignorada.
 */
export function BankIcon({
  size = "md",
  className,
}: {
  bankId?: string | null;
  size?: "sm" | "md";
  className?: string;
}) {
  const dims = size === "sm" ? "size-8" : "size-10";

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
