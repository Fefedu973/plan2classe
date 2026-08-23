"use client";

import type { SolverSettings } from "@plan2classe-app/api/schemas/classroom";
import { Alert, AlertDescription, AlertTitle } from "@plan2classe-app/ui/components/alert";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@plan2classe-app/ui/components/input-group";
import { Label } from "@plan2classe-app/ui/components/label";
import { Slider } from "@plan2classe-app/ui/components/slider";
import { Switch } from "@plan2classe-app/ui/components/switch";
import { Clock3, Ear, Eye, Hand, Scale, ShieldCheck, Star } from "lucide-react";

import { OptionSelect, type SelectOption } from "@/components/common/option-select";

const arrivalPolicyOptions: ReadonlyArray<SelectOption<SolverSettings["arrival_policy"]>> = [
  { value: "equal", label: "Égalité" },
  { value: "linear", label: "Linéaire" },
  { value: "exponential", label: "Exponentielle" },
];

const handCollisionOptions: ReadonlyArray<SelectOption<SolverSettings["hand_collision"]>> = [
  { value: "off", label: "Désactivée" },
  { value: "soft", label: "Souple" },
  { value: "hard", label: "Dure" },
];

function Row({
  icon: Icon,
  label,
  description,
  children,
}: {
  icon: typeof Scale;
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-3 border-b py-5 last:border-0 md:grid-cols-[1fr_17rem] md:items-center md:gap-6">
      <div className="flex gap-3">
        <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-muted">
          <Icon className="size-4" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <Label>{label}</Label>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="md:justify-self-end">{children}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card">
      <h3 className="border-b px-5 py-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h3>
      <div className="px-5">{children}</div>
    </section>
  );
}

function WeightInput({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (value: number) => void;
  label: string;
}) {
  return (
    <InputGroup className="w-32">
      <InputGroupInput
        type="number"
        min="0"
        value={value}
        onChange={(event) => onChange(Number(event.target.value) || 0)}
        aria-label={label}
      />
      <InputGroupAddon align="inline-end" className="text-xs">
        poids
      </InputGroupAddon>
    </InputGroup>
  );
}

export function SolverSettingsEditor({
  settings,
  onChange,
}: {
  settings: SolverSettings;
  onChange: (settings: SolverSettings) => void;
}) {
  const set = <Key extends keyof SolverSettings>(key: Key, value: SolverSettings[Key]) =>
    onChange({ ...settings, [key]: value });
  const sliderValue = (value: number | readonly number[], fallback: number) =>
    typeof value === "number" ? value : (value[0] ?? fallback);

  return (
    <div className="space-y-5">
      <Alert>
        <ShieldCheck aria-hidden="true" />
        <AlertTitle>Les contraintes dures passent toujours avant ces réglages.</AlertTitle>
        <AlertDescription>
          Les poids n’autorisent jamais une règle dure à être violée. Ils départagent seulement les
          plans faisables.
        </AlertDescription>
      </Alert>

      <Section title="Équité et arbitrage">
        <Row
          icon={Scale}
          label="Équité max-min"
          description="Maximise d’abord la satisfaction de la personne la moins satisfaite."
        >
          <Switch
            checked={settings.fairness_enabled}
            onCheckedChange={(checked) => set("fairness_enabled", checked)}
            aria-label="Activer l’équité max-min"
          />
        </Row>
        <Row
          icon={Scale}
          label="Tolérance d’équité"
          description="Perte maximale autorisée sur 1000 avant d’améliorer la satisfaction globale."
        >
          <div className="flex w-full items-center gap-3 md:w-64">
            <Slider
              min={0}
              max={200}
              step={5}
              value={[settings.fairness_tolerance]}
              onValueChange={(value) => set("fairness_tolerance", sliderValue(value, 0))}
              aria-label="Tolérance d’équité"
            />
            <span className="w-10 shrink-0 text-right text-xs tabular-nums">
              {settings.fairness_tolerance}
            </span>
          </div>
        </Row>
        <Row
          icon={Clock3}
          label="Priorité d’arrivée"
          description="Avantage les premières réponses, seulement après l’objectif d’équité."
        >
          <div className="flex gap-2">
            <OptionSelect
              value={settings.arrival_policy}
              onValueChange={(value) => set("arrival_policy", value)}
              options={arrivalPolicyOptions}
              className="w-36"
              aria-label="Politique d’arrivée"
            />
            <InputGroup className="w-24">
              <InputGroupInput
                type="number"
                min="0"
                max="500"
                value={settings.arrival_bonus_percent}
                onChange={(event) => set("arrival_bonus_percent", Number(event.target.value) || 0)}
                aria-label="Bonus d’arrivée en pourcentage"
              />
              <InputGroupAddon align="inline-end" className="text-xs">
                %
              </InputGroupAddon>
            </InputGroup>
          </div>
        </Row>
        <Row
          icon={Star}
          label="Stabilité du plan"
          description="Conserve les places précédentes lorsque la qualité principale reste identique."
        >
          <Switch
            checked={settings.stability_enabled}
            onCheckedChange={(checked) => set("stability_enabled", checked)}
            aria-label="Activer la stabilité"
          />
        </Row>
        <Row
          icon={Clock3}
          label="Recalcul automatique"
          description="Relance le plan à chaque réponse enregistrée."
        >
          <Switch
            checked={settings.auto_solve_on_response}
            onCheckedChange={(checked) => set("auto_solve_on_response", checked)}
            aria-label="Recalcul automatique"
          />
        </Row>
      </Section>

      <Section title="Besoins et confort">
        <Row
          icon={Hand}
          label="Collision droitier / gaucher"
          description="Évite la combinaison inconfortable sur les relations directionnelles hand_conflict."
        >
          <div className="flex gap-2">
            <OptionSelect
              value={settings.hand_collision}
              onValueChange={(value) => set("hand_collision", value)}
              options={handCollisionOptions}
              className="w-32"
              aria-label="Collision de main"
            />
            <WeightInput
              value={settings.hand_collision_weight}
              onChange={(value) => set("hand_collision_weight", value)}
              label="Poids collision main"
            />
          </div>
        </Row>
        <Row
          icon={Eye}
          label="Besoin visuel"
          description="Favorise les sièges les plus proches du centre du tableau selon le niveau 0 à 5."
        >
          <div className="flex flex-wrap justify-end gap-2">
            <WeightInput
              value={settings.vision_weight}
              onChange={(value) => set("vision_weight", value)}
              label="Poids vision"
            />
            <label className="flex h-8 cursor-pointer items-center gap-2 rounded-lg border px-3 text-xs">
              <Switch
                checked={settings.accessibility_hard}
                onCheckedChange={(checked) => set("accessibility_hard", checked)}
              />
              Niveaux 3–5 durs
            </label>
          </div>
        </Row>
        <Row
          icon={Ear}
          label="Besoin auditif"
          description="Favorise aussi l’avant de la salle pour les niveaux renseignés."
        >
          <WeightInput
            value={settings.hearing_weight}
            onChange={(value) => set("hearing_weight", value)}
            label="Poids audition"
          />
        </Row>
        <Row
          icon={ShieldCheck}
          label="Fraction de sièges avant"
          description="Part des places considérées comme accessibles pour un besoin maximal."
        >
          <div className="flex w-full items-center gap-3 md:w-64">
            <Slider
              min={10}
              max={60}
              step={5}
              value={[Math.round(settings.hard_front_fraction * 100)]}
              onValueChange={(value) => set("hard_front_fraction", sliderValue(value, 30) / 100)}
              aria-label="Fraction de sièges avant"
            />
            <span className="w-12 shrink-0 text-right text-xs tabular-nums">
              {Math.round(settings.hard_front_fraction * 100)} %
            </span>
          </div>
        </Row>
      </Section>

      <Section title="Niveaux scolaires">
        <Row
          icon={Scale}
          label="Équilibre des notes"
          description="Rapproche la moyenne de chaque table de la moyenne globale."
        >
          <WeightInput
            value={settings.grade_balance_weight}
            onChange={(value) => set("grade_balance_weight", value)}
            label="Poids équilibre des notes"
          />
        </Row>
        <Row
          icon={Star}
          label="Mix de niveaux"
          description="Bonus lorsque deux voisins présentent un écart de note utile au tutorat."
        >
          <div className="flex flex-wrap justify-end gap-2">
            <WeightInput
              value={settings.grade_mix_weight}
              onChange={(value) => set("grade_mix_weight", value)}
              label="Poids mix de niveaux"
            />
            <InputGroup className="w-32">
              <InputGroupInput
                type="number"
                min="0"
                step="0.5"
                value={settings.grade_mix_min_difference}
                onChange={(event) =>
                  set("grade_mix_min_difference", Number(event.target.value) || 0)
                }
                aria-label="Écart minimum de note"
              />
              <InputGroupAddon align="inline-end" className="text-xs">
                écart
              </InputGroupAddon>
            </InputGroup>
          </div>
        </Row>
      </Section>

      <Section title="Budget de calcul">
        <Row
          icon={Clock3}
          label="Temps de résolution"
          description="Temps maximal approximatif partagé entre les étapes lexicographiques."
        >
          <InputGroup className="w-36">
            <InputGroupInput
              type="number"
              min="0.5"
              max="600"
              step="0.5"
              value={settings.time_limit_seconds}
              onChange={(event) => set("time_limit_seconds", Number(event.target.value) || 0.5)}
              aria-label="Temps de résolution"
            />
            <InputGroupAddon align="inline-end" className="text-xs">
              s
            </InputGroupAddon>
          </InputGroup>
        </Row>
        <Row
          icon={ShieldCheck}
          label="Budget de diagnostic"
          description="Temps consacré à réduire un noyau de contraintes contradictoires."
        >
          <InputGroup className="w-36">
            <InputGroupInput
              type="number"
              min="0.5"
              max="120"
              step="0.5"
              value={settings.diagnostic_time_limit_seconds}
              onChange={(event) =>
                set("diagnostic_time_limit_seconds", Number(event.target.value) || 0.5)
              }
              aria-label="Budget de diagnostic"
            />
            <InputGroupAddon align="inline-end" className="text-xs">
              s
            </InputGroupAddon>
          </InputGroup>
        </Row>
      </Section>
    </div>
  );
}
