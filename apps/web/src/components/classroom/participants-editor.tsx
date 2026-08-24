"use client";

import { createParticipant } from "@plan2classe-app/api/domain/defaults";
import type { Participant, SolverSettings } from "@plan2classe-app/api/schemas/classroom";
import { Badge } from "@plan2classe-app/ui/components/badge";
import { Button } from "@plan2classe-app/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@plan2classe-app/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@plan2classe-app/ui/components/dropdown-menu";
import { Input } from "@plan2classe-app/ui/components/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@plan2classe-app/ui/components/input-group";
import { Label } from "@plan2classe-app/ui/components/label";
import { Switch } from "@plan2classe-app/ui/components/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@plan2classe-app/ui/components/table";
import { Textarea } from "@plan2classe-app/ui/components/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@plan2classe-app/ui/components/tooltip";
import { cn } from "@plan2classe-app/ui/lib/utils";
import {
  Check,
  Clipboard,
  Ear,
  Eye,
  EyeOff,
  FileUp,
  GraduationCap,
  Hand,
  MoreHorizontal,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { KeyValueTagInput } from "@/components/common/tag-input";
import { OptionSelect, type SelectOption } from "@/components/common/option-select";

const handednessOptions: ReadonlyArray<SelectOption<Participant["handedness"]>> = [
  { value: "right", label: "Droitier" },
  { value: "left", label: "Gaucher" },
  { value: "ambidextrous", label: "Ambidextre" },
  { value: "unknown", label: "Non précisé" },
];

type Filter = "all" | "active" | "inactive";

function parseTags(value: string): Record<string, string> {
  return Object.fromEntries(
    value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const [key, ...rest] = entry.split(":");
        return [key!.trim(), rest.join(":").trim() || "true"];
      }),
  );
}

function serializeTags(tags: Record<string, string>) {
  return Object.entries(tags)
    .map(([key, value]) => `${key}:${value}`)
    .join(", ");
}

function ImportDialog({
  open,
  onOpenChange,
  onImport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (participants: Participant[]) => void;
}) {
  const [value, setValue] = useState("");
  const previewCount = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line, index) => !(index === 0 && /^(nom|name)[,;]/i.test(line))).length;

  const parse = () => {
    const lines = value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const participants = lines
      .filter((line, index) => !(index === 0 && /^(nom|name)[,;]/i.test(line)))
      .map((line) => {
        const delimiter = line.includes(";") ? ";" : ",";
        const [name = "", tags = "", grade = "", handedness = "", vision = "", hearing = ""] = line
          .split(delimiter)
          .map((cell) => cell.trim());
        const participant = createParticipant(name);
        participant.tags = parseTags(tags);
        participant.grade = grade ? Number(grade.replace(",", ".")) : null;
        participant.handedness =
          handedness.toUpperCase() === "L"
            ? "left"
            : handedness.toUpperCase() === "R"
              ? "right"
              : "unknown";
        participant.vision_need = vision ? Math.min(5, Math.max(0, Number(vision))) : 0;
        participant.hearing_need = hearing ? Math.min(5, Math.max(0, Number(hearing))) : 0;
        return participant;
      })
      .filter((participant) => participant.name);
    onImport(participants);
    setValue("");
    onOpenChange(false);
    toast.success(
      `${participants.length} élève${participants.length > 1 ? "s" : ""} importé${participants.length > 1 ? "s" : ""}`,
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importer une liste</DialogTitle>
          <DialogDescription>
            Une ligne par élève. Seul le nom est obligatoire, les autres colonnes sont
            facultatives.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center gap-1.5 rounded-lg border bg-muted/40 p-2 font-mono text-[11px] text-muted-foreground">
            {["nom", "tags", "note", "main (R/L)", "vision 0-5", "audition 0-5"].map(
              (column, index) => (
                <span key={column} className="inline-flex items-center gap-1.5">
                  {index > 0 ? <span aria-hidden="true">;</span> : null}
                  <span className="rounded bg-background px-1.5 py-0.5">{column}</span>
                </span>
              ),
            )}
          </div>
          <Textarea
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className="min-h-56 font-mono text-xs"
            aria-label="Liste des élèves à importer"
            placeholder={
              "Nom;tags;note;main;vision;audition\nAlice Dupont;genre:F, groupe:1;15;R;0;0\nBob Martin;genre:M, groupe:2;11;L;2;1"
            }
          />
          <p className="text-xs text-muted-foreground">
            {previewCount > 0
              ? `${previewCount} ligne${previewCount > 1 ? "s" : ""} détectée${previewCount > 1 ? "s" : ""}.`
              : "Collez votre liste pour voir le nombre de lignes détectées."}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={parse} disabled={previewCount === 0}>
            <FileUp /> Importer {previewCount > 0 ? previewCount : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HeadHint({ label, hint }: { label: React.ReactNode; hint: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className="inline-flex cursor-help items-center gap-1.5 underline decoration-dotted decoration-muted-foreground underline-offset-4" />
        }
      >
        {label}
      </TooltipTrigger>
      <TooltipContent className="max-w-56">{hint}</TooltipContent>
    </Tooltip>
  );
}

/**
 * The numeric columns only mean something through the solver settings, and
 * several are off by default. Rather than describe them in the abstract, this
 * reports what the current configuration actually does with them.
 */
function ColumnEffects({
  settings,
  onOpenSettings,
}: {
  settings: SolverSettings;
  onOpenSettings?: () => void;
}) {
  const gradeUsed = settings.grade_balance_weight > 0 || settings.grade_mix_weight > 0;
  const rows: ReadonlyArray<{ icon: typeof Eye; column: string; effect: string; active: boolean }> = [
    {
      icon: GraduationCap,
      column: "Note",
      effect: gradeUsed
        ? [
            settings.grade_balance_weight > 0
              ? "équilibre la moyenne de chaque table"
              : null,
            settings.grade_mix_weight > 0
              ? `favorise les voisins avec au moins ${settings.grade_mix_min_difference} points d’écart`
              : null,
          ]
            .filter(Boolean)
            .join(" et ")
        : "ignorée : activez « Équilibre des notes » ou « Mix de niveaux » dans les réglages",
      active: gradeUsed,
    },
    {
      icon: Hand,
      column: "Main",
      effect:
        settings.hand_collision === "off"
          ? "ignorée : la collision droitier / gaucher est désactivée"
          : settings.hand_collision === "hard"
            ? "contrainte dure : deux voisins ne peuvent pas se gêner du coude"
            : "souhait pondéré : le moteur évite la gêne du coude si possible",
      active: settings.hand_collision !== "off",
    },
    {
      icon: Eye,
      column: "Vision",
      effect:
        settings.vision_weight > 0
          ? settings.accessibility_hard
            ? `rapproche du tableau ; les niveaux 3 à 5 sont une contrainte dure (${Math.round(settings.hard_front_fraction * 100)} % de places avant)`
            : "rapproche du tableau, en souhait pondéré"
          : "ignorée : le poids du besoin visuel est à 0",
      active: settings.vision_weight > 0,
    },
    {
      icon: Ear,
      column: "Audition",
      effect:
        settings.hearing_weight > 0
          ? "rapproche de l’avant de la salle, en souhait pondéré"
          : "ignorée : le poids du besoin auditif est à 0",
      active: settings.hearing_weight > 0,
    },
  ];

  return (
    <div className="rounded-xl border bg-muted/20 p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-xs font-medium">Ce que le moteur fait de ces colonnes, aujourd’hui</p>
        {onOpenSettings ? (
          <Button size="xs" variant="ghost" onClick={onOpenSettings}>
            <Settings2 /> Régler
          </Button>
        ) : null}
      </div>
      <dl className="grid gap-1.5 sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.column} className="flex items-start gap-2 text-xs leading-5">
            <row.icon
              className={cn(
                "mt-0.5 size-3.5 shrink-0",
                row.active ? "text-foreground" : "text-muted-foreground/60",
              )}
              aria-hidden="true"
            />
            <div className="min-w-0">
              <dt className={cn("font-medium", !row.active && "text-muted-foreground")}>
                {row.column}
              </dt>
              <dd className="text-muted-foreground">{row.effect}</dd>
            </div>
          </div>
        ))}
      </dl>
    </div>
  );
}

function AccessCodeButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      className="font-mono text-xs tracking-wider"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(code);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
          toast.success("Code copié");
        } catch {
          toast.error("Copie impossible. Sélectionnez le code manuellement.");
        }
      }}
      aria-label={`Copier le code ${code}`}
    >
      {code}
      {copied ? <Check className="size-3 text-success" /> : <Clipboard className="size-3" />}
    </Button>
  );
}

export function ParticipantsEditor({
  participants,
  seatCount,
  settings,
  onOpenSettings,
  onChange,
}: {
  participants: Participant[];
  seatCount?: number;
  settings?: SolverSettings;
  onOpenSettings?: () => void;
  onChange: (participants: Participant[]) => void;
}) {
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [importOpen, setImportOpen] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<Participant | null>(null);
  const [removeInactiveOpen, setRemoveInactiveOpen] = useState(false);

  // Suggest the keys already in use so tagging stays consistent across a class.
  const tagSuggestions = useMemo(() => {
    const keys = new Set<string>();
    for (const participant of participants) {
      for (const [key, value] of Object.entries(participant.tags)) {
        keys.add(value === "true" ? key : `${key}:${value}`);
      }
    }
    for (const fallback of ["genre:F", "genre:M", "groupe:1", "groupe:2", "accessible"]) {
      keys.add(fallback);
    }
    return [...keys].sort((a, b) => a.localeCompare(b, "fr"));
  }, [participants]);

  const activeCount = participants.filter((participant) => participant.active).length;
  const inactiveCount = participants.length - activeCount;
  const overCapacity = seatCount !== undefined && activeCount > seatCount;

  const visible = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("fr");
    return participants.filter((participant) => {
      if (filter === "active" && !participant.active) return false;
      if (filter === "inactive" && participant.active) return false;
      if (!needle) return true;
      return (
        participant.name.toLocaleLowerCase("fr").includes(needle) ||
        serializeTags(participant.tags).toLocaleLowerCase("fr").includes(needle)
      );
    });
  }, [filter, participants, search]);

  const update = (id: string, patch: Partial<Participant>) =>
    onChange(
      participants.map((participant) =>
        participant.id === id ? { ...participant, ...patch } : participant,
      ),
    );

  const add = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onChange([...participants, createParticipant(trimmed)]);
    setName("");
  };

  const setAllActive = (active: boolean) =>
    onChange(participants.map((participant) => ({ ...participant, active })));

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-end">
        <div className="grid flex-1 gap-2">
          <Label htmlFor="new-participant">Ajouter un élève</Label>
          <Input
            id="new-participant"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                add();
              }
            }}
            placeholder="Prénom NOM"
          />
        </div>
        <div className="flex gap-2">
          <Button onClick={add} disabled={!name.trim()}>
            <Plus /> Ajouter
          </Button>
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <FileUp /> Importer
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="gap-1.5">
            <Users aria-hidden="true" /> {activeCount} actif{activeCount > 1 ? "s" : ""}
          </Badge>
          {inactiveCount > 0 ? (
            <Badge variant="outline" className="gap-1.5">
              <EyeOff aria-hidden="true" /> {inactiveCount} inactif{inactiveCount > 1 ? "s" : ""}
            </Badge>
          ) : null}
          {seatCount !== undefined ? (
            <Badge
              variant="outline"
              className={cn("gap-1.5 tabular-nums", overCapacity && "border-warning/60 text-warning")}
            >
              {overCapacity ? <TriangleAlert aria-hidden="true" /> : <Check aria-hidden="true" />}
              {activeCount} / {seatCount} places
            </Badge>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <InputGroup className="w-full sm:w-64">
            <InputGroupAddon>
              <Search aria-hidden="true" />
            </InputGroupAddon>
            <InputGroupInput
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher un élève ou un tag…"
              aria-label="Rechercher un élève"
            />
            {search ? (
              <InputGroupAddon align="inline-end">
                <Button
                  size="icon-xs"
                  variant="ghost"
                  onClick={() => setSearch("")}
                  aria-label="Effacer la recherche"
                >
                  <X />
                </Button>
              </InputGroupAddon>
            ) : null}
          </InputGroup>

          <OptionSelect
            value={filter}
            onValueChange={(value) => setFilter(value)}
            options={[
              { value: "all", label: "Tous les élèves" },
              { value: "active", label: "Actifs seulement" },
              { value: "inactive", label: "Inactifs seulement" },
            ]}
            className="w-44"
            aria-label="Filtrer les élèves"
          />

          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="outline" size="icon" aria-label="Actions groupées" />}
            >
              <MoreHorizontal />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-card">
              <DropdownMenuItem onClick={() => setAllActive(true)}>
                <Eye /> Tout activer
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setAllActive(false)}>
                <EyeOff /> Tout désactiver
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                disabled={inactiveCount === 0}
                onClick={() => setRemoveInactiveOpen(true)}
              >
                <Trash2 /> Supprimer les inactifs
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {settings ? <ColumnEffects settings={settings} onOpenSettings={onOpenSettings} /> : null}

      <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
        <ShieldCheck className="mt-px size-3.5 shrink-0" aria-hidden="true" />
        Les besoins visuels, auditifs et les codes personnels ne sont jamais exposés dans le
        formulaire public.
      </p>

      {participants.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-muted/20 px-6 py-14 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl border bg-background">
            <UserRound className="size-5" aria-hidden="true" />
          </span>
          <h3 className="mt-4 font-medium">Aucun élève pour l’instant</h3>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            Ajoutez les élèves un par un, ou collez votre liste de classe depuis un tableur.
          </p>
          <Button className="mt-5" variant="outline" onClick={() => setImportOpen(true)}>
            <FileUp /> Importer une liste
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table className="min-w-[1080px]">
            <TableHeader className="bg-muted/40">
              <TableRow className="hover:bg-transparent">
                <TableHead className="sticky left-0 z-10 min-w-56 bg-muted/40 backdrop-blur">
                  Élève
                </TableHead>
                <TableHead className="min-w-56">
                  <HeadHint
                    label="Tags"
                    hint="Paires clé:valeur séparées par des virgules, réutilisables dans les contraintes. Ex. genre:F, groupe:1"
                  />
                </TableHead>
                <TableHead className="w-24">
                  <HeadHint label="Note" hint="Note moyenne sur 20, utilisée par l’équilibre des tables." />
                </TableHead>
                <TableHead className="w-36">
                  <span className="inline-flex items-center gap-1.5">
                    <Hand className="size-3.5" aria-hidden="true" /> Main
                  </span>
                </TableHead>
                <TableHead className="w-24">
                  <HeadHint
                    label={
                      <>
                        <Eye className="size-3.5" aria-hidden="true" /> Vision
                      </>
                    }
                    hint="0 = aucun besoin, 5 = doit être placé au plus près du tableau."
                  />
                </TableHead>
                <TableHead className="w-24">
                  <HeadHint
                    label={
                      <>
                        <Ear className="size-3.5" aria-hidden="true" /> Audition
                      </>
                    }
                    hint="0 = aucun besoin, 5 = doit être placé à l’avant de la salle."
                  />
                </TableHead>
                <TableHead className="w-24">
                  <HeadHint
                    label="Priorité"
                    hint="Multiplie le poids de cet élève dans la satisfaction globale. 1 = neutre."
                  />
                </TableHead>
                <TableHead className="w-32">
                  <HeadHint label="Code" hint="Code personnel demandé si le formulaire est protégé." />
                </TableHead>
                <TableHead className="w-20 text-center">Actif</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Supprimer</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={10} className="h-28 text-center text-muted-foreground">
                    Aucun élève ne correspond à ce filtre.
                  </TableCell>
                </TableRow>
              ) : (
                visible.map((participant) => (
                  <TableRow
                    key={participant.id}
                    className={cn("h-14", !participant.active && "opacity-55")}
                  >
                    <TableCell className="sticky left-0 z-10 bg-card">
                      <Input
                        value={participant.name}
                        onChange={(event) => update(participant.id, { name: event.target.value })}
                        className="min-w-48 font-medium"
                        aria-label={`Nom de ${participant.name}`}
                      />
                    </TableCell>
                    <TableCell>
                      <KeyValueTagInput
                        className="min-w-56"
                        value={participant.tags}
                        onChange={(tags) => update(participant.id, { tags })}
                        suggestions={tagSuggestions}
                        aria-label={`Tags de ${participant.name}`}
                      />
                    </TableCell>
                    <TableCell>
                      <InputGroup className="w-24">
                        <InputGroupInput
                          type="number"
                          min="0"
                          max="20"
                          step="0.1"
                          value={participant.grade ?? ""}
                          onChange={(event) =>
                            update(participant.id, {
                              grade: event.target.value ? Number(event.target.value) : null,
                            })
                          }
                          aria-label={`Note de ${participant.name}`}
                        />
                        <InputGroupAddon align="inline-end" className="text-xs">
                          /20
                        </InputGroupAddon>
                      </InputGroup>
                    </TableCell>
                    <TableCell>
                      <OptionSelect
                        value={participant.handedness}
                        onValueChange={(value) => update(participant.id, { handedness: value })}
                        options={handednessOptions}
                        className="w-32"
                        aria-label={`Main de ${participant.name}`}
                      />
                    </TableCell>
                    <TableCell>
                      <InputGroup className="w-20">
                        <InputGroupInput
                          type="number"
                          min="0"
                          max="5"
                          value={participant.vision_need}
                          onChange={(event) =>
                            update(participant.id, {
                              vision_need: Math.min(5, Math.max(0, Number(event.target.value))),
                            })
                          }
                          aria-label={`Besoin visuel de ${participant.name}`}
                        />
                        <InputGroupAddon align="inline-end" className="text-xs">
                          /5
                        </InputGroupAddon>
                      </InputGroup>
                    </TableCell>
                    <TableCell>
                      <InputGroup className="w-20">
                        <InputGroupInput
                          type="number"
                          min="0"
                          max="5"
                          value={participant.hearing_need}
                          onChange={(event) =>
                            update(participant.id, {
                              hearing_need: Math.min(5, Math.max(0, Number(event.target.value))),
                            })
                          }
                          aria-label={`Besoin auditif de ${participant.name}`}
                        />
                        <InputGroupAddon align="inline-end" className="text-xs">
                          /5
                        </InputGroupAddon>
                      </InputGroup>
                    </TableCell>
                    <TableCell>
                      <InputGroup className="w-20">
                        <InputGroupAddon className="text-xs">×</InputGroupAddon>
                        <InputGroupInput
                          type="number"
                          min="0.01"
                          max="100"
                          step="0.1"
                          value={participant.priority}
                          onChange={(event) =>
                            update(participant.id, {
                              priority: Number(event.target.value) || 1,
                            })
                          }
                          aria-label={`Priorité de ${participant.name}`}
                        />
                      </InputGroup>
                    </TableCell>
                    <TableCell>
                      <AccessCodeButton code={participant.accessCode} />
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={participant.active}
                        onCheckedChange={(checked) => update(participant.id, { active: checked })}
                        aria-label={`Activer ${participant.name}`}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => setPendingRemoval(participant)}
                        aria-label={`Supprimer ${participant.name}`}
                      >
                        <Trash2 />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {visible.length > 0 && visible.length !== participants.length ? (
        <p className="text-xs text-muted-foreground">
          {visible.length} élève{visible.length > 1 ? "s" : ""} affiché
          {visible.length > 1 ? "s" : ""} sur {participants.length}.
        </p>
      ) : null}

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImport={(incoming) => onChange([...participants, ...incoming])}
      />

      <ConfirmDialog
        open={pendingRemoval !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRemoval(null);
        }}
        title="Retirer cet élève ?"
        description={`« ${pendingRemoval?.name ?? ""} » sera retiré de la classe à l’enregistrement.`}
        detail="Les contraintes qui le mentionnent devront être vérifiées, et sa réponse au formulaire ne sera plus prise en compte."
        confirmLabel="Retirer"
        onConfirm={() => {
          if (pendingRemoval) {
            onChange(participants.filter((item) => item.id !== pendingRemoval.id));
          }
          setPendingRemoval(null);
        }}
      />

      <ConfirmDialog
        open={removeInactiveOpen}
        onOpenChange={setRemoveInactiveOpen}
        title="Supprimer les élèves inactifs ?"
        description={`${inactiveCount} élève${inactiveCount > 1 ? "s" : ""} inactif${inactiveCount > 1 ? "s" : ""} ${inactiveCount > 1 ? "seront retirés" : "sera retiré"} de la liste.`}
        confirmLabel="Supprimer"
        onConfirm={() => {
          onChange(participants.filter((participant) => participant.active));
          setRemoveInactiveOpen(false);
        }}
      />
    </div>
  );
}
