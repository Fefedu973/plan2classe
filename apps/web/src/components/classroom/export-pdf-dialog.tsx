"use client";

import { Button } from "@plan2classe-app/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@plan2classe-app/ui/components/dialog";
import { Input } from "@plan2classe-app/ui/components/input";
import { Label } from "@plan2classe-app/ui/components/label";
import { Switch } from "@plan2classe-app/ui/components/switch";
import { cn } from "@plan2classe-app/ui/lib/utils";
import { FileDown, LoaderCircle, RectangleHorizontal, RectangleVertical } from "lucide-react";
import { useEffect, useState } from "react";

import type { PdfExportOptions } from "@/lib/export-plan";

function ToggleRow({
  id,
  label,
  description,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{description}</span>
      </span>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} className="shrink-0" />
    </label>
  );
}

function ChoiceCard({
  selected,
  onSelect,
  icon: Icon,
  label,
  hint,
}: {
  selected: boolean;
  onSelect: () => void;
  icon?: typeof RectangleHorizontal;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "rounded-xl border p-3 text-left transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        selected ? "border-foreground bg-muted" : "hover:bg-muted/50",
      )}
    >
      {Icon ? <Icon className="mb-2 size-4" aria-hidden="true" /> : null}
      <span className="block text-sm font-medium">{label}</span>
      <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{hint}</span>
    </button>
  );
}

export function ExportPdfDialog({
  open,
  onOpenChange,
  defaults,
  pending,
  onExport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaults: PdfExportOptions;
  pending: boolean;
  onExport: (options: PdfExportOptions) => void;
}) {
  const [options, setOptions] = useState(defaults);

  // Reopening after a class or room change must not keep the stale defaults.
  useEffect(() => {
    if (open) setOptions(defaults);
  }, [open, defaults]);

  const set = <Key extends keyof PdfExportOptions>(key: Key, value: PdfExportOptions[Key]) =>
    setOptions((current) => ({ ...current, [key]: value }));

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending && !next) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Exporter le plan en PDF</DialogTitle>
          <DialogDescription>
            Le plan reprend la disposition réelle de la salle, telle que vous l’avez dessinée.
          </DialogDescription>
        </DialogHeader>

        <div className="scrollbar-thin grid max-h-[60svh] gap-5 overflow-y-auto py-1">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="pdf-title">Titre</Label>
              <Input
                id="pdf-title"
                value={options.title}
                onChange={(event) => set("title", event.target.value)}
                placeholder="Plan de classe"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pdf-subtitle">Classe</Label>
              <Input
                id="pdf-subtitle"
                value={options.subtitle}
                onChange={(event) => set("subtitle", event.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pdf-room">Nom de la salle</Label>
              <Input
                id="pdf-room"
                value={options.roomName}
                onChange={(event) => set("roomName", event.target.value)}
                placeholder="204"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pdf-year">Année scolaire</Label>
              <Input
                id="pdf-year"
                value={options.schoolYear}
                onChange={(event) => set("schoolYear", event.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Orientation</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              <ChoiceCard
                selected={options.orientation === "landscape"}
                onSelect={() => set("orientation", "landscape")}
                icon={RectangleHorizontal}
                label="Paysage"
                hint="Convient aux salles plus larges que profondes."
              />
              <ChoiceCard
                selected={options.orientation === "portrait"}
                onSelect={() => set("orientation", "portrait")}
                icon={RectangleVertical}
                label="Portrait"
                hint="Convient aux salles en longueur."
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Style</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              <ChoiceCard
                selected={options.style === "filled"}
                onSelect={() => set("style", "filled")}
                label="Contrasté"
                hint="Places occupées en sombre, lisibles de loin."
              />
              <ChoiceCard
                selected={options.style === "outline"}
                onSelect={() => set("style", "outline")}
                label="Épuré"
                hint="Traits fins uniquement, économe en encre."
              />
            </div>
          </div>

          <div className="divide-y rounded-xl border px-4">
            <ToggleRow
              id="pdf-seat-labels"
              label="Libellés des places"
              description="Affiche A1, B3… dans le coin de chaque place."
              checked={options.showSeatLabels}
              onCheckedChange={(checked) => set("showSeatLabels", checked)}
            />
            <ToggleRow
              id="pdf-needs"
              label="Repères de besoins"
              description="G gaucher, V vision, A audition, PMR accessibilité."
              checked={options.showNeeds}
              onCheckedChange={(checked) => set("showNeeds", checked)}
            />
            <ToggleRow
              id="pdf-list"
              label="Liste des élèves en annexe"
              description="Ajoute une page listant chaque place et son élève."
              checked={options.includeStudentList}
              onCheckedChange={(checked) => set("includeStudentList", checked)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Annuler
          </Button>
          <Button onClick={() => onExport(options)} disabled={pending}>
            {pending ? <LoaderCircle className="animate-spin" /> : <FileDown />}
            Générer le PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
