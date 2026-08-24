"use client";

import { newId } from "@plan2classe-app/api/domain/defaults";
import type { Participant, Room, Rule, RuleKind } from "@plan2classe-app/api/schemas/classroom";
import { Badge } from "@plan2classe-app/ui/components/badge";
import { Button } from "@plan2classe-app/ui/components/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@plan2classe-app/ui/components/card";
import { Checkbox } from "@plan2classe-app/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@plan2classe-app/ui/components/dialog";
import { Input } from "@plan2classe-app/ui/components/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@plan2classe-app/ui/components/input-group";
import { Label } from "@plan2classe-app/ui/components/label";
import { Switch } from "@plan2classe-app/ui/components/switch";
import { Textarea } from "@plan2classe-app/ui/components/textarea";
import { ToggleGroup, ToggleGroupItem } from "@plan2classe-app/ui/components/toggle-group";
import { cn } from "@plan2classe-app/ui/lib/utils";
import { Plus, Shield, Sparkles, Trash2, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { OptionSelect, type SelectOption } from "@/components/common/option-select";

type RuleCategory = "placement" | "relations" | "groupes" | "repartition";

const categoryLabels: Record<RuleCategory, string> = {
  placement: "Placement d’un élève",
  relations: "Relations entre deux élèves",
  groupes: "Groupes d’élèves",
  repartition: "Répartition par tag",
};

const kinds: Array<{
  value: RuleKind;
  label: string;
  description: string;
  category: RuleCategory;
}> = [
  {
    value: "fixed_seat",
    label: "Place imposée",
    description: "Un élève doit occuper une place précise.",
    category: "placement",
  },
  {
    value: "forbidden_seats",
    label: "Places interdites",
    description: "Un élève ne peut pas occuper certaines places.",
    category: "placement",
  },
  {
    value: "no_go" as RuleKind,
    label: "No-go enrichi",
    description: "Interdit des places ou des zones à un élève.",
    category: "placement",
  },
  {
    value: "require_seat_tags",
    label: "Zone obligatoire",
    description: "Le siège doit porter un ou plusieurs tags.",
    category: "placement",
  },
  {
    value: "forbid_seat_tags",
    label: "Zone interdite",
    description: "Le siège ne doit pas porter certains tags.",
    category: "placement",
  },
  {
    value: "max_board_distance" as RuleKind,
    label: "Distance au tableau",
    description: "Place un élève assez près du tableau.",
    category: "placement",
  },
  {
    value: "pair_relation",
    label: "Relation entre deux élèves",
    description: "Impose ou interdit voisinage, proximité ou table.",
    category: "relations",
  },
  {
    value: "min_distance",
    label: "Distance minimale",
    description: "Éloigne deux élèves d’un seuil donné.",
    category: "relations",
  },
  {
    value: "max_distance",
    label: "Distance maximale",
    description: "Rapproche deux élèves d’un seuil donné.",
    category: "relations",
  },
  {
    value: "group_same_table",
    label: "Groupe ensemble",
    description: "Maintient un groupe sur la même table.",
    category: "groupes",
  },
  {
    value: "group_different_tables",
    label: "Groupe séparé",
    description: "Place chaque membre sur une table différente.",
    category: "groupes",
  },
  {
    value: "group_spread_table" as RuleKind,
    label: "Groupe réparti",
    description: "Limite le nombre de membres par table.",
    category: "groupes",
  },
  {
    value: "tag_not_adjacent",
    label: "Tags non adjacents",
    description: "Évite les voisins partageant une valeur de tag.",
    category: "repartition",
  },
  {
    value: "alternate_tag" as RuleKind,
    label: "Alternance de tag",
    description: "Alterner genre, niveau ou tout autre tag.",
    category: "repartition",
  },
  {
    value: "max_tag_per_table",
    label: "Quota par table",
    description: "Limite un profil sur chaque table.",
    category: "repartition",
  },
  {
    value: "table_tag_balance",
    label: "Équilibre par table",
    description: "Équilibre plusieurs valeurs d’un tag.",
    category: "repartition",
  },
];

const relationOptions: ReadonlyArray<SelectOption> = [
  { value: "adjacent", label: "Voisins directs" },
  { value: "near", label: "Proches" },
  { value: "same_table", label: "Même table" },
  { value: "same_cluster", label: "Même îlot" },
  { value: "hand_conflict", label: "Collision de main" },
];

const modeOptions: ReadonlyArray<SelectOption> = [
  { value: "any", label: "Au moins un" },
  { value: "all", label: "Tous" },
];

function ruleDefaults(kind: RuleKind): Record<string, unknown> {
  switch (kind) {
    case "fixed_seat":
      return { participant_id: "", seat_id: "" };
    case "forbidden_seats":
      return { participant_id: "", seat_ids: [] };
    case "require_seat_tags":
    case "forbid_seat_tags":
      return { participant_id: "", tags: [], mode: "any" };
    case "pair_relation":
      return { a: "", b: "", relation: "adjacent", required: true };
    case "group_same_table":
    case "group_different_tables":
      return { participant_ids: [] };
    case "min_distance":
    case "max_distance":
      return { a: "", b: "", distance: 200 };
    case "tag_not_adjacent":
      return { tag_key: "genre", values: [] };
    case "max_tag_per_table":
      return { tag_key: "groupe", tag_value: "", max_count: 1 };
    case "table_tag_balance":
      return { tag_key: "genre", values: [], max_difference: 1 };
    case "no_go":
      return { participant_id: "", seat_ids: [], tags: [], mode: "any" };
    case "group_spread_table":
      return { participant_ids: [], max_per_table: 1 };
    case "alternate_tag":
      return { tag: "genre", tag_key: null, values: [], relation: "adjacent" };
    case "max_board_distance":
      return { participant_id: "", max_distance: 300 };
  }
}

function Field({
  label,
  hint,
  className,
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
      {hint ? <p className="text-xs leading-5 text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function MultiPicker({
  value,
  onChange,
  options,
  emptyLabel,
  columns = 2,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  options: ReadonlyArray<SelectOption>;
  emptyLabel: string;
  columns?: 2 | 3;
}) {
  if (options.length === 0) {
    return (
      <p className="rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
        {emptyLabel}
      </p>
    );
  }
  return (
    <div
      className={cn(
        "scrollbar-thin grid max-h-44 gap-0.5 overflow-y-auto rounded-lg border p-1.5",
        columns === 2 ? "sm:grid-cols-2" : "grid-cols-3 sm:grid-cols-4",
      )}
    >
      {options.map((option) => (
        <label
          key={option.value}
          className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted"
        >
          <Checkbox
            checked={value.includes(option.value)}
            onCheckedChange={(checked) =>
              onChange(
                checked
                  ? [...new Set([...value, option.value])]
                  : value.filter((id) => id !== option.value),
              )
            }
          />
          <span className="truncate">{option.label}</span>
        </label>
      ))}
    </div>
  );
}

function TagsInput({
  value,
  onChange,
  placeholder,
}: {
  value: unknown;
  onChange: (value: string[]) => void;
  placeholder: string;
}) {
  return (
    <Input
      value={Array.isArray(value) ? (value as string[]).join(", ") : ""}
      onChange={(event) =>
        onChange(
          event.target.value
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
        )
      }
      placeholder={placeholder}
      className="font-mono text-xs"
    />
  );
}

function ParamsEditor({
  rule,
  participantOptions,
  seatOptions,
  onParams,
}: {
  rule: Rule;
  participantOptions: ReadonlyArray<SelectOption>;
  seatOptions: ReadonlyArray<SelectOption>;
  onParams: (params: Record<string, unknown>) => void;
}) {
  const params = rule.params as unknown as Record<string, unknown>;
  const set = (key: string, value: unknown) => onParams({ ...params, [key]: value });
  const asArray = (key: string) => (Array.isArray(params[key]) ? (params[key] as string[]) : []);

  const personField = (key: string, label: string) => (
    <Field label={label}>
      <OptionSelect
        value={String(params[key] ?? "")}
        onValueChange={(value) => set(key, value)}
        options={participantOptions}
        placeholder="Choisir un élève"
        emptyLabel="Aucun élève actif"
        aria-label={label}
      />
    </Field>
  );

  switch (rule.kind) {
    case "fixed_seat":
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          {personField("participant_id", "Élève")}
          <Field label="Place imposée">
            <OptionSelect
              value={String(params.seat_id ?? "")}
              onValueChange={(value) => set("seat_id", value)}
              options={seatOptions}
              placeholder="Choisir une place"
              emptyLabel="Aucune place active"
              aria-label="Place imposée"
            />
          </Field>
        </div>
      );
    case "forbidden_seats":
      return (
        <div className="grid gap-3">
          {personField("participant_id", "Élève")}
          <Field label="Places interdites">
            <MultiPicker
              value={asArray("seat_ids")}
              onChange={(value) => set("seat_ids", value)}
              options={seatOptions}
              emptyLabel="Aucune place active dans cette salle."
              columns={3}
            />
          </Field>
        </div>
      );
    case "require_seat_tags":
    case "forbid_seat_tags":
      return (
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_10rem]">
          {personField("participant_id", "Élève")}
          <Field label="Tags de siège" hint="Séparés par des virgules.">
            <TagsInput
              value={params.tags}
              onChange={(value) => set("tags", value)}
              placeholder="zone:avant, accessible"
            />
          </Field>
          <Field label="Correspondance">
            <OptionSelect
              value={String(params.mode ?? "any")}
              onValueChange={(value) => set("mode", value)}
              options={modeOptions}
              aria-label="Correspondance des tags"
            />
          </Field>
        </div>
      );
    case "pair_relation":
      return (
        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {personField("a", "Premier élève")}
            {personField("b", "Second élève")}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Relation">
              <OptionSelect
                value={String(params.relation ?? "adjacent")}
                onValueChange={(value) => set("relation", value)}
                options={relationOptions}
                aria-label="Relation"
              />
            </Field>
            <label className="flex h-8 cursor-pointer items-center gap-2 self-end rounded-lg border px-3 text-xs">
              <Switch
                checked={Boolean(params.required)}
                onCheckedChange={(checked) => set("required", checked)}
              />
              {params.required ? "Relation exigée" : "Relation interdite"}
            </label>
          </div>
        </div>
      );
    case "group_same_table":
    case "group_different_tables":
      return (
        <Field label="Membres du groupe">
          <MultiPicker
            value={asArray("participant_ids")}
            onChange={(value) => set("participant_ids", value)}
            options={participantOptions}
            emptyLabel="Aucun élève actif."
          />
        </Field>
      );
    case "min_distance":
    case "max_distance":
      return (
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_9rem]">
          {personField("a", "Premier élève")}
          {personField("b", "Second élève")}
          <Field label="Distance">
            <InputGroup>
              <InputGroupInput
                type="number"
                value={Number(params.distance ?? 200)}
                onChange={(event) => set("distance", Number(event.target.value))}
                aria-label="Distance"
              />
              <InputGroupAddon align="inline-end" className="text-xs">
                px
              </InputGroupAddon>
            </InputGroup>
          </Field>
        </div>
      );
    case "tag_not_adjacent":
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Clé du tag">
            <Input
              value={String(params.tag_key ?? "")}
              onChange={(event) => set("tag_key", event.target.value)}
              placeholder="genre"
              className="font-mono text-xs"
            />
          </Field>
          <Field label="Valeurs concernées" hint="Vide = toutes les valeurs de cette clé.">
            <TagsInput
              value={params.values}
              onChange={(value) => set("values", value)}
              placeholder="F, M"
            />
          </Field>
        </div>
      );
    case "max_tag_per_table":
      return (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Clé du tag">
            <Input
              value={String(params.tag_key ?? "")}
              onChange={(event) => set("tag_key", event.target.value)}
              placeholder="groupe"
              className="font-mono text-xs"
            />
          </Field>
          <Field label="Valeur">
            <Input
              value={String(params.tag_value ?? "")}
              onChange={(event) => set("tag_value", event.target.value)}
              placeholder="1"
              className="font-mono text-xs"
            />
          </Field>
          <Field label="Maximum par table">
            <Input
              type="number"
              min="1"
              value={Number(params.max_count ?? 1)}
              onChange={(event) => set("max_count", Number(event.target.value))}
            />
          </Field>
        </div>
      );
    case "table_tag_balance":
      return (
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_10rem]">
          <Field label="Clé du tag">
            <Input
              value={String(params.tag_key ?? "")}
              onChange={(event) => set("tag_key", event.target.value)}
              placeholder="genre"
              className="font-mono text-xs"
            />
          </Field>
          <Field label="Valeurs à équilibrer">
            <TagsInput
              value={params.values}
              onChange={(value) => set("values", value)}
              placeholder="F, M"
            />
          </Field>
          <Field label="Écart toléré">
            <Input
              type="number"
              min="0"
              value={Number(params.max_difference ?? 1)}
              onChange={(event) => set("max_difference", Number(event.target.value))}
            />
          </Field>
        </div>
      );
    default:
      if (rule.kind === "no_go") {
        return (
          <div className="grid gap-3">
            {personField("participant_id", "Élève")}
            <Field label="Places interdites">
              <MultiPicker
                value={asArray("seat_ids")}
                onChange={(value) => set("seat_ids", value)}
                options={seatOptions}
                emptyLabel="Aucune place active dans cette salle."
                columns={3}
              />
            </Field>
            <Field label="Tags de sièges interdits">
              <TagsInput
                value={params.tags}
                onChange={(value) => set("tags", value)}
                placeholder="zone:fond, fenetre"
              />
            </Field>
          </div>
        );
      }
      if (rule.kind === "group_spread_table") {
        return (
          <div className="grid gap-3">
            <Field label="Membres du groupe">
              <MultiPicker
                value={asArray("participant_ids")}
                onChange={(value) => set("participant_ids", value)}
                options={participantOptions}
                emptyLabel="Aucun élève actif."
              />
            </Field>
            <Field label="Maximum par table" className="sm:max-w-40">
              <Input
                type="number"
                min="1"
                value={Number(params.max_per_table ?? 1)}
                onChange={(event) => set("max_per_table", Number(event.target.value))}
              />
            </Field>
          </div>
        );
      }
      if (rule.kind === "alternate_tag") {
        return (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Tag à alterner">
              <Input
                value={String(params.tag ?? "")}
                onChange={(event) => set("tag", event.target.value)}
                placeholder="genre"
                className="font-mono text-xs"
              />
            </Field>
            <Field label="Sur quelle relation">
              <OptionSelect
                value={String(params.relation ?? "adjacent")}
                onValueChange={(value) => set("relation", value)}
                options={relationOptions.slice(0, 2)}
                aria-label="Relation d’alternance"
              />
            </Field>
          </div>
        );
      }
      if (rule.kind === "max_board_distance") {
        return (
          <div className="grid gap-3 sm:grid-cols-[1fr_11rem]">
            {personField("participant_id", "Élève")}
            <Field label="Distance maximale">
              <InputGroup>
                <InputGroupInput
                  type="number"
                  value={Number(params.max_distance ?? 300)}
                  onChange={(event) => set("max_distance", Number(event.target.value))}
                  aria-label="Distance maximale au tableau"
                />
                <InputGroupAddon align="inline-end" className="text-xs">
                  px
                </InputGroupAddon>
              </InputGroup>
            </Field>
          </div>
        );
      }
      return (
        <Textarea
          value={JSON.stringify(params, null, 2)}
          readOnly
          className="font-mono text-xs"
          aria-label="Paramètres bruts"
        />
      );
  }
}

function NewRuleDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (rule: Rule) => void;
}) {
  const [kind, setKind] = useState<RuleKind>("fixed_seat");
  const [name, setName] = useState("");
  const selected = kinds.find((item) => item.value === kind)!;
  const grouped = useMemo(
    () =>
      (Object.keys(categoryLabels) as RuleCategory[]).map((category) => ({
        category,
        items: kinds.filter((item) => item.category === category),
      })),
    [],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Ajouter une contrainte</DialogTitle>
          <DialogDescription>
            Une règle dure ne peut jamais être violée. Une règle souple influence seulement le
            score.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="scrollbar-thin max-h-80 space-y-4 overflow-y-auto pr-1">
            {grouped.map((group) => (
              <div key={group.category}>
                <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {categoryLabels[group.category]}
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {group.items.map((item) => {
                    const isSelected = item.value === kind;
                    return (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => setKind(item.value)}
                        aria-pressed={isSelected}
                        className={cn(
                          "rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                          isSelected ? "border-foreground bg-muted" : "hover:bg-muted/50",
                        )}
                      >
                        <span className="block text-sm font-medium">{item.label}</span>
                        <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                          {item.description}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="rule-name">Nom de la règle</Label>
            <Input
              id="rule-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={selected.label}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            onClick={() => {
              onCreate({
                id: newId("rule"),
                name: name.trim() || selected.label,
                kind,
                hard: true,
                weight: 100,
                params: ruleDefaults(kind),
                enabled: true,
                source: "admin",
                explanation: "",
              } as unknown as Rule);
              setName("");
              onOpenChange(false);
            }}
          >
            <Plus /> Ajouter la règle
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ConstraintsEditor({
  rules,
  participants,
  room,
  onChange,
}: {
  rules: Rule[];
  participants: Participant[];
  room: Room;
  onChange: (rules: Rule[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const participantOptions = useMemo<ReadonlyArray<SelectOption>>(
    () =>
      participants
        .filter((participant) => participant.active)
        .map((participant) => ({ value: participant.id, label: participant.name })),
    [participants],
  );
  const seatOptions = useMemo<ReadonlyArray<SelectOption>>(
    () =>
      room.seats
        .filter((seat) => seat.enabled)
        .map((seat) => ({ value: seat.id, label: seat.label })),
    [room.seats],
  );

  const hardCount = rules.filter((rule) => rule.hard).length;
  const disabledHardCount = rules.filter((rule) => rule.hard && !rule.enabled).length;

  const update = (id: string, patch: Record<string, unknown>) =>
    onChange(rules.map((rule) => (rule.id === id ? ({ ...rule, ...patch } as Rule) : rule)));

  const removeRule = (rule: Rule) => {
    const snapshot = rules;
    onChange(rules.filter((item) => item.id !== rule.id));
    toast.success(`« ${rule.name} » supprimée`, {
      action: { label: "Annuler", onClick: () => onChange(snapshot) },
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-medium">Règles de placement</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {rules.length} règle{rules.length !== 1 ? "s" : ""}, dont {hardCount} dure
            {hardCount !== 1 ? "s" : ""}. Les préférences des élèves s’ajoutent à ces règles.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus /> Ajouter une contrainte
        </Button>
      </div>

      {disabledHardCount > 0 ? (
        <p className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning-muted/50 px-3 py-2 text-xs text-warning">
          <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
          {disabledHardCount} contrainte{disabledHardCount > 1 ? "s" : ""} dure
          {disabledHardCount > 1 ? "s sont désactivées" : " est désactivée"} et ne sera pas
          appliquée au prochain calcul.
        </p>
      ) : null}

      {rules.length === 0 ? (
        <div className="rounded-2xl border border-dashed px-6 py-14 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl border bg-muted/30">
            <Shield className="size-5" aria-hidden="true" />
          </span>
          <h3 className="mt-4 font-medium">Aucune règle administrateur</h3>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            Les préférences du formulaire suffisent pour commencer. Ajoutez ici les besoins
            médicaux, groupes, quotas ou alternances qui ne se négocient pas.
          </p>
          <Button className="mt-5" variant="outline" onClick={() => setOpen(true)}>
            <Plus /> Créer la première règle
          </Button>
        </div>
      ) : (
        <div className="grid gap-3">
          {rules.map((rule) => (
            <Card key={rule.id} className={cn("shadow-none", !rule.enabled && "opacity-60")}>
              <CardHeader className="px-4 sm:px-5">
                <CardTitle className="text-sm">{rule.name}</CardTitle>
                <p className="text-xs leading-5 text-muted-foreground">
                  {kinds.find((item) => item.value === rule.kind)?.description}
                </p>
                <CardAction className="flex items-center gap-2">
                  <Badge variant={rule.hard ? "default" : "secondary"} className="gap-1.5">
                    {rule.hard ? <Shield /> : <Sparkles />}
                    {rule.hard ? "Dure" : "Souple"}
                  </Badge>
                  <Switch
                    checked={rule.enabled}
                    onCheckedChange={(enabled) => update(rule.id, { enabled })}
                    aria-label={`Activer ${rule.name}`}
                  />
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => removeRule(rule)}
                    aria-label={`Supprimer ${rule.name}`}
                  >
                    <Trash2 />
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="grid gap-4 px-4 sm:px-5">
                <ParamsEditor
                  rule={rule}
                  participantOptions={participantOptions}
                  seatOptions={seatOptions}
                  onParams={(params) => update(rule.id, { params })}
                />
                <div className="grid gap-3 border-t pt-4 sm:grid-cols-[auto_9rem_1fr] sm:items-end">
                  <ToggleGroup
                    value={[rule.hard ? "hard" : "soft"]}
                    onValueChange={(value) => {
                      const next = value[0];
                      if (next) update(rule.id, { hard: next === "hard" });
                    }}
                    aria-label="Type de contrainte"
                    className="w-fit"
                  >
                    <ToggleGroupItem value="hard" className="text-xs">
                      <Shield /> Dure
                    </ToggleGroupItem>
                    <ToggleGroupItem value="soft" className="text-xs">
                      <Sparkles /> Souple
                    </ToggleGroupItem>
                  </ToggleGroup>
                  {rule.hard ? (
                    <div className="sm:col-start-2" />
                  ) : (
                    <Field label="Poids">
                      <Input
                        type="number"
                        min="1"
                        max="1000000"
                        value={rule.weight}
                        onChange={(event) =>
                          update(rule.id, { weight: Number(event.target.value) || 1 })
                        }
                        aria-label={`Poids de ${rule.name}`}
                      />
                    </Field>
                  )}
                  <Field label="Justification (note privée)">
                    <Input
                      value={rule.explanation}
                      onChange={(event) => update(rule.id, { explanation: event.target.value })}
                      placeholder="Pourquoi cette règle existe"
                    />
                  </Field>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <NewRuleDialog open={open} onOpenChange={setOpen} onCreate={(rule) => onChange([...rules, rule])} />
    </div>
  );
}
