import { describe, expect, it } from "vitest";
import { RateLimiter } from "../src/ratelimit.js";

describe("RateLimiter", () => {
  it("allows up to max per window, then blocks, then resets next window", () => {
    const rl = new RateLimiter(1000, 3);
    const t0 = 1_000_000;
    expect(rl.allow("k", t0)).toBe(true);
    expect(rl.allow("k", t0 + 10)).toBe(true);
    expect(rl.allow("k", t0 + 20)).toBe(true);
    expect(rl.allow("k", t0 + 30)).toBe(false); // 4th in window
    expect(rl.allow("k", t0 + 1001)).toBe(true); // new window
  });

  it("tracks keys independently", () => {
    const rl = new RateLimiter(1000, 1);
    expect(rl.allow("a", 0)).toBe(true);
    expect(rl.allow("b", 0)).toBe(true);
    expect(rl.allow("a", 1)).toBe(false);
  });
});
