"use client";

import type { FormConfig, RelationKind, Room } from "@plan2classe-app/api/schemas/classroom";
import { publicResponseInputSchema } from "@plan2classe-app/api/schemas/classroom";
import { useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "@plan2classe-app/ui/components/alert";
import { Badge } from "@plan2classe-app/ui/components/badge";
import { Button } from "@plan2classe-app/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@plan2classe-app/ui/components/card";
import { Input } from "@plan2classe-app/ui/components/input";
import { Label } from "@plan2classe-app/ui/components/label";
import { Progress } from "@plan2classe-app/ui/components/progress";
import { Separator } from "@plan2classe-app/ui/components/separator";
import { Skeleton } from "@plan2classe-app/ui/components/skeleton";
import { Textarea } from "@plan2classe-app/ui/components/textarea";
import { cn } from "@plan2classe-app/ui/lib/utils";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  CircleAlert,
  DoorOpen,
  Info,
  KeyRound,
  LayoutGrid,
  LockKeyhole,
  MessageSquareText,
  MousePointerClick,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  UsersRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { z } from "zod";

import { client, orpc } from "@/utils/orpc";

type PublicResponseInput = z.infer<typeof publicResponseInputSchema>;
type RankedNeighbor = PublicResponseInput["desired_neighbors"][number];

type FormState = PublicResponseInput & {
  accessCode: string;
};

type PublicParticipant = {
  id: string;
  name: string;
};

type SubmissionResult = {
  saved: true;
  revision: number;
  confirmationMessage: string;
  solve: {
    status: string;
    min_satisfaction: number | null;
    average_satisfaction: number | null;
  } | null;
};

const steps = [
  { label: "Identité", shortLabel: "Vous", icon: UsersRound },
  { label: "Places et zones", shortLabel: "Places", icon: LayoutGrid },
  { label: "Voisinages", shortLabel: "Voisins", icon: UsersRound },
  { label: "Priorités", shortLabel: "Valider", icon: Star },
] as const;

const relationOptions: ReadonlyArray<{ value: Exclude<RelationKind, "hand_conflict">; label: string }> = [
  { value: "adjacent", label: "Juste à côté" },
  { value: "near", label: "À proximité" },
  { value: "same_table", label: "À la même table" },
  { value: "same_cluster", label: "Dans le même groupe" },
];

const priorityOptions: ReadonlyArray<{
  value: PublicResponseInput["priority_mode"];
  title: string;
  description: string;
}> = [
  {
    value: "balanced",
    title: "Équilibrer les deux",
    description: "Mes choix de place et de voisinage comptent autant.",
  },
  {
    value: "seat",
    title: "Priorité à la place",
    description: "Je préfère surtout être bien placé dans la salle.",
  },
  {
    value: "neighbors",
    title: "Priorité au voisinage",
    description: "Les personnes autour de moi sont le plus important.",
  },
  {
    value: "none",
    title: "Aucune priorité",
    description: "Je laisse le moteur arbitrer librement.",
  },
];

function initialFormState(): FormState {
  return {
    participant_id: "",
    accessCode: "",
    seat_ranking: [],
    zone_ranking: [],
    desired_neighbors: [],
    avoided_neighbors: [],
    priority_mode: "balanced",
    notes: "",
  };
}

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "Une erreur inattendue est survenue. Réessayez dans quelques instants.";
}

function zoneLabel(zone: string) {
  const readable = zone.replace(/^zone:/, "").replace(/[-_]+/g, " ").trim();
  return readable
    ? `${readable[0]?.toLocaleUpperCase("fr-FR")}${readable.slice(1)}`
    : zone;
}

export function PublicClassroomForm({ slug }: { slug: string }) {
  const classroomQuery = useQuery(
    orpc.publicClassroom.get.queryOptions({ input: { slug }, retry: false }),
  );

  if (classroomQuery.isPending) {
    return <PublicFormSkeleton />;
  }

  if (classroomQuery.isError || !classroomQuery.data) {
    return (
      <PublicFormError
        message={errorMessage(classroomQuery.error)}
        onRetry={() => void classroomQuery.refetch()}
      />
    );
  }

  return <LoadedPublicClassroomForm slug={slug} data={classroomQuery.data} />;
}

function LoadedPublicClassroomForm({
  slug,
  data,
}: {
  slug: string;
  data: {
    classroom: {
      id: string;
      name: string;
      description: string;
      slug: string;
      form: FormConfig;
      room: Room;
    };
    participants: PublicParticipant[];
    zones: string[];
  };
}) {
  const { classroom, participants, zones } = data;
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(initialFormState);
  const [pageError, setPageError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<SubmissionResult | null>(null);

  const availableSeats = useMemo(
    () => classroom.room.seats.filter((seat) => seat.enabled),
    [classroom.room.seats],
  );
  const selectedParticipant = participants.find((person) => person.id === form.participant_id);

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setPageError(null);
  }

  function selectParticipant(participantId: string) {
    setForm((current) => ({
      ...current,
      participant_id: participantId,
      desired_neighbors: current.desired_neighbors.filter(
        (neighbor) => neighbor.participant_id !== participantId,
      ),
      avoided_neighbors: current.avoided_neighbors.filter(
        (neighbor) => neighbor.participant_id !== participantId,
      ),
    }));
    setPageError(null);
  }

  function toggleRanking(key: "seat_ranking" | "zone_ranking", id: string, max: number) {
    setForm((current) => {
      const ranking = current[key];
      if (ranking.includes(id)) {
        return { ...current, [key]: ranking.filter((item) => item !== id) };
      }
      if (ranking.length >= max) return current;
      return { ...current, [key]: [...ranking, id] };
    });
    setPageError(null);
  }

  function toggleNeighbor(kind: "desired_neighbors" | "avoided_neighbors", personId: string) {
    const otherKind =
      kind === "desired_neighbors" ? "avoided_neighbors" : "desired_neighbors";
    const limit =
      kind === "desired_neighbors"
        ? classroom.form.maxNeighborChoices
        : classroom.form.maxAvoidChoices;

    setForm((current) => {
      const ranking = current[kind];
      const exists = ranking.some((neighbor) => neighbor.participant_id === personId);
      if (!exists && ranking.length >= limit) return current;

      return {
        ...current,
        [kind]: exists
          ? ranking.filter((neighbor) => neighbor.participant_id !== personId)
          : [...ranking, { participant_id: personId, relation: "adjacent" as const }],
        [otherKind]: current[otherKind].filter(
          (neighbor) => neighbor.participant_id !== personId,
        ),
      };
    });
    setPageError(null);
  }

  function updateNeighborRelation(
    kind: "desired_neighbors" | "avoided_neighbors",
    personId: string,
    relation: RankedNeighbor["relation"],
  ) {
    setForm((current) => ({
      ...current,
      [kind]: current[kind].map((neighbor) =>
        neighbor.participant_id === personId ? { ...neighbor, relation } : neighbor,
      ),
    }));
  }

  function validateIdentity() {
    if (!form.participant_id) {
      setPageError("Sélectionnez votre nom pour continuer.");
      return false;
    }
    if (classroom.form.accessMode === "code" && form.accessCode.trim().length < 4) {
      setPageError("Saisissez le code personnel qui vous a été communiqué.");
      return false;
    }
    return true;
  }

  function goNext() {
    if (step === 0 && !validateIdentity()) return;
    setPageError(null);
    setStep((current) => Math.min(steps.length - 1, current + 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goBack() {
    setPageError(null);
    setStep((current) => Math.max(0, current - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submitResponse() {
    if (!validateIdentity()) {
      setStep(0);
      return;
    }

    const parsed = publicResponseInputSchema.safeParse({
      participant_id: form.participant_id,
      seat_ranking: form.seat_ranking,
      zone_ranking: form.zone_ranking,
      desired_neighbors: form.desired_neighbors,
      avoided_neighbors: form.avoided_neighbors,
      priority_mode: classroom.form.collectPriority ? form.priority_mode : "none",
      notes: classroom.form.collectNotes ? form.notes.trim() : "",
    });

    if (!parsed.success) {
      setPageError(parsed.error.issues[0]?.message ?? "Certaines réponses sont invalides.");
      return;
    }

    setIsSubmitting(true);
    setPageError(null);
    try {
      const submission = await client.publicClassroom.submit({
        slug,
        accessCode: form.accessCode.trim() || undefined,
        response: parsed.data,
      });
      setResult({ ...submission, solve: submission.solve?.result ?? null });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      setPageError(errorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (result) {
    return (
      <SubmissionSuccess
        classroomName={classroom.name}
        participantName={selectedParticipant?.name ?? ""}
        result={result}
        allowEdits={classroom.form.allowEdits}
        onEdit={() => {
          setResult(null);
          setStep(0);
        }}
      />
    );
  }

  return (
    <main className="min-h-0 overflow-y-auto bg-muted/20">
      <div className="border-b bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
            <span className="grid size-7 place-items-center rounded-lg bg-foreground text-background">
              <Sparkles className="size-3.5" aria-hidden="true" />
            </span>
            Plan2Classe
          </Link>
          <Badge variant="outline" className="gap-1.5">
            <ShieldCheck aria-hidden="true" />
            Réponse confidentielle
          </Badge>
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl gap-7 px-4 py-8 sm:px-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:px-8 lg:py-12">
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Formulaire de préférences
          </p>
          <h1 className="mt-3 text-xl font-semibold tracking-tight">{classroom.form.title}</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {classroom.description || classroom.name}
          </p>

          <div className="mt-6 lg:hidden">
            <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>{steps[step]?.label}</span>
              <span>
                {step + 1} / {steps.length}
              </span>
            </div>
            <Progress value={((step + 1) / steps.length) * 100} />
          </div>

          <nav aria-label="Étapes du formulaire" className="mt-7 hidden space-y-1 lg:block">
            {steps.map((item, index) => {
              const Icon = item.icon;
              const isActive = index === step;
              const isPast = index < step;
              return (
                <button
                  key={item.label}
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                    isActive && "bg-foreground text-background",
                    !isActive && "text-muted-foreground",
                    isPast && "hover:bg-muted hover:text-foreground",
                  )}
                  onClick={() => {
                    if (isPast) setStep(index);
                  }}
                  disabled={index > step}
                  aria-current={isActive ? "step" : undefined}
                >
                  <span
                    className={cn(
                      "grid size-6 place-items-center rounded-md border",
                      isActive && "border-background/20",
                    )}
                  >
                    {isPast ? (
                      <Check className="size-3" aria-hidden="true" />
                    ) : (
                      <Icon className="size-3" aria-hidden="true" />
                    )}
                  </span>
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="mt-7 hidden rounded-xl border bg-background p-4 text-xs leading-5 text-muted-foreground lg:block">
            <LockKeyhole className="mb-3 size-4 text-foreground" aria-hidden="true" />
            Vos choix sont transmis à l’enseignant et utilisés uniquement pour calculer le plan.
          </div>
        </aside>

        <div className="min-w-0">
          <Card className="shadow-sm">
            <CardHeader className="border-b px-5 pb-5 sm:px-7">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">
                    Étape {step + 1} sur {steps.length}
                  </p>
                  <CardTitle className="text-xl sm:text-2xl">{stepTitle(step)}</CardTitle>
                  <CardDescription className="mt-2 max-w-2xl leading-6">
                    {stepDescription(step, classroom.form)}
                  </CardDescription>
                </div>
                <span className="hidden rounded-lg border bg-muted/40 px-2.5 py-1 font-mono text-xs text-muted-foreground sm:block">
                  {String(step + 1).padStart(2, "0")}
                </span>
              </div>
            </CardHeader>

            <CardContent className="px-5 py-6 sm:px-7 sm:py-8">
              {step === 0 ? (
                <IdentityStep
                  participants={participants}
                  participantId={form.participant_id}
                  accessCode={form.accessCode}
                  accessMode={classroom.form.accessMode}
                  description={classroom.form.description}
                  onParticipantChange={selectParticipant}
                  onAccessCodeChange={(value) => updateForm("accessCode", value)}
                />
              ) : null}

              {step === 1 ? (
                <PreferencesStep
                  room={classroom.room}
                  zones={zones}
                  formConfig={classroom.form}
                  seatRanking={form.seat_ranking}
                  zoneRanking={form.zone_ranking}
                  onSeatToggle={(id) =>
                    toggleRanking("seat_ranking", id, classroom.form.maxSeatChoices)
                  }
                  onZoneToggle={(id) =>
                    toggleRanking("zone_ranking", id, Math.min(10, zones.length))
                  }
                />
              ) : null}

              {step === 2 ? (
                <NeighborsStep
                  participants={participants.filter(
                    (person) => person.id !== form.participant_id,
                  )}
                  desired={form.desired_neighbors}
                  avoided={form.avoided_neighbors}
                  maxDesired={classroom.form.maxNeighborChoices}
                  maxAvoided={classroom.form.maxAvoidChoices}
                  onToggle={toggleNeighbor}
                  onRelationChange={updateNeighborRelation}
                />
              ) : null}

              {step === 3 ? (
                <ReviewStep
                  form={form}
                  formConfig={classroom.form}
                  participantName={selectedParticipant?.name ?? ""}
                  seats={availableSeats.map((seat) => ({ id: seat.id, name: seat.label }))}
                  zones={zones}
                  participants={participants}
                  onPriorityChange={(value) => updateForm("priority_mode", value)}
                  onNotesChange={(value) => updateForm("notes", value)}
                />
              ) : null}

              {pageError ? (
                <Alert variant="destructive" className="mt-6" aria-live="polite">
                  <CircleAlert aria-hidden="true" />
                  <AlertTitle>Vérifiez votre réponse</AlertTitle>
                  <AlertDescription>{pageError}</AlertDescription>
                </Alert>
              ) : null}
            </CardContent>

            <CardFooter className="justify-between gap-3 px-5 py-4 sm:px-7">
              <Button
                type="button"
                variant="outline"
                onClick={goBack}
                disabled={step === 0 || isSubmitting}
              >
                <ArrowLeft data-icon="inline-start" aria-hidden="true" />
                Retour
              </Button>
              {step < steps.length - 1 ? (
                <Button type="button" onClick={goNext}>
                  Continuer
                  <ArrowRight data-icon="inline-end" aria-hidden="true" />
                </Button>
              ) : (
                <Button type="button" onClick={() => void submitResponse()} disabled={isSubmitting}>
                  {isSubmitting ? "Enregistrement…" : "Envoyer mes choix"}
                  {!isSubmitting ? <Check data-icon="inline-end" aria-hidden="true" /> : null}
                </Button>
              )}
            </CardFooter>
          </Card>
        </div>
      </div>
    </main>
  );
}

function stepTitle(step: number) {
  return [
    "Commençons par vous identifier",
    "Quelles places vous conviendraient ?",
    "Avec qui souhaitez-vous être placé ?",
    "Une dernière vérification",
  ][step];
}

function stepDescription(step: number, form: FormConfig) {
  return [
    form.accessMode === "code"
      ? "Choisissez votre nom et utilisez le code personnel transmis par votre enseignant."
      : "Choisissez simplement votre nom dans la liste. Aucun compte élève n’est nécessaire.",
    "Classez vos choix par ordre de préférence. Vous pouvez aussi ne rien sélectionner.",
    "Ces souhaits guident le calcul sans garantir un voisinage précis.",
    "Précisez ce qui compte le plus pour vous, puis relisez votre réponse.",
  ][step];
}

function IdentityStep({
  participants,
  participantId,
  accessCode,
  accessMode,
  description,
  onParticipantChange,
  onAccessCodeChange,
}: {
  participants: PublicParticipant[];
  participantId: string;
  accessCode: string;
  accessMode: FormConfig["accessMode"];
  description: string;
  onParticipantChange: (value: string) => void;
  onAccessCodeChange: (value: string) => void;
}) {
  return (
    <div className="space-y-7">
      {description ? (
        <div className="rounded-xl border bg-muted/30 p-4 text-sm leading-6 text-muted-foreground">
          <Info className="mr-2 inline size-4 text-foreground" aria-hidden="true" />
          {description}
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="participant">Votre nom</Label>
        <div className="relative">
          <select
            id="participant"
            value={participantId}
            onChange={(event) => onParticipantChange(event.target.value)}
            className="h-10 w-full appearance-none rounded-lg border border-input bg-background px-3 pr-10 text-sm outline-none transition-shadow focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            required
          >
            <option value="">Sélectionnez votre nom…</option>
            {participants.map((participant) => (
              <option key={participant.id} value={participant.id}>
                {participant.name}
              </option>
            ))}
          </select>
          <DoorOpen className="pointer-events-none absolute right-3 top-3 size-4 text-muted-foreground" aria-hidden="true" />
        </div>
        <p className="text-xs text-muted-foreground">
          Votre nom sert uniquement à rattacher vos choix au bon élève.
        </p>
      </div>

      {accessMode === "code" ? (
        <div className="space-y-2">
          <Label htmlFor="access-code">Code personnel</Label>
          <div className="relative max-w-sm">
            <KeyRound className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="access-code"
              type="password"
              autoComplete="one-time-code"
              value={accessCode}
              onChange={(event) => onAccessCodeChange(event.target.value)}
              className="h-10 pl-9 font-mono tracking-[0.18em]"
              placeholder="••••••"
              minLength={4}
              maxLength={32}
              required
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Le code est vérifié de façon sécurisée lors de l’envoi.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function PreferencesStep({
  room,
  zones,
  formConfig,
  seatRanking,
  zoneRanking,
  onSeatToggle,
  onZoneToggle,
}: {
  room: Room;
  zones: string[];
  formConfig: FormConfig;
  seatRanking: string[];
  zoneRanking: string[];
  onSeatToggle: (id: string) => void;
  onZoneToggle: (id: string) => void;
}) {
  const seats = room.seats.filter((seat) => seat.enabled);

  return (
    <div className="space-y-9">
      <section aria-labelledby="seat-heading">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="seat-heading" className="font-medium">
              Vos places préférées
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Cliquez dans l’ordre souhaité. Recliquez pour retirer un choix.
            </p>
          </div>
          <Badge variant="secondary">
            {seatRanking.length} / {formConfig.maxSeatChoices}
          </Badge>
        </div>

        {formConfig.maxSeatChoices > 0 && seats.length > 0 ? (
          <SeatMap
            room={room}
            ranking={seatRanking}
            maxChoices={formConfig.maxSeatChoices}
            onToggle={onSeatToggle}
          />
        ) : (
          <EmptyPreference message="Les choix de place ne sont pas proposés pour cette classe." />
        )}

        {seatRanking.length > 0 ? (
          <RankedSummary
            className="mt-4"
            values={seatRanking}
            labelFor={(id) => seats.find((seat) => seat.id === id)?.label ?? id}
            onRemove={onSeatToggle}
          />
        ) : null}
      </section>

      {formConfig.collectZones ? (
        <section aria-labelledby="zone-heading">
          <Separator className="mb-7" />
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 id="zone-heading" className="font-medium">
                Vos zones préférées
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Le premier choix sera considéré comme le plus important.
              </p>
            </div>
            <Badge variant="secondary">{zoneRanking.length} choix</Badge>
          </div>
          {zones.length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {zones.map((zone) => {
                const index = zoneRanking.indexOf(zone);
                const selected = index >= 0;
                return (
                  <button
                    key={zone}
                    type="button"
                    className={cn(
                      "flex min-h-12 items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                      selected
                        ? "border-foreground bg-foreground text-background"
                        : "bg-background hover:bg-muted",
                    )}
                    onClick={() => onZoneToggle(zone)}
                    aria-pressed={selected}
                    disabled={!selected && zoneRanking.length >= Math.min(10, zones.length)}
                  >
                    <span
                      className={cn(
                        "grid size-6 shrink-0 place-items-center rounded-md border text-xs font-semibold",
                        selected ? "border-background/25" : "text-muted-foreground",
                      )}
                    >
                      {selected ? index + 1 : <MousePointerClick className="size-3" />}
                    </span>
                    {zoneLabel(zone)}
                  </button>
                );
              })}
            </div>
          ) : (
            <EmptyPreference message="Aucune zone n’a été définie pour cette salle." />
          )}
        </section>
      ) : null}
    </div>
  );
}

function SeatMap({
  room,
  ranking,
  maxChoices,
  onToggle,
}: {
  room: Room;
  ranking: string[];
  maxChoices: number;
  onToggle: (id: string) => void;
}) {
  const ratio = Math.max(0.55, Math.min(0.82, room.height / room.width));

  return (
    <div className="overflow-x-auto rounded-xl border bg-muted/20 p-3 sm:p-5">
      <div
        className="relative mx-auto min-w-[520px] overflow-hidden rounded-lg border bg-background shadow-inner"
        style={{ aspectRatio: `1 / ${ratio}` }}
        aria-label="Plan interactif de la salle"
      >
        <div
          className="absolute top-3 h-2 rounded-full bg-foreground/70"
          style={{
            left: `${Math.max(4, (room.board.x / room.width) * 100)}%`,
            width: `${Math.min(88, (room.board.width / room.width) * 100)}%`,
            transform: "translateX(-50%)",
          }}
          title={room.board.label}
        />

        {room.furniture.map((item) => (
          <div
            key={item.id}
            aria-hidden="true"
            className={cn(
              "absolute border bg-muted/50",
              item.shape === "ellipse" ? "rounded-full" : "rounded-md",
            )}
            style={{
              left: `${(item.x / room.width) * 100}%`,
              top: `${(item.y / room.height) * 100}%`,
              width: `${Math.max(2, (item.width / room.width) * 100)}%`,
              height: `${Math.max(2, (item.height / room.height) * 100)}%`,
              transform: `translate(-50%, -50%) rotate(${item.rotation}deg)`,
            }}
          />
        ))}

        {room.seats
          .filter((seat) => seat.enabled)
          .map((seat) => {
            const index = ranking.indexOf(seat.id);
            const selected = index >= 0;
            const full = !selected && ranking.length >= maxChoices;
            return (
              <button
                key={seat.id}
                type="button"
                className={cn(
                  "absolute z-10 flex h-8 min-w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-md border px-1.5 text-[11px] font-medium shadow-xs transition-all focus-visible:z-20 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  selected
                    ? "border-foreground bg-foreground text-background ring-2 ring-background"
                    : "bg-background hover:border-foreground hover:bg-muted",
                  full && "cursor-not-allowed opacity-45",
                )}
                style={{
                  left: `${Math.min(97, Math.max(3, (seat.x / room.width) * 100))}%`,
                  top: `${Math.min(96, Math.max(8, (seat.y / room.height) * 100))}%`,
                }}
                onClick={() => onToggle(seat.id)}
                disabled={full}
                aria-pressed={selected}
                aria-label={`${seat.label}${selected ? `, choix numéro ${index + 1}` : ""}`}
                title={seat.label}
              >
                {selected ? index + 1 : seat.label}
              </button>
            );
          })}
      </div>
      <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
        <MousePointerClick className="size-3.5" aria-hidden="true" />
        Le numéro indique votre ordre de préférence.
      </p>
    </div>
  );
}

function RankedSummary({
  values,
  labelFor,
  onRemove,
  className,
}: {
  values: string[];
  labelFor: (id: string) => string;
  onRemove: (id: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)} aria-label="Choix classés">
      {values.map((value, index) => (
        <span
          key={value}
          className="inline-flex items-center gap-2 rounded-full border bg-background py-1 pl-2 pr-1 text-xs"
        >
          <span className="grid size-5 place-items-center rounded-full bg-foreground font-semibold text-background">
            {index + 1}
          </span>
          {labelFor(value)}
          <button
            type="button"
            className="grid size-6 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => onRemove(value)}
            aria-label={`Retirer ${labelFor(value)}`}
          >
            <X className="size-3" aria-hidden="true" />
          </button>
        </span>
      ))}
    </div>
  );
}

function NeighborsStep({
  participants,
  desired,
  avoided,
  maxDesired,
  maxAvoided,
  onToggle,
  onRelationChange,
}: {
  participants: PublicParticipant[];
  desired: RankedNeighbor[];
  avoided: RankedNeighbor[];
  maxDesired: number;
  maxAvoided: number;
  onToggle: (kind: "desired_neighbors" | "avoided_neighbors", id: string) => void;
  onRelationChange: (
    kind: "desired_neighbors" | "avoided_neighbors",
    id: string,
    relation: RankedNeighbor["relation"],
  ) => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = participants.filter((participant) =>
    participant.name.toLocaleLowerCase("fr").includes(search.trim().toLocaleLowerCase("fr")),
  );

  if (maxDesired === 0 && maxAvoided === 0) {
    return <EmptyPreference message="Les souhaits de voisinage ne sont pas proposés pour cette classe." />;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border bg-muted/20 p-4">
          <p className="text-sm font-medium">Voisinages souhaités</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {desired.length} sur {maxDesired} choix
          </p>
        </div>
        <div className="rounded-xl border bg-muted/20 p-4">
          <p className="text-sm font-medium">Voisinages à éviter</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {avoided.length} sur {maxAvoided} choix
          </p>
        </div>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" aria-hidden="true" />
        <Input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="h-10 pl-9"
          placeholder="Rechercher un élève…"
          aria-label="Rechercher un élève"
        />
      </div>

      <div className="max-h-[480px] space-y-2 overflow-y-auto pr-1">
        {filtered.length > 0 ? (
          filtered.map((participant) => {
            const desiredChoice = desired.find(
              (neighbor) => neighbor.participant_id === participant.id,
            );
            const avoidedChoice = avoided.find(
              (neighbor) => neighbor.participant_id === participant.id,
            );
            const selectedChoice = desiredChoice ?? avoidedChoice;
            const selectedKind = desiredChoice ? "desired_neighbors" : "avoided_neighbors";

            return (
              <div
                key={participant.id}
                className={cn(
                  "rounded-xl border bg-background p-3 transition-colors",
                  selectedChoice && "border-foreground/35",
                )}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold uppercase">
                    {participant.name.slice(0, 2)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {participant.name}
                  </span>
                  <div className="flex gap-1.5">
                    {maxDesired > 0 ? (
                      <Button
                        type="button"
                        size="sm"
                        variant={desiredChoice ? "default" : "outline"}
                        onClick={() => onToggle("desired_neighbors", participant.id)}
                        disabled={!desiredChoice && desired.length >= maxDesired}
                        aria-pressed={Boolean(desiredChoice)}
                      >
                        <Check aria-hidden="true" />
                        Souhaité
                      </Button>
                    ) : null}
                    {maxAvoided > 0 ? (
                      <Button
                        type="button"
                        size="sm"
                        variant={avoidedChoice ? "default" : "outline"}
                        onClick={() => onToggle("avoided_neighbors", participant.id)}
                        disabled={!avoidedChoice && avoided.length >= maxAvoided}
                        aria-pressed={Boolean(avoidedChoice)}
                      >
                        <X aria-hidden="true" />
                        À éviter
                      </Button>
                    ) : null}
                  </div>
                </div>

                {selectedChoice ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
                    <Label htmlFor={`relation-${participant.id}`} className="text-xs text-muted-foreground">
                      Relation souhaitée
                    </Label>
                    <select
                      id={`relation-${participant.id}`}
                      value={selectedChoice.relation}
                      onChange={(event) =>
                        onRelationChange(
                          selectedKind,
                          participant.id,
                          event.target.value as RankedNeighbor["relation"],
                        )
                      }
                      className="h-8 rounded-lg border border-input bg-background px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
                    >
                      {relationOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <Badge variant="secondary" className="ml-auto">
                      choix n°
                      {(desiredChoice ? desired : avoided).findIndex(
                        (neighbor) => neighbor.participant_id === participant.id,
                      ) + 1}
                    </Badge>
                  </div>
                ) : null}
              </div>
            );
          })
        ) : (
          <EmptyPreference message="Aucun élève ne correspond à cette recherche." />
        )}
      </div>
    </div>
  );
}

function ReviewStep({
  form,
  formConfig,
  participantName,
  seats,
  zones,
  participants,
  onPriorityChange,
  onNotesChange,
}: {
  form: FormState;
  formConfig: FormConfig;
  participantName: string;
  seats: Array<{ id: string; name: string }>;
  zones: string[];
  participants: PublicParticipant[];
  onPriorityChange: (value: PublicResponseInput["priority_mode"]) => void;
  onNotesChange: (value: string) => void;
}) {
  return (
    <div className="space-y-8">
      {formConfig.collectPriority ? (
        <section aria-labelledby="priority-heading">
          <h2 id="priority-heading" className="font-medium">
            Ce qui compte le plus
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Ce choix aide le moteur à arbitrer lorsque tout ne peut pas être satisfait.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {priorityOptions.map((option) => {
              const selected = form.priority_mode === option.value;
              return (
                <label
                  key={option.value}
                  className={cn(
                    "flex cursor-pointer gap-3 rounded-xl border p-4 transition-colors",
                    selected ? "border-foreground bg-muted/50" : "hover:bg-muted/30",
                  )}
                >
                  <input
                    type="radio"
                    name="priority"
                    value={option.value}
                    checked={selected}
                    onChange={() => onPriorityChange(option.value)}
                    className="mt-0.5 size-4 accent-foreground"
                  />
                  <span>
                    <span className="block text-sm font-medium">{option.title}</span>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                      {option.description}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </section>
      ) : null}

      {formConfig.collectNotes ? (
        <section aria-labelledby="notes-heading">
          {formConfig.collectPriority ? <Separator className="mb-7" /> : null}
          <div className="flex items-center justify-between gap-3">
            <Label id="notes-heading" htmlFor="notes">
              Une précision à ajouter ?
            </Label>
            <span className="text-xs tabular-nums text-muted-foreground">
              {form.notes.length} / 2000
            </span>
          </div>
          <Textarea
            id="notes"
            value={form.notes}
            onChange={(event) => onNotesChange(event.target.value)}
            maxLength={2000}
            className="mt-2 min-h-28 resize-y"
            placeholder="Besoin particulier, information utile à l’enseignant…"
          />
          <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <MessageSquareText className="size-3.5" aria-hidden="true" />
            Cette note sera visible par l’administrateur de la classe.
          </p>
        </section>
      ) : null}

      <section aria-labelledby="summary-heading">
        {(formConfig.collectPriority || formConfig.collectNotes) && <Separator className="mb-7" />}
        <h2 id="summary-heading" className="font-medium">
          Récapitulatif
        </h2>
        <div className="mt-4 divide-y rounded-xl border bg-muted/15">
          <SummaryRow label="Élève" value={participantName || "Non sélectionné"} />
          <SummaryRow
            label="Places"
            value={formatRanking(form.seat_ranking, (id) => seats.find((seat) => seat.id === id)?.name ?? id)}
          />
          {formConfig.collectZones ? (
            <SummaryRow
              label="Zones"
              value={formatRanking(form.zone_ranking, (id) => zones.find((zone) => zone === id) ?? id)}
            />
          ) : null}
          <SummaryRow
            label="Voisinages souhaités"
            value={formatNeighbors(form.desired_neighbors, participants)}
          />
          <SummaryRow
            label="Voisinages à éviter"
            value={formatNeighbors(form.avoided_neighbors, participants)}
          />
        </div>
      </section>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 px-4 py-3 text-sm sm:grid-cols-[180px_1fr]">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium sm:text-right">{value}</dd>
    </div>
  );
}

function formatRanking(values: string[], labelFor: (value: string) => string) {
  if (values.length === 0) return "Aucun choix";
  return values.map((value, index) => `${index + 1}. ${labelFor(value)}`).join(" · ");
}

function formatNeighbors(values: RankedNeighbor[], participants: PublicParticipant[]) {
  if (values.length === 0) return "Aucun choix";
  return values
    .map((value, index) => {
      const name = participants.find((person) => person.id === value.participant_id)?.name;
      return `${index + 1}. ${name ?? value.participant_id}`;
    })
    .join(" · ");
}

function EmptyPreference({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed bg-muted/20 p-7 text-center">
      <Info className="mx-auto mb-3 size-5 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

function SubmissionSuccess({
  classroomName,
  participantName,
  result,
  allowEdits,
  onEdit,
}: {
  classroomName: string;
  participantName: string;
  result: SubmissionResult;
  allowEdits: boolean;
  onEdit: () => void;
}) {
  return (
    <main className="min-h-0 overflow-y-auto bg-muted/20 px-4 py-10 sm:py-16">
      <Card className="mx-auto max-w-xl shadow-sm">
        <CardHeader className="items-center px-6 pt-5 text-center sm:px-9">
          <div className="mb-3 grid size-14 place-items-center rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="size-7" aria-hidden="true" />
          </div>
          <Badge variant="secondary">Réponse enregistrée · révision {result.revision}</Badge>
          <CardTitle className="mt-3 text-2xl">Merci {participantName}</CardTitle>
          <CardDescription className="max-w-md text-pretty leading-6">
            {result.confirmationMessage ||
              `Vos préférences pour ${classroomName} ont bien été transmises.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-6 pb-2 sm:px-9">
          {result.solve ? (
            <div className="grid gap-3 rounded-xl border bg-muted/20 p-4 sm:grid-cols-3">
              <div>
                <p className="text-xs text-muted-foreground">Calcul</p>
                <p className="mt-1 font-medium capitalize">{translateSolveStatus(result.solve.status)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Score minimal</p>
                <p className="mt-1 font-medium tabular-nums">
                  {result.solve.min_satisfaction ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Score moyen</p>
                <p className="mt-1 font-medium tabular-nums">
                  {result.solve.average_satisfaction === null
                    ? "—"
                    : result.solve.average_satisfaction.toFixed(1)}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">
              <Info className="mt-0.5 size-4 shrink-0 text-foreground" aria-hidden="true" />
              Le calcul sera lancé par l’enseignant lorsque toutes les réponses seront prêtes.
            </div>
          )}

          <div className="mt-5 flex items-start gap-3 text-sm text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-foreground" aria-hidden="true" />
            <p>
              Le résultat final dépend de l’ensemble des réponses et des contraintes fixées par
              l’enseignant. Un souhait n’est donc jamais une garantie de placement.
            </p>
          </div>
        </CardContent>
        <CardFooter className="flex-col justify-center gap-2 px-6 py-4 sm:flex-row sm:px-9">
          {allowEdits ? (
            <Button type="button" variant="outline" onClick={onEdit}>
              Modifier ma réponse
            </Button>
          ) : null}
          <Button type="button" render={<Link href="/" />}>
            Terminer
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}

function translateSolveStatus(status: string) {
  return (
    {
      optimal: "Optimal",
      feasible: "Solution trouvée",
      infeasible: "À revoir",
      unknown: "En attente",
      error: "Erreur",
    }[status] ?? status
  );
}

function PublicFormSkeleton() {
  return (
    <main className="min-h-0 overflow-y-auto bg-muted/20">
      <div className="border-b bg-background px-4 py-4">
        <div className="mx-auto flex max-w-6xl justify-between">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-6 w-40" />
        </div>
      </div>
      <div className="mx-auto grid max-w-6xl gap-7 px-4 py-10 lg:grid-cols-[220px_1fr]">
        <div className="space-y-3">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-8 w-44" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
        <Card>
          <CardHeader className="border-b">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-8 w-3/5" />
            <Skeleton className="h-4 w-4/5" />
          </CardHeader>
          <CardContent className="space-y-5 py-8">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function PublicFormError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <main className="grid min-h-0 place-items-center overflow-y-auto bg-muted/20 px-4 py-10">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <div className="mb-3 grid size-10 place-items-center rounded-xl bg-destructive/10 text-destructive">
            <CircleAlert className="size-5" aria-hidden="true" />
          </div>
          <CardTitle>Formulaire indisponible</CardTitle>
          <CardDescription className="leading-6">
            Ce lien est peut-être incorrect, le formulaire n’est plus publié ou le serveur ne
            répond pas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertTitle>Impossible de charger la classe</AlertTitle>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        </CardContent>
        <CardFooter className="justify-between gap-3">
          <Button variant="outline" render={<Link href="/" />}>
            Retour à l’accueil
          </Button>
          <Button type="button" onClick={onRetry}>
            <RefreshCw aria-hidden="true" />
            Réessayer
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}
