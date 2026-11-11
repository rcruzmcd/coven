import { describe, expect, test } from "bun:test";
import { PAGE_SIZE } from "@/lib/pagination";
import { parseAuditLogParams, type AuditLogParams } from "./audit-log-params";

const defaults = {
  sort: "occurred_at",
  dir: "desc",
  table: "all",
  action: "all",
  related: "all",
  actor: "all",
  from: "",
  to: "",
  page: 1,
  perPage: PAGE_SIZE,
} satisfies AuditLogParams;

describe("parseAuditLogParams", () => {
  test("falls back to defaults for an empty query string", () => {
    expect(parseAuditLogParams({})).toEqual(defaults);
  });

  test("reads every parameter when all are present", () => {
    expect(
      parseAuditLogParams({
        sort: "table_name",
        dir: "asc",
        table: "donations",
        action: "delete",
        related: "event",
        actor: "person-1",
        from: "2026-01-01",
        to: "2026-01-31",
        page: "3",
        perPage: "25",
      }),
    ).toEqual({
      sort: "table_name",
      dir: "asc",
      table: "donations",
      action: "delete",
      related: "event",
      actor: "person-1",
      from: "2026-01-01",
      to: "2026-01-31",
      page: 3,
      perPage: 25,
    });
  });

  test("takes the first value when a parameter is repeated", () => {
    const parsed = parseAuditLogParams({
      table: ["events", "donations"],
      page: ["2", "9"],
    });
    expect(parsed.table).toBe("events");
    expect(parsed.page).toBe(2);
  });

  test("falls back to occurred_at for an unsortable column", () => {
    expect(parseAuditLogParams({ sort: "actor" }).sort).toBe("occurred_at");
  });

  test("only treats an exact 'asc' as ascending", () => {
    expect(parseAuditLogParams({ dir: "asc" }).dir).toBe("asc");
    expect(parseAuditLogParams({ dir: "ASC" }).dir).toBe("desc");
    expect(parseAuditLogParams({ dir: "sideways" }).dir).toBe("desc");
  });

  test("drops an unknown table, action or related filter", () => {
    const parsed = parseAuditLogParams({
      table: "secrets",
      action: "truncate",
      related: "donor",
    });
    expect(parsed.table).toBe("all");
    expect(parsed.action).toBe("all");
    expect(parsed.related).toBe("all");
  });

  test("clamps a nonsensical page back to the first one", () => {
    expect(parseAuditLogParams({ page: "0" }).page).toBe(1);
    expect(parseAuditLogParams({ page: "-4" }).page).toBe(1);
    expect(parseAuditLogParams({ page: "later" }).page).toBe(1);
  });

  test("snaps an unoffered page size to the nearest option", () => {
    expect(parseAuditLogParams({ perPage: "15" }).perPage).toBe(10);
    expect(parseAuditLogParams({ perPage: "9000" }).perPage).toBe(25);
    expect(parseAuditLogParams({ perPage: "0" }).perPage).toBe(PAGE_SIZE);
  });

  test("passes a blank date range through as blank", () => {
    const parsed = parseAuditLogParams({ from: "", to: "" });
    expect(parsed.from).toBe("");
    expect(parsed.to).toBe("");
  });
});
