import { Badge } from "@plan2classe-app/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@plan2classe-app/ui/components/card";
import type { Metadata } from "next";
import {
  ArrowRight,
  CheckCircle2,
  GitBranch,
  Network,
  Scale,
  ShieldCheck,
  Sparkles,
  TimerReset,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Comprendre le moteur",
};

const stages = [
  {
    icon: ShieldCheck,
    title: "Faisabilité",
    description:
      "Chaque élève reçoit une place, aucune place n’est doublée et toutes les règles dures sont respectées.",
  },
  {
    icon: Scale,
    title: "Équité max-min",
    description: "Le moteur maximise d’abord la satisfaction de la personne la moins satisfaite.",
  },
  {
    icon: Sparkles,
    title: "Satisfaction globale",
    description:
      "À équité identique, il maximise les préférences pondérées et les objectifs collectifs.",
  },
  {
    icon: GitBranch,
    title: "Stabilité",
    description: "À qualité identique, il garde le plus d’élèves possible à leur place précédente.",
  },
] as const;

const principles = [
  {
    icon: Network,
    title: "La salle devient un graphe",
    text: "Les formes de tables servent au dessin. Le solveur travaille sur les sièges et leurs relations explicites : voisin direct, proximité, même table, même îlot ou collision de main. Les tables rondes, en U, les îlots et les dispositions libres utilisent donc le même modèle robuste.",
  },
  {
    icon: TimerReset,
    title: "Les réponses peuvent arriver progressivement",
    text: "Les absents restent placés avec une satisfaction neutre. Chaque nouvelle réponse relance le calcul global ; la stabilité évite de bouleverser le plan lorsqu’un changement n’améliore rien.",
  },
  {
    icon: Scale,
    title: "Les contradictions sont expliquées",
    text: "Chaque contrainte dure reçoit une hypothèse identifiable. Si le problème est impossible, CP-SAT renvoie un noyau contradictoire que le service réduit sous budget de temps pour indiquer précisément les règles à revoir.",
  },
  {
    icon: ShieldCheck,
    title: "Chaque solution est vérifiée deux fois",
    text: "Après le solveur, un validateur indépendant relit l’affectation sans réutiliser le modèle CP-SAT. Une solution n’est déclarée fiable que si toutes les règles dures passent cette seconde vérification.",
  },
] as const;

export default function AlgorithmPage() {
  return (
    <article className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 lg:py-14">
      <Badge variant="outline">OR-Tools CP-SAT</Badge>
      <h1 className="mt-4 max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
        Un plan de classe est un problème d’optimisation, pas un simple mélange.
      </h1>
      <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">
        Avec 36 élèves et 36 sièges, il existe environ 3,72 × 10⁴¹ affectations. Plan2Classe encode
        la salle comme un graphe, distingue les règles impossibles à violer des souhaits, puis
        résout plusieurs objectifs dans un ordre auditable.
      </p>

      <section aria-label="Étapes du calcul" className="mt-10">
        <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          L’ordre des objectifs
        </h2>
        <ol className="mt-4 grid items-stretch gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr]">
          {stages.map((stage, index) => (
            <li key={stage.title} className="contents">
              <Card className="gap-3 py-5 shadow-none">
                <CardHeader className="px-5">
                  <div className="mb-2 grid size-9 place-items-center rounded-lg bg-muted">
                    <stage.icon className="size-4" aria-hidden="true" />
                  </div>
                  <CardTitle className="text-sm">
                    {index + 1}. {stage.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-5 text-xs leading-5 text-muted-foreground">
                  {stage.description}
                </CardContent>
              </Card>
              {index < stages.length - 1 && (
                <div
                  aria-hidden="true"
                  className="grid place-items-center py-1 text-muted-foreground md:px-1 md:py-0"
                >
                  <ArrowRight className="size-4 rotate-90 md:rotate-0" />
                </div>
              )}
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          Chaque étape protège le résultat de la précédente : améliorer la satisfaction globale ne
          peut jamais dégrader l’équité déjà acquise.
        </p>
      </section>

      <div className="mt-10 grid gap-4 md:grid-cols-2">
        {principles.map((principle) => (
          <section key={principle.title} className="rounded-2xl border p-6">
            <div className="grid size-9 place-items-center rounded-lg bg-muted">
              <principle.icon className="size-4" aria-hidden="true" />
            </div>
            <h2 className="mt-5 font-semibold tracking-tight">{principle.title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{principle.text}</p>
          </section>
        ))}
      </div>

      <div className="mt-10 rounded-2xl bg-foreground p-6 text-background sm:p-8">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <div>
            <h2 className="font-semibold">Ce que signifie « optimal »</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-background/70">
              Le statut optimal indique que les deux objectifs pédagogiques principaux — équité puis
              satisfaction totale — sont prouvés. Si le budget expire, Plan2Classe conserve la
              meilleure solution faisable avec sa borne et son écart connu, sans masquer
              l’incertitude.
            </p>
          </div>
        </div>
      </div>
    </article>
  );
}
