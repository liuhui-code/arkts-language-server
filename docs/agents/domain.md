# Domain documentation

This is a single-context repository. Before exploring or changing a domain,
read the relevant existing documentation:

- `CONTEXT.md`, if it exists;
- ADRs under `docs/adr/`, if that directory exists;
- `docs/architecture.md` for system boundaries and ownership;
- the current execution plan under `docs/plans/`;
- related implementation evidence under `docs/tdd/`.

Missing `CONTEXT.md` or ADR files are not blockers. Proceed silently; those
artifacts are created only when the project resolves terminology or decisions
that need a durable domain record.

Use established names from the documentation in issue titles, tests, and code.
If a proposal contradicts an ADR, identify the conflict explicitly instead of
silently overriding the decision.
