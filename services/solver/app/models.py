from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Literal
from uuid import uuid4

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator, model_validator


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:12]}"


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class RelationKind(str, Enum):
    ADJACENT = "adjacent"
    NEAR = "near"
    SAME_TABLE = "same_table"
    SAME_CLUSTER = "same_cluster"
    HAND_CONFLICT = "hand_conflict"


class Handedness(str, Enum):
    RIGHT = "right"
    LEFT = "left"
    AMBIDEXTROUS = "ambidextrous"
    UNKNOWN = "unknown"


class RuleKind(str, Enum):
    FIXED_SEAT = "fixed_seat"
    FORBIDDEN_SEATS = "forbidden_seats"
    REQUIRE_SEAT_TAGS = "require_seat_tags"
    FORBID_SEAT_TAGS = "forbid_seat_tags"
    PAIR_RELATION = "pair_relation"
    GROUP_SAME_TABLE = "group_same_table"
    GROUP_DIFFERENT_TABLES = "group_different_tables"
    MIN_DISTANCE = "min_distance"
    MAX_DISTANCE = "max_distance"
    TAG_NOT_ADJACENT = "tag_not_adjacent"
    MAX_TAG_PER_TABLE = "max_tag_per_table"
    TABLE_TAG_BALANCE = "table_tag_balance"
    # Extensions retained from the compact POC. The twelve values above are the
    # canonical contract and remain unchanged.
    GROUP_SPREAD_TABLE = "group_spread_table"
    NO_GO = "no_go"
    ALTERNATE_TAG = "alternate_tag"
    MAX_BOARD_DISTANCE = "max_board_distance"


class Furniture(BaseModel):
    id: str = Field(default_factory=lambda: new_id("furniture"))
    label: str = "Table"
    shape: Literal["rectangle", "ellipse", "polygon", "composite", "line", "free"] = "rectangle"
    x: float = 100
    y: float = 100
    width: float = 180
    height: float = 80
    rotation: float = 0
    points: list[tuple[float, float]] = Field(default_factory=list)
    parts: list[dict[str, Any]] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    cluster_id: str | None = None


class Seat(BaseModel):
    id: str = Field(default_factory=lambda: new_id("seat"))
    label: str
    x: float
    y: float
    rotation: float = 0
    furniture_id: str | None = None
    cluster_id: str | None = None
    tags: list[str] = Field(default_factory=list)
    side: str | None = None
    enabled: bool = True
    metadata: dict[str, Any] = Field(default_factory=dict)


class SeatRelation(BaseModel):
    a: str
    b: str
    kinds: list[RelationKind]
    bidirectional: bool = True

    @model_validator(mode="after")
    def no_self_relation(self) -> "SeatRelation":
        if self.a == self.b:
            raise ValueError("A seat cannot be related to itself")
        return self


class Board(BaseModel):
    x: float = 450
    y: float = 40
    width: float = 300
    rotation: float = 0
    label: str = "Tableau"


class Room(BaseModel):
    width: float = 1200
    height: float = 800
    board: Board = Field(default_factory=Board)
    furniture: list[Furniture] = Field(default_factory=list)
    seats: list[Seat] = Field(default_factory=list)
    relations: list[SeatRelation] = Field(default_factory=list)
    near_threshold: float = 190
    infer_adjacent_threshold: float = 125
    metadata: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_references(self) -> "Room":
        seat_ids = {seat.id for seat in self.seats}
        furniture_ids = {item.id for item in self.furniture}
        if len(seat_ids) != len(self.seats):
            raise ValueError("Seat IDs must be unique")
        for seat in self.seats:
            if seat.furniture_id and seat.furniture_id not in furniture_ids:
                raise ValueError(f"Unknown furniture_id for seat {seat.id}: {seat.furniture_id}")
        for relation in self.relations:
            if relation.a not in seat_ids or relation.b not in seat_ids:
                raise ValueError("Seat relation references an unknown seat")
        return self


class Participant(BaseModel):
    id: str = Field(default_factory=lambda: new_id("person"))
    name: str
    email: str | None = None
    tags: dict[str, str] = Field(default_factory=dict)
    attributes: dict[str, Any] = Field(default_factory=dict)
    grade: float | None = Field(default=None, ge=0, le=100)
    handedness: Handedness = Handedness.UNKNOWN
    vision_need: int = Field(default=0, ge=0, le=5)
    hearing_need: int = Field(default=0, ge=0, le=5)
    notes: str = Field(default="", max_length=2_000)
    active: bool = True
    priority: float = Field(default=1.0, ge=0.01, le=100)

    @field_validator("handedness", mode="before")
    @classmethod
    def normalize_handedness(cls, value: Any) -> Any:
        if isinstance(value, Handedness):
            return value
        if value is None or value == "":
            return Handedness.UNKNOWN
        normalized = str(value).strip().lower()
        aliases = {
            "r": Handedness.RIGHT,
            "right": Handedness.RIGHT,
            "d": Handedness.RIGHT,
            "droitier": Handedness.RIGHT,
            "droitiere": Handedness.RIGHT,
            "droitière": Handedness.RIGHT,
            "l": Handedness.LEFT,
            "left": Handedness.LEFT,
            "g": Handedness.LEFT,
            "gaucher": Handedness.LEFT,
            "gauchere": Handedness.LEFT,
            "gauchère": Handedness.LEFT,
            "a": Handedness.AMBIDEXTROUS,
            "ambidextrous": Handedness.AMBIDEXTROUS,
            "ambidextre": Handedness.AMBIDEXTROUS,
            "unknown": Handedness.UNKNOWN,
            "inconnu": Handedness.UNKNOWN,
        }
        return aliases.get(normalized, normalized)


class RankedNeighbor(BaseModel):
    participant_id: str
    relation: RelationKind = RelationKind.ADJACENT


class PreferenceResponse(BaseModel):
    participant_id: str
    submitted_at: str = Field(default_factory=utc_now_iso)
    seat_ranking: list[str] = Field(default_factory=list)
    zone_ranking: list[str] = Field(default_factory=list)
    desired_neighbors: list[RankedNeighbor] = Field(default_factory=list)
    avoided_neighbors: list[RankedNeighbor] = Field(default_factory=list)
    priority_mode: Literal["seat", "neighbors", "balanced", "none"] = "balanced"
    notes: str = ""
    revision: int = 1

    @field_validator("seat_ranking", "zone_ranking")
    @classmethod
    def unique_rankings(cls, value: list[str]) -> list[str]:
        return list(dict.fromkeys(value))

    @field_validator("desired_neighbors", "avoided_neighbors")
    @classmethod
    def unique_neighbors(cls, value: list[RankedNeighbor]) -> list[RankedNeighbor]:
        seen: set[tuple[str, str]] = set()
        result: list[RankedNeighbor] = []
        for item in value:
            key = (item.participant_id, item.relation.value)
            if key not in seen:
                seen.add(key)
                result.append(item)
        return result


class _ExtensionRuleParams(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")


class GroupSpreadTableParams(_ExtensionRuleParams):
    participant_ids: list[str] = Field(
        min_length=2,
        validation_alias=AliasChoices("participant_ids", "participants"),
    )
    max_per_table: int = Field(default=1, ge=1, le=500)

    @field_validator("participant_ids")
    @classmethod
    def unique_participants(cls, value: list[str]) -> list[str]:
        unique = list(dict.fromkeys(value))
        if len(unique) < 2:
            raise ValueError("group_spread_table requires at least two distinct participants")
        return unique


class NoGoParams(_ExtensionRuleParams):
    participant_id: str = Field(
        validation_alias=AliasChoices("participant_id", "participant")
    )
    seat_ids: list[str] = Field(
        default_factory=list,
        validation_alias=AliasChoices("seat_ids", "seats"),
    )
    tags: list[str] = Field(
        default_factory=list,
        validation_alias=AliasChoices("tags", "seat_tags"),
    )
    mode: Literal["any", "all"] = "any"

    @model_validator(mode="after")
    def has_a_forbidden_target(self) -> "NoGoParams":
        if not self.seat_ids and not self.tags:
            raise ValueError("no_go requires at least one seat_id or seat tag")
        self.seat_ids = list(dict.fromkeys(self.seat_ids))
        self.tags = list(dict.fromkeys(self.tags))
        return self


class AlternateTagParams(_ExtensionRuleParams):
    tag: str | None = None
    tag_key: str | None = None
    values: list[str] = Field(default_factory=list)
    relation: Literal["adjacent", "near", "same_table", "same_cluster"] = "adjacent"

    @model_validator(mode="after")
    def has_a_tag_selector(self) -> "AlternateTagParams":
        if not self.tag and not self.tag_key:
            raise ValueError("alternate_tag requires tag or tag_key")
        self.values = list(dict.fromkeys(self.values))
        return self


class MaxBoardDistanceParams(_ExtensionRuleParams):
    participant_id: str = Field(
        validation_alias=AliasChoices("participant_id", "participant")
    )
    max_distance: float = Field(gt=0, le=10_000)


EXTENSION_RULE_PARAM_MODELS: dict[RuleKind, type[_ExtensionRuleParams]] = {
    RuleKind.GROUP_SPREAD_TABLE: GroupSpreadTableParams,
    RuleKind.NO_GO: NoGoParams,
    RuleKind.ALTERNATE_TAG: AlternateTagParams,
    RuleKind.MAX_BOARD_DISTANCE: MaxBoardDistanceParams,
}


class Rule(BaseModel):
    id: str = Field(default_factory=lambda: new_id("rule"))
    name: str
    kind: RuleKind
    hard: bool = True
    weight: int = Field(default=100, ge=1, le=1_000_000)
    params: dict[str, Any] = Field(default_factory=dict)
    enabled: bool = True
    source: Literal["admin", "medical", "import", "system"] = "admin"
    explanation: str = ""

    @model_validator(mode="after")
    def validate_extension_params(self) -> "Rule":
        params_model = EXTENSION_RULE_PARAM_MODELS.get(self.kind)
        if params_model is not None:
            self.params = params_model.model_validate(self.params).model_dump(mode="json")
        return self


class SolverSettings(BaseModel):
    time_limit_seconds: float = Field(default=12.0, ge=0.5, le=600)
    num_workers: int = Field(default=1, ge=1, le=64)
    random_seed: int = 20260822
    fairness_enabled: bool = True
    fairness_tolerance: int = Field(default=0, ge=0, le=1000)
    arrival_policy: Literal["equal", "linear", "exponential"] = "equal"
    arrival_bonus_percent: int = Field(default=35, ge=0, le=500)
    seat_preference_weight: int = Field(default=100, ge=0, le=10000)
    neighbor_preference_weight: int = Field(default=100, ge=0, le=10000)
    avoid_neighbor_weight: int = Field(default=130, ge=0, le=10000)
    zone_preference_weight: int = Field(default=45, ge=0, le=10000)
    mutual_bonus: int = Field(default=30, ge=0, le=10000)
    stability_enabled: bool = True
    auto_solve_on_response: bool = True
    default_relation: RelationKind = RelationKind.ADJACENT
    deterministic_tiebreak: bool = True
    diagnostic_time_limit_seconds: float = Field(default=8.0, ge=0.5, le=120)
    accessibility_hard: bool = False
    hard_front_fraction: float = Field(default=0.32, gt=0, le=1)
    vision_weight: int = Field(default=8, ge=0, le=10_000)
    hearing_weight: int = Field(default=6, ge=0, le=10_000)
    hand_collision: Literal["off", "soft", "hard"] = "hard"
    hand_collision_weight: int = Field(default=500, ge=0, le=1_000_000)
    grade_balance_weight: int = Field(default=0, ge=0, le=1_000_000)
    grade_mix_weight: int = Field(default=0, ge=0, le=1_000_000)
    grade_mix_min_difference: float = Field(default=2.0, ge=0, le=100)


class ProjectSnapshot(BaseModel):
    id: str = Field(default_factory=lambda: new_id("project"))
    name: str = "Nouveau plan de classe"
    slug: str = Field(default_factory=lambda: uuid4().hex[:10])
    admin_token: str = Field(default_factory=lambda: uuid4().hex)
    created_at: str = Field(default_factory=utc_now_iso)
    updated_at: str = Field(default_factory=utc_now_iso)
    room: Room = Field(default_factory=Room)
    participants: list[Participant] = Field(default_factory=list)
    responses: list[PreferenceResponse] = Field(default_factory=list)
    rules: list[Rule] = Field(default_factory=list)
    settings: SolverSettings = Field(default_factory=SolverSettings)
    previous_assignment: dict[str, str] = Field(default_factory=dict)
    published: bool = True

    @model_validator(mode="after")
    def validate_project(self) -> "ProjectSnapshot":
        participant_ids = {person.id for person in self.participants}
        seat_ids = {seat.id for seat in self.room.seats if seat.enabled}
        if len(participant_ids) != len(self.participants):
            raise ValueError("Participant IDs must be unique")
        for response in self.responses:
            if response.participant_id not in participant_ids:
                raise ValueError(f"Response references unknown participant: {response.participant_id}")
            unknown_seats = set(response.seat_ranking) - seat_ids
            if unknown_seats:
                raise ValueError(f"Response references unknown seats: {sorted(unknown_seats)}")
            for item in [*response.desired_neighbors, *response.avoided_neighbors]:
                if item.participant_id not in participant_ids:
                    raise ValueError(f"Response references unknown neighbor: {item.participant_id}")
        return self


class StageResult(BaseModel):
    name: str
    status: str
    objective_value: int | float | None = None
    best_bound: int | float | None = None
    relative_gap: float | None = None
    wall_time_seconds: float = 0


class PersonResult(BaseModel):
    participant_id: str
    seat_id: str
    satisfaction: int = 1000
    raw_score: int = 0
    response_received: bool = False
    moved_from_previous: bool = False
    breakdown: list[dict[str, Any]] = Field(default_factory=list)


class SolveResult(BaseModel):
    status: Literal["optimal", "feasible", "infeasible", "unknown", "error"]
    assignment: dict[str, str] = Field(default_factory=dict)
    people: list[PersonResult] = Field(default_factory=list)
    stages: list[StageResult] = Field(default_factory=list)
    min_satisfaction: int | None = None
    average_satisfaction: float | None = None
    weighted_total: int | None = None
    unchanged_count: int | None = None
    diagnostics: list[dict[str, Any]] = Field(default_factory=list)
    hard_constraints_verified: bool = False
    generated_at: str = Field(default_factory=utc_now_iso)
    solver: str = "OR-Tools CP-SAT"
    model_stats: dict[str, Any] = Field(default_factory=dict)
