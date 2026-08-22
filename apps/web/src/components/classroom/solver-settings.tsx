"use client";

import type { SolverSettings } from "@plan2classe-app/api/schemas/classroom";
import { Alert, AlertDescription, AlertTitle } from "@plan2classe-app/ui/components/alert";
import { Input } from "@plan2classe-app/ui/components/input";
import { Label } from "@plan2classe-app/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@plan2classe-app/ui/components/select";
import { Slider } from "@plan2classe-app/ui/components/slider";
import { Switch } from "@plan2classe-app/ui/components/switch";
import { Clock3, Ear, Eye, Hand, Scale, ShieldCheck, Star } from "lucide-react";

function Row({ icon: Icon, label, description, children }: { icon: typeof Scale; label: string; description: string; children: React.ReactNode }) {
  return <div className="grid gap-4 border-b py-5 last:border-0 md:grid-cols-[1fr_260px] md:items-center"><div className="flex gap-3"><div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-muted"><Icon className="size-4" /></div><div><Label>{label}</Label><p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p></div></div><div className="md:justify-self-end">{children}</div></div>;
}

export function SolverSettingsEditor({ settings, onChange }: { settings: SolverSettings; onChange: (settings: SolverSettings) => void }) {
  const set = <Key extends keyof SolverSettings>(key: Key, value: SolverSettings[Key]) =>
    onChange({ ...settings, [key]: value });
  const sliderValue = (value: number | readonly number[], fallback: number) =>
    typeof value === "number" ? value : value[0] ?? fallback;
  return (
    <div className="space-y-6">
      <Alert><ShieldCheck /><AlertTitle>Les contraintes dures passent toujours avant ces réglages.</AlertTitle><AlertDescription>Les poids n’autorisent jamais une règle dure à être violée. Ils départagent seulement les plans faisables.</AlertDescription></Alert>

      <section className="rounded-xl border bg-card px-5">
        <Row icon={Scale} label="Équité max-min" description="Maximise d’abord la satisfaction de la personne la moins satisfaite."><Switch checked={settings.fairness_enabled} onCheckedChange={(checked) => set("fairness_enabled", checked)} /></Row>
        <Row icon={Scale} label="Tolérance d’équité" description="Perte maximale autorisée sur 1000 avant d’améliorer la satisfaction globale."><div className="flex w-64 items-center gap-3"><Slider min={0} max={200} step={5} value={[settings.fairness_tolerance]} onValueChange={(value) => set("fairness_tolerance", sliderValue(value, 0))} /><span className="w-10 text-right text-xs tabular-nums">{settings.fairness_tolerance}</span></div></Row>
        <Row icon={Clock3} label="Priorité d’arrivée" description="Avantage les premières réponses seulement après l’objectif d’équité."><div className="flex gap-2"><Select value={settings.arrival_policy} onValueChange={(value) => set("arrival_policy", value ?? "equal")}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="equal">Égalité</SelectItem><SelectItem value="linear">Linéaire</SelectItem><SelectItem value="exponential">Exponentielle</SelectItem></SelectContent></Select><Input className="w-20" type="number" min="0" max="500" value={settings.arrival_bonus_percent} onChange={(event) => set("arrival_bonus_percent", Number(event.target.value))} aria-label="Bonus d’arrivée en pourcentage" /></div></Row>
        <Row icon={Star} label="Stabilité du plan" description="Conserve les places précédentes lorsque la qualité principale reste identique."><Switch checked={settings.stability_enabled} onCheckedChange={(checked) => set("stability_enabled", checked)} /></Row>
        <Row icon={Clock3} label="Recalcul automatique" description="Relance le plan à chaque réponse enregistrée."><Switch checked={settings.auto_solve_on_response} onCheckedChange={(checked) => set("auto_solve_on_response", checked)} /></Row>
      </section>

      <section className="rounded-xl border bg-card px-5">
        <Row icon={Hand} label="Collision droitier / gaucher" description="Évite la combinaison inconfortable sur les relations directionnelles hand_conflict."><div className="flex gap-2"><Select value={settings.hand_collision} onValueChange={(value) => set("hand_collision", (value ?? "off") as SolverSettings["hand_collision"])}><SelectTrigger className="w-32"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="off">Désactivée</SelectItem><SelectItem value="soft">Souple</SelectItem><SelectItem value="hard">Dure</SelectItem></SelectContent></Select><Input className="w-20" type="number" min="0" value={settings.hand_collision_weight} onChange={(event) => set("hand_collision_weight", Number(event.target.value))} aria-label="Poids collision main" /></div></Row>
        <Row icon={Eye} label="Besoin visuel" description="Favorise les sièges les plus proches du centre du tableau selon le niveau 0 à 5."><div className="flex gap-2"><Input className="w-20" type="number" min="0" value={settings.vision_weight} onChange={(event) => set("vision_weight", Number(event.target.value))} aria-label="Poids vision" /><label className="flex items-center gap-2 rounded-lg border px-3 text-xs"><Switch checked={settings.accessibility_hard} onCheckedChange={(checked) => set("accessibility_hard", checked)} /> Niveaux 3–5 durs</label></div></Row>
        <Row icon={Ear} label="Besoin auditif" description="Favorise aussi l’avant de la salle pour les niveaux renseignés."><Input className="w-24" type="number" min="0" value={settings.hearing_weight} onChange={(event) => set("hearing_weight", Number(event.target.value))} aria-label="Poids audition" /></Row>
        <Row icon={ShieldCheck} label="Fraction de sièges avant" description="Part des places considérées comme accessibles pour un besoin maximal."><div className="flex w-64 items-center gap-3"><Slider min={10} max={60} step={5} value={[Math.round(settings.hard_front_fraction * 100)]} onValueChange={(value) => set("hard_front_fraction", sliderValue(value, 30) / 100)} /><span className="w-10 text-right text-xs tabular-nums">{Math.round(settings.hard_front_fraction * 100)} %</span></div></Row>
      </section>

      <section className="rounded-xl border bg-card px-5">
        <Row icon={Scale} label="Équilibre des notes" description="Rapproche la moyenne de chaque table de la moyenne globale."><Input className="w-24" type="number" min="0" value={settings.grade_balance_weight} onChange={(event) => set("grade_balance_weight", Number(event.target.value))} /></Row>
        <Row icon={Star} label="Mix de niveaux" description="Bonus lorsque deux voisins présentent un écart de note utile au tutorat."><div className="flex gap-2"><Input className="w-20" type="number" min="0" value={settings.grade_mix_weight} onChange={(event) => set("grade_mix_weight", Number(event.target.value))} aria-label="Poids mix de niveaux" /><Input className="w-20" type="number" min="0" step="0.5" value={settings.grade_mix_min_difference} onChange={(event) => set("grade_mix_min_difference", Number(event.target.value))} aria-label="Écart minimum de note" /></div></Row>
      </section>

      <section className="rounded-xl border bg-card px-5">
        <Row icon={Clock3} label="Budget de calcul" description="Temps maximal approximatif partagé entre les étapes lexicographiques."><div className="flex items-center gap-2"><Input className="w-24" type="number" min="0.5" max="600" step="0.5" value={settings.time_limit_seconds} onChange={(event) => set("time_limit_seconds", Number(event.target.value))} /><span className="text-xs text-muted-foreground">secondes</span></div></Row>
        <Row icon={ShieldCheck} label="Budget de diagnostic" description="Temps consacré à réduire un noyau de contraintes contradictoires."><div className="flex items-center gap-2"><Input className="w-24" type="number" min="0.5" max="120" step="0.5" value={settings.diagnostic_time_limit_seconds} onChange={(event) => set("diagnostic_time_limit_seconds", Number(event.target.value))} /><span className="text-xs text-muted-foreground">secondes</span></div></Row>
      </section>
    </div>
  );
}
