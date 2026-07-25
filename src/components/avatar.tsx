import { cn } from "./ui";

function iniciais(name: string | null, email: string) {
  return (name ?? email)
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

/**
 * Avatar da pessoa: mostra as iniciais do nome (ou do e-mail). Sem foto — o app
 * não guarda imagem de perfil, para manter o banco e as páginas leves.
 * O tamanho vem por `className` (ex.: "size-8 text-xs").
 */
export function Avatar({
  name,
  email,
  className,
}: {
  name: string | null;
  email: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-primary-subtle font-semibold text-primary-text",
        className,
      )}
    >
      {iniciais(name, email)}
    </span>
  );
}
