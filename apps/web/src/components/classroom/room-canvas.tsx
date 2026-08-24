"use client";

import type { Participant, Room } from "@plan2classe-app/api/schemas/classroom";
import { cn } from "@plan2classe-app/ui/lib/utils";
import { Accessibility, Ear, Eye, Hand } from "lucide-react";
import { useMemo, useRef, useState } from "react";

export type RoomSelection = { type: "seat" | "furniture" | "board"; id: string };
export type RoomMove = RoomSelection & { x: number; y: number };

/** Dragging snaps to this grid so hand-built rooms stay visually aligned. */
const SNAP = 5;
const NUDGE = 5;
const NUDGE_LARGE = 25;
/** How close two anchors must be, in room units, to snap and show a guide. */
const GUIDE_TOLERANCE = 7;

type Guide = { axis: "x" | "y"; at: number };
type Marquee = { x1: number; y1: number; x2: number; y2: number };

function snapToGrid(value: number, enabled: boolean) {
  return enabled ? Math.round(value / SNAP) * SNAP : Math.round(value);
}

function sameSelection(a: RoomSelection, b: RoomSelection) {
  return a.type === b.type && a.id === b.id;
}

/**
 * Anchors an element contributes to alignment: its centre plus its two edges on
 * each axis. Seats are drawn centred on their coordinates, furniture from its
 * top-left corner, so the two shapes report different boxes.
 */
function anchorsFor(room: Room, target: RoomSelection, x: number, y: number) {
  if (target.type === "furniture") {
    const item = room.furniture.find((candidate) => candidate.id === target.id);
    const width = item?.width ?? 0;
    const height = item?.height ?? 0;
    return { xs: [x, x + width / 2, x + width], ys: [y, y + height / 2, y + height] };
  }
  if (target.type === "board") {
    return { xs: [x, x + room.board.width / 2, x + room.board.width], ys: [y] };
  }
  return { xs: [x], ys: [y] };
}

export function RoomCanvas({
  room,
  participants = [],
  assignment = {},
  editable = false,
  selection = [],
  onSelectionChange,
  onMove,
  onDelete,
  className,
}: {
  room: Room;
  participants?: Participant[];
  assignment?: Record<string, string>;
  editable?: boolean;
  selection?: RoomSelection[];
  onSelectionChange?: (selection: RoomSelection[]) => void;
  /** Absolute positions for every dragged element, applied in one update. */
  onMove?: (moves: RoomMove[]) => void;
  onDelete?: (targets: RoomSelection[]) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [marquee, setMarquee] = useState<Marquee | null>(null);

  const personBySeat = useMemo(() => {
    const participantsById = new Map(
      participants.map((participant) => [participant.id, participant]),
    );
    return new Map(
      Object.entries(assignment).map(([participantId, seatId]) => [
        seatId,
        participantsById.get(participantId),
      ]),
    );
  }, [assignment, participants]);

  const isSelected = (target: RoomSelection) =>
    selection.some((item) => sameSelection(item, target));

  const positionOf = (target: RoomSelection) => {
    if (target.type === "board") return { x: room.board.x, y: room.board.y };
    if (target.type === "seat") {
      const seat = room.seats.find((item) => item.id === target.id);
      return seat ? { x: seat.x, y: seat.y } : null;
    }
    const item = room.furniture.find((candidate) => candidate.id === target.id);
    return item ? { x: item.x, y: item.y } : null;
  };

  /**
   * Alignment anchors of everything that is not being dragged, used both to
   * snap the drag and to draw the guides the teacher sees.
   */
  const collectStaticAnchors = (dragged: RoomSelection[]) => {
    const isDragged = (target: RoomSelection) =>
      dragged.some((item) => sameSelection(item, target));
    const xs: number[] = [room.width / 2];
    const ys: number[] = [room.height / 2];
    for (const item of room.furniture) {
      if (isDragged({ type: "furniture", id: item.id })) continue;
      xs.push(item.x, item.x + item.width / 2, item.x + item.width);
      ys.push(item.y, item.y + item.height / 2, item.y + item.height);
    }
    for (const seat of room.seats) {
      if (isDragged({ type: "seat", id: seat.id })) continue;
      xs.push(seat.x);
      ys.push(seat.y);
    }
    if (!isDragged({ type: "board", id: "board" })) {
      xs.push(room.board.x, room.board.x + room.board.width / 2, room.board.x + room.board.width);
      ys.push(room.board.y);
    }
    return { xs, ys };
  };

  const startDrag = (event: React.PointerEvent, target: RoomSelection) => {
    event.stopPropagation();

    const additive = event.shiftKey || event.metaKey || event.ctrlKey;
    let nextSelection: RoomSelection[];
    if (additive) {
      nextSelection = isSelected(target)
        ? selection.filter((item) => !sameSelection(item, target))
        : [...selection, target];
    } else {
      nextSelection = isSelected(target) ? selection : [target];
    }
    onSelectionChange?.(nextSelection);

    if (!editable || !onMove || !containerRef.current) return;
    if (nextSelection.length === 0) return;

    try {
      // Throws if the pointer was released between the event and this call;
      // capture is an optimisation, so losing it must not abort the drag.
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    } catch {
      /* keep going without capture */
    }
    const startX = event.clientX;
    const startY = event.clientY;
    const bounds = containerRef.current.getBoundingClientRect();

    // Positions are read once: every move applies the total delta to this
    // snapshot, so a fast drag can never accumulate rounding drift.
    const origins = nextSelection
      .map((item) => ({ target: item, from: positionOf(item) }))
      .filter((entry): entry is { target: RoomSelection; from: { x: number; y: number } } =>
        Boolean(entry.from),
      );
    const primary = origins.find((entry) => sameSelection(entry.target, target)) ?? origins[0];
    if (!primary) return;
    const staticAnchors = collectStaticAnchors(nextSelection);

    const move = (moveEvent: PointerEvent) => {
      const freeform = moveEvent.altKey;
      let dx = ((moveEvent.clientX - startX) / bounds.width) * room.width;
      let dy = ((moveEvent.clientY - startY) / bounds.height) * room.height;

      if (!freeform) {
        dx = snapToGrid(primary.from.x + dx, true) - primary.from.x;
        dy = snapToGrid(primary.from.y + dy, true) - primary.from.y;
      }

      // Alignment: nudge the whole group so the primary element lines up with
      // the nearest anchor on each axis, and remember the line to draw.
      const nextGuides: Guide[] = [];
      if (!freeform) {
        const candidate = anchorsFor(room, primary.target, primary.from.x + dx, primary.from.y + dy);
        let bestX: { delta: number; at: number } | null = null;
        for (const value of candidate.xs) {
          for (const anchor of staticAnchors.xs) {
            const distance = Math.abs(anchor - value);
            if (distance <= GUIDE_TOLERANCE && (!bestX || distance < Math.abs(bestX.delta))) {
              bestX = { delta: anchor - value, at: anchor };
            }
          }
        }
        let bestY: { delta: number; at: number } | null = null;
        for (const value of candidate.ys) {
          for (const anchor of staticAnchors.ys) {
            const distance = Math.abs(anchor - value);
            if (distance <= GUIDE_TOLERANCE && (!bestY || distance < Math.abs(bestY.delta))) {
              bestY = { delta: anchor - value, at: anchor };
            }
          }
        }
        if (bestX) {
          dx += bestX.delta;
          nextGuides.push({ axis: "x", at: bestX.at });
        }
        if (bestY) {
          dy += bestY.delta;
          nextGuides.push({ axis: "y", at: bestY.at });
        }
      }
      setGuides(nextGuides);

      onMove(
        origins.map((entry) => ({
          ...entry.target,
          x: Math.max(0, Math.min(room.width, Math.round(entry.from.x + dx))),
          y: Math.max(0, Math.min(room.height, Math.round(entry.from.y + dy))),
        })),
      );
    };
    const end = () => {
      setGuides([]);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end, { once: true });
  };

  /** Drag on empty canvas draws a rectangle and selects what it covers. */
  const startMarquee = (event: React.PointerEvent) => {
    if (!editable || !containerRef.current) {
      onSelectionChange?.([]);
      return;
    }
    const bounds = containerRef.current.getBoundingClientRect();
    const toRoom = (clientX: number, clientY: number) => ({
      x: ((clientX - bounds.left) / bounds.width) * room.width,
      y: ((clientY - bounds.top) / bounds.height) * room.height,
    });
    const origin = toRoom(event.clientX, event.clientY);
    const additive = event.shiftKey || event.metaKey || event.ctrlKey;
    if (!additive) onSelectionChange?.([]);
    let moved = false;

    const move = (moveEvent: PointerEvent) => {
      const current = toRoom(moveEvent.clientX, moveEvent.clientY);
      moved = true;
      setMarquee({ x1: origin.x, y1: origin.y, x2: current.x, y2: current.y });
    };
    const end = (upEvent: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      setMarquee(null);
      if (!moved) return;
      const current = toRoom(upEvent.clientX, upEvent.clientY);
      const left = Math.min(origin.x, current.x);
      const right = Math.max(origin.x, current.x);
      const top = Math.min(origin.y, current.y);
      const bottom = Math.max(origin.y, current.y);
      const covered: RoomSelection[] = [];
      for (const seat of room.seats) {
        if (seat.x >= left && seat.x <= right && seat.y >= top && seat.y <= bottom) {
          covered.push({ type: "seat", id: seat.id });
        }
      }
      for (const item of room.furniture) {
        const centerX = item.x + item.width / 2;
        const centerY = item.y + item.height / 2;
        if (centerX >= left && centerX <= right && centerY >= top && centerY <= bottom) {
          covered.push({ type: "furniture", id: item.id });
        }
      }
      onSelectionChange?.(
        additive
          ? [...selection, ...covered.filter((item) => !isSelected(item))]
          : covered,
      );
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end, { once: true });
  };

  const handleKeyDown = (event: React.KeyboardEvent, target: RoomSelection) => {
    if (!editable) return;
    const targets = isSelected(target) && selection.length > 0 ? selection : [target];
    if (event.key === "Delete" || event.key === "Backspace") {
      if (!onDelete) return;
      event.preventDefault();
      onDelete(targets);
      return;
    }
    const deltas: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const delta = deltas[event.key];
    if (!delta || !onMove) return;
    event.preventDefault();
    const step = event.shiftKey ? NUDGE_LARGE : NUDGE;
    const moves: RoomMove[] = [];
    for (const item of targets) {
      const current = positionOf(item);
      if (!current) continue;
      moves.push({
        ...item,
        x: Math.max(0, Math.min(room.width, current.x + delta[0] * step)),
        y: Math.max(0, Math.min(room.height, current.y + delta[1] * step)),
      });
    }
    if (moves.length > 0) onMove(moves);
  };

  const isEmpty = room.seats.length === 0 && room.furniture.length === 0;
  const boardSelected = isSelected({ type: "board", id: "board" });

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative isolate w-full overflow-hidden rounded-2xl border bg-[linear-gradient(to_right,color-mix(in_oklab,var(--border)_42%,transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_oklab,var(--border)_42%,transparent)_1px,transparent_1px)] bg-[size:24px_24px] shadow-inner select-none",
        editable && "touch-none",
        className,
      )}
      style={{ aspectRatio: `${room.width} / ${room.height}` }}
      onPointerDown={startMarquee}
      role="application"
      aria-label="Plan interactif de la salle"
    >
      {isEmpty ? (
        <p className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-muted-foreground">
          La salle est vide. Ajoutez une table ou un siège pour commencer.
        </p>
      ) : null}

      {guides.map((guide) => (
        <div
          key={`${guide.axis}-${guide.at}`}
          aria-hidden="true"
          className="pointer-events-none absolute z-50 bg-primary/70"
          style={
            guide.axis === "x"
              ? { left: `${(guide.at / room.width) * 100}%`, top: 0, bottom: 0, width: 1 }
              : { top: `${(guide.at / room.height) * 100}%`, left: 0, right: 0, height: 1 }
          }
        />
      ))}

      {marquee ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute z-50 rounded-sm border border-primary/60 bg-primary/10"
          style={{
            left: `${(Math.min(marquee.x1, marquee.x2) / room.width) * 100}%`,
            top: `${(Math.min(marquee.y1, marquee.y2) / room.height) * 100}%`,
            width: `${(Math.abs(marquee.x2 - marquee.x1) / room.width) * 100}%`,
            height: `${(Math.abs(marquee.y2 - marquee.y1) / room.height) * 100}%`,
          }}
        />
      ) : null}

      <div
        className={cn(
          "absolute z-10 flex h-5 items-center justify-center rounded-sm border-2 border-foreground bg-background px-2 text-[9px] font-semibold tracking-wide shadow-sm",
          editable && "cursor-grab active:cursor-grabbing",
          boardSelected && "z-30 ring-2 ring-primary ring-offset-2",
        )}
        style={{
          left: `${(room.board.x / room.width) * 100}%`,
          top: `${(room.board.y / room.height) * 100}%`,
          width: `${(room.board.width / room.width) * 100}%`,
          transform: `rotate(${room.board.rotation}deg)`,
        }}
        onPointerDown={(event) => startDrag(event, { type: "board", id: "board" })}
        onKeyDown={(event) => handleKeyDown(event, { type: "board", id: "board" })}
        tabIndex={editable ? 0 : -1}
        role={editable ? "button" : undefined}
        aria-label={editable ? `Tableau : ${room.board.label}` : undefined}
      >
        <span className="truncate">{room.board.label}</span>
      </div>

      {room.furniture.map((item) => {
        const selected = isSelected({ type: "furniture", id: item.id });
        const polygon =
          item.shape === "polygon" && item.points.length > 2
            ? `polygon(${item.points.map(([x, y]) => `${x}% ${y}%`).join(",")})`
            : undefined;
        return (
          <div
            key={item.id}
            className={cn(
              "absolute z-0 flex items-center justify-center border border-foreground/25 bg-muted/85 text-[9px] font-medium text-muted-foreground shadow-sm",
              // Never transition geometry: `left`/`top` change on every pointer
              // move and an eased transition makes seats trail the table.
              "transition-[box-shadow,border-color,background-color]",
              item.shape === "ellipse" && "rounded-[999px]",
              item.shape === "rectangle" && "rounded-md",
              item.shape === "composite" &&
                "rounded-b-lg border-x-[7px] border-b-[7px] border-t-0 bg-transparent",
              item.shape === "line" && "h-1! border-0 bg-foreground/60",
              item.shape === "free" && "rounded-xl border-dashed",
              selected && "z-20 ring-2 ring-primary ring-offset-2",
              editable && "cursor-grab active:cursor-grabbing",
            )}
            style={{
              left: `${(item.x / room.width) * 100}%`,
              top: `${(item.y / room.height) * 100}%`,
              width: `${(item.width / room.width) * 100}%`,
              height: `${(item.height / room.height) * 100}%`,
              transform: `rotate(${item.rotation}deg)`,
              clipPath: polygon,
            }}
            onPointerDown={(event) => startDrag(event, { type: "furniture", id: item.id })}
            onKeyDown={(event) => handleKeyDown(event, { type: "furniture", id: item.id })}
            tabIndex={editable ? 0 : -1}
            role={editable ? "button" : undefined}
            aria-label={editable ? `Mobilier : ${item.label}` : undefined}
          >
            <span className="max-w-full truncate px-2">{item.label}</span>
          </div>
        );
      })}

      {room.seats.map((seat) => {
        const participant = personBySeat.get(seat.id);
        const selected = isSelected({ type: "seat", id: seat.id });
        const hand = participant?.handedness;
        const vision = participant?.vision_need ?? 0;
        const hearing = participant?.hearing_need ?? 0;
        if (!seat.enabled && !editable) return null;
        return (
          <button
            key={seat.id}
            type="button"
            className={cn(
              // Centring lives in the inline `transform` below. Tailwind's
              // `-translate-x-1/2` compiles to the standalone `translate`
              // property, which would *compose* with it and shift the seat by a
              // whole box instead of half of one.
              "absolute z-20 flex min-h-8 min-w-8 items-center justify-center rounded-lg border bg-background px-1.5 py-1 text-[10px] font-semibold shadow-sm hover:z-30 hover:scale-105 hover:border-foreground/50 focus-visible:z-40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
              "transition-[box-shadow,border-color,background-color,scale]",
              participant && "min-w-16 border-foreground bg-foreground text-background",
              !seat.enabled && "border-dashed opacity-45",
              selected && "z-40 ring-2 ring-primary ring-offset-2",
              editable && "cursor-grab active:cursor-grabbing",
            )}
            style={{
              left: `${(seat.x / room.width) * 100}%`,
              top: `${(seat.y / room.height) * 100}%`,
              transform: `translate(-50%, -50%) rotate(${seat.rotation}deg)`,
            }}
            onPointerDown={(event) => startDrag(event, { type: "seat", id: seat.id })}
            onKeyDown={(event) => handleKeyDown(event, { type: "seat", id: seat.id })}
            title={
              participant
                ? `${seat.label} — ${participant.name}`
                : seat.enabled
                  ? seat.label
                  : `${seat.label} (désactivée)`
            }
            aria-label={participant ? `${seat.label}, ${participant.name}` : `Place ${seat.label}`}
          >
            {participant ? (
              <span className="flex max-w-28 items-center gap-1 truncate">
                <span className="truncate">{participant.name.split(" ")[0]}</span>
                {hand === "left" && <Hand className="size-2.5 shrink-0" aria-hidden="true" />}
                {vision > 0 && <Eye className="size-2.5 shrink-0" aria-hidden="true" />}
                {hearing > 0 && <Ear className="size-2.5 shrink-0" aria-hidden="true" />}
                {participant.tags.accessible === "true" && (
                  <Accessibility className="size-2.5 shrink-0" aria-hidden="true" />
                )}
              </span>
            ) : (
              seat.label
            )}
          </button>
        );
      })}
    </div>
  );
}
