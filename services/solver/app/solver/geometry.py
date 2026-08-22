from __future__ import annotations

from dataclasses import dataclass
from itertools import combinations
from math import ceil, hypot
from typing import Callable

from app.models import RelationKind, Room, Seat


@dataclass(frozen=True)
class SeatPairContext:
    a: Seat
    b: Seat
    distance: float


class RoomGeometry:
    """Pre-computed geometric and semantic relations between seats.

    The optimizer never assumes that a table is rectangular or that the front is
    a row letter. It consumes a graph of seats. Relations can be explicitly
    authored in the editor and the safe defaults below fill the gaps.
    """

    def __init__(self, room: Room):
        self.room = room
        self.seats = [seat for seat in room.seats if seat.enabled]
        self.by_id = {seat.id: seat for seat in self.seats}
        self.index = {seat.id: index for index, seat in enumerate(self.seats)}
        self._explicit: dict[RelationKind, set[tuple[str, str]]] = {
            kind: set() for kind in RelationKind
        }
        for relation in room.relations:
            if relation.a not in self.by_id or relation.b not in self.by_id:
                continue
            for kind in relation.kinds:
                self._explicit[kind].add((relation.a, relation.b))
                # A hand-conflict edge is ordered: a right-handed person in the
                # physical-left seat conflicts with a left-handed person in the
                # physical-right seat. Mirroring it would erase that meaning.
                if relation.bidirectional and kind != RelationKind.HAND_CONFLICT:
                    self._explicit[kind].add((relation.b, relation.a))

        self._distance: dict[tuple[str, str], float] = {}
        for a in self.seats:
            for b in self.seats:
                self._distance[(a.id, b.id)] = hypot(a.x - b.x, a.y - b.y)

        self._infer_hand_conflicts()

    def _infer_hand_conflicts(self) -> None:
        """Infer ordered left-seat -> right-seat collision edges.

        The lateral axis is derived from the direction in which occupants face
        the board, so rotated rows are handled without assuming that screen x is
        always classroom left/right. Front/back neighbours are deliberately not
        considered arm-collision pairs.
        """

        board_x = self.room.board.x + self.room.board.width / 2
        board_y = self.room.board.y
        for a, b in combinations(self.seats, 2):
            if not a.furniture_id or a.furniture_id != b.furniture_id:
                continue
            if not (self.adjacent(a.id, b.id) or self.adjacent(b.id, a.id)):
                continue

            a_side = (a.side or "").strip().lower()
            b_side = (b.side or "").strip().lower()
            if a_side == "left" and b_side == "right":
                self._explicit[RelationKind.HAND_CONFLICT].add((a.id, b.id))
                continue
            if a_side == "right" and b_side == "left":
                self._explicit[RelationKind.HAND_CONFLICT].add((b.id, a.id))
                continue

            midpoint_x = (a.x + b.x) / 2
            midpoint_y = (a.y + b.y) / 2
            forward_x = board_x - midpoint_x
            forward_y = board_y - midpoint_y
            forward_norm = hypot(forward_x, forward_y)
            if forward_norm == 0:
                continue
            # In screen coordinates (y grows down), (-forward_y, forward_x)
            # points to an occupant's physical right.
            right_x = -forward_y / forward_norm
            right_y = forward_x / forward_norm
            delta_x = b.x - a.x
            delta_y = b.y - a.y
            lateral = delta_x * right_x + delta_y * right_y
            longitudinal = delta_x * (forward_x / forward_norm) + delta_y * (
                forward_y / forward_norm
            )
            if abs(lateral) < abs(longitudinal) or abs(lateral) < 1e-9:
                continue
            ordered = (a.id, b.id) if lateral > 0 else (b.id, a.id)
            self._explicit[RelationKind.HAND_CONFLICT].add(ordered)

    def distance(self, seat_a: str, seat_b: str) -> float:
        return self._distance[(seat_a, seat_b)]

    def same_table(self, seat_a: str, seat_b: str) -> bool:
        a, b = self.by_id[seat_a], self.by_id[seat_b]
        return bool(a.furniture_id and a.furniture_id == b.furniture_id) or (seat_a, seat_b) in self._explicit[RelationKind.SAME_TABLE]

    def same_cluster(self, seat_a: str, seat_b: str) -> bool:
        a, b = self.by_id[seat_a], self.by_id[seat_b]
        if a.cluster_id and a.cluster_id == b.cluster_id:
            return True
        return (seat_a, seat_b) in self._explicit[RelationKind.SAME_CLUSTER]

    def adjacent(self, seat_a: str, seat_b: str) -> bool:
        if seat_a == seat_b:
            return False
        if (seat_a, seat_b) in self._explicit[RelationKind.ADJACENT]:
            return True
        a, b = self.by_id[seat_a], self.by_id[seat_b]
        # We only infer immediate neighbors inside the same furniture object.
        # Cross-table adjacency should be explicit because aisles matter.
        return (
            bool(a.furniture_id)
            and a.furniture_id == b.furniture_id
            and self.distance(seat_a, seat_b) <= self.room.infer_adjacent_threshold
        )

    def near(self, seat_a: str, seat_b: str) -> bool:
        if seat_a == seat_b:
            return False
        if (seat_a, seat_b) in self._explicit[RelationKind.NEAR]:
            return True
        return self.distance(seat_a, seat_b) <= self.room.near_threshold

    def hand_conflict(self, seat_a: str, seat_b: str) -> bool:
        return (seat_a, seat_b) in self._explicit[RelationKind.HAND_CONFLICT]

    def related(self, seat_a: str, seat_b: str, relation: RelationKind | str) -> bool:
        relation = RelationKind(relation)
        if relation == RelationKind.ADJACENT:
            return self.adjacent(seat_a, seat_b)
        if relation == RelationKind.NEAR:
            return self.near(seat_a, seat_b)
        if relation == RelationKind.SAME_TABLE:
            return self.same_table(seat_a, seat_b)
        if relation == RelationKind.SAME_CLUSTER:
            return self.same_cluster(seat_a, seat_b)
        if relation == RelationKind.HAND_CONFLICT:
            return self.hand_conflict(seat_a, seat_b)
        raise ValueError(f"Unsupported relation: {relation}")

    def relation_predicate(self, relation: RelationKind | str) -> Callable[[str, str], bool]:
        return lambda a, b: self.related(a, b, relation)

    def table_ids(self) -> list[str]:
        return sorted({seat.furniture_id for seat in self.seats if seat.furniture_id})

    def seats_for_table(self, table_id: str) -> list[str]:
        return [seat.id for seat in self.seats if seat.furniture_id == table_id]

    def seats_with_tags(self, tags: list[str], mode: str = "any") -> set[str]:
        expected = set(tags)
        result: set[str] = set()
        for seat in self.seats:
            actual = set(seat.tags)
            matched = expected.issubset(actual) if mode == "all" else bool(expected & actual)
            if matched:
                result.add(seat.id)
        return result

    def board_distance(self, seat_id: str) -> float:
        seat = self.by_id[seat_id]
        board = self.room.board
        # Distance to the board centre is a stable geometric proxy. A production
        # version may use distance to the board segment and obstacle occlusion.
        return hypot(seat.x - (board.x + board.width / 2), seat.y - board.y)

    def front_score(self, seat_id: str) -> int:
        """Return the compact POC's 0..1000 proximity-to-board score."""

        maximum = max((self.board_distance(seat.id) for seat in self.seats), default=1.0)
        maximum = max(1.0, maximum)
        score = round(1000 * (1 - self.board_distance(seat_id) / maximum))
        return max(0, min(1000, score))

    def front_seat_ids(self, fraction: float) -> set[str]:
        count = max(1, ceil(len(self.seats) * fraction))
        ordered = sorted(self.seats, key=lambda seat: (self.board_distance(seat.id), seat.id))
        return {seat.id for seat in ordered[:count]}
