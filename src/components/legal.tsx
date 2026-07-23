/** Blocos de texto para as páginas legais — estilo consistente e legível. */

export function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold text-foreground">{titulo}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

export function Lista({ itens }: { itens: React.ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5">
      {itens.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  );
}

/** Marca um trecho a preencher com dados reais (ex.: razão social, CNPJ). */
export function Preencher({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-xp-subtle px-1 font-medium text-warning" title="Preencher com o dado real">
      {children}
    </span>
  );
}
