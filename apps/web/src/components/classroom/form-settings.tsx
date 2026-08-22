"use client";

import type { FormConfig } from "@plan2classe-app/api/schemas/classroom";
import { Alert, AlertDescription, AlertTitle } from "@plan2classe-app/ui/components/alert";
import { Badge } from "@plan2classe-app/ui/components/badge";
import { Button } from "@plan2classe-app/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@plan2classe-app/ui/components/card";
import { Input } from "@plan2classe-app/ui/components/input";
import { Label } from "@plan2classe-app/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@plan2classe-app/ui/components/select";
import { Switch } from "@plan2classe-app/ui/components/switch";
import { Textarea } from "@plan2classe-app/ui/components/textarea";
import { Clipboard, ExternalLink, KeyRound, Link2, LockKeyhole, UserRoundCheck } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { toast } from "sonner";

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
    <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="max-w-xl">
        <Label>{label}</Label>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
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
  const copyLink = () => {
    const url = new URL(publicPath, window.location.origin).toString();
    void navigator.clipboard.writeText(url);
    toast.success("Lien copié");
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Card className="shadow-none">
        <CardHeader><CardTitle>Contenu du formulaire</CardTitle></CardHeader>
        <CardContent className="grid gap-5">
          <div className="grid gap-2"><Label htmlFor="form-title">Titre</Label><Input id="form-title" value={form.title} onChange={(event) => set("title", event.target.value)} /></div>
          <div className="grid gap-2"><Label htmlFor="form-description">Introduction</Label><Textarea id="form-description" value={form.description} onChange={(event) => set("description", event.target.value)} className="min-h-28" /></div>
          <div className="grid gap-2"><Label htmlFor="form-confirmation">Message de confirmation</Label><Textarea id="form-confirmation" value={form.confirmationMessage} onChange={(event) => set("confirmationMessage", event.target.value)} /></div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-2"><Label>Choix de places</Label><Input type="number" min="0" max="10" value={form.maxSeatChoices} onChange={(event) => set("maxSeatChoices", Number(event.target.value))} /></div>
            <div className="grid gap-2"><Label>Voisins souhaités</Label><Input type="number" min="0" max="10" value={form.maxNeighborChoices} onChange={(event) => set("maxNeighborChoices", Number(event.target.value))} /></div>
            <div className="grid gap-2"><Label>Voisins à éviter</Label><Input type="number" min="0" max="10" value={form.maxAvoidChoices} onChange={(event) => set("maxAvoidChoices", Number(event.target.value))} /></div>
          </div>

          <div className="divide-y rounded-xl border px-4">
            <SettingRow label="Préférences de zone" description="Les tags zone:… définissent les zones publiques ; sans eux, les tags de salle classiques sont proposés."><Switch checked={form.collectZones} onCheckedChange={(checked) => set("collectZones", checked)} /></SettingRow>
            <SettingRow label="Arbitrage place / voisin" description="Demander ce qui compte le plus si tous les souhaits ne sont pas compatibles."><Switch checked={form.collectPriority} onCheckedChange={(checked) => set("collectPriority", checked)} /></SettingRow>
            <SettingRow label="Note libre" description="Laisser un champ pour une information que l’administrateur traitera manuellement."><Switch checked={form.collectNotes} onCheckedChange={(checked) => set("collectNotes", checked)} /></SettingRow>
            <SettingRow label="Modifier sa réponse" description="Une nouvelle soumission remplace la réponse précédente sans perdre l’ordre d’arrivée initial."><Switch checked={form.allowEdits} onCheckedChange={(checked) => set("allowEdits", checked)} /></SettingRow>
          </div>

          <div className="grid gap-2">
            <Label>Protection du formulaire</Label>
            <Select value={form.accessMode} onValueChange={(value) => set("accessMode", (value ?? "open") as FormConfig["accessMode"])}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="open">Lien secret, choix du nom</SelectItem><SelectItem value="code">Code individuel obligatoire</SelectItem></SelectContent>
            </Select>
          </div>
          {form.accessMode === "code" && (
            <Alert><KeyRound /><AlertTitle>Codes individuels activés</AlertTitle><AlertDescription>Chaque élève choisit son nom puis saisit le code visible dans l’onglet Élèves. Le code n’apparaît jamais dans l’API publique.</AlertDescription></Alert>
          )}
        </CardContent>
      </Card>

      <div className="space-y-4 xl:sticky xl:top-20 xl:self-start">
        <Card className="shadow-none">
          <CardHeader className="flex-row items-center justify-between"><CardTitle className="text-sm">Partage</CardTitle><Badge variant={published ? "default" : "secondary"}>{published ? "Ouvert" : "Fermé"}</Badge></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-2"><Link2 className="size-4 shrink-0" /><code className="min-w-0 flex-1 truncate text-xs">{publicPath}</code><Button size="icon-sm" variant="ghost" onClick={copyLink} aria-label="Copier le lien"><Clipboard /></Button></div>
            <Button className="w-full" variant="outline" render={<Link href={publicPath as Route} target="_blank" />}><ExternalLink /> Prévisualiser</Button>
            <p className="text-xs leading-5 text-muted-foreground">Le formulaire public ne demande aucun compte et n’expose ni réponses, ni contraintes privées, ni besoins sensibles.</p>
          </CardContent>
        </Card>
        <Card className="shadow-none">
          <CardContent className="grid gap-3 p-5">
            <div className="flex items-center gap-3"><div className="grid size-9 place-items-center rounded-lg bg-muted"><UserRoundCheck className="size-4" /></div><div><p className="text-sm font-medium">{participantCount} destinataires</p><p className="text-xs text-muted-foreground">Un seul formulaire pour la classe</p></div></div>
            <div className="flex items-center gap-3"><div className="grid size-9 place-items-center rounded-lg bg-muted"><LockKeyhole className="size-4" /></div><div><p className="text-sm font-medium">Sans service email</p><p className="text-xs text-muted-foreground">Tout reste auto-hébergé</p></div></div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
