import { describe, expect, it } from "vitest";

import type { WellEvent } from "../../../types";
import {
  buildTimelineTicks,
  colorForEvent,
  computeTimelineDomain,
  EVENT_TYPE_META,
  eventTypeMeta,
  formatEventDuration,
  formatTimelineTick,
  fractionForTime,
  hasLanes,
  humanizeEventType,
  layoutTimeline,
  normalizeEvents,
  timelineLanes,
  timelineLegend,
  toEpochMs,
  withAlpha,
} from "../event-timeline.services";

const ms = (iso: string) => Date.parse(iso);

const events: WellEvent[] = [
  { id: "b", date: "2022-01-01", type: "first-production", title: "First production" },
  { id: "a", date: "2021-06-15", type: "permit", title: "Permit" },
  { id: "span", date: "2021-09-01", endDate: "2021-10-01", type: "drilling", title: "Drilling" },
];

describe("toEpochMs", () => {
  it("parses ISO strings, numbers, and Dates", () => {
    expect(toEpochMs("2022-01-01")).toBe(ms("2022-01-01"));
    expect(toEpochMs(1000)).toBe(1000);
    expect(toEpochMs(new Date(1234))).toBe(1234);
  });

  it("returns NaN for unparseable input", () => {
    expect(Number.isNaN(toEpochMs("not-a-date"))).toBe(true);
  });
});

describe("normalizeEvents", () => {
  it("sorts chronologically by start", () => {
    const result = normalizeEvents(events);
    expect(result.map((event) => event.id)).toEqual(["a", "span", "b"]);
  });

  it("marks spans as ranges and points as non-ranges", () => {
    const result = normalizeEvents(events);
    const span = result.find((event) => event.id === "span");
    const point = result.find((event) => event.id === "a");
    expect(span?.isRange).toBe(true);
    expect(span?.end).toBe(ms("2021-10-01"));
    expect(point?.isRange).toBe(false);
    expect(point?.end).toBe(point?.start);
  });

  it("drops events with invalid dates", () => {
    const result = normalizeEvents([{ id: "bad", date: "nope", type: "note", title: "Bad" }]);
    expect(result).toHaveLength(0);
  });

  it("clamps an end before start up to the start", () => {
    const result = normalizeEvents([
      { id: "x", date: "2022-01-10", endDate: "2022-01-01", type: "workover", title: "X" },
    ]);
    expect(result[0].isRange).toBe(false);
    expect(result[0].end).toBe(ms("2022-01-10"));
  });
});

describe("computeTimelineDomain", () => {
  it("honors an explicit domain", () => {
    const domain = computeTimelineDomain(normalizeEvents(events), ["2020-01-01", "2026-01-01"]);
    expect(domain).toEqual([ms("2020-01-01"), ms("2026-01-01")]);
  });

  it("rejects an inverted explicit domain", () => {
    expect(computeTimelineDomain([], ["2026-01-01", "2020-01-01"])).toBeNull();
  });

  it("pads a derived domain beyond the event extent", () => {
    const normalized = normalizeEvents(events);
    const domain = computeTimelineDomain(normalized, undefined, 0.1);
    expect(domain).not.toBeNull();
    if (!domain) return;
    expect(domain[0]).toBeLessThan(ms("2021-06-15"));
    expect(domain[1]).toBeGreaterThan(ms("2022-01-01"));
  });

  it("widens a single-instant extent into a window", () => {
    const domain = computeTimelineDomain(
      normalizeEvents([{ id: "one", date: "2022-01-01", type: "note", title: "One" }]),
    );
    expect(domain).not.toBeNull();
    if (!domain) return;
    expect(domain[1]).toBeGreaterThan(domain[0]);
  });

  it("returns null when there are no events", () => {
    expect(computeTimelineDomain([])).toBeNull();
  });
});

describe("fractionForTime", () => {
  it("maps time to a clamped 0–1 position", () => {
    const domain: [number, number] = [0, 100];
    expect(fractionForTime(50, domain)).toBe(0.5);
    expect(fractionForTime(-10, domain)).toBe(0);
    expect(fractionForTime(200, domain)).toBe(1);
  });
});

describe("layoutTimeline", () => {
  it("stacks colliding labels into separate rows", () => {
    const near: WellEvent[] = [
      { id: "1", date: "2022-01-01", type: "note", title: "A" },
      { id: "2", date: "2022-01-02", type: "note", title: "B" },
    ];
    const normalized = normalizeEvents(near);
    const domain = computeTimelineDomain(normalized, ["2022-01-01", "2022-12-31"]);
    if (!domain) throw new Error("domain");
    const laid = layoutTimeline(normalized, domain, { minLabelGap: 0.2, maxLabelRows: 2 });
    expect(laid[0].row).toBe(0);
    expect(laid[1].row).toBe(1);
    expect(laid.every((event) => event.showLabel)).toBe(true);
  });

  it("suppresses labels past the row budget", () => {
    const stacked: WellEvent[] = Array.from({ length: 4 }, (_, index) => ({
      id: `e${index}`,
      date: `2022-01-0${index + 1}`,
      type: "note",
      title: `E${index}`,
    }));
    const normalized = normalizeEvents(stacked);
    const domain = computeTimelineDomain(normalized, ["2022-01-01", "2022-12-31"]);
    if (!domain) throw new Error("domain");
    const laid = layoutTimeline(normalized, domain, { minLabelGap: 0.5, maxLabelRows: 2 });
    expect(laid.some((event) => !event.showLabel)).toBe(true);
  });
});

describe("buildTimelineTicks & formatTimelineTick", () => {
  it("returns evenly spaced ticks spanning the domain", () => {
    const ticks = buildTimelineTicks([0, 100], 5);
    expect(ticks).toHaveLength(5);
    expect(ticks[0].fraction).toBe(0);
    expect(ticks[4].fraction).toBe(1);
  });

  it("adapts label granularity to the span", () => {
    const t = Date.parse("2024-03-14");
    expect(formatTimelineTick(t, 5 * 365.25 * 86_400_000)).toBe("2024");
    expect(formatTimelineTick(t, 6 * 30.44 * 86_400_000)).toMatch(/Mar/);
    expect(formatTimelineTick(t, 10 * 86_400_000)).toMatch(/Mar 14/);
  });
});

describe("formatEventDuration", () => {
  it("returns null for point events", () => {
    expect(formatEventDuration({ start: 0, end: 0, isRange: false })).toBeNull();
  });

  it("formats days, months, and years", () => {
    const day = 86_400_000;
    expect(formatEventDuration({ start: 0, end: 3 * day, isRange: true })).toBe("3 days");
    expect(formatEventDuration({ start: 0, end: 90 * day, isRange: true })).toBe("3 mo");
    expect(formatEventDuration({ start: 0, end: 800 * day, isRange: true })).toMatch(/yr$/);
  });
});

describe("type metadata", () => {
  it("resolves built-in metadata", () => {
    expect(eventTypeMeta("stimulation")).toEqual(EVENT_TYPE_META.stimulation);
  });

  it("synthesizes metadata for custom types", () => {
    const meta = eventTypeMeta("casing-inspection");
    expect(meta.label).toBe("Casing Inspection");
    expect(meta.group).toBe("Other");
  });

  it("prefers an explicit event color", () => {
    expect(colorForEvent({ type: "note", color: "#123456" })).toBe("#123456");
    expect(colorForEvent({ type: "spud" })).toBe(EVENT_TYPE_META.spud.color);
  });

  it("humanizes type strings", () => {
    expect(humanizeEventType("return-to-production")).toBe("Return To Production");
  });
});

describe("timelineLegend", () => {
  it("lists distinct types ordered by group then label", () => {
    const legend = timelineLegend(normalizeEvents(events));
    // drilling & first-production are "Drilling & Completion"/"Production", permit is "Regulatory"
    expect(legend.map((entry) => entry.type)).toEqual(["drilling", "first-production", "permit"]);
  });
});

describe("lanes", () => {
  it("detects and lists lanes", () => {
    const laned = normalizeEvents([
      { id: "a", date: "2022-01-01", type: "note", title: "A", lane: "Surface" },
      { id: "b", date: "2022-02-01", type: "note", title: "B", lane: "Downhole" },
      { id: "c", date: "2022-03-01", type: "note", title: "C", lane: "Surface" },
    ]);
    expect(hasLanes(laned)).toBe(true);
    expect(timelineLanes(laned)).toEqual(["Surface", "Downhole"]);
  });

  it("reports no lanes when none are set", () => {
    expect(hasLanes(normalizeEvents(events))).toBe(false);
  });
});

describe("withAlpha", () => {
  it("converts hex to rgba", () => {
    expect(withAlpha("#3b82f6", 0.5)).toBe("rgba(59, 130, 246, 0.5)");
  });

  it("expands shorthand hex", () => {
    expect(withAlpha("#fff", 1)).toBe("rgba(255, 255, 255, 1)");
  });

  it("passes through non-hex colors unchanged", () => {
    expect(withAlpha("rebeccapurple", 0.5)).toBe("rebeccapurple");
  });
});
