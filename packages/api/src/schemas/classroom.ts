import { z } from "zod";

export const relationKinds = [
  "adjacent",
  "near",
  "same_table",
  "same_cluster",
  "hand_conflict",
] as const;

export const ruleKinds = [
  "fixed_seat",
  "forbidden_seats",
  "require_seat_tags",
  "forbid_seat_tags",
  "pair_relation",
  "group_same_table",
  "group_different_tables",
  "min_distance",
  "max_distance",
  "tag_not_adjacent",
  "max_tag_per_table",
  "table_tag_balance",
  "group_spread_table",
  "no_go",
  "alternate_tag",
  "max_board_distance",
] as const;

export const relationKindSchema = z.enum(relationKinds);
export const ruleKindSchema = z.enum(ruleKinds);

export const furnitureSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  shape: z.enum(["rectangle", "ellipse", "polygon", "composite", "line", "free"]),
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().positive(),
  height: z.number().positive(),
  rotation: z.number().finite(),
  points: z.array(z.tuple([z.number(), z.number()])),
  parts: z.array(z.record(z.string(), z.unknown())),
  tags: z.array(z.string()),
  cluster_id: z.string().nullable(),
});

export const seatSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  x: z.number().finite(),
  y: z.number().finite(),
  rotation: z.number().finite(),
  furniture_id: z.string().nullable(),
  cluster_id: z.string().nullable(),
  tags: z.array(z.string()),
  side: z.string().nullable(),
  enabled: z.boolean(),
  metadata: z.record(z.string(), z.unknown()),
});

export const seatRelationSchema = z
  .object({
    a: z.string().min(1),
    b: z.string().min(1),
    kinds: z.array(relationKindSchema).min(1),
    bidirectional: z.boolean(),
  })
  .refine((relation) => relation.a !== relation.b, "Une place ne peut pas être reliée à elle-même");

export const boardSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().positive(),
  rotation: z.number().finite(),
  label: z.string().min(1),
});

export const roomSchema = z
  .object({
    width: z.number().min(400).max(4000),
    height: z.number().min(300).max(3000),
    board: boardSchema,
    furniture: z.array(furnitureSchema),
    seats: z.array(seatSchema),
    relations: z.array(seatRelationSchema),
    near_threshold: z.number().min(0).max(2000),
    infer_adjacent_threshold: z.number().min(0).max(2000),
    metadata: z.record(z.string(), z.unknown()),
  })
  .superRefine((room, context) => {
    const furnitureIds = new Set<string>();
    for (const [index, item] of room.furniture.entries()) {
      if (furnitureIds.has(item.id)) {
        context.addIssue({
          code: "custom",
          message: "Les identifiants de mobilier doivent être uniques.",
          path: ["furniture", index, "id"],
        });
      }
      furnitureIds.add(item.id);
    }
    const seatIds = new Set<string>();
    for (const [index, seat] of room.seats.entries()) {
      if (seatIds.has(seat.id)) {
        context.addIssue({
          code: "custom",
          message: "Les identifiants de places doivent être uniques.",
          path: ["seats", index, "id"],
        });
      }
      seatIds.add(seat.id);
      if (seat.furniture_id && !furnitureIds.has(seat.furniture_id)) {
        context.addIssue({
          code: "custom",
          message: "La place référence un mobilier inconnu.",
          path: ["seats", index, "furniture_id"],
        });
      }
    }
    for (const [index, relation] of room.relations.entries()) {
      if (!seatIds.has(relation.a) || !seatIds.has(relation.b)) {
        context.addIssue({
          code: "custom",
          message: "La relation référence une place inconnue.",
          path: ["relations", index],
        });
      }
    }
  });

export const participantSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(160),
  email: z.string().email().nullable(),
  tags: z.record(z.string(), z.string()),
  attributes: z.record(z.string(), z.unknown()),
  grade: z.number().min(0).max(100).nullable().default(null),
  handedness: z
    .enum(["right", "left", "ambidextrous", "unknown"])
    .default("unknown"),
  vision_need: z.number().int().min(0).max(5).default(0),
  hearing_need: z.number().int().min(0).max(5).default(0),
  notes: z.string().max(2_000).default(""),
  active: z.boolean(),
  priority: z.number().min(0.01).max(100),
  accessCode: z.string().trim().min(4).max(32),
});

export const rankedNeighborSchema = z.object({
  participant_id: z.string().min(1),
  relation: relationKindSchema,
});

export const preferenceResponseSchema = z.object({
  participant_id: z.string().min(1),
  submitted_at: z.string().datetime({ offset: true }),
  seat_ranking: z.array(z.string()).max(10),
  zone_ranking: z.array(z.string()).max(10),
  desired_neighbors: z.array(rankedNeighborSchema).max(10),
  avoided_neighbors: z.array(rankedNeighborSchema).max(10),
  priority_mode: z.enum(["seat", "neighbors", "balanced", "none"]),
  notes: z.string().max(2000),
  revision: z.number().int().positive(),
});

export const publicResponseInputSchema = preferenceResponseSchema.omit({
  submitted_at: true,
  revision: true,
});

const entityIdSchema = z.string().min(1);
const ruleBaseSchema = z.object({
  id: entityIdSchema,
  name: z.string().trim().min(1).max(180),
  hard: z.boolean(),
  weight: z.number().int().min(1).max(1_000_000),
  enabled: z.boolean(),
  source: z.enum(["admin", "medical", "import", "system"]),
  explanation: z.string().max(1000),
});

export const fixedSeatRuleParamsSchema = z.object({
  participant_id: entityIdSchema,
  seat_id: entityIdSchema,
});
export const forbiddenSeatsRuleParamsSchema = z.object({
  participant_id: entityIdSchema,
  seat_ids: z.array(entityIdSchema).min(1),
});
export const seatTagsRuleParamsSchema = z.object({
  participant_id: entityIdSchema,
  tags: z.array(z.string().min(1)).min(1),
  mode: z.enum(["any", "all"]).default("any"),
});
export const pairRelationRuleParamsSchema = z.object({
  a: entityIdSchema,
  b: entityIdSchema,
  relation: relationKindSchema.default("adjacent"),
  required: z.boolean().default(true),
});
export const groupRuleParamsSchema = z.object({
  participant_ids: z.array(entityIdSchema).min(2),
});
export const distanceRuleParamsSchema = z.object({
  a: entityIdSchema,
  b: entityIdSchema,
  distance: z.number().min(0).max(10_000),
});
export const tagNotAdjacentRuleParamsSchema = z.object({
  tag_key: z.string().min(1),
  values: z.array(z.string()).default([]),
});
export const maxTagPerTableRuleParamsSchema = z.object({
  tag_key: z.string().min(1),
  tag_value: z.string(),
  max_count: z.number().int().min(0).max(500),
});
export const tableTagBalanceRuleParamsSchema = z.object({
  tag_key: z.string().min(1),
  values: z.array(z.string()).default([]),
  max_difference: z.number().int().min(0).max(500),
});
export const groupSpreadTableRuleParamsSchema = z.object({
  participant_ids: z.array(entityIdSchema).min(2),
  max_per_table: z.number().int().min(1).max(500).default(1),
});
export const noGoRuleParamsSchema = z
  .object({
    participant_id: entityIdSchema,
    seat_ids: z.array(entityIdSchema).default([]),
    tags: z.array(z.string().min(1)).default([]),
    mode: z.enum(["any", "all"]).default("any"),
  })
  .refine((params) => params.seat_ids.length > 0 || params.tags.length > 0, {
    message: "Une règle no-go doit cibler au moins une place ou un tag.",
  });
export const alternateTagRuleParamsSchema = z
  .object({
    tag: z.string().min(1).nullable().default(null),
    tag_key: z.string().min(1).nullable().default(null),
    values: z.array(z.string()).default([]),
    relation: z.enum(["adjacent", "near", "same_table", "same_cluster"]).default("adjacent"),
  })
  .refine((params) => Boolean(params.tag || params.tag_key), {
    message: "Une alternance doit indiquer un tag ou une clé de tag.",
  });
export const maxBoardDistanceRuleParamsSchema = z.object({
  participant_id: entityIdSchema,
  max_distance: z.number().positive().max(10_000),
});

function ruleVariant<TKind extends RuleKind, TParams extends z.ZodType>(
  kind: TKind,
  params: TParams,
) {
  return ruleBaseSchema.extend({
    kind: z.literal(kind),
    params,
  });
}

export const ruleSchema = z.discriminatedUnion("kind", [
  ruleVariant("fixed_seat", fixedSeatRuleParamsSchema),
  ruleVariant("forbidden_seats", forbiddenSeatsRuleParamsSchema),
  ruleVariant("require_seat_tags", seatTagsRuleParamsSchema),
  ruleVariant("forbid_seat_tags", seatTagsRuleParamsSchema),
  ruleVariant("pair_relation", pairRelationRuleParamsSchema),
  ruleVariant("group_same_table", groupRuleParamsSchema),
  ruleVariant("group_different_tables", groupRuleParamsSchema),
  ruleVariant("min_distance", distanceRuleParamsSchema),
  ruleVariant("max_distance", distanceRuleParamsSchema),
  ruleVariant("tag_not_adjacent", tagNotAdjacentRuleParamsSchema),
  ruleVariant("max_tag_per_table", maxTagPerTableRuleParamsSchema),
  ruleVariant("table_tag_balance", tableTagBalanceRuleParamsSchema),
  ruleVariant("group_spread_table", groupSpreadTableRuleParamsSchema),
  ruleVariant("no_go", noGoRuleParamsSchema),
  ruleVariant("alternate_tag", alternateTagRuleParamsSchema),
  ruleVariant("max_board_distance", maxBoardDistanceRuleParamsSchema),
]);

export const solverSettingsSchema = z.object({
  time_limit_seconds: z.number().min(0.5).max(600),
  num_workers: z.number().int().min(1).max(64),
  random_seed: z.number().int(),
  fairness_enabled: z.boolean(),
  fairness_tolerance: z.number().int().min(0).max(1000),
  arrival_policy: z.enum(["equal", "linear", "exponential"]),
  arrival_bonus_percent: z.number().int().min(0).max(500),
  seat_preference_weight: z.number().int().min(0).max(10_000),
  neighbor_preference_weight: z.number().int().min(0).max(10_000),
  avoid_neighbor_weight: z.number().int().min(0).max(10_000),
  zone_preference_weight: z.number().int().min(0).max(10_000),
  mutual_bonus: z.number().int().min(0).max(10_000),
  stability_enabled: z.boolean(),
  auto_solve_on_response: z.boolean(),
  default_relation: relationKindSchema,
  deterministic_tiebreak: z.boolean(),
  diagnostic_time_limit_seconds: z.number().min(0.5).max(120),
  accessibility_hard: z.boolean().default(false),
  hard_front_fraction: z.number().positive().max(1).default(0.32),
  vision_weight: z.number().int().min(0).max(10_000).default(8),
  hearing_weight: z.number().int().min(0).max(10_000).default(6),
  hand_collision: z.enum(["off", "soft", "hard"]).default("hard"),
  hand_collision_weight: z.number().int().min(0).max(1_000_000).default(500),
  grade_balance_weight: z.number().int().min(0).max(1_000_000).default(0),
  grade_mix_weight: z.number().int().min(0).max(1_000_000).default(0),
  grade_mix_min_difference: z.number().min(0).max(100).default(2),
});

export const formConfigSchema = z.object({
  title: z.string().trim().min(1).max(180),
  description: z.string().max(2000),
  confirmationMessage: z.string().max(500),
  maxSeatChoices: z.number().int().min(0).max(10),
  maxNeighborChoices: z.number().int().min(0).max(10),
  maxAvoidChoices: z.number().int().min(0).max(10),
  collectZones: z.boolean(),
  collectPriority: z.boolean(),
  collectNotes: z.boolean(),
  accessMode: z.enum(["open", "code"]),
  allowEdits: z.boolean(),
});

export const classroomConfigSchema = z
  .object({
    room: roomSchema,
    participants: z.array(participantSchema).max(500),
    rules: z.array(ruleSchema).max(1000),
    settings: solverSettingsSchema,
    form: formConfigSchema,
    previous_assignment: z.record(z.string(), z.string()),
  })
  .superRefine((config, context) => {
    const participantIds = new Set<string>();
    const accessCodes = new Set<string>();
    for (const [index, participant] of config.participants.entries()) {
      if (participantIds.has(participant.id)) {
        context.addIssue({
          code: "custom",
          message: "Les identifiants de participants doivent être uniques.",
          path: ["participants", index, "id"],
        });
      }
      participantIds.add(participant.id);
      const normalizedCode = participant.accessCode.toUpperCase();
      if (accessCodes.has(normalizedCode)) {
        context.addIssue({
          code: "custom",
          message: "Les codes participants doivent être uniques dans une classe.",
          path: ["participants", index, "accessCode"],
        });
      }
      accessCodes.add(normalizedCode);
    }

    const ruleIds = new Set<string>();
    for (const [index, rule] of config.rules.entries()) {
      if (ruleIds.has(rule.id)) {
        context.addIssue({
          code: "custom",
          message: "Les identifiants de règles doivent être uniques.",
          path: ["rules", index, "id"],
        });
      }
      ruleIds.add(rule.id);
    }

    const enabledSeatIds = new Set(
      config.room.seats.filter((seat) => seat.enabled).map((seat) => seat.id),
    );

    for (const [index, rule] of config.rules.entries()) {
      const requireParticipant = (id: string, key: string) => {
        if (!participantIds.has(id)) {
          context.addIssue({
            code: "custom",
            message: "La règle référence un participant inconnu.",
            path: ["rules", index, "params", key],
          });
        }
      };
      const requireSeat = (id: string, key: string) => {
        if (!enabledSeatIds.has(id)) {
          context.addIssue({
            code: "custom",
            message: "La règle référence une place active inconnue.",
            path: ["rules", index, "params", key],
          });
        }
      };

      switch (rule.kind) {
        case "fixed_seat":
          requireParticipant(rule.params.participant_id, "participant_id");
          requireSeat(rule.params.seat_id, "seat_id");
          break;
        case "forbidden_seats":
          requireParticipant(rule.params.participant_id, "participant_id");
          rule.params.seat_ids.forEach((id) => requireSeat(id, "seat_ids"));
          break;
        case "require_seat_tags":
        case "forbid_seat_tags":
          requireParticipant(rule.params.participant_id, "participant_id");
          break;
        case "pair_relation":
        case "min_distance":
        case "max_distance":
          requireParticipant(rule.params.a, "a");
          requireParticipant(rule.params.b, "b");
          if (rule.params.a === rule.params.b) {
            context.addIssue({
              code: "custom",
              message: "Une règle de paire nécessite deux participants différents.",
              path: ["rules", index, "params", "b"],
            });
          }
          break;
        case "group_same_table":
        case "group_different_tables":
        case "group_spread_table":
          rule.params.participant_ids.forEach((id) => requireParticipant(id, "participant_ids"));
          break;
        case "no_go":
          requireParticipant(rule.params.participant_id, "participant_id");
          rule.params.seat_ids.forEach((id) => requireSeat(id, "seat_ids"));
          break;
        case "max_board_distance":
          requireParticipant(rule.params.participant_id, "participant_id");
          break;
        case "alternate_tag":
        case "tag_not_adjacent":
        case "max_tag_per_table":
        case "table_tag_balance":
          break;
      }
    }
  });

export const classroomSchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string(),
  published: z.boolean(),
  config: classroomConfigSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const stageResultSchema = z.object({
  name: z.string(),
  status: z.string(),
  objective_value: z.number().nullable().optional(),
  best_bound: z.number().nullable().optional(),
  relative_gap: z.number().nullable().optional(),
  wall_time_seconds: z.number().min(0),
});

export const personResultSchema = z.object({
  participant_id: z.string(),
  seat_id: z.string(),
  satisfaction: z.number().int().min(0).max(1_000),
  raw_score: z.number().int(),
  response_received: z.boolean(),
  moved_from_previous: z.boolean(),
  breakdown: z.array(z.record(z.string(), z.unknown())),
});

export const solveResultSchema = z.object({
  status: z.enum(["optimal", "feasible", "infeasible", "unknown", "error"]),
  assignment: z.record(z.string(), z.string()),
  people: z.array(personResultSchema),
  stages: z.array(stageResultSchema),
  min_satisfaction: z.number().int().min(0).max(1_000).nullable(),
  average_satisfaction: z.number().min(0).max(1_000).nullable(),
  weighted_total: z.number().int().nullable(),
  unchanged_count: z.number().int().nullable(),
  diagnostics: z.array(z.record(z.string(), z.unknown())),
  hard_constraints_verified: z.boolean(),
  generated_at: z.string().datetime({ offset: true }),
  solver: z.string(),
  model_stats: z.record(z.string(), z.unknown()),
});

export const solutionRecordSchema = z.object({
  id: z.string(),
  classroomId: z.string(),
  result: solveResultSchema,
  createdAt: z.string(),
});

export const projectSnapshotSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  admin_token: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  room: roomSchema,
  participants: z.array(participantSchema.omit({ accessCode: true })),
  responses: z.array(preferenceResponseSchema),
  rules: z.array(ruleSchema),
  settings: solverSettingsSchema,
  previous_assignment: z.record(z.string(), z.string()),
  published: z.boolean(),
});

export const publicClassroomPayloadSchema = z.object({
  classroom: z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    slug: z.string(),
    form: formConfigSchema,
    room: roomSchema,
  }),
  participants: z.array(z.object({ id: z.string(), name: z.string() })),
  zones: z.array(z.string()),
});

export const publicSubmitSchema = z.object({
  slug: z.string().min(1),
  accessCode: z.string().trim().max(64).optional(),
  response: publicResponseInputSchema,
});

export type RelationKind = z.infer<typeof relationKindSchema>;
export type RuleKind = z.infer<typeof ruleKindSchema>;
export type Furniture = z.infer<typeof furnitureSchema>;
export type Seat = z.infer<typeof seatSchema>;
export type SeatRelation = z.infer<typeof seatRelationSchema>;
export type Room = z.infer<typeof roomSchema>;
export type Participant = z.infer<typeof participantSchema>;
export type PreferenceResponse = z.infer<typeof preferenceResponseSchema>;
export type Rule = z.infer<typeof ruleSchema>;
export type SolverSettings = z.infer<typeof solverSettingsSchema>;
export type FormConfig = z.infer<typeof formConfigSchema>;
export type ClassroomConfig = z.infer<typeof classroomConfigSchema>;
export type Classroom = z.infer<typeof classroomSchema>;
export type SolveResult = z.infer<typeof solveResultSchema>;
export type SolutionRecord = z.infer<typeof solutionRecordSchema>;
