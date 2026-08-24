import type { WellEvent } from "../types";

/**
 * A realistic lifecycle history for a single horizontal well, from permit to
 * present. Mixes point events (spud, first production) and spans (drilling,
 * shut-in periods). Use with the EventTimeline for demos and testing.
 *
 * ```tsx
 * import { sampleWellEvents } from "@aai-agency/og-components/sample-data";
 * import { EventTimeline } from "@aai-agency/og-components";
 *
 * <EventTimeline events={sampleWellEvents} title="Well history" />
 * ```
 */
export const sampleWellEvents: WellEvent[] = [
  {
    id: "permit",
    date: "2021-06-15",
    type: "permit",
    title: "Drilling permit approved",
    description: "State permit issued for a 2-mile lateral in the Niobrara.",
    meta: { authority: "COGCC", permitNo: "05-123-45678", formation: "Niobrara B" },
  },
  {
    id: "spud",
    date: "2021-09-02",
    type: "spud",
    title: "Spud",
    description: "Surface hole spudded; rig on location.",
  },
  {
    id: "drilling",
    date: "2021-09-02",
    endDate: "2021-10-01",
    type: "drilling",
    title: "Drilling",
    description: "Drilled to TD of 18,240 ft MD across 29 days.",
    value: 29,
  },
  {
    id: "completion",
    date: "2021-10-10",
    endDate: "2021-10-24",
    type: "completion",
    title: "Completion",
    description: "42-stage plug-and-perf completion.",
    value: 42,
  },
  {
    id: "stimulation",
    date: "2021-10-20",
    type: "stimulation",
    title: "Hydraulic fracturing",
    description: "11.2M lb proppant, 8.4M gal fluid placed.",
    meta: { proppant: "11.2M lb", fluid: "8.4M gal", stages: 42, avgRate: "82 bpm" },
  },
  {
    id: "first-production",
    date: "2021-11-05",
    type: "first-production",
    title: "First production",
    description: "Flowback complete; well online at 1,180 BOE/d.",
    meta: { ip: "1,180 BOE/d", choke: '28/64"', gor: "2,400 scf/bbl" },
  },
  {
    id: "well-test-1",
    date: "2022-04-18",
    type: "test",
    title: "90-day rate test",
    description: "IP90 of 940 BOE/d confirmed.",
  },
  {
    id: "workover-1",
    date: "2022-08-30",
    endDate: "2022-09-12",
    type: "workover",
    title: "Rod pump repair",
    description: "Pulled and replaced worn downhole pump.",
  },
  {
    id: "esp-install",
    date: "2023-02-14",
    type: "artificial-lift",
    title: "ESP installed",
    description: "Converted to electric submersible pump as reservoir pressure declined.",
  },
  {
    id: "shut-in-1",
    date: "2023-07-01",
    endDate: "2023-07-20",
    type: "shut-in",
    title: "Offset frac shut-in",
    description: "Shut in to protect against an offset completion.",
  },
  {
    id: "return-1",
    date: "2023-07-21",
    type: "return-to-production",
    title: "Returned to production",
    description: "Brought back online with no measurable interference.",
  },
  {
    id: "recompletion",
    date: "2024-03-10",
    type: "recompletion",
    title: "Recompletion",
    description: "Added perforations in an uphole bench.",
  },
  {
    id: "inspection-1",
    date: "2024-09-05",
    type: "inspection",
    title: "Mechanical integrity test",
    description: "Annual MIT passed.",
  },
  {
    id: "incident-1",
    date: "2025-01-22",
    type: "incident",
    title: "Surface line leak",
    description: "Minor flowline leak; contained and repaired same day.",
  },
  {
    id: "ownership-1",
    date: "2025-06-30",
    type: "ownership",
    title: "Working interest sale",
    description: "Operated interest transferred to a new operator.",
    meta: { from: "Coastal Energy", to: "Front Range Resources", workingInterest: "62.5%" },
  },
  {
    id: "note-1",
    date: "2025-11-15",
    type: "note",
    title: "Artificial-lift optimization under review",
    description: "Gas-lift conversion under evaluation for 2026.",
  },
];
