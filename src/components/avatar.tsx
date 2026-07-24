import { cn } from "./ui";

function iniciais(name: string | null, email: string) {
  return (name ?? email)
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

/**
 * Avatar da pessoa: mostra a foto de perfil quando há uma, senão as iniciais.
 * O tamanho vem por `className` (ex.: "size-8 text-xs"). A foto é guardada como
 * data URL no próprio usuário, então entra direto no src.
 */
export function Avatar({
  name,
  email,
  imageUrl,
  className,
}: {
  name: string | null;
  email: string;
  imageUrl?: string | null;
  className?: string;
}) {
  if (imageUrl) {
    return (
      // Data URL local (não é imagem remota); next/image não se aplica aqui.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt={name ?? email}
        className={cn("shrink-0 rounded-full object-cover", className)}
      />
    );
  }
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
