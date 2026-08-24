"use client";

import { newId } from "@plan2classe-app/api/domain/defaults";
import type { Furniture, Room, Seat, SeatRelation } from "@plan2classe-app/api/schemas/classroom";
import { Badge } from "@plan2classe-app/ui/components/badge";
import { Button } from "@plan2classe-app/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@plan2classe-app/ui/components/card";
import { Checkbox } from "@plan2classe-app/ui/components/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@plan2classe-app/ui/components/dropdown-menu";
import { Input } from "@plan2classe-app/ui/components/input";
import { Label } from "@plan2classe-app/ui/components/label";
import { Separator } from "@plan2classe-app/ui/components/separator";
import { Switch } from "@plan2classe-app/ui/components/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@plan2classe-app/ui/components/tooltip";
import { cn } from "@plan2classe-app/ui/lib/utils";
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignHorizontalSpaceAround,
  AlignStartHorizontal,
  AlignVerticalSpaceAround,
  Armchair,
  Circle,
  Grid2X2,
  Keyboard,
  Link2,
  MonitorPlay,
  MoreHorizontal,
  MousePointerClick,
  PanelTop,
  Plus,
  RectangleHorizontal,
  RotateCw,
  Ruler,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { OptionSelect, type SelectOption } from "@/components/common/option-select";
import { TagInput } from "@/components/common/tag-input";

import { RoomCanvas, type RoomMove, type RoomSelection } from "./room-canvas";

const relationLabels = {
  adjacent: "Voisins directs",
  near: "Proches",
  same_table: "Même table",
  same_cluster: "Même îlot",
  hand_conflict: "Collision de main",
} as const;

/**
 * Only the shapes the inspector can actually edit. `polygon` and `free` need a
 * point editor that does not exist, so offering them would create furniture
 * nobody can change afterwards; existing data still renders.
 */
const shapeOptions: ReadonlyArray<SelectOption<Furniture["shape"]>> = [
  { value: "rectangle", label: "Rectangle" },
  { value: "ellipse", label: "Ellipse" },
  { value: "line", label: "Ligne" },
  { value: "composite", label: "Table en U" },
];

const sideOptions: ReadonlyArray<SelectOption<"none" | "left" | "right">> = [
  { value: "none", label: "Non défini" },
  { value: "left", label: "Gauche" },
  { value: "right", label: "Droite" },
];

const SEAT_TAG_SUGGESTIONS = [
  "zone:avant",
  "zone:fond",
  "zone:fenetre",
  "zone:mur",
  "accessible",
  "front",
  "middle",
  "back",
];

function makeSeat(label: string, x: number, y: number, furnitureId: string | null): Seat {
  return {
    id: newId("seat"),
    label,
    x,
    y,
    rotation: 0,
    furniture_id: furnitureId,
    cluster_id: null,
    tags: [],
    side: null,
    enabled: true,
    metadata: {},
  };
}

function preset(
  room: Room,
  kind: "double" | "island" | "round" | "u" | "free",
): { furniture?: Furniture; seats: Seat[]; relations: SeatRelation[] } {
  if (kind === "free") {
    return {
      seats: [makeSeat(`P${room.seats.length + 1}`, room.width / 2, room.height / 2, null)],
      relations: [],
    };
  }
  const id = newId("furniture");
  const count = kind === "double" ? 2 : kind === "island" ? 4 : kind === "round" ? 6 : 8;
  const width = kind === "u" ? 300 : kind === "round" ? 190 : kind === "island" ? 220 : 170;
  const height = kind === "u" ? 190 : kind === "round" ? 150 : kind === "island" ? 130 : 70;
  const x = Math.round(room.width / 2 - width / 2);
  const y = Math.round(room.height / 2 - height / 2);
  const furniture: Furniture = {
    id,
    label:
      kind === "double"
        ? "Table double"
        : kind === "island"
          ? "Îlot 4 places"
          : kind === "round"
            ? "Table ronde"
            : "Table en U",
    shape: kind === "round" ? "ellipse" : kind === "u" ? "composite" : "rectangle",
    x,
    y,
    width,
    height,
    rotation: 0,
    points: [],
    parts:
      kind === "u"
        ? [
            { x: 0, y: 0, width: 40, height },
            { x: width - 40, y: 0, width: 40, height },
            { x: 0, y: height - 40, width, height: 40 },
          ]
        : [],
    tags: [],
    cluster_id: null,
  };
  const seats: Seat[] = [];
  if (kind === "double") {
    seats.push(makeSeat(`P${room.seats.length + 1}`, x + 45, y + height + 22, id));
    seats.push(makeSeat(`P${room.seats.length + 2}`, x + width - 45, y + height + 22, id));
  } else if (kind === "island") {
    const positions = [
      [x + 45, y - 18],
      [x + width - 45, y - 18],
      [x + 45, y + height + 18],
      [x + width - 45, y + height + 18],
    ];
    positions.forEach(([seatX, seatY], index) =>
      seats.push(makeSeat(`P${room.seats.length + index + 1}`, seatX, seatY, id)),
    );
  } else if (kind === "round") {
    for (let index = 0; index < count; index += 1) {
      const angle = (Math.PI * 2 * index) / count - Math.PI / 2;
      seats.push(
        makeSeat(
          `P${room.seats.length + index + 1}`,
          x + width / 2 + Math.cos(angle) * (width * 0.58),
          y + height / 2 + Math.sin(angle) * (height * 0.68),
          id,
        ),
      );
    }
  } else {
    const positions = [
      [x - 18, y + 35],
      [x - 18, y + 95],
      [x - 18, y + 155],
      [x + 55, y + height + 18],
      [x + width - 55, y + height + 18],
      [x + width + 18, y + 155],
      [x + width + 18, y + 95],
      [x + width + 18, y + 35],
    ];
    positions.forEach(([seatX, seatY], index) =>
      seats.push(makeSeat(`P${room.seats.length + index + 1}`, seatX, seatY, id)),
    );
  }
  const relations: SeatRelation[] = [];
  for (let index = 0; index < seats.length - 1; index += 1) {
    relations.push({
      a: seats[index]!.id,
      b: seats[index + 1]!.id,
      kinds: ["adjacent", "near", "same_table"],
      bidirectional: true,
    });
  }
  return { furniture, seats, relations };
}

function InspectorSection({
  title,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  icon: typeof Ruler;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="inline-flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          <Icon className="size-3.5" aria-hidden="true" />
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function AlignButton({
  label,
  icon: Icon,
  onClick,
}: {
  label: string;
  icon: typeof AlignStartHorizontal;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={<Button size="icon-sm" variant="outline" onClick={onClick} aria-label={label} />}
      >
        <Icon />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function RoomBuilder({ room, onChange }: { room: Room; onChange: (room: Room) => void }) {
  const [selection, setSelection] = useState<RoomSelection[]>([]);
  const [relationA, setRelationA] = useState("");
  const [relationB, setRelationB] = useState("");
  const [relationKinds, setRelationKinds] = useState<Array<keyof typeof relationLabels>>([
    "adjacent",
  ]);
  const [clearOpen, setClearOpen] = useState(false);

  const single = selection.length === 1 ? selection[0] : undefined;
  const selectedSeat =
    single?.type === "seat" ? room.seats.find((seat) => seat.id === single.id) : undefined;
  const selectedFurniture =
    single?.type === "furniture"
      ? room.furniture.find((item) => item.id === single.id)
      : undefined;

  const seatOptions = useMemo<ReadonlyArray<SelectOption>>(
    () =>
      room.seats
        .filter((seat) => seat.enabled)
        .map((seat) => ({ value: seat.id, label: seat.label })),
    [room.seats],
  );
  const seatLabelById = useMemo(
    () => new Map(room.seats.map((seat) => [seat.id, seat.label])),
    [room.seats],
  );
  const enabledSeatCount = room.seats.filter((seat) => seat.enabled).length;

  const metadataText = (key: string) =>
    typeof room.metadata?.[key] === "string" ? (room.metadata[key] as string) : "";
  const roomNumber = metadataText("roomNumber");
  const schoolYear = metadataText("schoolYear");
  const defaultSchoolYear = useMemo(() => {
    const now = new Date();
    const start = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
    return `${start}–${start + 1}`;
  }, []);
  const setMetadata = (key: string, value: string) =>
    onChange({ ...room, metadata: { ...room.metadata, [key]: value } });

  const addPreset = (kind: Parameters<typeof preset>[1]) => {
    const next = preset(room, kind);
    onChange({
      ...room,
      furniture: next.furniture ? [...room.furniture, next.furniture] : room.furniture,
      seats: [...room.seats, ...next.seats],
      relations: [...room.relations, ...next.relations],
    });
    setSelection(
      next.furniture
        ? [{ type: "furniture", id: next.furniture.id }]
        : [{ type: "seat", id: next.seats[0]!.id }],
    );
  };

  /** Applies a batch of absolute positions; furniture carries its seats along. */
  const applyMoves = (moves: RoomMove[]) => {
    let board = room.board;
    const furnitureById = new Map(room.furniture.map((item) => [item.id, item]));
    const nextFurniture = new Map<string, { x: number; y: number }>();
    const nextSeats = new Map<string, { x: number; y: number }>();
    const movedSeatIds = new Set(
      moves.filter((move) => move.type === "seat").map((move) => move.id),
    );

    for (const move of moves) {
      if (move.type === "board") {
        board = { ...board, x: move.x, y: move.y };
        continue;
      }
      if (move.type === "seat") {
        nextSeats.set(move.id, { x: move.x, y: move.y });
        continue;
      }
      const item = furnitureById.get(move.id);
      if (!item) continue;
      nextFurniture.set(move.id, { x: move.x, y: move.y });
      const dx = move.x - item.x;
      const dy = move.y - item.y;
      for (const seat of room.seats) {
        // A seat dragged in its own right keeps its explicit position.
        if (seat.furniture_id !== move.id || movedSeatIds.has(seat.id)) continue;
        nextSeats.set(seat.id, { x: seat.x + dx, y: seat.y + dy });
      }
    }

    onChange({
      ...room,
      board,
      furniture: room.furniture.map((item) => {
        const next = nextFurniture.get(item.id);
        return next ? { ...item, ...next } : item;
      }),
      seats: room.seats.map((seat) => {
        const next = nextSeats.get(seat.id);
        return next ? { ...seat, ...next } : seat;
      }),
    });
  };

  const updateSeat = (patch: Partial<Seat>) => {
    if (!selectedSeat) return;
    onChange({
      ...room,
      seats: room.seats.map((seat) => (seat.id === selectedSeat.id ? { ...seat, ...patch } : seat)),
    });
  };
  const updateFurniture = (patch: Partial<Furniture>) => {
    if (!selectedFurniture) return;
    onChange({
      ...room,
      furniture: room.furniture.map((item) =>
        item.id === selectedFurniture.id ? { ...item, ...patch } : item,
      ),
    });
  };

  const removeTargets = (targets: RoomSelection[]) => {
    const furnitureIds = new Set(
      targets.filter((item) => item.type === "furniture").map((item) => item.id),
    );
    const seatIds = new Set(targets.filter((item) => item.type === "seat").map((item) => item.id));
    for (const seat of room.seats) {
      if (seat.furniture_id && furnitureIds.has(seat.furniture_id)) seatIds.add(seat.id);
    }
    if (furnitureIds.size === 0 && seatIds.size === 0) return;
    onChange({
      ...room,
      furniture: room.furniture.filter((item) => !furnitureIds.has(item.id)),
      seats: room.seats.filter((seat) => !seatIds.has(seat.id)),
      relations: room.relations.filter(
        (relation) => !seatIds.has(relation.a) && !seatIds.has(relation.b),
      ),
    });
    setSelection([]);
  };

  /** Aligns or spreads every selected element along one axis. */
  const alignSelection = (
    mode: "left" | "center-x" | "right" | "top" | "center-y" | "bottom" | "spread-x" | "spread-y",
  ) => {
    const boxes = selection.flatMap((item) => {
      if (item.type === "seat") {
        const seat = room.seats.find((candidate) => candidate.id === item.id);
        return seat ? [{ target: item, x: seat.x, y: seat.y, width: 0, height: 0 }] : [];
      }
      if (item.type === "furniture") {
        const furniture = room.furniture.find((candidate) => candidate.id === item.id);
        return furniture
          ? [
              {
                target: item,
                x: furniture.x,
                y: furniture.y,
                width: furniture.width,
                height: furniture.height,
              },
            ]
          : [];
      }
      return [];
    });
    if (boxes.length < 2) return;

    const lefts = boxes.map((box) => box.x);
    const rights = boxes.map((box) => box.x + box.width);
    const tops = boxes.map((box) => box.y);
    const bottoms = boxes.map((box) => box.y + box.height);
    const moves: RoomMove[] = [];

    if (mode === "spread-x" || mode === "spread-y") {
      const horizontal = mode === "spread-x";
      const sorted = [...boxes].sort((a, b) => (horizontal ? a.x - b.x : a.y - b.y));
      const first = sorted[0]!;
      const last = sorted[sorted.length - 1]!;
      const span = horizontal ? last.x - first.x : last.y - first.y;
      const step = span / (sorted.length - 1);
      sorted.forEach((box, index) => {
        const value = Math.round((horizontal ? first.x : first.y) + step * index);
        moves.push({
          ...box.target,
          x: horizontal ? value : box.x,
          y: horizontal ? box.y : value,
        });
      });
    } else {
      const minLeft = Math.min(...lefts);
      const maxRight = Math.max(...rights);
      const minTop = Math.min(...tops);
      const maxBottom = Math.max(...bottoms);
      const centerX = (minLeft + maxRight) / 2;
      const centerY = (minTop + maxBottom) / 2;
      for (const box of boxes) {
        let { x, y } = box;
        if (mode === "left") x = minLeft;
        if (mode === "right") x = maxRight - box.width;
        if (mode === "center-x") x = Math.round(centerX - box.width / 2);
        if (mode === "top") y = minTop;
        if (mode === "bottom") y = maxBottom - box.height;
        if (mode === "center-y") y = Math.round(centerY - box.height / 2);
        moves.push({ ...box.target, x: Math.round(x), y: Math.round(y) });
      }
    }
    applyMoves(moves);
  };

  const addSeatToFurniture = () => {
    if (!selectedFurniture) return;
    const seat = makeSeat(
      `P${room.seats.length + 1}`,
      selectedFurniture.x + selectedFurniture.width / 2,
      selectedFurniture.y + selectedFurniture.height + 22,
      selectedFurniture.id,
    );
    onChange({ ...room, seats: [...room.seats, seat] });
    setSelection([{ type: "seat", id: seat.id }]);
  };

  const addRelation = () => {
    if (!relationA || !relationB || relationA === relationB || relationKinds.length === 0) return;
    const existing = room.relations.find(
      (relation) =>
        (relation.a === relationA && relation.b === relationB) ||
        (relation.bidirectional && relation.a === relationB && relation.b === relationA),
    );
    const relations = existing
      ? room.relations.map((relation) =>
          relation === existing
            ? { ...relation, kinds: [...new Set([...relation.kinds, ...relationKinds])] }
            : relation,
        )
      : [
          ...room.relations,
          { a: relationA, b: relationB, kinds: relationKinds, bidirectional: true },
        ];
    onChange({ ...room, relations });
    toast.success(existing ? "Relation complétée" : "Relation enregistrée");
  };

  const renumberSeats = () => {
    // Reading order: top rows first, then left to right inside a row.
    const ordered = [...room.seats].sort(
      (left, right) => Math.round(left.y / 40) - Math.round(right.y / 40) || left.x - right.x,
    );
    const labels = new Map(
      ordered.map((seat, index) => {
        const row = String.fromCharCode(65 + Math.floor(index / 8));
        return [seat.id, `${row}${(index % 8) + 1}`];
      }),
    );
    onChange({
      ...room,
      seats: room.seats.map((seat) => ({ ...seat, label: labels.get(seat.id) ?? seat.label })),
    });
    toast.success("Places renumérotées");
  };

  const inspectorTitle = selectedSeat
    ? `Place ${selectedSeat.label}`
    : selectedFurniture
      ? selectedFurniture.label
      : single?.type === "board"
        ? "Tableau"
        : selection.length > 1
          ? `${selection.length} éléments`
          : "Inspecteur";

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2">
          <span className="pl-2 text-xs font-medium text-muted-foreground">Ajouter</span>
          <Button size="sm" variant="outline" onClick={() => addPreset("double")}>
            <RectangleHorizontal /> Table double
          </Button>
          <Button size="sm" variant="outline" onClick={() => addPreset("island")}>
            <Grid2X2 /> Îlot 4
          </Button>
          <Button size="sm" variant="outline" onClick={() => addPreset("round")}>
            <Circle /> Ronde 6
          </Button>
          <Button size="sm" variant="outline" onClick={() => addPreset("u")}>
            <PanelTop /> U 8
          </Button>
          <Button size="sm" variant="outline" onClick={() => addPreset("free")}>
            <Armchair /> Siège libre
          </Button>

          <div className="ml-auto flex items-center gap-2">
            <Badge variant="secondary" className="tabular-nums">
              {enabledSeatCount} place{enabledSeatCount > 1 ? "s" : ""}
            </Badge>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button size="icon-sm" variant="ghost" aria-label="Autres actions" />}
              >
                <MoreHorizontal />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-card">
                <DropdownMenuItem onClick={renumberSeats} disabled={room.seats.length === 0}>
                  <Ruler /> Renuméroter les places
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    setSelection([
                      ...room.furniture.map(
                        (item) => ({ type: "furniture", id: item.id }) as RoomSelection,
                      ),
                      ...room.seats.map((seat) => ({ type: "seat", id: seat.id }) as RoomSelection),
                    ])
                  }
                  disabled={room.seats.length === 0 && room.furniture.length === 0}
                >
                  <Grid2X2 /> Tout sélectionner
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSelection([{ type: "board", id: "board" }])}>
                  <MonitorPlay /> Sélectionner le tableau
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  disabled={room.seats.length === 0 && room.furniture.length === 0}
                  onClick={() => setClearOpen(true)}
                >
                  <Trash2 /> Vider la salle
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <RoomCanvas
          room={room}
          editable
          selection={selection}
          onSelectionChange={setSelection}
          onMove={applyMoves}
          onDelete={removeTargets}
          className="min-h-[420px] lg:min-h-[520px]"
        />

        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <MousePointerClick className="size-3.5" aria-hidden="true" />
            Glissez pour déplacer, tracez un rectangle pour sélectionner plusieurs éléments
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Keyboard className="size-3.5" aria-hidden="true" />
            Maj+clic pour ajouter à la sélection, flèches pour ajuster, Suppr pour retirer
          </span>
          <span>Alt enfoncé : placement libre, sans grille ni alignement</span>
        </div>
      </div>

      <Card className="h-fit gap-0 py-0 shadow-none xl:sticky xl:top-4">
        <CardHeader className="flex-row items-center justify-between gap-2 border-b px-4 py-3">
          <CardTitle className="text-sm">{inspectorTitle}</CardTitle>
          {selection.length > 0 ? (
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => setSelection([])}
              aria-label="Désélectionner"
            >
              <X />
            </Button>
          ) : null}
        </CardHeader>

        <CardContent className="scrollbar-thin grid max-h-[calc(100svh-12rem)] gap-6 overflow-y-auto px-4 py-4">
          {selection.length === 0 && (
            <InspectorSection title="Dimensions de la salle" icon={Ruler}>
              <div className="grid grid-cols-2 gap-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="room-width" className="text-xs">
                    Largeur
                  </Label>
                  <Input
                    id="room-width"
                    type="number"
                    min="400"
                    max="4000"
                    step="20"
                    value={room.width}
                    onChange={(event) =>
                      onChange({
                        ...room,
                        width: Math.min(4000, Math.max(400, Number(event.target.value) || 400)),
                      })
                    }
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="room-height" className="text-xs">
                    Profondeur
                  </Label>
                  <Input
                    id="room-height"
                    type="number"
                    min="300"
                    max="3000"
                    step="20"
                    value={room.height}
                    onChange={(event) =>
                      onChange({
                        ...room,
                        height: Math.min(3000, Math.max(300, Number(event.target.value) || 300)),
                      })
                    }
                  />
                </div>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                Sélectionnez un élément du plan pour le modifier, ou plusieurs pour les aligner.
              </p>
            </InspectorSection>
          )}

          {selection.length === 0 && (
            <InspectorSection title="Identité de la salle" icon={MonitorPlay}>
              <div className="grid grid-cols-2 gap-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="room-number" className="text-xs">
                    Numéro de salle
                  </Label>
                  <Input
                    id="room-number"
                    value={roomNumber}
                    placeholder="204"
                    onChange={(event) => setMetadata("roomNumber", event.target.value)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="school-year" className="text-xs">
                    Année scolaire
                  </Label>
                  <Input
                    id="school-year"
                    value={schoolYear}
                    placeholder={defaultSchoolYear}
                    onChange={(event) => setMetadata("schoolYear", event.target.value)}
                  />
                </div>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                Repris tels quels en en-tête du plan exporté en PDF.
              </p>
            </InspectorSection>
          )}

          {selection.length > 1 && (
            <InspectorSection title={`${selection.length} éléments sélectionnés`} icon={Grid2X2}>
              <div className="grid gap-2">
                <p className="text-xs text-muted-foreground">Aligner</p>
                <div className="flex flex-wrap gap-1.5">
                  <AlignButton
                    label="Aligner à gauche"
                    icon={AlignStartHorizontal}
                    onClick={() => alignSelection("left")}
                  />
                  <AlignButton
                    label="Centrer horizontalement"
                    icon={AlignCenterVertical}
                    onClick={() => alignSelection("center-x")}
                  />
                  <AlignButton
                    label="Aligner à droite"
                    icon={AlignEndHorizontal}
                    onClick={() => alignSelection("right")}
                  />
                  <AlignButton
                    label="Aligner en haut"
                    icon={AlignStartHorizontal}
                    onClick={() => alignSelection("top")}
                  />
                  <AlignButton
                    label="Centrer verticalement"
                    icon={AlignCenterHorizontal}
                    onClick={() => alignSelection("center-y")}
                  />
                  <AlignButton
                    label="Aligner en bas"
                    icon={AlignEndHorizontal}
                    onClick={() => alignSelection("bottom")}
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Répartir</p>
                <div className="flex flex-wrap gap-1.5">
                  <AlignButton
                    label="Espacer horizontalement"
                    icon={AlignHorizontalSpaceAround}
                    onClick={() => alignSelection("spread-x")}
                  />
                  <AlignButton
                    label="Espacer verticalement"
                    icon={AlignVerticalSpaceAround}
                    onClick={() => alignSelection("spread-y")}
                  />
                </div>
              </div>
              <Button variant="destructive" size="sm" onClick={() => removeTargets(selection)}>
                <Trash2 /> Supprimer la sélection
              </Button>
            </InspectorSection>
          )}

          {single?.type === "board" && (
            <InspectorSection title="Tableau" icon={MonitorPlay}>
              <div className="grid gap-1.5">
                <Label className="text-xs">Libellé</Label>
                <Input
                  value={room.board.label}
                  onChange={(event) =>
                    onChange({ ...room, board: { ...room.board, label: event.target.value } })
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="grid gap-1.5">
                  <Label className="text-xs">X</Label>
                  <Input
                    type="number"
                    value={room.board.x}
                    onChange={(event) =>
                      onChange({ ...room, board: { ...room.board, x: Number(event.target.value) } })
                    }
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">Y</Label>
                  <Input
                    type="number"
                    value={room.board.y}
                    onChange={(event) =>
                      onChange({ ...room, board: { ...room.board, y: Number(event.target.value) } })
                    }
                  />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Largeur</Label>
                <Input
                  type="number"
                  value={room.board.width}
                  onChange={(event) =>
                    onChange({
                      ...room,
                      board: { ...room.board, width: Math.max(20, Number(event.target.value)) },
                    })
                  }
                />
              </div>
            </InspectorSection>
          )}

          {selectedFurniture && (
            <InspectorSection title="Mobilier" icon={RectangleHorizontal}>
              <div className="grid gap-1.5">
                <Label className="text-xs">Nom</Label>
                <Input
                  value={selectedFurniture.label}
                  onChange={(event) => updateFurniture({ label: event.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Forme</Label>
                <OptionSelect
                  value={selectedFurniture.shape}
                  onValueChange={(value) => updateFurniture({ shape: value })}
                  options={shapeOptions}
                  aria-label="Forme du mobilier"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="grid gap-1.5">
                  <Label className="text-xs">Largeur</Label>
                  <Input
                    type="number"
                    value={selectedFurniture.width}
                    onChange={(event) =>
                      updateFurniture({ width: Math.max(20, Number(event.target.value)) })
                    }
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">Hauteur</Label>
                  <Input
                    type="number"
                    value={selectedFurniture.height}
                    onChange={(event) =>
                      updateFurniture({ height: Math.max(10, Number(event.target.value)) })
                    }
                  />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label className="inline-flex items-center gap-2 text-xs">
                  <RotateCw className="size-3.5" aria-hidden="true" /> Rotation
                </Label>
                <Input
                  type="number"
                  value={selectedFurniture.rotation}
                  onChange={(event) => updateFurniture({ rotation: Number(event.target.value) })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Tags</Label>
                <TagInput
                  value={selectedFurniture.tags}
                  onChange={(tags) => updateFurniture({ tags })}
                  suggestions={SEAT_TAG_SUGGESTIONS}
                  placeholder="Ajouter un tag…"
                  aria-label="Tags du mobilier"
                />
              </div>
              <div className="grid gap-2">
                <Button variant="outline" size="sm" onClick={addSeatToFurniture}>
                  <Plus /> Ajouter un siège
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => removeTargets([{ type: "furniture", id: selectedFurniture.id }])}
                >
                  <Trash2 /> Supprimer table et sièges
                </Button>
              </div>
            </InspectorSection>
          )}

          {selectedSeat && (
            <InspectorSection title="Place" icon={Armchair}>
              <div className="grid gap-1.5">
                <Label className="text-xs">Libellé</Label>
                <Input
                  value={selectedSeat.label}
                  onChange={(event) => updateSeat({ label: event.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="grid gap-1.5">
                  <Label className="text-xs">X</Label>
                  <Input
                    type="number"
                    value={selectedSeat.x}
                    onChange={(event) => updateSeat({ x: Number(event.target.value) })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">Y</Label>
                  <Input
                    type="number"
                    value={selectedSeat.y}
                    onChange={(event) => updateSeat({ y: Number(event.target.value) })}
                  />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Côté de table</Label>
                <OptionSelect
                  value={(selectedSeat.side ?? "none") as "none" | "left" | "right"}
                  onValueChange={(value) => updateSeat({ side: value === "none" ? null : value })}
                  options={sideOptions}
                  aria-label="Côté de la place"
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Tags</Label>
                <TagInput
                  value={selectedSeat.tags}
                  onChange={(tags) => updateSeat({ tags })}
                  suggestions={SEAT_TAG_SUGGESTIONS}
                  placeholder="Ajouter un tag…"
                  aria-label="Tags de la place"
                  hint="Les tags zone:… deviennent les zones proposées aux élèves dans le formulaire."
                />
              </div>
              <label className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs">
                <span>
                  Place utilisable
                  <span className="mt-0.5 block text-muted-foreground">
                    Une place désactivée reste dessinée mais n’est jamais attribuée.
                  </span>
                </span>
                <Switch
                  checked={selectedSeat.enabled}
                  onCheckedChange={(checked) => updateSeat({ enabled: checked })}
                />
              </label>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => removeTargets([{ type: "seat", id: selectedSeat.id }])}
              >
                <Trash2 /> Supprimer la place
              </Button>
            </InspectorSection>
          )}

          <Separator />

          <InspectorSection
            title="Relations entre places"
            icon={Link2}
            action={
              <Badge variant="outline" className="tabular-nums">
                {room.relations.length}
              </Badge>
            }
          >
            <p className="text-xs leading-5 text-muted-foreground">
              Le moteur ne voit pas les formes : il raisonne sur ce graphe de relations.
            </p>
            <div className="grid gap-2">
              <OptionSelect
                value={relationA}
                onValueChange={setRelationA}
                options={seatOptions}
                placeholder="Première place"
                emptyLabel="Ajoutez d’abord des places"
                aria-label="Première place de la relation"
              />
              <OptionSelect
                value={relationB}
                onValueChange={setRelationB}
                options={seatOptions}
                placeholder="Deuxième place"
                emptyLabel="Ajoutez d’abord des places"
                aria-label="Deuxième place de la relation"
              />
              <div className="grid gap-1 py-1">
                {Object.entries(relationLabels).map(([kind, label]) => (
                  <label
                    key={kind}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-xs hover:bg-muted"
                  >
                    <Checkbox
                      checked={relationKinds.includes(kind as keyof typeof relationLabels)}
                      onCheckedChange={(checked) =>
                        setRelationKinds((current) =>
                          checked
                            ? [...new Set([...current, kind as keyof typeof relationLabels])]
                            : current.filter((item) => item !== kind),
                        )
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={addRelation}
                disabled={
                  !relationA || !relationB || relationA === relationB || relationKinds.length === 0
                }
              >
                <Plus /> Enregistrer la relation
              </Button>
            </div>

            {room.relations.length > 0 ? (
              <div className="scrollbar-thin max-h-56 space-y-1.5 overflow-y-auto rounded-lg border p-1.5">
                {room.relations.map((relation, index) => (
                  <div
                    key={`${relation.a}-${relation.b}-${index}`}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {seatLabelById.get(relation.a) ?? relation.a} ↔{" "}
                      {seatLabelById.get(relation.b) ?? relation.b}
                    </span>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Badge variant="secondary" className="shrink-0 cursor-help tabular-nums" />
                        }
                      >
                        {relation.kinds.length}
                      </TooltipTrigger>
                      <TooltipContent>
                        {relation.kinds
                          .map((kind) => relationLabels[kind as keyof typeof relationLabels] ?? kind)
                          .join(", ")}
                      </TooltipContent>
                    </Tooltip>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label="Supprimer la relation"
                      onClick={() =>
                        onChange({
                          ...room,
                          relations: room.relations.filter((_, position) => position !== index),
                        })
                      }
                    >
                      <X />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p
                className={cn(
                  "rounded-lg border border-dashed px-3 py-4 text-center text-xs",
                  "text-muted-foreground",
                )}
              >
                Aucune relation explicite. Les tables ajoutées depuis la barre d’outils en créent
                automatiquement.
              </p>
            )}
          </InspectorSection>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={clearOpen}
        onOpenChange={setClearOpen}
        title="Vider la salle ?"
        description="Toutes les tables, places et relations de cette salle seront supprimées."
        detail={`${room.furniture.length} mobilier(s), ${room.seats.length} place(s) et ${room.relations.length} relation(s) seront retirés. Le tableau et les dimensions sont conservés.`}
        confirmLabel="Vider la salle"
        onConfirm={() => {
          onChange({ ...room, furniture: [], seats: [], relations: [] });
          setSelection([]);
          setClearOpen(false);
          toast.success("Salle vidée");
        }}
      />
    </div>
  );
}
