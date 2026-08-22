# Plan2Classe solver service

This directory contains the stateless Python/OR-Tools part of Plan2Classe. It
does not read the application database and has no authentication endpoints.
The Hono service remains responsible for authorization, SQLite transactions,
building a complete `ProjectSnapshot`, and persisting the returned
`SolveResult`.

## HTTP contract

- `GET /health` reports process health.
- `POST /solve` accepts one `ProjectSnapshot` JSON object and returns one
  `SolveResult` JSON object.

Run locally:

```bash
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
python -m pytest
```

The implementation preserves the recovered lexicographic CP-SAT engine and its
independent post-solve validator. Typed extensions cover table spreading,
combined no-go zones, tag alternation, board-distance limits, geometric
vision/hearing needs, directional handedness collisions, and level mixing.

In Docker Compose, keep this service private: use `expose: ["8000"]`, do not
publish a host port, and do not mount the SQLite data volume into this container.
