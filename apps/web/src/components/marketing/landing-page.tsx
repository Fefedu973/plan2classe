import { Badge } from "@plan2classe-app/ui/components/badge";
import { buttonVariants } from "@plan2classe-app/ui/components/button";
import { cn } from "@plan2classe-app/ui/lib/utils";
import {
  ArrowRight,
  BarChart3,
  Blocks,
  Check,
  ClipboardCheck,
  FileDown,
  FormInput,
  Gauge,
  LockKeyhole,
  MousePointerClick,
  Route,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";
import Link from "next/link";

import { SiteFooter, SiteHeader } from "./site-chrome";

const previewSeats = [
  { name: "Inès", place: "A1", active: true },
  { name: "Noah", place: "A2", active: false },
  { name: "Lina", place: "B1", active: false },
  { name: "Adam", place: "B2", active: true },
  { name: "Jade", place: "C1", active: false },
  { name: "Maël", place: "C2", active: false },
] as const;

const steps = [
  {
    number: "01",
    icon: MousePointerClick,
    title: "Dessinez la salle",
    text: "Placez les tables et les sièges, puis décrivez les zones et relations utiles.",
  },
  {
    number: "02",
    icon: ClipboardCheck,
    title: "Recueillez les choix",
    text: "Les élèves répondent depuis un lien public, avec un code individuel si vous le souhaitez.",
  },
  {
    number: "03",
    icon: Route,
    title: "Calculez et arbitrez",
    text: "Comparez la satisfaction, comprenez les compromis et exportez la version retenue.",
  },
] as const;

const features = [
  {
    icon: FormInput,
    title: "Des préférences faciles à recueillir",
    description:
      "Partagez un lien. Chaque élève classe ses places, ses zones et ses voisinages sans créer de compte.",
  },
  {
    icon: Blocks,
    title: "Vos vraies contraintes de classe",
    description:
      "Places imposées ou interdites, groupes, besoins particuliers, alternance et règles de proximité.",
  },
  {
    icon: Gauge,
    title: "Un optimum, pas un tirage au sort",
    description:
      "Le moteur arbitre les compromis, protège la satisfaction minimale et conserve un résultat explicable.",
  },
  {
    icon: FileDown,
    title: "Un plan prêt à utiliser",
    description:
      "Relisez, ajustez puis exportez un PDF propre pour la salle ou votre dossier pédagogique.",
  },
] as const;

export function LandingPage() {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <SiteHeader />

      <main className="flex-1">
        <section className="relative overflow-hidden border-b">
          <div className="mx-auto grid max-w-7xl gap-14 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-[0.92fr_1.08fr] lg:items-center lg:px-10 lg:py-28">
            <div className="max-w-2xl">
              <Badge variant="outline" className="mb-6 gap-1.5 bg-background">
                <Sparkles aria-hidden="true" />
                Le plan de classe, enfin calculé avec méthode
              </Badge>
              <h1 className="text-4xl leading-[1.05] font-semibold tracking-[-0.04em] text-balance sm:text-6xl lg:text-7xl">
                Le meilleur plan de classe, sans tirer au sort.
              </h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-pretty text-muted-foreground sm:text-lg sm:leading-8">
                Plan2Classe réunit les souhaits des élèves, vos contraintes pédagogiques et un
                moteur d’optimisation pour produire une répartition juste, stable et utilisable.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/login?mode=signup"
                  className={cn(buttonVariants({ size: "lg" }), "h-11 px-5")}
                >
                  Créer mon premier plan
                  <ArrowRight data-icon="inline-end" aria-hidden="true" />
                </Link>
                <Link
                  href="#fonctionnement"
                  className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11 px-5")}
                >
                  Voir comment ça marche
                </Link>
              </div>
              <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm text-muted-foreground">
                {[
                  "Sans compte pour les élèves",
                  "Aucun envoi d’e-mail requis",
                  "Auto-hébergeable",
                ].map((benefit) => (
                  <li key={benefit} className="flex items-center gap-2">
                    <Check className="size-3.5 text-foreground" aria-hidden="true" />
                    {benefit}
                  </li>
                ))}
              </ul>
            </div>

            <div className="relative mx-auto w-full max-w-2xl lg:mx-0">
              <div
                aria-hidden="true"
                className="absolute -inset-5 -z-10 rounded-[2rem] bg-muted/60"
              />
              <div className="overflow-hidden rounded-2xl border bg-card shadow-xl shadow-foreground/5">
                <div className="flex items-center justify-between border-b px-5 py-4">
                  <div>
                    <p className="font-medium">4e B · Salle 204</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Dernier calcul à l’instant
                    </p>
                  </div>
                  <Badge variant="secondary" className="gap-1.5">
                    <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
                    Plan optimal
                  </Badge>
                </div>

                <div className="grid gap-4 p-4 sm:grid-cols-[1fr_170px] sm:p-5">
                  <div className="rounded-xl border bg-muted/20 p-4">
                    <div className="mx-auto mb-7 h-2 w-2/3 rounded-full bg-foreground/75" />
                    <div className="grid grid-cols-2 gap-3">
                      {previewSeats.map((seat, index) => (
                        <div
                          key={seat.place}
                          className={cn(
                            "relative rounded-lg border bg-background p-3 shadow-xs",
                            seat.active && "border-foreground ring-2 ring-foreground/10",
                          )}
                        >
                          <span className="absolute top-2 right-2 text-[10px] text-muted-foreground">
                            {seat.place}
                          </span>
                          <div className="mb-3 grid size-7 place-items-center rounded-full bg-muted text-xs font-medium">
                            {index + 1}
                          </div>
                          <p className="text-sm font-medium">{seat.name}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid content-start gap-3">
                    <div className="rounded-xl border p-4">
                      <BarChart3
                        className="mb-4 size-4 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <p className="text-xs text-muted-foreground">Satisfaction minimale</p>
                      <p className="mt-1 text-2xl font-semibold tracking-tight">84</p>
                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full w-[84%] rounded-full bg-foreground" />
                      </div>
                    </div>
                    <div className="rounded-xl border p-4">
                      <UsersRound
                        className="mb-4 size-4 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <p className="text-xs text-muted-foreground">Réponses reçues</p>
                      <p className="mt-1 text-2xl font-semibold tracking-tight">27 / 29</p>
                    </div>
                    <div className="flex items-center gap-2 rounded-xl border bg-muted/30 p-3 text-xs text-muted-foreground">
                      <ShieldCheck className="size-4 shrink-0 text-foreground" aria-hidden="true" />
                      Contraintes dures vérifiées
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="fonctionnement" className="scroll-mt-16 border-b bg-muted/20">
          <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-10 lg:py-24">
            <div className="max-w-2xl">
              <p className="text-sm font-medium text-muted-foreground">Du formulaire au PDF</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
                Une méthode claire en trois temps.
              </h2>
            </div>

            <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border bg-border md:grid-cols-3">
              {steps.map((step) => (
                <article key={step.number} className="bg-background p-7 sm:p-8">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-muted-foreground">{step.number}</span>
                    <step.icon className="size-5 text-muted-foreground" aria-hidden="true" />
                  </div>
                  <h3 className="mt-12 text-lg font-medium">{step.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{step.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="capacites" className="scroll-mt-16 border-b">
          <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-10 lg:py-24">
            <div className="grid gap-12 lg:grid-cols-[0.72fr_1.28fr]">
              <div className="max-w-md">
                <Badge variant="secondary">Tout ce qu’il faut, au même endroit</Badge>
                <h2 className="mt-5 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
                  La complexité reste dans le moteur.
                </h2>
                <p className="mt-4 leading-7 text-muted-foreground">
                  L’interface vous guide. Vous gardez la main sur les règles, les données et le
                  plan final.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {features.map((feature) => (
                  <article key={feature.title} className="rounded-2xl border p-6">
                    <div className="grid size-9 place-items-center rounded-lg bg-muted">
                      <feature.icon className="size-4" aria-hidden="true" />
                    </div>
                    <h3 className="mt-7 font-medium">{feature.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {feature.description}
                    </p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="bg-foreground text-background">
          <div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[1fr_auto] lg:items-center lg:px-10 lg:py-20">
            <div className="max-w-2xl">
              <LockKeyhole className="mb-5 size-5 text-background/60" aria-hidden="true" />
              <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
                Votre prochaine classe mérite mieux qu’un tableur.
              </h2>
              <p className="mt-4 max-w-xl leading-7 text-background/65">
                Créez votre espace administrateur. Les élèves, eux, n’auront besoin que du lien du
                formulaire.
              </p>
            </div>
            <Link
              href="/login?mode=signup"
              className={cn(
                buttonVariants({ variant: "secondary", size: "lg" }),
                "h-11 bg-background px-5 text-foreground hover:bg-background/90",
              )}
            >
              Commencer maintenant
              <ArrowRight data-icon="inline-end" aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
