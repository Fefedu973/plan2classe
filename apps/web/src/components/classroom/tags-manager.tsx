"use client";

import type { ClassroomConfig, Rule } from "@plan2classe-app/api/schemas/classroom";
import { Badge } from "@plan2classe-app/ui/components/badge";
import { Button } from "@plan2classe-app/ui/components/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@plan2classe-app/ui/components/card";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@plan2classe-app/ui/components/tooltip";
import { cn } from "@plan2classe-app/ui/lib/utils";
import { Armchair, ListChecks, Pencil, Tag, Trash2, TriangleAlert, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/common/confirm-dialog";

type ParticipantTag = { key: string; values: Array<{ value: string; count: number }> };
type SeatTag = { tag: string; seats: number; furniture: number };

type Target =
  | { scope: "participant-key"; key: string }
  | { scope: "participant-value"; key: string; value: string }
  | { scope: "seat-tag"; tag: string };

function params(rule: Rule) {
  return rule.params as unknown as Record<string, unknown>;
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? (value as unknown[]).filter((item) => typeof item === "string") : [];
}

/** Names of the rules that would be affected by touching a given tag. */
function rulesUsing(rules: Rule[], target: Target): string[] {
  return rules
    .filter((rule) => {
      const p = params(rule);
      if (target.scope === "seat-tag") {
        return asStringArray(p.tags).includes(target.tag);
      }
      const key = typeof p.tag_key === "string" ? p.tag_key : null;
      const flatTag = typeof p.tag === "string" ? p.tag : null;
      if (target.scope === "participant-key") {
        return key === target.key || flatTag === target.key;
      }
      if (key !== target.key && flatTag !== target.key) return false;
      return (
        asStringArray(p.values).includes(target.value) || p.tag_value === target.value
      );
    })
    .map((rule) => rule.name);
}

function RuleWarning({ names }: { names: string[] }) {
  if (names.length === 0) return null;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Badge variant="outline" className="cursor-help gap-1 border-warning/50 text-warning" />
        }
      >
        <TriangleAlert className="size-3" aria-hidden="true" />
        {names.length}
      </TooltipTrigger>
      <TooltipContent className="max-w-64">
        Utilisé par {names.length === 1 ? "la règle" : "les règles"} : {names.join(", ")}
      </TooltipContent>
    </Tooltip>
  );
}

function RenameDialog({
  target,
  onClose,
  onRename,
}: {
  target: { label: string; current: string; hint: string } | null;
  onClose: () => void;
  onRename: (next: string) => void;
}) {
  const [value, setValue] = useState("");
  const open = target !== null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
        else setValue(target?.current ?? "");
      }}
    >
      <DialogContent className="sm:max-w-md">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = value.trim();
            if (!trimmed || trimmed === target?.current) {
              onClose();
              return;
            }
            onRename(trimmed);
          }}
        >
          <DialogHeader>
            <DialogTitle>Renommer {target?.label}</DialogTitle>
            <DialogDescription>{target?.hint}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5 py-5">
            <Label htmlFor="tag-rename">Nouveau nom</Label>
            <Input
              id="tag-rename"
              value={value || target?.current || ""}
              onChange={(event) => setValue(event.target.value)}
              className="font-mono"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit">Renommer</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TagsManager({
  config,
  onChange,
}: {
  config: ClassroomConfig;
  onChange: (config: ClassroomConfig) => void;
}) {
  const [renaming, setRenaming] = useState<Target | null>(null);
  const [deleting, setDeleting] = useState<Target | null>(null);

  const participantTags = useMemo<ParticipantTag[]>(() => {
    const byKey = new Map<string, Map<string, number>>();
    for (const participant of config.participants) {
      for (const [key, value] of Object.entries(participant.tags)) {
        const values = byKey.get(key) ?? new Map<string, number>();
        values.set(value, (values.get(value) ?? 0) + 1);
        byKey.set(key, values);
      }
    }
    return [...byKey.entries()]
      .map(([key, values]) => ({
        key,
        values: [...values.entries()]
          .map(([value, count]) => ({ value, count }))
          .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, "fr")),
      }))
      .sort((a, b) => a.key.localeCompare(b.key, "fr"));
  }, [config.participants]);

  const seatTags = useMemo<SeatTag[]>(() => {
    const counts = new Map<string, { seats: number; furniture: number }>();
    for (const seat of config.room.seats) {
      for (const tag of seat.tags) {
        const entry = counts.get(tag) ?? { seats: 0, furniture: 0 };
        entry.seats += 1;
        counts.set(tag, entry);
      }
    }
    for (const item of config.room.furniture) {
      for (const tag of item.tags) {
        const entry = counts.get(tag) ?? { seats: 0, furniture: 0 };
        entry.furniture += 1;
        counts.set(tag, entry);
      }
    }
    return [...counts.entries()]
      .map(([tag, entry]) => ({ tag, ...entry }))
      .sort((a, b) => a.tag.localeCompare(b.tag, "fr"));
  }, [config.room.furniture, config.room.seats]);

  /** Rewrites a tag everywhere, rules included, so constraints keep working. */
  const applyRename = (target: Target, next: string) => {
    if (target.scope === "seat-tag") {
      onChange({
        ...config,
        room: {
          ...config.room,
          seats: config.room.seats.map((seat) => ({
            ...seat,
            tags: seat.tags.map((tag) => (tag === target.tag ? next : tag)),
          })),
          furniture: config.room.furniture.map((item) => ({
            ...item,
            tags: item.tags.map((tag) => (tag === target.tag ? next : tag)),
          })),
        },
        rules: config.rules.map((rule) => {
          const p = params(rule);
          if (!asStringArray(p.tags).includes(target.tag)) return rule;
          return {
            ...rule,
            params: {
              ...p,
              tags: asStringArray(p.tags).map((tag) => (tag === target.tag ? next : tag)),
            },
          } as Rule;
        }),
      });
      setRenaming(null);
      toast.success("Tag de place renommé");
      return;
    }

    const isKey = target.scope === "participant-key";
    onChange({
      ...config,
      participants: config.participants.map((participant) => {
        const entries = Object.entries(participant.tags);
        if (isKey) {
          if (!(target.key in participant.tags)) return participant;
          return {
            ...participant,
            tags: Object.fromEntries(
              entries.map(([key, value]) => [key === target.key ? next : key, value]),
            ),
          };
        }
        if (participant.tags[target.key] !== target.value) return participant;
        return { ...participant, tags: { ...participant.tags, [target.key]: next } };
      }),
      rules: config.rules.map((rule) => {
        const p = params(rule);
        const key = typeof p.tag_key === "string" ? p.tag_key : null;
        const flatTag = typeof p.tag === "string" ? p.tag : null;
        if (key !== target.key && flatTag !== target.key) return rule;
        if (isKey) {
          return {
            ...rule,
            params: {
              ...p,
              ...(key === target.key ? { tag_key: next } : {}),
              ...(flatTag === target.key ? { tag: next } : {}),
            },
          } as Rule;
        }
        return {
          ...rule,
          params: {
            ...p,
            ...(asStringArray(p.values).includes(target.value)
              ? {
                  values: asStringArray(p.values).map((value) =>
                    value === target.value ? next : value,
                  ),
                }
              : {}),
            ...(p.tag_value === target.value ? { tag_value: next } : {}),
          },
        } as Rule;
      }),
    });
    setRenaming(null);
    toast.success(isKey ? "Clé renommée" : "Valeur renommée");
  };

  const applyDelete = (target: Target) => {
    if (target.scope === "seat-tag") {
      onChange({
        ...config,
        room: {
          ...config.room,
          seats: config.room.seats.map((seat) => ({
            ...seat,
            tags: seat.tags.filter((tag) => tag !== target.tag),
          })),
          furniture: config.room.furniture.map((item) => ({
            ...item,
            tags: item.tags.filter((tag) => tag !== target.tag),
          })),
        },
      });
    } else {
      onChange({
        ...config,
        participants: config.participants.map((participant) => {
          if (target.scope === "participant-key") {
            if (!(target.key in participant.tags)) return participant;
            const { [target.key]: _removed, ...rest } = participant.tags;
            return { ...participant, tags: rest };
          }
          if (participant.tags[target.key] !== target.value) return participant;
          const { [target.key]: _removed, ...rest } = participant.tags;
          return { ...participant, tags: rest };
        }),
      });
    }
    setDeleting(null);
    toast.success("Tag retiré");
  };

  const renameTarget = renaming
    ? renaming.scope === "seat-tag"
      ? {
          label: "le tag de place",
          current: renaming.tag,
          hint: "Les places, le mobilier et les règles qui l’utilisent sont mis à jour.",
        }
      : renaming.scope === "participant-key"
        ? {
            label: "la clé",
            current: renaming.key,
            hint: "Tous les élèves portant cette clé et les règles associées sont mis à jour.",
          }
        : {
            label: "la valeur",
            current: renaming.value,
            hint: `Concerne uniquement la clé « ${renaming.key} ».`,
          }
    : null;

  const deleteNames = deleting ? rulesUsing(config.rules, deleting) : [];
  const zoneTags = seatTags.filter((entry) => entry.tag.startsWith("zone:"));
  const otherSeatTags = seatTags.filter((entry) => !entry.tag.startsWith("zone:"));

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Users className="size-4" aria-hidden="true" /> Tags des élèves
          </CardTitle>
          <p className="text-xs leading-5 text-muted-foreground">
            Des paires clé : valeur, utilisables dans les contraintes de groupe, de quota et
            d’alternance.
          </p>
          <CardAction>
            <Badge variant="secondary" className="tabular-nums">
              {participantTags.length} clé{participantTags.length > 1 ? "s" : ""}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-3">
          {participantTags.length === 0 ? (
            <p className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
              Aucun tag pour l’instant. Ajoutez-en depuis l’onglet Élèves.
            </p>
          ) : (
            participantTags.map((entry) => {
              const keyUsage = rulesUsing(config.rules, {
                scope: "participant-key",
                key: entry.key,
              });
              return (
                <div key={entry.key} className="rounded-xl border">
                  <div className="flex items-center gap-2 border-b px-3 py-2">
                    <Tag className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate font-mono text-sm">{entry.key}</span>
                    <RuleWarning names={keyUsage} />
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label={`Renommer la clé ${entry.key}`}
                      onClick={() => setRenaming({ scope: "participant-key", key: entry.key })}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label={`Supprimer la clé ${entry.key}`}
                      onClick={() => setDeleting({ scope: "participant-key", key: entry.key })}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                  <div className="grid gap-1 p-1.5">
                    {entry.values.map((value) => {
                      const usage = rulesUsing(config.rules, {
                        scope: "participant-value",
                        key: entry.key,
                        value: value.value,
                      });
                      return (
                        <div
                          key={value.value}
                          className="flex items-center gap-2 rounded-md px-2 py-1 text-xs hover:bg-muted"
                        >
                          <span className="min-w-0 flex-1 truncate font-mono">{value.value}</span>
                          <span className="shrink-0 tabular-nums text-muted-foreground">
                            {value.count} élève{value.count > 1 ? "s" : ""}
                          </span>
                          <RuleWarning names={usage} />
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            aria-label={`Renommer la valeur ${value.value}`}
                            onClick={() =>
                              setRenaming({
                                scope: "participant-value",
                                key: entry.key,
                                value: value.value,
                              })
                            }
                          >
                            <Pencil />
                          </Button>
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            aria-label={`Supprimer la valeur ${value.value}`}
                            onClick={() =>
                              setDeleting({
                                scope: "participant-value",
                                key: entry.key,
                                value: value.value,
                              })
                            }
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Armchair className="size-4" aria-hidden="true" /> Tags des places
          </CardTitle>
          <p className="text-xs leading-5 text-muted-foreground">
            Portés par les places et le mobilier. Les tags{" "}
            <span className="font-mono">zone:</span> deviennent les zones proposées aux élèves dans
            le formulaire.
          </p>
          <CardAction>
            <Badge variant="secondary" className="tabular-nums">
              {seatTags.length}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-4">
          {seatTags.length === 0 ? (
            <p className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
              Aucun tag de place. Sélectionnez une place dans l’onglet Salle pour en ajouter.
            </p>
          ) : (
            [
              { title: "Zones proposées aux élèves", entries: zoneTags },
              { title: "Autres tags", entries: otherSeatTags },
            ]
              .filter((group) => group.entries.length > 0)
              .map((group) => (
                <div key={group.title} className="grid gap-1.5">
                  <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    {group.title}
                  </p>
                  <div className="grid gap-1 rounded-xl border p-1.5">
                    {group.entries.map((entry) => {
                      const usage = rulesUsing(config.rules, {
                        scope: "seat-tag",
                        tag: entry.tag,
                      });
                      return (
                        <div
                          key={entry.tag}
                          className={cn(
                            "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted",
                          )}
                        >
                          <span className="min-w-0 flex-1 truncate font-mono">{entry.tag}</span>
                          <span className="shrink-0 tabular-nums text-muted-foreground">
                            {entry.seats > 0 ? `${entry.seats} place${entry.seats > 1 ? "s" : ""}` : null}
                            {entry.seats > 0 && entry.furniture > 0 ? " · " : null}
                            {entry.furniture > 0
                              ? `${entry.furniture} mobilier${entry.furniture > 1 ? "s" : ""}`
                              : null}
                          </span>
                          <RuleWarning names={usage} />
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            aria-label={`Renommer le tag ${entry.tag}`}
                            onClick={() => setRenaming({ scope: "seat-tag", tag: entry.tag })}
                          >
                            <Pencil />
                          </Button>
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            aria-label={`Supprimer le tag ${entry.tag}`}
                            onClick={() => setDeleting({ scope: "seat-tag", tag: entry.tag })}
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
          )}

          <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
            <ListChecks className="mt-px size-3.5 shrink-0" aria-hidden="true" />
            Renommer met aussi à jour les contraintes qui citent le tag. Supprimer ne les modifie
            pas : vérifiez-les ensuite.
          </p>
        </CardContent>
      </Card>

      <RenameDialog
        target={renameTarget}
        onClose={() => setRenaming(null)}
        onRename={(next) => renaming && applyRename(renaming, next)}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title="Retirer ce tag ?"
        description={
          deleting?.scope === "seat-tag"
            ? `Le tag « ${deleting.tag} » sera retiré de toutes les places et du mobilier.`
            : deleting?.scope === "participant-key"
              ? `La clé « ${deleting.key} » sera retirée de tous les élèves.`
              : `La valeur « ${deleting?.scope === "participant-value" ? deleting.value : ""} » sera retirée des élèves concernés.`
        }
        detail={
          deleteNames.length > 0
            ? `Attention : ${deleteNames.length === 1 ? "la règle" : "les règles"} ${deleteNames.join(", ")} ${deleteNames.length === 1 ? "cite" : "citent"} ce tag et ${deleteNames.length === 1 ? "restera" : "resteront"} en place. Vérifiez-${deleteNames.length === 1 ? "la" : "les"} dans l’onglet Contraintes.`
            : undefined
        }
        confirmLabel="Retirer"
        onConfirm={() => deleting && applyDelete(deleting)}
      />
    </div>
  );
}
