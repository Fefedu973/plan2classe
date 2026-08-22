from __future__ import annotations

from dataclasses import dataclass, field
from itertools import combinations
from math import exp
from typing import Any, Iterable

from app.models import (
    Handedness,
    Participant,
    PreferenceResponse,
    ProjectSnapshot,
    RelationKind,
    Rule,
    RuleKind,
)
from app.solver.geometry import RoomGeometry


RANK_POINTS = (100, 72, 54, 41, 32, 25, 19, 14, 10, 7, 5, 3)


def rank_points(rank: int) -> int:
    if rank < len(RANK_POINTS):
        return RANK_POINTS[rank]
    return max(1, round(100 / (rank + 2)))


@dataclass(frozen=True)
class PairCondition:
    kind: str
    relation: str | None = None
    threshold: float | None = None
    negate: bool = False

    @property
    def key(self) -> tuple[Any, ...]:
        return (self.kind, self.relation, self.threshold, self.negate)

    @property
    def directional(self) -> bool:
        return self.kind == "relation" and self.relation == RelationKind.HAND_CONFLICT.value

    def matches(self, geometry: RoomGeometry, seat_a: str, seat_b: str) -> bool:
        if self.kind == "relation":
            result = geometry.related(seat_a, seat_b, self.relation or RelationKind.ADJACENT)
        elif self.kind == "min_distance":
            result = geometry.distance(seat_a, seat_b) >= float(self.threshold or 0)
        elif self.kind == "max_distance":
            result = geometry.distance(seat_a, seat_b) <= float(self.threshold or 0)
        else:
            raise ValueError(f"Unknown pair condition: {self.kind}")
        return not result if self.negate else result


@dataclass(frozen=True)
class UnaryScoreSpec:
    person_id: str
    seat_id: str
    coefficient: int
    label: str
    category: str
    source_id: str


@dataclass(frozen=True)
class PairScoreSpec:
    person_a: str
    person_b: str
    condition: PairCondition
    beneficiaries: tuple[str, ...]
    coefficient: int
    label: str
    category: str
    source_id: str


@dataclass
class ScoringPlan:
    unary: list[UnaryScoreSpec] = field(default_factory=list)
    pair: list[PairScoreSpec] = field(default_factory=list)
    person_weights: dict[str, int] = field(default_factory=dict)
    responded: set[str] = field(default_factory=set)
    global_soft_rules: list[Rule] = field(default_factory=list)


def _category_multipliers(response: PreferenceResponse) -> tuple[float, float]:
    if response.priority_mode == "seat":
        return 1.40, 0.70
    if response.priority_mode == "neighbors":
        return 0.70, 1.40
    return 1.0, 1.0


def _response_map(snapshot: ProjectSnapshot) -> dict[str, PreferenceResponse]:
    # A participant may revise a response. Keep the latest revision / timestamp.
    latest: dict[str, PreferenceResponse] = {}
    for response in snapshot.responses:
        current = latest.get(response.participant_id)
        if current is None or (response.revision, response.submitted_at) >= (
            current.revision,
            current.submitted_at,
        ):
            latest[response.participant_id] = response
    return latest


def _arrival_weights(
    participants: Iterable[Participant],
    responses: dict[str, PreferenceResponse],
    policy: str,
    bonus_percent: int,
) -> dict[str, int]:
    people = list(participants)
    ordered = sorted(
        (response for response in responses.values()),
        key=lambda item: item.submitted_at,
    )
    rank = {response.participant_id: index for index, response in enumerate(ordered)}
    count = len(ordered)
    result: dict[str, int] = {}
    for person in people:
        factor = 1.0
        if person.id in rank and policy != "equal" and count:
            position = rank[person.id]
            bonus = bonus_percent / 100
            if policy == "linear":
                fraction = 1.0 if count == 1 else (count - 1 - position) / (count - 1)
                factor += bonus * fraction
            elif policy == "exponential":
                factor += bonus * exp(-position / max(1.0, count / 4))
        result[person.id] = max(1, round(1000 * factor * person.priority))
    return result


def _person_pairs_for_tag_rule(snapshot: ProjectSnapshot, rule: Rule) -> list[tuple[str, str]]:
    key = str(rule.params.get("tag_key", "group"))
    values = set(map(str, rule.params.get("values", [])))
    participants = [person for person in snapshot.participants if person.active]
    pairs: list[tuple[str, str]] = []
    for a, b in combinations(participants, 2):
        a_value = a.tags.get(key)
        b_value = b.tags.get(key)
        if a_value is None or b_value is None or a_value != b_value:
            continue
        if values and a_value not in values:
            continue
        pairs.append((a.id, b.id))
    return pairs


def participants_for_alternate_tag(snapshot: ProjectSnapshot, rule: Rule) -> list[str]:
    """Select the participants targeted by the compact POC's alternate_tag rule."""

    tag = rule.params.get("tag")
    tag_key = rule.params.get("tag_key")
    values = set(map(str, rule.params.get("values", [])))
    selected: list[str] = []
    for person in snapshot.participants:
        if not person.active:
            continue
        if tag is not None:
            marker = str(tag)
            if marker in person.tags or marker in person.tags.values():
                selected.append(person.id)
            continue
        if tag_key is None:
            continue
        value = person.tags.get(str(tag_key))
        if value is not None and (not values or value in values):
            selected.append(person.id)
    return selected


def build_scoring_plan(snapshot: ProjectSnapshot, geometry: RoomGeometry) -> ScoringPlan:
    settings = snapshot.settings
    plan = ScoringPlan()
    responses = _response_map(snapshot)
    plan.responded = set(responses)
    plan.person_weights = _arrival_weights(
        (person for person in snapshot.participants if person.active),
        responses,
        settings.arrival_policy,
        settings.arrival_bonus_percent,
    )
    seat_ids = {seat.id for seat in geometry.seats}

    # Typed accessibility needs from the compact POC are ordinary unary terms,
    # so they participate in the same normalized fairness calculation as seat
    # preferences instead of bypassing it as a hidden global bonus.
    for person in snapshot.participants:
        if not person.active:
            continue
        need_weight = (
            person.vision_need * settings.vision_weight
            + person.hearing_need * settings.hearing_weight
        )
        if need_weight <= 0:
            continue
        for seat in geometry.seats:
            coefficient = max(0, round(geometry.front_score(seat.id) * need_weight / 10))
            if coefficient == 0:
                continue
            plan.unary.append(
                UnaryScoreSpec(
                    person.id,
                    seat.id,
                    coefficient,
                    "Proximité du tableau (besoin vision/audition)",
                    "accessibility",
                    f"accessibility:{person.id}",
                )
            )

    if settings.hand_collision == "soft" and settings.hand_collision_weight:
        right_handed = [
            person.id
            for person in snapshot.participants
            if person.active and person.handedness == Handedness.RIGHT
        ]
        left_handed = [
            person.id
            for person in snapshot.participants
            if person.active and person.handedness == Handedness.LEFT
        ]
        for right_id in right_handed:
            for left_id in left_handed:
                if right_id == left_id:
                    continue
                plan.pair.append(
                    PairScoreSpec(
                        right_id,
                        left_id,
                        PairCondition(
                            kind="relation", relation=RelationKind.HAND_CONFLICT.value
                        ),
                        (right_id, left_id),
                        -settings.hand_collision_weight,
                        "Collision directionnelle droitier/gaucher",
                        "hand_collision",
                        f"hand_collision:{right_id}:{left_id}",
                    )
                )

    if settings.grade_mix_weight:
        graded = [
            person
            for person in snapshot.participants
            if person.active and person.grade is not None
        ]
        for a, b in combinations(graded, 2):
            if abs(float(a.grade) - float(b.grade)) < settings.grade_mix_min_difference:
                continue
            plan.pair.append(
                PairScoreSpec(
                    a.id,
                    b.id,
                    PairCondition(kind="relation", relation=RelationKind.ADJACENT.value),
                    (a.id, b.id),
                    settings.grade_mix_weight,
                    "Mix de niveaux complémentaires",
                    "grade_mix",
                    f"grade_mix:{a.id}:{b.id}",
                )
            )

    for person_id, response in responses.items():
        seat_multiplier, neighbor_multiplier = _category_multipliers(response)
        for rank, seat_id in enumerate(response.seat_ranking):
            if seat_id not in seat_ids:
                continue
            coefficient = round(
                rank_points(rank)
                * settings.seat_preference_weight
                * seat_multiplier
            )
            plan.unary.append(
                UnaryScoreSpec(
                    person_id=person_id,
                    seat_id=seat_id,
                    coefficient=coefficient,
                    label=f"Choix de place n°{rank + 1}",
                    category="seat_preference",
                    source_id=f"response:{person_id}:seat:{rank}",
                )
            )

        for rank, tag in enumerate(response.zone_ranking):
            coefficient = round(
                rank_points(rank)
                * settings.zone_preference_weight
                * seat_multiplier
            )
            for seat in geometry.seats:
                if tag in seat.tags:
                    plan.unary.append(
                        UnaryScoreSpec(
                            person_id=person_id,
                            seat_id=seat.id,
                            coefficient=coefficient,
                            label=f"Zone préférée « {tag} » n°{rank + 1}",
                            category="zone_preference",
                            source_id=f"response:{person_id}:zone:{rank}:{tag}",
                        )
                    )

        for rank, item in enumerate(response.desired_neighbors):
            if item.participant_id == person_id:
                continue
            coefficient = round(
                rank_points(rank)
                * settings.neighbor_preference_weight
                * neighbor_multiplier
            )
            plan.pair.append(
                PairScoreSpec(
                    person_a=person_id,
                    person_b=item.participant_id,
                    condition=PairCondition(kind="relation", relation=item.relation.value),
                    beneficiaries=(person_id,),
                    coefficient=coefficient,
                    label=f"Voisin souhaité n°{rank + 1}",
                    category="desired_neighbor",
                    source_id=f"response:{person_id}:desired:{rank}",
                )
            )

        for rank, item in enumerate(response.avoided_neighbors):
            if item.participant_id == person_id:
                continue
            coefficient = -round(
                rank_points(rank)
                * settings.avoid_neighbor_weight
                * neighbor_multiplier
            )
            plan.pair.append(
                PairScoreSpec(
                    person_a=person_id,
                    person_b=item.participant_id,
                    condition=PairCondition(kind="relation", relation=item.relation.value),
                    beneficiaries=(person_id,),
                    coefficient=coefficient,
                    label=f"Voisin à éviter n°{rank + 1}",
                    category="avoided_neighbor",
                    source_id=f"response:{person_id}:avoided:{rank}",
                )
            )

    # Reciprocal wishes receive a deliberately small bonus. It improves global
    # efficiency without letting a clique dominate the max-min fairness stage.
    desired = {
        (response.participant_id, item.participant_id, item.relation.value)
        for response in responses.values()
        for item in response.desired_neighbors
    }
    seen_mutual: set[tuple[str, str, str]] = set()
    for a, b, relation in desired:
        key = (min(a, b), max(a, b), relation)
        if key in seen_mutual or (b, a, relation) not in desired:
            continue
        seen_mutual.add(key)
        plan.pair.append(
            PairScoreSpec(
                person_a=a,
                person_b=b,
                condition=PairCondition(kind="relation", relation=relation),
                beneficiaries=(a, b),
                coefficient=settings.mutual_bonus,
                label="Choix de voisin réciproque",
                category="mutual_bonus",
                source_id=f"mutual:{key[0]}:{key[1]}:{relation}",
            )
        )

    for rule in snapshot.rules:
        if not rule.enabled or rule.hard:
            continue
        p = rule.params
        weight = int(rule.weight)
        if rule.kind == RuleKind.FIXED_SEAT:
            plan.unary.append(
                UnaryScoreSpec(
                    str(p["participant_id"]),
                    str(p["seat_id"]),
                    weight,
                    rule.name,
                    "admin_rule",
                    rule.id,
                )
            )
        elif rule.kind == RuleKind.FORBIDDEN_SEATS:
            for seat_id in p.get("seat_ids", []):
                plan.unary.append(
                    UnaryScoreSpec(
                        str(p["participant_id"]),
                        str(seat_id),
                        -weight,
                        rule.name,
                        "admin_rule",
                        rule.id,
                    )
                )
        elif rule.kind == RuleKind.NO_GO:
            person_id = str(p["participant_id"])
            forbidden = set(map(str, p.get("seat_ids", [])))
            forbidden |= geometry.seats_with_tags(
                list(map(str, p.get("tags", []))), str(p.get("mode", "any"))
            )
            for seat_id in forbidden:
                plan.unary.append(
                    UnaryScoreSpec(
                        person_id,
                        seat_id,
                        -weight,
                        rule.name,
                        "admin_rule",
                        rule.id,
                    )
                )
        elif rule.kind in (RuleKind.REQUIRE_SEAT_TAGS, RuleKind.FORBID_SEAT_TAGS):
            matching = geometry.seats_with_tags(
                list(map(str, p.get("tags", []))), str(p.get("mode", "any"))
            )
            coefficient = weight if rule.kind == RuleKind.REQUIRE_SEAT_TAGS else -weight
            for seat_id in matching:
                plan.unary.append(
                    UnaryScoreSpec(
                        str(p["participant_id"]),
                        seat_id,
                        coefficient,
                        rule.name,
                        "admin_rule",
                        rule.id,
                    )
                )
        elif rule.kind == RuleKind.PAIR_RELATION:
            required = bool(p.get("required", True))
            plan.pair.append(
                PairScoreSpec(
                    str(p["a"]),
                    str(p["b"]),
                    PairCondition(
                        kind="relation",
                        relation=str(p.get("relation", RelationKind.ADJACENT.value)),
                    ),
                    (str(p["a"]), str(p["b"])),
                    weight if required else -weight,
                    rule.name,
                    "admin_rule",
                    rule.id,
                )
            )
        elif rule.kind in (RuleKind.GROUP_SAME_TABLE, RuleKind.GROUP_DIFFERENT_TABLES):
            ids = list(map(str, p.get("participant_ids", [])))
            for a, b in combinations(ids, 2):
                plan.pair.append(
                    PairScoreSpec(
                        a,
                        b,
                        PairCondition(kind="relation", relation=RelationKind.SAME_TABLE.value),
                        (a, b),
                        weight if rule.kind == RuleKind.GROUP_SAME_TABLE else -weight,
                        rule.name,
                        "admin_rule",
                        rule.id,
                    )
                )
        elif rule.kind in (RuleKind.MIN_DISTANCE, RuleKind.MAX_DISTANCE):
            condition = PairCondition(
                kind="min_distance" if rule.kind == RuleKind.MIN_DISTANCE else "max_distance",
                threshold=float(p.get("distance", 0)),
            )
            plan.pair.append(
                PairScoreSpec(
                    str(p["a"]),
                    str(p["b"]),
                    condition,
                    (str(p["a"]), str(p["b"])),
                    weight,
                    rule.name,
                    "admin_rule",
                    rule.id,
                )
            )
        elif rule.kind == RuleKind.TAG_NOT_ADJACENT:
            for a, b in _person_pairs_for_tag_rule(snapshot, rule):
                plan.pair.append(
                    PairScoreSpec(
                        a,
                        b,
                        PairCondition(kind="relation", relation=RelationKind.ADJACENT.value),
                        (a, b),
                        -weight,
                        rule.name,
                        "admin_rule",
                        rule.id,
                    )
                )
        elif rule.kind == RuleKind.ALTERNATE_TAG:
            relation = str(p.get("relation", RelationKind.ADJACENT.value))
            for a, b in combinations(participants_for_alternate_tag(snapshot, rule), 2):
                plan.pair.append(
                    PairScoreSpec(
                        a,
                        b,
                        PairCondition(kind="relation", relation=relation),
                        (a, b),
                        -weight,
                        rule.name,
                        "admin_rule",
                        rule.id,
                    )
                )
        elif rule.kind == RuleKind.MAX_BOARD_DISTANCE:
            person_id = str(p["participant_id"])
            maximum = float(p["max_distance"])
            for seat in geometry.seats:
                if geometry.board_distance(seat.id) <= maximum:
                    plan.unary.append(
                        UnaryScoreSpec(
                            person_id,
                            seat.id,
                            weight,
                            rule.name,
                            "admin_rule",
                            rule.id,
                        )
                    )
        elif rule.kind == RuleKind.GROUP_SPREAD_TABLE:
            plan.global_soft_rules.append(rule)
        else:
            # Cardinality/balance rules need dedicated integer violation vars.
            plan.global_soft_rules.append(rule)

    return plan
