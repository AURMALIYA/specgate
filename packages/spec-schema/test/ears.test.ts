import { describe, expect, it } from "vitest";
import { parseCriterion, parseCriteria } from "../src/ears.js";

describe("EARS parser", () => {
  it("accepts each EARS pattern", () => {
    expect(parseCriterion("THE SYSTEM SHALL log every request.", 1).kind).toBe("ubiquitous");
    expect(
      parseCriterion("WHEN a user signs in THE SYSTEM SHALL record the time.", 1).kind,
    ).toBe("event");
    expect(parseCriterion("WHILE offline THE SYSTEM SHALL queue writes.", 1).kind).toBe("state");
    expect(
      parseCriterion("IF the token is invalid THEN THE SYSTEM SHALL reject the request.", 1).kind,
    ).toBe("unwanted");
    expect(
      parseCriterion("WHERE export is enabled THE SYSTEM SHALL show a download button.", 1).kind,
    ).toBe("optional");
  });

  it("flags non-EARS prose as non-testable", () => {
    const c = parseCriterion("The system should be fast and friendly.", 1);
    expect(c.kind).toBeNull();
    expect(c.valid).toBe(false);
    expect(c.problems.join(" ")).toMatch(/EARS pattern/);
  });

  it("flags bundled multi-claim criteria", () => {
    const c = parseCriterion(
      "WHEN paid THE SYSTEM SHALL ship the order and THE SYSTEM SHALL email a receipt.",
      1,
    );
    expect(c.valid).toBe(false);
    expect(c.problems.join(" ")).toMatch(/SHALL clause/);
  });

  it("strips list markers before parsing", () => {
    const list = parseCriteria("- THE SYSTEM SHALL retry.\n1. WHEN x THE SYSTEM SHALL stop.");
    expect(list).toHaveLength(2);
    expect(list[0]?.kind).toBe("ubiquitous");
    expect(list[1]?.kind).toBe("event");
  });
});
