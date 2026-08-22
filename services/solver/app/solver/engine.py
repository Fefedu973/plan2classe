from __future__ import annotations

from dataclasses import dataclass, field
from itertools import combinations
from math import isfinite
from time import monotonic
from typing import Any, Iterable

from ortools.sat.python import cp_model

from app.models import (
    Handedness,
    PersonResult,
    ProjectSnapshot,
    RelationKind,
    Rule,
    RuleKind,
    SolveResult,
    StageResult,
)
from app.solver.geometry import RoomGeometry
from app.solver.scoring import (
    PairCondition,
    PairScoreSpec,
    ScoringPlan,
    UnaryScoreSpec,
    build_scoring_plan,
    participants_for_alternate_tag,
)
from app.solver.validation import validate_assignment


FEASIBLE_STATUSES = (cp_model.OPTIMAL, cp_model.FEASIBLE)


@dataclass
class EvaluatedTerm:
    beneficiaries: tuple[str, ...]
    coefficient: int
    label: str
    category: str
    source_id: str
    variable: Any


@dataclass
class BuildArtifacts:
    model: cp_model.CpModel
    x: dict[tuple[str, str], Any]
    seat_of: dict[str, Any]
    condition_vars: dict[tuple[str, str, tuple[Any, ...]], Any]
    raw_scores: dict[str, Any]
    satisfaction: dict[str, Any]
    min_satisfaction: Any
    weighted_total: Any
    unchanged_count: Any
    tiebreak: Any
    assumption_map: dict[int, Rule]
    evaluated_terms: list[EvaluatedTerm]
    model_stats: dict[str, int]


@dataclass
class SolveLocks:
    min_satisfaction: int | None = None
    weighted_total: int | None = None
    unchanged_count: int | None = None


class SeatingOptimizer:
    """Exact lexicographic classroom seating optimizer using CP-SAT.

    It solves a graph-constrained assignment problem. Unary preferences resemble
    a weighted bipartite assignment, while neighbor/table/distance preferences
    introduce quadratic terms. These terms are linearized with Boolean relation
    variables backed by allowed-assignment tables.
    """

    def __init__(self, snapshot: ProjectSnapshot):
        self.snapshot = snapshot
        self.participants = [person for person in snapshot.participants if person.active]
        self.people_by_id = {person.id: person for person in self.participants}
        self.geometry = RoomGeometry(snapshot.room)
        self.seats = self.geometry.seats
        self.seat_ids = [seat.id for seat in self.seats]
        self.person_ids = [person.id for person in self.participants]
        self.scoring = build_scoring_plan(snapshot, self.geometry)
        self.hard_rules = [rule for rule in snapshot.rules if rule.enabled and rule.hard]
        self.hard_rules.extend(self._implicit_hard_rules())

    def _implicit_hard_rules(self) -> list[Rule]:
        """Turn typed built-in needs into explainable assumption-backed rules."""

        rules: list[Rule] = []
        settings = self.snapshot.settings
        if settings.accessibility_hard and self.seats:
            front = self.geometry.front_seat_ids(settings.hard_front_fraction)
            cutoff = max((self.geometry.board_distance(seat_id) for seat_id in front), default=0)
            for person in self.participants:
                if max(person.vision_need, person.hearing_need) < 3:
                    continue
                rules.append(
                    Rule(
                        id=f"system_accessibility__{person.id}",
                        name=f"{person.name} doit être dans la zone avant",
                        kind=RuleKind.MAX_BOARD_DISTANCE,
                        hard=True,
                        source="system",
                        explanation="Besoin vision/audition élevé.",
                        params={
                            "participant_id": person.id,
                            "max_distance": max(cutoff, 1e-9),
                        },
                    )
                )

        if settings.hand_collision == "hard":
            right_handed = [
                person
                for person in self.participants
                if person.handedness == Handedness.RIGHT
            ]
            left_handed = [
                person
                for person in self.participants
                if person.handedness == Handedness.LEFT
            ]
            for right in right_handed:
                for left in left_handed:
                    if right.id == left.id:
                        continue
                    rules.append(
                        Rule(
                            id=f"system_hand_collision__{right.id}__{left.id}",
                            name=f"Éviter la collision de bras entre {right.name} et {left.name}",
                            kind=RuleKind.PAIR_RELATION,
                            hard=True,
                            source="system",
                            explanation=(
                                "Un droitier placé à gauche d'un gaucher partage la même zone d'écriture."
                            ),
                            params={
                                "a": right.id,
                                "b": left.id,
                                "relation": RelationKind.HAND_CONFLICT.value,
                                "required": False,
                            },
                        )
                    )
        return rules

    # ------------------------------------------------------------------ public
    def solve(self) -> SolveResult:
        preflight = self._preflight_diagnostics()
        if preflight:
            return SolveResult(
                status="infeasible",
                diagnostics=preflight,
                model_stats=self._base_stats(),
            )

        settings = self.snapshot.settings
        total_budget = max(0.5, settings.time_limit_seconds)
        primary_stage_count = 2 if settings.fairness_enabled else 1
        optional_stage_count = int(settings.stability_enabled and bool(self.snapshot.previous_assignment))
        optional_stage_count += int(settings.deterministic_tiebreak)
        stage_count = primary_stage_count + optional_stage_count
        per_stage = max(0.25, total_budget / max(1, stage_count))

        stages: list[StageResult] = []
        locks = SolveLocks()
        final_artifacts: BuildArtifacts | None = None
        final_solver: cp_model.CpSolver | None = None
        primary_optimal = True

        if settings.fairness_enabled:
            stage, artifacts, solver, status = self._run_stage(
                "max-min fairness", "fairness", locks, per_stage
            )
            stages.append(stage)
            if status not in FEASIBLE_STATUSES:
                return self._failed_result(status, stages, artifacts, solver)
            locks.min_satisfaction = int(solver.Value(artifacts.min_satisfaction))
            primary_optimal &= status == cp_model.OPTIMAL
            final_artifacts, final_solver = artifacts, solver

        stage, artifacts, solver, status = self._run_stage(
            "weighted satisfaction", "total", locks, per_stage
        )
        stages.append(stage)
        if status not in FEASIBLE_STATUSES:
            return self._failed_result(status, stages, artifacts, solver)
        locks.weighted_total = int(solver.Value(artifacts.weighted_total))
        if locks.min_satisfaction is None:
            locks.min_satisfaction = int(solver.Value(artifacts.min_satisfaction))
        primary_optimal &= status == cp_model.OPTIMAL
        final_artifacts, final_solver = artifacts, solver

        if settings.stability_enabled and self.snapshot.previous_assignment:
            stage, artifacts, solver, status = self._run_stage(
                "stability", "stability", locks, per_stage
            )
            stages.append(stage)
            if status in FEASIBLE_STATUSES:
                locks.unchanged_count = int(solver.Value(artifacts.unchanged_count))
                final_artifacts, final_solver = artifacts, solver
            else:
                # The locked primary solution is still valid; retain it and make
                # the optional-stage failure explicit instead of losing the plan.
                stages[-1].status = f"{stages[-1].status} (primary plan retained)"

        if settings.deterministic_tiebreak:
            stage, artifacts, solver, status = self._run_stage(
                "deterministic tie-break", "tiebreak", locks, per_stage
            )
            stages.append(stage)
            if status in FEASIBLE_STATUSES:
                final_artifacts, final_solver = artifacts, solver
            else:
                stages[-1].status = f"{stages[-1].status} (primary plan retained)"

        assert final_artifacts is not None and final_solver is not None
        assignment = self._extract_assignment(final_artifacts, final_solver)
        violations = validate_assignment(self.snapshot, assignment)
        if violations:
            return SolveResult(
                status="error",
                assignment=assignment,
                stages=stages,
                diagnostics=[
                    {
                        "type": "post_solve_validation",
                        "message": "Le solveur a produit un plan qui échoue à la validation indépendante.",
                        "violations": violations,
                    }
                ],
                hard_constraints_verified=False,
                model_stats=final_artifacts.model_stats,
            )

        people = self._extract_people(final_artifacts, final_solver, assignment)
        satisfactions = [
            person.satisfaction for person in people if person.response_received or person.breakdown
        ]
        return SolveResult(
            status="optimal" if primary_optimal else "feasible",
            assignment=assignment,
            people=people,
            stages=stages,
            min_satisfaction=min(satisfactions) if satisfactions else 1000,
            average_satisfaction=(sum(satisfactions) / len(satisfactions)) if satisfactions else 1000,
            weighted_total=int(final_solver.Value(final_artifacts.weighted_total)),
            unchanged_count=int(final_solver.Value(final_artifacts.unchanged_count)),
            diagnostics=[],
            hard_constraints_verified=True,
            model_stats=final_artifacts.model_stats,
        )

    # --------------------------------------------------------------- stage flow
    def _run_stage(
        self,
        display_name: str,
        objective: str,
        locks: SolveLocks,
        time_limit: float,
    ) -> tuple[StageResult, BuildArtifacts, cp_model.CpSolver, int]:
        artifacts = self._build_model(locks=locks, objective=objective)
        solver = self._new_solver(time_limit)
        start = monotonic()
        status = solver.Solve(artifacts.model)
        elapsed = monotonic() - start
        stage = self._stage_result(display_name, objective, artifacts, solver, status, elapsed)
        return stage, artifacts, solver, status

    def _new_solver(self, time_limit: float) -> cp_model.CpSolver:
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = max(0.05, time_limit)
        solver.parameters.num_search_workers = self.snapshot.settings.num_workers
        solver.parameters.random_seed = self.snapshot.settings.random_seed
        solver.parameters.log_search_progress = False
        # With one worker and a fixed seed, results are reproducible. Users can
        # raise workers for speed while retaining the final deterministic stage.
        return solver

    def _stage_result(
        self,
        name: str,
        objective: str,
        artifacts: BuildArtifacts,
        solver: cp_model.CpSolver,
        status: int,
        elapsed: float,
    ) -> StageResult:
        status_name = solver.StatusName(status)
        objective_var = {
            "fairness": artifacts.min_satisfaction,
            "total": artifacts.weighted_total,
            "stability": artifacts.unchanged_count,
            "tiebreak": artifacts.tiebreak,
        }[objective]
        value: int | None = None
        bound: float | None = None
        gap: float | None = None
        if status in FEASIBLE_STATUSES:
            value = int(solver.Value(objective_var))
            bound = float(solver.BestObjectiveBound())
            denominator = max(1.0, abs(float(value)))
            gap = abs(bound - float(value)) / denominator
            if status == cp_model.OPTIMAL:
                gap = 0.0
        return StageResult(
            name=name,
            status=status_name,
            objective_value=value,
            best_bound=bound,
            relative_gap=gap,
            wall_time_seconds=elapsed,
        )

    # --------------------------------------------------------------- model build
    def _build_model(
        self,
        locks: SolveLocks,
        objective: str | None,
        active_hard_rule_ids: set[str] | None = None,
        use_assumptions: bool = True,
    ) -> BuildArtifacts:
        model = cp_model.CpModel()
        person_ids = self.person_ids
        seat_ids = self.seat_ids
        seat_index = {seat_id: index for index, seat_id in enumerate(seat_ids)}

        x: dict[tuple[str, str], Any] = {}
        for person_id in person_ids:
            for seat_id in seat_ids:
                x[(person_id, seat_id)] = model.NewBoolVar(f"x__{person_id}__{seat_id}")

        for person_id in person_ids:
            model.AddExactlyOne(x[(person_id, seat_id)] for seat_id in seat_ids)
        for seat_id in seat_ids:
            model.AddAtMostOne(x[(person_id, seat_id)] for person_id in person_ids)

        seat_of: dict[str, Any] = {}
        for person_id in person_ids:
            var = model.NewIntVar(0, max(0, len(seat_ids) - 1), f"seat_of__{person_id}")
            model.Add(var == sum(seat_index[seat_id] * x[(person_id, seat_id)] for seat_id in seat_ids))
            seat_of[person_id] = var

        condition_vars: dict[tuple[str, str, tuple[Any, ...]], Any] = {}

        def condition_var(person_a: str, person_b: str, condition: PairCondition) -> Any:
            if person_a == person_b:
                raise ValueError("A pair condition needs two different participants")
            if condition.directional:
                a, b = person_a, person_b
            else:
                a, b = sorted((person_a, person_b))
            key = (a, b, condition.key)
            existing = condition_vars.get(key)
            if existing is not None:
                return existing
            met = model.NewBoolVar(f"condition__{len(condition_vars)}")
            tuples: list[tuple[int, int, int]] = []
            for a_index, seat_a in enumerate(seat_ids):
                for b_index, seat_b in enumerate(seat_ids):
                    matches = condition.matches(self.geometry, seat_a, seat_b)
                    tuples.append((a_index, b_index, int(matches)))
            model.AddAllowedAssignments([seat_of[a], seat_of[b], met], tuples)
            condition_vars[key] = met
            return met

        assumption_map: dict[int, Rule] = {}
        active_ids = active_hard_rule_ids
        for rule in self.hard_rules:
            if active_ids is not None and rule.id not in active_ids:
                continue
            assumption = None
            if use_assumptions:
                assumption = model.NewBoolVar(f"assume__{rule.id}")
                model.AddAssumption(assumption)
                assumption_map[assumption.Index()] = rule
            self._add_hard_rule(model, x, condition_var, rule, assumption)

        evaluated_terms: list[EvaluatedTerm] = []
        terms_by_person: dict[str, list[tuple[int, Any]]] = {person_id: [] for person_id in person_ids}
        unary_totals: dict[str, dict[str, int]] = {person_id: {} for person_id in person_ids}
        pair_coefficients: dict[str, list[int]] = {person_id: [] for person_id in person_ids}

        for term in self.scoring.unary:
            if term.person_id not in self.people_by_id or term.seat_id not in seat_index:
                continue
            var = x[(term.person_id, term.seat_id)]
            terms_by_person[term.person_id].append((term.coefficient, var))
            unary_totals[term.person_id][term.seat_id] = (
                unary_totals[term.person_id].get(term.seat_id, 0) + term.coefficient
            )
            evaluated_terms.append(
                EvaluatedTerm(
                    (term.person_id,), term.coefficient, term.label, term.category, term.source_id, var
                )
            )

        for term in self.scoring.pair:
            if term.person_a not in self.people_by_id or term.person_b not in self.people_by_id:
                continue
            var = condition_var(term.person_a, term.person_b, term.condition)
            for beneficiary in term.beneficiaries:
                if beneficiary in terms_by_person:
                    terms_by_person[beneficiary].append((term.coefficient, var))
                    pair_coefficients[beneficiary].append(term.coefficient)
            evaluated_terms.append(
                EvaluatedTerm(
                    term.beneficiaries,
                    term.coefficient,
                    term.label,
                    term.category,
                    term.source_id,
                    var,
                )
            )

        global_soft_terms: list[tuple[int, Any]] = []
        self._add_global_soft_rules(model, x, global_soft_terms)
        self._add_grade_balance_terms(model, x, global_soft_terms)

        raw_scores: dict[str, Any] = {}
        satisfaction: dict[str, Any] = {}
        fairness_people: list[str] = []
        for person_id in person_ids:
            terms = terms_by_person[person_id]
            # Unary terms are mutually exclusive by seat, so their true bound is
            # the best/worst aggregate value of one seat—not the sum of every
            # ranked seat. Pair bounds remain conservative because several
            # social relations may be fulfilled simultaneously.
            seat_values = [unary_totals[person_id].get(seat_id, 0) for seat_id in seat_ids]
            unary_lower = min(seat_values, default=0)
            unary_upper = max(seat_values, default=0)
            lower = unary_lower + sum(c for c in pair_coefficients[person_id] if c < 0)
            upper = unary_upper + sum(c for c in pair_coefficients[person_id] if c > 0)
            raw = model.NewIntVar(lower, upper, f"raw_score__{person_id}")
            model.Add(raw == sum(coefficient * var for coefficient, var in terms))
            raw_scores[person_id] = raw

            norm = model.NewIntVar(0, 1000, f"satisfaction__{person_id}")
            score_range = upper - lower
            if score_range <= 0:
                model.Add(norm == 1000)
            else:
                # norm is the integer floor of a 0..1000 affine normalization.
                model.Add(norm * score_range <= (raw - lower) * 1000)
                model.Add((norm + 1) * score_range >= (raw - lower) * 1000 + 1)
                fairness_people.append(person_id)
            satisfaction[person_id] = norm

        min_satisfaction = model.NewIntVar(0, 1000, "min_satisfaction")
        if fairness_people:
            for person_id in fairness_people:
                model.Add(min_satisfaction <= satisfaction[person_id])
        else:
            model.Add(min_satisfaction == 1000)

        person_total = sum(
            self.scoring.person_weights.get(person_id, 1000) * satisfaction[person_id]
            for person_id in person_ids
        )
        max_weighted = sum(self.scoring.person_weights.get(pid, 1000) * 1000 for pid in person_ids)
        # Global cardinality violations can be larger than one. Keep a safe
        # int64 domain instead of accidentally cutting off a valid score.
        weighted_total = model.NewIntVar(
            -9_000_000_000_000_000,
            min(9_000_000_000_000_000, max_weighted + 1_000_000_000_000),
            "weighted_total",
        )
        model.Add(
            weighted_total
            == person_total + sum(coefficient * var for coefficient, var in global_soft_terms)
        )

        unchanged_terms = []
        for person_id, previous_seat in self.snapshot.previous_assignment.items():
            if person_id in self.people_by_id and previous_seat in seat_index:
                unchanged_terms.append(x[(person_id, previous_seat)])
        unchanged_count = model.NewIntVar(0, len(unchanged_terms), "unchanged_count")
        model.Add(unchanged_count == sum(unchanged_terms))

        # A stable pseudo-random coefficient creates a deterministic final order
        # without encoding a pedagogical preference for the top-left seat.
        tie_coefficients: dict[tuple[str, str], int] = {}
        tie_max = 0
        for p_index, person_id in enumerate(person_ids):
            for s_index, seat_id in enumerate(seat_ids):
                coefficient = (((p_index + 1) * 73_856_093) ^ ((s_index + 1) * 19_349_663)) % 1_000_003
                tie_coefficients[(person_id, seat_id)] = coefficient
                tie_max += coefficient
        tiebreak = model.NewIntVar(0, tie_max, "tiebreak")
        model.Add(tiebreak == sum(coef * x[key] for key, coef in tie_coefficients.items()))

        if locks.min_satisfaction is not None:
            tolerance = self.snapshot.settings.fairness_tolerance
            model.Add(min_satisfaction >= max(0, locks.min_satisfaction - tolerance))
        if locks.weighted_total is not None:
            model.Add(weighted_total == locks.weighted_total)
        if locks.unchanged_count is not None:
            model.Add(unchanged_count == locks.unchanged_count)

        if objective == "fairness":
            model.Maximize(min_satisfaction)
        elif objective == "total":
            model.Maximize(weighted_total)
        elif objective == "stability":
            model.Maximize(unchanged_count)
        elif objective == "tiebreak":
            model.Minimize(tiebreak)

        self._add_hints(model, x)
        return BuildArtifacts(
            model=model,
            x=x,
            seat_of=seat_of,
            condition_vars=condition_vars,
            raw_scores=raw_scores,
            satisfaction=satisfaction,
            min_satisfaction=min_satisfaction,
            weighted_total=weighted_total,
            unchanged_count=unchanged_count,
            tiebreak=tiebreak,
            assumption_map=assumption_map,
            evaluated_terms=evaluated_terms,
            model_stats={
                **self._base_stats(),
                "assignment_booleans": len(x),
                "relation_booleans": len(condition_vars),
                "soft_terms": len(evaluated_terms),
            },
        )

    def _add_hard_rule(
        self,
        model: cp_model.CpModel,
        x: dict[tuple[str, str], Any],
        condition_var: Any,
        rule: Rule,
        assumption: Any | None,
    ) -> None:
        p = rule.params

        def add(constraint: Any) -> None:
            if assumption is not None:
                constraint.OnlyEnforceIf(assumption)

        def impossible() -> None:
            add(model.AddBoolOr([]))

        try:
            if rule.kind == RuleKind.FIXED_SEAT:
                key = (str(p["participant_id"]), str(p["seat_id"]))
                if key not in x:
                    impossible()
                else:
                    add(model.Add(x[key] == 1))
            elif rule.kind == RuleKind.FORBIDDEN_SEATS:
                person_id = str(p["participant_id"])
                for seat_id in map(str, p.get("seat_ids", [])):
                    if (person_id, seat_id) in x:
                        add(model.Add(x[(person_id, seat_id)] == 0))
            elif rule.kind == RuleKind.NO_GO:
                person_id = str(p["participant_id"])
                if person_id not in self.people_by_id:
                    impossible()
                    return
                forbidden = set(map(str, p.get("seat_ids", [])))
                forbidden |= self.geometry.seats_with_tags(
                    list(map(str, p.get("tags", []))), str(p.get("mode", "any"))
                )
                for seat_id in forbidden:
                    if (person_id, seat_id) in x:
                        add(model.Add(x[(person_id, seat_id)] == 0))
            elif rule.kind in (RuleKind.REQUIRE_SEAT_TAGS, RuleKind.FORBID_SEAT_TAGS):
                person_id = str(p["participant_id"])
                if person_id not in self.people_by_id:
                    impossible()
                    return
                matching = self.geometry.seats_with_tags(
                    list(map(str, p.get("tags", []))), str(p.get("mode", "any"))
                )
                if rule.kind == RuleKind.REQUIRE_SEAT_TAGS:
                    vars_ = [x[(person_id, seat_id)] for seat_id in matching if (person_id, seat_id) in x]
                    if not vars_:
                        impossible()
                    else:
                        add(model.Add(sum(vars_) == 1))
                else:
                    for seat_id in matching:
                        if (person_id, seat_id) in x:
                            add(model.Add(x[(person_id, seat_id)] == 0))
            elif rule.kind == RuleKind.PAIR_RELATION:
                a, b = str(p["a"]), str(p["b"])
                if a not in self.people_by_id or b not in self.people_by_id or a == b:
                    impossible()
                    return
                condition = PairCondition(
                    kind="relation",
                    relation=str(p.get("relation", RelationKind.ADJACENT.value)),
                )
                met = condition_var(a, b, condition)
                add(model.Add(met == int(bool(p.get("required", True)))))
            elif rule.kind in (RuleKind.GROUP_SAME_TABLE, RuleKind.GROUP_DIFFERENT_TABLES):
                ids = [str(item) for item in p.get("participant_ids", [])]
                if any(item not in self.people_by_id for item in ids):
                    impossible()
                    return
                required = rule.kind == RuleKind.GROUP_SAME_TABLE
                for a, b in combinations(ids, 2):
                    met = condition_var(
                        a,
                        b,
                        PairCondition(kind="relation", relation=RelationKind.SAME_TABLE.value),
                    )
                    add(model.Add(met == int(required)))
            elif rule.kind in (RuleKind.MIN_DISTANCE, RuleKind.MAX_DISTANCE):
                a, b = str(p["a"]), str(p["b"])
                if a not in self.people_by_id or b not in self.people_by_id or a == b:
                    impossible()
                    return
                condition = PairCondition(
                    kind="min_distance" if rule.kind == RuleKind.MIN_DISTANCE else "max_distance",
                    threshold=float(p.get("distance", 0)),
                )
                add(model.Add(condition_var(a, b, condition) == 1))
            elif rule.kind == RuleKind.TAG_NOT_ADJACENT:
                key = str(p.get("tag_key", "group"))
                values = set(map(str, p.get("values", [])))
                candidates = [person for person in self.participants if person.tags.get(key) is not None]
                for a, b in combinations(candidates, 2):
                    value = a.tags.get(key)
                    if value != b.tags.get(key) or (values and value not in values):
                        continue
                    met = condition_var(
                        a.id,
                        b.id,
                        PairCondition(kind="relation", relation=RelationKind.ADJACENT.value),
                    )
                    add(model.Add(met == 0))
            elif rule.kind == RuleKind.ALTERNATE_TAG:
                relation = str(p.get("relation", RelationKind.ADJACENT.value))
                ids = participants_for_alternate_tag(self.snapshot, rule)
                for a, b in combinations(ids, 2):
                    met = condition_var(
                        a,
                        b,
                        PairCondition(kind="relation", relation=relation),
                    )
                    add(model.Add(met == 0))
            elif rule.kind == RuleKind.GROUP_SPREAD_TABLE:
                ids = [str(item) for item in p.get("participant_ids", [])]
                if any(item not in self.people_by_id for item in ids):
                    impossible()
                    return
                maximum = int(p.get("max_per_table", 1))
                for table_id in self.geometry.table_ids():
                    table_seats = self.geometry.seats_for_table(table_id)
                    count = sum(
                        x[(person_id, seat_id)]
                        for person_id in ids
                        for seat_id in table_seats
                    )
                    add(model.Add(count <= maximum))
            elif rule.kind == RuleKind.MAX_BOARD_DISTANCE:
                person_id = str(p["participant_id"])
                maximum = float(p["max_distance"])
                allowed = [
                    seat.id
                    for seat in self.seats
                    if self.geometry.board_distance(seat.id) <= maximum
                ]
                variables = [x[(person_id, seat_id)] for seat_id in allowed if (person_id, seat_id) in x]
                if not variables:
                    impossible()
                else:
                    add(model.Add(sum(variables) == 1))
            elif rule.kind == RuleKind.MAX_TAG_PER_TABLE:
                tag_key = str(p.get("tag_key", "group"))
                tag_value = str(p.get("tag_value", ""))
                maximum = int(p.get("max_count", 1))
                tagged = [person.id for person in self.participants if person.tags.get(tag_key) == tag_value]
                for table_id in self.geometry.table_ids():
                    table_seats = self.geometry.seats_for_table(table_id)
                    expression = sum(x[(person_id, seat_id)] for person_id in tagged for seat_id in table_seats)
                    add(model.Add(expression <= maximum))
            elif rule.kind == RuleKind.TABLE_TAG_BALANCE:
                self._add_balance_rule(model, x, rule, assumption)
            else:
                impossible()
        except (KeyError, TypeError, ValueError):
            # Malformed hard rules are explicit contradictions, never silently
            # ignored. Their assumption literal makes the error explainable.
            impossible()

    def _add_balance_rule(
        self,
        model: cp_model.CpModel,
        x: dict[tuple[str, str], Any],
        rule: Rule,
        assumption: Any | None,
    ) -> None:
        p = rule.params
        tag_key = str(p.get("tag_key", "group"))
        values = list(map(str, p.get("values", [])))
        if not values:
            values = sorted({person.tags[tag_key] for person in self.participants if tag_key in person.tags})
        maximum_difference = int(p.get("max_difference", 1))
        for table_id in self.geometry.table_ids():
            table_seats = self.geometry.seats_for_table(table_id)
            counts: dict[str, Any] = {}
            for value in values:
                people = [person.id for person in self.participants if person.tags.get(tag_key) == value]
                count = sum(x[(person_id, seat_id)] for person_id in people for seat_id in table_seats)
                counts[value] = count
            for a, b in combinations(values, 2):
                c1 = model.Add(counts[a] - counts[b] <= maximum_difference)
                c2 = model.Add(counts[b] - counts[a] <= maximum_difference)
                if assumption is not None:
                    c1.OnlyEnforceIf(assumption)
                    c2.OnlyEnforceIf(assumption)

    def _add_global_soft_rules(
        self,
        model: cp_model.CpModel,
        x: dict[tuple[str, str], Any],
        terms: list[tuple[int, Any]],
    ) -> None:
        for rule in self.scoring.global_soft_rules:
            p = rule.params
            if rule.kind == RuleKind.MAX_TAG_PER_TABLE:
                key = str(p.get("tag_key", "group"))
                value = str(p.get("tag_value", ""))
                maximum = int(p.get("max_count", 1))
                people = [person.id for person in self.participants if person.tags.get(key) == value]
                for table_id in self.geometry.table_ids():
                    seats = self.geometry.seats_for_table(table_id)
                    count = sum(x[(person_id, seat_id)] for person_id in people for seat_id in seats)
                    violation = model.NewIntVar(0, len(seats), f"soft_overflow__{rule.id}__{table_id}")
                    model.Add(violation >= count - maximum)
                    terms.append((-rule.weight, violation))
            elif rule.kind == RuleKind.TABLE_TAG_BALANCE:
                key = str(p.get("tag_key", "group"))
                values = list(map(str, p.get("values", [])))
                if not values:
                    values = sorted({person.tags[key] for person in self.participants if key in person.tags})
                allowed = int(p.get("max_difference", 1))
                for table_id in self.geometry.table_ids():
                    seats = self.geometry.seats_for_table(table_id)
                    counts: dict[str, Any] = {}
                    for value in values:
                        people = [person.id for person in self.participants if person.tags.get(key) == value]
                        counts[value] = sum(
                            x[(person_id, seat_id)] for person_id in people for seat_id in seats
                        )
                    for a, b in combinations(values, 2):
                        diff = model.NewIntVar(-len(seats), len(seats), f"diff__{rule.id}__{table_id}__{a}__{b}")
                        absolute = model.NewIntVar(0, len(seats), f"abs__{rule.id}__{table_id}__{a}__{b}")
                        violation = model.NewIntVar(0, len(seats), f"imbalance__{rule.id}__{table_id}__{a}__{b}")
                        model.Add(diff == counts[a] - counts[b])
                        model.AddAbsEquality(absolute, diff)
                        model.Add(violation >= absolute - allowed)
                        terms.append((-rule.weight, violation))
            elif rule.kind == RuleKind.GROUP_SPREAD_TABLE:
                ids = [
                    str(item)
                    for item in p.get("participant_ids", [])
                    if str(item) in self.people_by_id
                ]
                maximum = int(p.get("max_per_table", 1))
                for table_id in self.geometry.table_ids():
                    seats = self.geometry.seats_for_table(table_id)
                    count = sum(
                        x[(person_id, seat_id)]
                        for person_id in ids
                        for seat_id in seats
                    )
                    violation = model.NewIntVar(
                        0,
                        len(ids),
                        f"soft_spread__{rule.id}__{table_id}",
                    )
                    model.Add(violation >= count - maximum)
                    terms.append((-rule.weight, violation))

    def _add_grade_balance_terms(
        self,
        model: cp_model.CpModel,
        x: dict[tuple[str, str], Any],
        terms: list[tuple[int, Any]],
    ) -> None:
        weight = self.snapshot.settings.grade_balance_weight
        if weight <= 0:
            return
        grades = {
            person.id: round(float(person.grade) * 100)
            for person in self.participants
            if person.grade is not None
        }
        if not grades:
            return
        total_grade = sum(grades.values())
        count_people = len(grades)
        max_grade = max(grades.values(), default=0)
        for table_id in self.geometry.table_ids():
            seats = self.geometry.seats_for_table(table_id)
            occupancy = sum(
                x[(person_id, seat_id)] for person_id in grades for seat_id in seats
            )
            grade_sum = sum(
                grade * x[(person_id, seat_id)]
                for person_id, grade in grades.items()
                for seat_id in seats
            )
            bound = max(
                1,
                len(seats) * (max_grade * count_people + total_grade),
            )
            deviation = model.NewIntVar(0, bound, f"grade_deviation__{table_id}")
            model.AddAbsEquality(
                deviation,
                grade_sum * count_people - total_grade * occupancy,
            )
            terms.append((-weight, deviation))

    def _add_hints(self, model: cp_model.CpModel, x: dict[tuple[str, str], Any]) -> None:
        used: set[str] = set()
        # Previous plans are excellent warm starts for incremental recalculation.
        for person_id, seat_id in self.snapshot.previous_assignment.items():
            if (person_id, seat_id) in x and seat_id not in used:
                model.AddHint(x[(person_id, seat_id)], 1)
                used.add(seat_id)

        # Complete the hint greedily with unary utility only. A hint is not a
        # constraint; CP-SAT repairs it when pairwise hard rules require changes.
        unary_score: dict[tuple[str, str], int] = {}
        for term in self.scoring.unary:
            unary_score[(term.person_id, term.seat_id)] = unary_score.get(
                (term.person_id, term.seat_id), 0
            ) + term.coefficient
        remaining_people = [pid for pid in self.person_ids if pid not in self.snapshot.previous_assignment]
        remaining_people.sort(
            key=lambda pid: max((unary_score.get((pid, sid), 0) for sid in self.seat_ids), default=0),
            reverse=True,
        )
        for person_id in remaining_people:
            free = [sid for sid in self.seat_ids if sid not in used]
            if not free:
                break
            seat_id = max(free, key=lambda sid: (unary_score.get((person_id, sid), 0), sid))
            model.AddHint(x[(person_id, seat_id)], 1)
            used.add(seat_id)

    # ---------------------------------------------------------- result/diagnose
    def _failed_result(
        self,
        status: int,
        stages: list[StageResult],
        artifacts: BuildArtifacts,
        solver: cp_model.CpSolver,
    ) -> SolveResult:
        if status == cp_model.INFEASIBLE:
            diagnostics = self._diagnose_infeasibility(artifacts, solver)
            return SolveResult(
                status="infeasible",
                stages=stages,
                diagnostics=diagnostics,
                model_stats=artifacts.model_stats,
            )
        return SolveResult(
            status="unknown",
            stages=stages,
            diagnostics=[
                {
                    "type": "solver_timeout",
                    "message": "Aucune solution faisable n'a été trouvée dans la limite de calcul. Augmentez la limite ou simplifiez les contraintes.",
                }
            ],
            model_stats=artifacts.model_stats,
        )

    def _diagnose_infeasibility(
        self, artifacts: BuildArtifacts, solver: cp_model.CpSolver
    ) -> list[dict[str, Any]]:
        indices = set(solver.SufficientAssumptionsForInfeasibility())
        core_rules = [
            rule
            for index, rule in artifacts.assumption_map.items()
            if index in indices or (-index - 1) in indices
        ]
        if not core_rules:
            return [
                {
                    "type": "base_infeasibility",
                    "message": "Les contraintes structurelles d'affectation sont incompatibles, mais aucun noyau de règles administratives n'a été isolé.",
                }
            ]

        shrunk, minimal_by_deletion = self._shrink_core(core_rules)
        return [
            {
                "type": "unsat_core",
                "message": (
                    "Ces règles forment un noyau contradictoire minimal par suppression."
                    if minimal_by_deletion
                    else "Ces règles forment un noyau contradictoire suffisant ; la réduction n'a pas été prouvée minimale dans le délai imparti."
                ),
                "rules": [
                    {
                        "id": rule.id,
                        "name": rule.name,
                        "kind": rule.kind.value,
                        "params": rule.params,
                        "source": rule.source,
                    }
                    for rule in shrunk
                ],
                "minimal_by_deletion": minimal_by_deletion,
            }
        ]

    def _shrink_core(self, rules: list[Rule]) -> tuple[list[Rule], bool]:
        remaining = list(rules)
        deadline = monotonic() + self.snapshot.settings.diagnostic_time_limit_seconds
        index = 0
        complete = True
        while index < len(remaining):
            if monotonic() >= deadline:
                complete = False
                break
            candidate = remaining[:index] + remaining[index + 1 :]
            artifacts = self._build_model(
                locks=SolveLocks(),
                objective=None,
                active_hard_rule_ids={rule.id for rule in candidate},
                use_assumptions=False,
            )
            solver = self._new_solver(min(0.8, max(0.05, deadline - monotonic())))
            status = solver.Solve(artifacts.model)
            # Model construction and the CP-SAT call both consume the same
            # diagnostic budget.  Even a conclusive last check must not turn
            # into a minimality claim when it returned after the deadline.
            if monotonic() >= deadline:
                complete = False
            if status == cp_model.INFEASIBLE:
                remaining = candidate
            elif status in FEASIBLE_STATUSES:
                index += 1
            else:
                # UNKNOWN/MODEL_INVALID cannot prove that the tested rule is
                # necessary, so retain it without claiming minimality.
                complete = False
                index += 1
        return remaining, complete and index >= len(remaining)

    def _extract_assignment(
        self, artifacts: BuildArtifacts, solver: cp_model.CpSolver
    ) -> dict[str, str]:
        assignment: dict[str, str] = {}
        for person_id in self.person_ids:
            for seat_id in self.seat_ids:
                if solver.Value(artifacts.x[(person_id, seat_id)]):
                    assignment[person_id] = seat_id
                    break
        return assignment

    def _extract_people(
        self,
        artifacts: BuildArtifacts,
        solver: cp_model.CpSolver,
        assignment: dict[str, str],
    ) -> list[PersonResult]:
        breakdown_by_person: dict[str, list[dict[str, Any]]] = {pid: [] for pid in self.person_ids}
        for term in artifacts.evaluated_terms:
            active = bool(solver.Value(term.variable))
            if not active:
                continue
            for beneficiary in term.beneficiaries:
                if beneficiary in breakdown_by_person:
                    breakdown_by_person[beneficiary].append(
                        {
                            "label": term.label,
                            "category": term.category,
                            "points": term.coefficient,
                            "source_id": term.source_id,
                        }
                    )

        results: list[PersonResult] = []
        for person_id in self.person_ids:
            previous = self.snapshot.previous_assignment.get(person_id)
            results.append(
                PersonResult(
                    participant_id=person_id,
                    seat_id=assignment[person_id],
                    satisfaction=int(solver.Value(artifacts.satisfaction[person_id])),
                    raw_score=int(solver.Value(artifacts.raw_scores[person_id])),
                    response_received=person_id in self.scoring.responded,
                    moved_from_previous=bool(previous and previous != assignment[person_id]),
                    breakdown=sorted(
                        breakdown_by_person[person_id],
                        key=lambda item: abs(int(item["points"])),
                        reverse=True,
                    ),
                )
            )
        return results

    def _preflight_diagnostics(self) -> list[dict[str, Any]]:
        diagnostics: list[dict[str, Any]] = []
        if not self.participants:
            diagnostics.append(
                {"type": "empty_project", "message": "Ajoutez au moins une personne."}
            )
        if len(self.seats) < len(self.participants):
            diagnostics.append(
                {
                    "type": "capacity",
                    "message": f"Il y a {len(self.participants)} personnes actives pour {len(self.seats)} places actives.",
                    "missing_seats": len(self.participants) - len(self.seats),
                }
            )
        if not self.seats:
            diagnostics.append(
                {"type": "empty_room", "message": "Ajoutez au moins une place à la salle."}
            )
        return diagnostics

    def _base_stats(self) -> dict[str, int]:
        return {
            "participants": len(self.participants),
            "seats": len(self.seats),
            "hard_rules": len(self.hard_rules),
            "responses": len(self.scoring.responded),
        }
