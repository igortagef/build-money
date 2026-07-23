import { cn } from "./ui";

/**
 * Símbolo do Build Money: três blocos empilhados em ziguezague.
 *
 * Geometria medida do PDF da marca por scripts/medir-simbolo.ts — percentuais
 * do quadrado do símbolo, não da caixa do recorte. Cada barra é uma cápsula
 * (raio = metade da altura).
 */
const BARRAS = [
  { x: 27.59, y: 25.17, w: 27.93, h: 8.97 },
  { x: 43.45, y: 45.17, w: 36.55, h: 8.62 },
  { x: 31.38, y: 65.52, w: 34.48, h: 8.62 },
] as const;

/** Raio dos cantos do quadrado, também medido: 20.86% do lado. */
const RAIO = 20.86;

type LogoMarkProps = {
  className?: string;
  /**
   * contained  — cápsulas douradas dentro do quadrado teal (padrão, ícone de app)
   * bare       — só as cápsulas, para usar sobre fundo teal
   * mono       — quadrado claro com cápsulas teal
   * gold       — quadrado dourado com cápsulas escuras
   */
  variant?: "contained" | "bare" | "mono" | "gold";
  title?: string;
};

export function LogoMark({
  className,
  variant = "contained",
  title,
}: LogoMarkProps) {
  const fundo =
    variant === "contained"
      ? "var(--brand-teal)"
      : variant === "mono"
        ? "var(--surface)"
        : variant === "gold"
          ? "var(--brand-gold)"
          : "none";

  const barras =
    variant === "contained" || variant === "bare"
      ? "var(--brand-gold)"
      : variant === "mono"
        ? "var(--brand-teal)"
        : "var(--brand-teal-deep)";

  return (
    <svg
      viewBox="0 0 100 100"
      className={cn("shrink-0", className)}
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {variant !== "bare" && (
        <rect width="100" height="100" rx={RAIO} ry={RAIO} fill={fundo} />
      )}
      {BARRAS.map((b, i) => (
        <rect
          key={i}
          x={b.x}
          y={b.y}
          width={b.w}
          height={b.h}
          rx={b.h / 2}
          ry={b.h / 2}
          fill={barras}
        />
      ))}
    </svg>
  );
}

/**
 * Assinatura da marca. O nome é sempre em caixa baixa — é uma decisão da
 * identidade ("caixa baixa acessível, sem formalidade excessiva"), não um
 * descuido de digitação.
 */
export function Logo({
  className,
  size = "md",
  tone = "brand",
  showMark = true,
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
  tone?: "brand" | "onDark";
  showMark?: boolean;
}) {
  const sizes = {
    sm: { mark: "size-6", text: "text-base" },
    md: { mark: "size-8", text: "text-lg" },
    lg: { mark: "size-12", text: "text-2xl" },
  };

  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      {showMark && (
        <LogoMark
          variant={tone === "onDark" ? "bare" : "contained"}
          className={sizes[size].mark}
        />
      )}
      <span
        className={cn(
          "font-semibold lowercase tracking-tight",
          sizes[size].text,
          tone === "onDark" ? "text-white" : "text-brand-teal",
        )}
      >
        build money
      </span>
    </span>
  );
}
