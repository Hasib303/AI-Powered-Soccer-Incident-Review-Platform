import * as z from "zod";

/**
 * Permissive UUID-shaped validator (8-4-4-4-12 hex).
 *
 * Zod 4's strict `z.uuid()` rejects UUIDs whose version digit isn't one of
 * 1/3/4/5/6/7/8 (RFC 4122). Our Postgres seed uses fixed pseudo-UUIDs like
 * `00000000-0000-0000-0000-000000000030` for deterministic demo data —
 * those are valid `uuid` column values in Postgres but fail the RFC check.
 *
 * Use this validator in server actions when the value is just a stable
 * identifier round-tripped from the database, not a freshly generated
 * UUIDv4 from the runtime.
 */
export const UuidLike = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    "Must be a UUID-shaped string (8-4-4-4-12 hex).",
  );
