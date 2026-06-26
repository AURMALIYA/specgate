import { describe, expect, it } from "vitest";
import { parseAccessMatrix } from "../src/access-matrix.js";

const TABLE = `
| role    | resource | visible | editable | data_scope | enforcement_layer | source_attribute | deny_cases        | fallback  |
|---------|----------|---------|----------|------------|-------------------|------------------|-------------------|-----------|
| shopper | order    | true    | false    | own        | service           | session          | refunded, expired | read-only |
`;

describe("access-matrix parser", () => {
  it("parses one typed row per role/resource", () => {
    const { rows, problems } = parseAccessMatrix(TABLE);
    expect(problems).toEqual([]);
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.role).toBe("shopper");
    expect(row.visible).toBe(true);
    expect(row.editable).toBe(false);
    expect(row.data_scope).toBe("own");
    expect(row.deny_cases).toEqual(["refunded", "expired"]);
  });

  it("reports a non-boolean visible/editable value", () => {
    const bad = `
| role | resource | visible | editable | data_scope | enforcement_layer |
|------|----------|---------|----------|------------|-------------------|
| a    | b        | maybe   | false    | own        | service           |
`;
    const { problems } = parseAccessMatrix(bad);
    expect(problems.join(" ")).toMatch(/not a boolean/);
  });

  it("reports a missing required column", () => {
    const bad = `
| role | resource | visible |
|------|----------|---------|
| a    | b        | true    |
`;
    const { problems } = parseAccessMatrix(bad);
    expect(problems.join(" ")).toMatch(/missing required column/);
  });
});
