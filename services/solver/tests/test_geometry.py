from __future__ import annotations

from app.models import Furniture, RelationKind, Room, Seat, SeatRelation
from app.solver.geometry import RoomGeometry


def test_freeform_furniture_uses_explicit_seat_graph() -> None:
    room = Room(
        width=800,
        height=600,
        furniture=[
            Furniture(
                id="u",
                label="U",
                shape="composite",
                parts=[
                    {"shape": "rectangle", "x": 0, "y": 0, "width": 40, "height": 200},
                    {"shape": "rectangle", "x": 160, "y": 0, "width": 40, "height": 200},
                    {"shape": "rectangle", "x": 0, "y": 160, "width": 200, "height": 40},
                ],
            )
        ],
        seats=[
            Seat(id="a", label="A", x=90, y=90, furniture_id="u"),
            Seat(id="b", label="B", x=500, y=90, furniture_id="u"),
            Seat(id="c", label="C", x=90, y=180, furniture_id="u"),
        ],
        relations=[
            SeatRelation(a="a", b="c", kinds=[RelationKind.ADJACENT]),
        ],
        infer_adjacent_threshold=20,
    )
    geometry = RoomGeometry(room)
    assert geometry.same_table("a", "b")
    assert not geometry.adjacent("a", "b")
    assert geometry.adjacent("a", "c")


def test_explicit_same_table_can_link_free_seats() -> None:
    room = Room(
        seats=[
            Seat(id="a", label="A", x=10, y=10),
            Seat(id="b", label="B", x=100, y=10),
        ],
        relations=[SeatRelation(a="a", b="b", kinds=[RelationKind.SAME_TABLE])],
    )
    assert RoomGeometry(room).same_table("a", "b")

