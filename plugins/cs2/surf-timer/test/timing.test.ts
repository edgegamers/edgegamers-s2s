/// <reference types="vitest/globals" />

import { formatRunTime } from "../src/timing.ts";

describe("formatRunTime", () => {
  it("formats milliseconds as seconds and centiseconds", () => {
    expect(formatRunTime(12345)).toBe("12.34s");
  });

  it("does not emit negative run times", () => {
    expect(formatRunTime(-500)).toBe("0.00s");
  });
});
