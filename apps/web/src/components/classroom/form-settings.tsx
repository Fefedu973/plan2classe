"use client";

import type { FormConfig } from "@plan2classe-app/api/schemas/classroom";
import { Alert, AlertDescription, AlertTitle } from "@plan2classe-app/ui/components/alert";
import { Badge } from "@plan2classe-app/ui/components/badge";
import { Button } from "@plan2classe-app/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@plan2classe-app/ui/components/card";
import { Input } from "@plan2classe-app/ui/components/input";
import { Label } from "@plan2classe-app/ui/components/label";
import { Switch } from "@plan2classe-app/ui/components/switch";
import { Textarea } from "@plan2classe-app/ui/components/textarea";
import { cn } from "@plan2classe-app/ui/lib/utils";
import {
  Clipboard,
  ExternalLink,
  Eye,
  KeyRound,
  Link2,
  LockKeyhole,
  UserRoundCheck,
} from "lucide-react";
import type { Route } from "next";
import { toast } from "sonner";

import { LinkButton } from "@/components/common/link-button";

import type { SelectOption } from "@/components/common/option-select";

const accessModeOptions: ReadonlyArray<SelectOption<FormConfig["accessMode"]>> = [
  {
    value: "open",
    label: "Lien secret",
    description: "L’élève choisit son nom dans la liste",
  },
  {
    value: "code",
    label: "Code individuel",
    description: "Un code personnel est exigé à l’envoi",
  },
];

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
      <span className="max-w-xl">
        <span className="block text-sm font-medium">{label}</span>
        <span className="mt-1 block text-xs leading-5 text-muted-foreground">{description}</span>
      </span>
      <span className="shrink-0">{children}</span>
    </label>
  );
}

function CountField({
  id,
  label,
  hint,
  value,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        min="0"
        max="10"
        value={value}
        onChange={(event) => onChange(Math.min(10, Math.max(0, Number(event.target.value) || 0)))}
      />
      <p className="text-xs leading-5 text-muted-foreground">
        {value === 0 ? "Question masquée dans le formulaire." : hint}
      </p>
    </div>
  );
}

export function FormSettings({
  form,
  slug,
  published,
  participantCount,
  onChange,
}: {
  form: FormConfig;
  slug: string;
  published: boolean;
  participantCount: number;
  onChange: (form: FormConfig) => void;
}) {
  const set = <Key extends keyof FormConfig>(key: Key, value: FormConfig[Key]) =>
    onChange({ ...form, [key]: value });
  const publicPath = `/f/${slug}`;
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(new URL(publicPath, window.location.origin).toString());
      toast.success("Lien copié");
    } catch {
      toast.error("Copie impossible. Sélectionnez le lien puis copiez-le manuellement.");
    }
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-5">
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="text-sm">Contenu du formulaire</CardTitle>
            <p className="text-xs text-muted-foreground">
              Ce que les élèves voient en ouvrant le lien public.
            </p>
          </CardHeader>
          <CardContent className="grid gap-5">
            <div className="grid gap-1.5">
              <Label htmlFor="form-title">Titre</Label>
              <Input
                id="form-title"
                value={form.title}
                onChange={(event) => set("title", event.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="form-description">Introduction</Label>
              <Textarea
                id="form-description"
                value={form.description}
                onChange={(event) => set("description", event.target.value)}
                className="min-h-28"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="form-confirmation">Message de confirmation</Label>
              <Textarea
                id="form-confirmation"
                value={form.confirmationMessage}
                onChange={(event) => set("confirmationMessage", event.target.value)}
                className="min-h-20"
              />
              <p className="text-xs text-muted-foreground">
                Affiché à l’élève une fois sa réponse enregistrée.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="text-sm">Questions posées</CardTitle>
            <p className="text-xs text-muted-foreground">
              Mettre une limite à 0 retire complètement la question.
            </p>
          </CardHeader>
          <CardContent className="grid gap-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <CountField
                id="form-seats"
                label="Choix de places"
                hint="Places classées par ordre de préférence."
                value={form.maxSeatChoices}
                onChange={(value) => set("maxSeatChoices", value)}
              />
              <CountField
                id="form-neighbors"
                label="Voisins souhaités"
                hint="Camarades avec qui l’élève veut être placé."
                value={form.maxNeighborChoices}
                onChange={(value) => set("maxNeighborChoices", value)}
              />
              <CountField
                id="form-avoid"
                label="Voisins à éviter"
                hint="Traité comme un souhait, jamais comme une règle dure."
                value={form.maxAvoidChoices}
                onChange={(value) => set("maxAvoidChoices", value)}
              />
            </div>

            <div className="divide-y rounded-xl border px-4">
              <SettingRow
                label="Préférences de zone"
                description="Les tags zone:… définissent les zones publiques ; sans eux, les tags de salle classiques sont proposés."
              >
                <Switch
                  checked={form.collectZones}
                  onCheckedChange={(checked) => set("collectZones", checked)}
                />
              </SettingRow>
              <SettingRow
                label="Arbitrage place / voisin"
                description="Demander ce qui compte le plus si tous les souhaits ne sont pas compatibles."
              >
                <Switch
                  checked={form.collectPriority}
                  onCheckedChange={(checked) => set("collectPriority", checked)}
                />
              </SettingRow>
              <SettingRow
                label="Note libre"
                description="Laisser un champ pour une information que vous traiterez manuellement."
              >
                <Switch
                  checked={form.collectNotes}
                  onCheckedChange={(checked) => set("collectNotes", checked)}
                />
              </SettingRow>
              <SettingRow
                label="Modifier sa réponse"
                description="Une nouvelle soumission remplace la précédente sans perdre l’ordre d’arrivée initial."
              >
                <Switch
                  checked={form.allowEdits}
                  onCheckedChange={(checked) => set("allowEdits", checked)}
                />
              </SettingRow>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="text-sm">Protection du formulaire</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2 sm:grid-cols-2">
              {accessModeOptions.map((option) => {
                const isSelected = form.accessMode === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => set("accessMode", option.value)}
                    className={cn(
                      "rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                      isSelected ? "border-foreground bg-muted" : "hover:bg-muted/50",
                    )}
                  >
                    {option.value === "code" ? (
                      <KeyRound className="mb-3 size-5" aria-hidden="true" />
                    ) : (
                      <Link2 className="mb-3 size-5" aria-hidden="true" />
                    )}
                    <span className="block text-sm font-medium">{option.label}</span>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                      {option.description}
                    </span>
                  </button>
                );
              })}
            </div>
            {form.accessMode === "code" ? (
              <Alert>
                <KeyRound aria-hidden="true" />
                <AlertTitle>Codes individuels activés</AlertTitle>
                <AlertDescription>
                  Chaque élève choisit son nom puis saisit le code visible dans l’onglet Élèves. Le
                  code n’apparaît jamais dans l’API publique.
                </AlertDescription>
              </Alert>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4 xl:sticky xl:top-4 xl:self-start">
        <Card className="shadow-none">
          <CardHeader className="flex-row items-center justify-between gap-2">
            <CardTitle className="text-sm">Partage</CardTitle>
            <Badge variant={published ? "default" : "secondary"}>
              {published ? "Ouvert" : "Fermé"}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-2">
              <Link2 className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <code className="min-w-0 flex-1 truncate text-xs">{publicPath}</code>
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => void copyLink()}
                aria-label="Copier le lien"
              >
                <Clipboard />
              </Button>
            </div>
            {!published ? (
              <p className="text-xs leading-5 text-warning">
                La collecte est fermée : le lien affiche une page d’indisponibilité aux élèves.
                Activez « Collecte » en haut de la page.
              </p>
            ) : null}
            <LinkButton
              className="w-full"
              variant="outline"
              href={publicPath as Route}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink /> Prévisualiser
            </LinkButton>
            <p className="text-xs leading-5 text-muted-foreground">
              Le formulaire public ne demande aucun compte et n’expose ni réponses, ni contraintes
              privées, ni besoins sensibles.
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardContent className="grid gap-3 p-5">
            <div className="flex items-center gap-3">
              <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted">
                <UserRoundCheck className="size-4" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {participantCount} destinataire{participantCount > 1 ? "s" : ""}
                </p>
                <p className="text-xs text-muted-foreground">Un seul formulaire pour la classe</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted">
                <Eye className="size-4" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium">Réponses privées</p>
                <p className="text-xs text-muted-foreground">Aucun élève ne voit les autres choix</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted">
                <LockKeyhole className="size-4" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium">Sans service email</p>
                <p className="text-xs text-muted-foreground">Tout reste auto-hébergé</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
