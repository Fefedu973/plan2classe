"use client";

import type { Participant, Room } from "@plan2classe-app/api/schemas/classroom";
import { cn } from "@plan2classe-app/ui/lib/utils";
import { Accessibility, Ear, Eye, Hand } from "lucide-react";
import { useMemo, useRef } from "react";

type Selection = { type: "seat" | "furniture" | "board"; id: string } | null;

/** Dragging snaps to this grid so hand-built rooms stay visually aligned. */
const SNAP = 5;
const NUDGE = 5;
const NUDGE_LARGE = 25;

function snap(value: number, enabled: boolean) {
  return enabled ? Math.round(value / SNAP) * SNAP : Math.round(value);
}

export function RoomCanvas({
  room,
  participants = [],
  assignment = {},
  editable = false,
  selection,
  onSelectionChange,
  onMove,
  onDelete,
  className,
}: {
  room: Room;
  participants?: Participant[];
  assignment?: Record<string, string>;
  editable?: boolean;
  selection?: Selection;
  onSelectionChange?: (selection: Selection) => void;
  onMove?: (selection: Exclude<Selection, null>, x: number, y: number) => void;
  onDelete?: (selection: Exclude<Selection, null>) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
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

  const positionOf = (target: Exclude<Selection, null>) => {
    if (target.type === "board") return { x: room.board.x, y: room.board.y };
    if (target.type === "seat") {
      const seat = room.seats.find((item) => item.id === target.id);
      return seat ? { x: seat.x, y: seat.y } : null;
    }
    const furniture = room.furniture.find((item) => item.id === target.id);
    return furniture ? { x: furniture.x, y: furniture.y } : null;
  };

  const startDrag = (
    event: React.PointerEvent,
    target: Exclude<Selection, null>,
    originalX: number,
    originalY: number,
  ) => {
    event.stopPropagation();
    onSelectionChange?.(target);
    if (!editable || !onMove || !containerRef.current) return;
    const element = event.currentTarget as HTMLElement;
    element.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startY = event.clientY;
    const bounds = containerRef.current.getBoundingClientRect();

    const move = (moveEvent: PointerEvent) => {
      const rawX = originalX + ((moveEvent.clientX - startX) / bounds.width) * room.width;
      const rawY = originalY + ((moveEvent.clientY - startY) / bounds.height) * room.height;
      // Hold Alt to place freely, otherwise stick to the visible grid.
      const useSnap = !moveEvent.altKey;
      onMove(
        target,
        Math.max(0, Math.min(room.width, snap(rawX, useSnap))),
        Math.max(0, Math.min(room.height, snap(rawY, useSnap))),
      );
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end, { once: true });
  };

  const handleKeyDown = (event: React.KeyboardEvent, target: Exclude<Selection, null>) => {
    if (!editable) return;
    if (event.key === "Delete" || event.key === "Backspace") {
      if (!onDelete) return;
      event.preventDefault();
      onDelete(target);
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
    const current = positionOf(target);
    if (!current) return;
    event.preventDefault();
    const step = event.shiftKey ? NUDGE_LARGE : NUDGE;
    onMove(
      target,
      Math.max(0, Math.min(room.width, current.x + delta[0] * step)),
      Math.max(0, Math.min(room.height, current.y + delta[1] * step)),
    );
  };

  const isEmpty = room.seats.length === 0 && room.furniture.length === 0;

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative isolate w-full overflow-hidden rounded-2xl border bg-[linear-gradient(to_right,color-mix(in_oklab,var(--border)_42%,transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_oklab,var(--border)_42%,transparent)_1px,transparent_1px)] bg-[size:24px_24px] shadow-inner select-none",
        editable && "touch-none",
        className,
      )}
      style={{ aspectRatio: `${room.width} / ${room.height}` }}
      onPointerDown={() => onSelectionChange?.(null)}
      role="application"
      aria-label="Plan interactif de la salle"
    >
      {isEmpty ? (
        <p className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-muted-foreground">
          La salle est vide. Ajoutez une table ou un siège pour commencer.
        </p>
      ) : null}

      <div
        className={cn(
          "absolute z-10 flex h-5 items-center justify-center rounded-sm border-2 border-foreground bg-background px-2 text-[9px] font-semibold tracking-wide shadow-sm",
          editable && "cursor-grab active:cursor-grabbing",
          selection?.type === "board" && "z-30 ring-2 ring-primary ring-offset-2",
        )}
        style={{
          left: `${(room.board.x / room.width) * 100}%`,
          top: `${(room.board.y / room.height) * 100}%`,
          width: `${(room.board.width / room.width) * 100}%`,
          transform: `rotate(${room.board.rotation}deg)`,
        }}
        onPointerDown={(event) =>
          startDrag(event, { type: "board", id: "board" }, room.board.x, room.board.y)
        }
        onKeyDown={(event) => handleKeyDown(event, { type: "board", id: "board" })}
        tabIndex={editable ? 0 : -1}
        role={editable ? "button" : undefined}
        aria-label={editable ? `Tableau : ${room.board.label}` : undefined}
      >
        <span className="truncate">{room.board.label}</span>
      </div>

      {room.furniture.map((item) => {
        const isSelected = selection?.type === "furniture" && selection.id === item.id;
        const polygon =
          item.shape === "polygon" && item.points.length > 2
            ? `polygon(${item.points.map(([x, y]) => `${x}% ${y}%`).join(",")})`
            : undefined;
        return (
          <div
            key={item.id}
            className={cn(
              "absolute z-0 flex items-center justify-center border border-foreground/25 bg-muted/85 text-[9px] font-medium text-muted-foreground shadow-sm transition-shadow",
              item.shape === "ellipse" && "rounded-[999px]",
              item.shape === "rectangle" && "rounded-md",
              item.shape === "composite" &&
                "rounded-b-lg border-x-[7px] border-b-[7px] border-t-0 bg-transparent",
              item.shape === "line" && "h-1! border-0 bg-foreground/60",
              item.shape === "free" && "rounded-xl border-dashed",
              isSelected && "z-20 ring-2 ring-primary ring-offset-2",
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
            onPointerDown={(event) =>
              startDrag(event, { type: "furniture", id: item.id }, item.x, item.y)
            }
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
        const isSelected = selection?.type === "seat" && selection.id === seat.id;
        const hand = participant?.handedness;
        const vision = participant?.vision_need ?? 0;
        const hearing = participant?.hearing_need ?? 0;
        if (!seat.enabled && !editable) return null;
        return (
          <button
            key={seat.id}
            type="button"
            className={cn(
              "absolute z-20 flex min-h-8 min-w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-lg border bg-background px-1.5 py-1 text-[10px] font-semibold shadow-sm transition-all hover:z-30 hover:scale-105 hover:border-foreground/50 focus-visible:z-40 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              participant && "min-w-16 border-foreground bg-foreground text-background",
              !seat.enabled && "border-dashed opacity-45",
              isSelected && "z-40 ring-2 ring-primary ring-offset-2",
              editable && "cursor-grab active:cursor-grabbing",
            )}
            style={{
              left: `${(seat.x / room.width) * 100}%`,
              top: `${(seat.y / room.height) * 100}%`,
              transform: `translate(-50%, -50%) rotate(${seat.rotation}deg)`,
            }}
            onPointerDown={(event) => startDrag(event, { type: "seat", id: seat.id }, seat.x, seat.y)}
            onKeyDown={(event) => handleKeyDown(event, { type: "seat", id: seat.id })}
            title={
              participant
                ? `${seat.label} — ${participant.name}`
                : seat.enabled
                  ? seat.label
                  : `${seat.label} (désactivée)`
            }
            aria-label={
              participant ? `${seat.label}, ${participant.name}` : `Place ${seat.label}`
            }
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

export type { Selection as RoomSelection };
