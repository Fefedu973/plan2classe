import type {
  ClassroomConfig,
  Furniture,
  Participant,
  Room,
  Seat,
  SeatRelation,
} from "../schemas/classroom";

export const demoStudentNames = Array.from(
  { length: 36 },
  (_, index) => `Élève ${String(index + 1).padStart(2, "0")}`,
);

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
}

export function createAccessCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

export function createParticipant(name: string): Participant {
  return {
    id: newId("person"),
    name: name.trim(),
    email: null,
    tags: {},
    attributes: {},
    grade: null,
    handedness: "unknown",
    vision_need: 0,
    hearing_need: 0,
    notes: "",
    active: true,
    priority: 1,
    accessCode: createAccessCode(),
  };
}

export function buildClassicRoom(options?: {
  rows?: number;
  doubleTablesPerRow?: number;
  partialLastRowTables?: number;
}): Room {
  const rows = options?.rows ?? 4;
  const tablesPerRow = options?.doubleTablesPerRow ?? 4;
  const partialLastRowTables = options?.partialLastRowTables ?? tablesPerRow;
  const furniture: Furniture[] = [];
  const seats: Seat[] = [];
  const relations: SeatRelation[] = [];
  const width = 1200;
  const height = Math.max(760, rows * 135 + 210);

  for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) {
    const rowName = String.fromCharCode(65 + rowIndex);
    const count = rowIndex === rows - 1 ? partialLastRowTables : tablesPerRow;
    const usableWidth = 960;
    const tableGap = usableWidth / count;
    const startX = 120 + (tablesPerRow - count) * (tableGap / 2);
    const y = 180 + rowIndex * 130;
    for (let tableIndex = 0; tableIndex < count; tableIndex += 1) {
      const furnitureId = `table_${rowName}${tableIndex + 1}`;
      const x = startX + tableIndex * tableGap;
      const leftNumber = tableIndex * 2 + 1;
      const rightNumber = leftNumber + 1;
      const leftId = `seat_${rowName}${leftNumber}`;
      const rightId = `seat_${rowName}${rightNumber}`;
      const depthTag =
        rowIndex < Math.ceil(rows / 3)
          ? "front"
          : rowIndex >= Math.floor((rows * 2) / 3)
            ? "back"
            : "middle";
      const commonTags = [depthTag, `row:${rowName}`];
      if (tableIndex === 0) commonTags.push("wall");
      if (tableIndex === count - 1) commonTags.push("window");

      furniture.push({
        id: furnitureId,
        label: `Table ${rowName}${leftNumber}–${rowName}${rightNumber}`,
        shape: "rectangle",
        x,
        y,
        width: 170,
        height: 70,
        rotation: 0,
        points: [],
        parts: [],
        tags: [depthTag],
        cluster_id: `row_${rowName}`,
      });
      seats.push(
        {
          id: leftId,
          label: `${rowName}${leftNumber}`,
          x: x + 45,
          y: y + 88,
          rotation: 0,
          furniture_id: furnitureId,
          cluster_id: `row_${rowName}`,
          tags: [...commonTags, "left"],
          side: "left",
          enabled: true,
          metadata: {},
        },
        {
          id: rightId,
          label: `${rowName}${rightNumber}`,
          x: x + 125,
          y: y + 88,
          rotation: 0,
          furniture_id: furnitureId,
          cluster_id: `row_${rowName}`,
          tags: [...commonTags, "right"],
          side: "right",
          enabled: true,
          metadata: {},
        },
      );
      relations.push({
        a: leftId,
        b: rightId,
        kinds: ["adjacent", "near", "same_table", "hand_conflict"],
        bidirectional: true,
      });

      if (tableIndex > 0) {
        relations.push({
          a: `seat_${rowName}${leftNumber - 1}`,
          b: leftId,
          kinds: ["near"],
          bidirectional: true,
        });
      }
    }
  }

  return {
    width,
    height,
    board: {
      x: 390,
      y: 40,
      width: 420,
      rotation: 0,
      label: "Tableau",
    },
    furniture,
    seats,
    relations,
    near_threshold: 190,
    infer_adjacent_threshold: 110,
    metadata: { wall: "left", window: "right", front: "top" },
  };
}

export type ClassroomTemplate = "empty" | "blank" | "demo";

/** A room with the board and dimensions set, but nothing placed in it yet. */
function buildEmptyRoom(): Room {
  const room = buildClassicRoom();
  return { ...room, furniture: [], seats: [], relations: [] };
}

export function createDefaultClassroomConfig(
  template: ClassroomTemplate = "blank",
): ClassroomConfig {
  const isDemo = template === "demo";
  return {
    room:
      template === "empty"
        ? buildEmptyRoom()
        : buildClassicRoom(
            isDemo
              ? { rows: 5, doubleTablesPerRow: 4, partialLastRowTables: 2 }
              : { rows: 4, doubleTablesPerRow: 4 },
          ),
    participants: isDemo ? demoStudentNames.map(createParticipant) : [],
    rules: [],
    settings: {
      time_limit_seconds: 12,
      num_workers: 1,
      random_seed: 2_026_082_2,
      fairness_enabled: true,
      fairness_tolerance: 0,
      arrival_policy: isDemo ? "linear" : "equal",
      arrival_bonus_percent: 25,
      seat_preference_weight: 100,
      neighbor_preference_weight: 100,
      avoid_neighbor_weight: 130,
      zone_preference_weight: 45,
      mutual_bonus: 30,
      stability_enabled: true,
      auto_solve_on_response: true,
      default_relation: "adjacent",
      deterministic_tiebreak: true,
      diagnostic_time_limit_seconds: 8,
      accessibility_hard: false,
      hard_front_fraction: 0.32,
      vision_weight: 8,
      hearing_weight: 6,
      hand_collision: "hard",
      hand_collision_weight: 500,
      grade_balance_weight: 0,
      grade_mix_weight: 0,
      grade_mix_min_difference: 2,
    },
    form: {
      title: isDemo ? "Plan de classe — démonstration" : "Choisissez vos préférences",
      description:
        "Indiquez vos souhaits. Les contraintes de l’enseignant restent prioritaires et le moteur cherche la solution la plus équitable.",
      confirmationMessage: "Votre réponse est enregistrée. Le plan vient d’être recalculé.",
      maxSeatChoices: 5,
      maxNeighborChoices: 5,
      maxAvoidChoices: 5,
      collectZones: true,
      collectPriority: true,
      collectNotes: true,
      accessMode: "open",
      allowEdits: true,
    },
    previous_assignment: {},
  };
}
