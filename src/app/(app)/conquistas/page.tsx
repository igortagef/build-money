import {
  Flame,
  Lock,
  Wallet,
  Pencil,
  Layers,
  Split,
  Tags,
  Check,
  CheckCheck,
  ShieldCheck,
  Target,
  Trophy,
  TrendingUp,
} from "lucide-react";
import { requireAccess } from "@/lib/auth";
import {
  getConquistas,
  getHistoricoXp,
  getProgresso,
} from "@/lib/gamification";
import {
  ACHIEVEMENTS,
  GRUPO_LABEL,
  levelProgress,
  type Achievement,
} from "@/lib/achievements";
import { Card, cn } from "@/components/ui";

export const metadata = { title: "Conquistas · Build Money" };

const ICONES: Record<string, React.ComponentType<{ className?: string }>> = {
  flame: Flame,
  wallet: Wallet,
  pencil: Pencil,
  layers: Layers,
  split: Split,
  tags: Tags,
  check: Check,
  "check-check": CheckCheck,
  "shield-check": ShieldCheck,
  target: Target,
  trophy: Trophy,
  "trending-up": TrendingUp,
};

export default async function ConquistasPage() {
  const { userId } = await requireAccess();

  const [progresso, conquistadas, historico] = await Promise.all([
    getProgresso(userId),
    getConquistas(userId),
    getHistoricoXp(userId),
  ]);

  const obtidas = new Map(conquistadas.map((c) => [c.code, c.unlockedAt]));
  const p = levelProgress(progresso.xp);

  const grupos = Object.keys(GRUPO_LABEL) as Achievement["grupo"][];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Conquistas</h1>

      {/* Cartão de nível */}
      <Card className="overflow-hidden">
        <div className="bg-brand-teal p-6 text-white">
          <div className="flex items-center gap-4">
            <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-brand-gold text-xl font-bold text-xp-foreground">
              {p.level}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-lg font-semibold">{p.titulo}</p>
              <p className="text-sm text-white/70">
                {p.xp} XP · faltam {p.xpParaProximo} para o nível {p.level + 1}
              </p>
            </div>
          </div>

          <div
            className="mt-4 h-2 overflow-hidden rounded-full bg-white/20"
            role="progressbar"
            aria-valuenow={p.percentual}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Progresso do nível ${p.level}`}
          >
            <div
              className="h-full rounded-full bg-brand-gold transition-all"
              style={{ width: `${p.percentual}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-3 divide-x divide-border">
          <Stat
            label="Ofensiva"
            valor={`${progresso.currentStreak}`}
            sufixo={progresso.currentStreak === 1 ? "dia" : "dias"}
            destaque={progresso.currentStreak > 0}
          />
          <Stat
            label="Recorde"
            valor={`${progresso.longestStreak}`}
            sufixo={progresso.longestStreak === 1 ? "dia" : "dias"}
          />
          <Stat
            label="Conquistas"
            valor={`${obtidas.size}`}
            sufixo={`de ${ACHIEVEMENTS.length}`}
          />
        </div>
      </Card>

      {/* Conquistas por grupo */}
      {grupos.map((grupo) => {
        const lista = ACHIEVEMENTS.filter((a) => a.grupo === grupo);
        const feitas = lista.filter((a) => obtidas.has(a.code)).length;

        return (
          <section key={grupo} className="space-y-3">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold text-muted-foreground">
                {GRUPO_LABEL[grupo]}
              </h2>
              <span className="text-xs text-muted-foreground">
                {feitas}/{lista.length}
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {lista.map((a) => {
                const desbloqueada = obtidas.has(a.code);
                const Icone = ICONES[a.icone] ?? Trophy;

                return (
                  <Card
                    key={a.code}
                    className={cn(
                      "flex items-start gap-3 p-4 transition-colors",
                      desbloqueada ? "border-xp-border" : "opacity-70",
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-10 shrink-0 place-items-center rounded-lg",
                        desbloqueada
                          ? "bg-xp text-xp-foreground"
                          : "bg-surface-muted text-muted-foreground",
                      )}
                      aria-hidden
                    >
                      {desbloqueada ? (
                        <Icone className="size-5" />
                      ) : (
                        <Lock className="size-4" />
                      )}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="font-medium">{a.nome}</p>
                        <span
                          className={cn(
                            "shrink-0 text-xs font-semibold",
                            desbloqueada
                              ? "text-xp-text"
                              : "text-muted-foreground",
                          )}
                        >
                          +{a.xp} XP
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {/* Bloqueada mostra COMO obter; desbloqueada mostra o
                            que a pessoa fez. Um "???" não ensina nada. */}
                        {desbloqueada ? a.descricao : a.comoObter}
                      </p>
                      {desbloqueada && (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Conquistada em{" "}
                          {obtidas
                            .get(a.code)!
                            .toLocaleDateString("pt-BR", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })}
                        </p>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          </section>
        );
      })}

      {/* Histórico de XP */}
      {historico.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">
            XP recente
          </h2>
          <Card className="divide-y divide-border">
            {historico.map((e) => (
              <div key={e.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="min-w-0 flex-1 truncate text-sm">
                  {e.label ?? e.kind}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {e.createdAt.toLocaleDateString("pt-BR", {
                    day: "2-digit",
                    month: "short",
                  })}
                </span>
                <span className="tabular shrink-0 text-sm font-semibold text-xp-text">
                  +{e.amount}
                </span>
              </div>
            ))}
          </Card>
        </section>
      )}
    </div>
  );
}

function Stat({
  label,
  valor,
  sufixo,
  destaque,
}: {
  label: string;
  valor: string;
  sufixo: string;
  destaque?: boolean;
}) {
  return (
    <div className="p-4 text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5">
        <span
          className={cn(
            "tabular text-xl font-semibold",
            destaque && "text-xp-text",
          )}
        >
          {valor}
        </span>{" "}
        <span className="text-xs text-muted-foreground">{sufixo}</span>
      </p>
    </div>
  );
}
