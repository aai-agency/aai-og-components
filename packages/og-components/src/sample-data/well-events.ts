import type { WellEvent } from "../types";

// Self-contained SVG previews so the sample renders without any network access.
const PLAT_MAP =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='140'%3E%3Crect width='240' height='140' fill='%23eef2ff'/%3E%3Crect x='36' y='34' width='168' height='74' fill='none' stroke='%236366f1' stroke-dasharray='4 4' stroke-width='1.5'/%3E%3Cpath d='M20 112 L70 52 L120 86 L170 34 L220 70' fill='none' stroke='%2394a3b8' stroke-width='2'/%3E%3Ccircle cx='170' cy='34' r='5' fill='%23ef4444'/%3E%3C/svg%3E";
const FRAC_CHART =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='140'%3E%3Crect width='240' height='140' fill='%23f8fafc'/%3E%3Cline x1='16' y1='124' x2='224' y2='124' stroke='%23cbd5e1'/%3E%3Cpolyline points='16,120 52,58 88,86 124,40 160,60 196,34 224,50' fill='none' stroke='%23c43d18' stroke-width='3'/%3E%3C/svg%3E";

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
    attachments: [
      { name: "Form 2 Drilling permit.pdf", url: "#", type: "application/pdf", size: "142 KB" },
      { name: "Plat map.svg", url: PLAT_MAP, type: "image/svg+xml", size: "18 KB" },
    ],
  },
  {
    id: "spud",
    date: "2021-09-02",
    type: "spud",
    title: "Spud",
    description: "Surface hole spudded; rig on location.",
    meta: { rig: "Patterson-UTI 291", surfaceHole: '13-3/8"', spudTime: "06:42" },
  },
  {
    id: "drilling",
    date: "2021-09-02",
    endDate: "2021-10-01",
    type: "drilling",
    title: "Drilling",
    description: "Drilled to TD of 18,240 ft MD across 29 days.",
    value: 29,
    meta: { td: "18,240 ft MD", mudWeight: "9.8 ppg", rop: "62 ft/hr", days: 29 },
  },
  {
    id: "completion",
    date: "2021-10-10",
    endDate: "2021-10-24",
    type: "completion",
    title: "Completion",
    description: "42-stage plug-and-perf completion.",
    value: 42,
    meta: { method: "Plug-and-perf", stages: 42, clustersPerStage: 6, perfInterval: "9,600–18,050 ft" },
  },
  {
    id: "stimulation",
    date: "2021-10-20",
    type: "stimulation",
    title: "Hydraulic fracturing",
    description: "11.2M lb proppant, 8.4M gal fluid placed.",
    meta: { proppant: "11.2M lb", fluid: "8.4M gal", stages: 42, avgRate: "82 bpm" },
    attachments: [
      { name: "Frac treating chart.svg", url: FRAC_CHART, type: "image/svg+xml", size: "24 KB" },
      { name: "Stage-by-stage report.pdf", url: "#", type: "application/pdf", size: "1.2 MB" },
      { name: "Proppant tickets.csv", url: "#", type: "text/csv", size: "36 KB" },
    ],
  },
  {
    id: "first-production",
    date: "2021-11-05",
    type: "first-production",
    title: "First production",
    description: "Flowback complete; well online at 1,180 BOE/d.",
    meta: { IP: "1,180 BOE/d", choke: '28/64"', GOR: "2,400 scf/bbl" },
    attachments: [{ name: "First-production test.pdf", url: "#", type: "application/pdf", size: "320 KB" }],
  },
  {
    id: "well-test-1",
    date: "2022-04-18",
    type: "test",
    title: "90-day rate test",
    description: "IP90 of 940 BOE/d confirmed.",
    meta: { IP90: "940 BOE/d", oilRate: "612 bbl/d", waterCut: "38%", GOR: "2,510 scf/bbl" },
  },
  {
    id: "workover-1",
    date: "2022-08-30",
    endDate: "2022-09-12",
    type: "workover",
    title: "Rod pump repair",
    summary:
      "Rod string parted and the pump was worn. Pulled everything, replaced the pump and 18 rods, and put the well back on production. Took 13 days.",
    description:
      "The rod string parted near 4,200 ft. Rigged up a workover rig, pulled the rod string and tubing, replaced the downhole pump and 18 worn rods, ran a new pump, and returned the well to production. Tubing and casing checked out fine.",
    meta: {
      reason: "Parted rod string",
      downtime: "13 days",
      cost: "$84k",
      contractor: "Basin Well Services",
      steps: [
        { time: "Aug 30", label: "Rigged up workover rig and killed the well" },
        { time: "Aug 31", label: "Pulled the rod string; found the part at 4,210 ft" },
        { time: "Sep 2", label: "Pulled tubing and inspected it, no leaks" },
        { time: "Sep 5", label: "Fished the retained rod section" },
        { time: "Sep 8", label: "Ran a new insert pump and 18 replacement rods" },
        { time: "Sep 10", label: "Ran tubing and pressure-tested to 1,500 psi" },
        { time: "Sep 12", label: "Put the well back on production at 705 BOE/d" },
      ],
    },
    attachments: [{ name: "Workover daily report.pdf", url: "#", type: "application/pdf", size: "680 KB" }],
  },
  {
    id: "esp-install",
    date: "2023-02-14",
    type: "artificial-lift",
    title: "ESP installed",
    description: "Converted to electric submersible pump as reservoir pressure declined.",
    meta: { liftType: "ESP", settingDepth: "9,850 ft MD", designRate: "620 bfpd", motor: "120 hp" },
  },
  {
    id: "shut-in-1",
    date: "2023-07-01",
    endDate: "2023-07-20",
    type: "shut-in",
    title: "Offset frac shut-in",
    description: "Shut in to protect against an offset completion.",
    meta: { reason: "Offset frac protection", offsetWell: "14-29-2H", downtime: "19 days" },
  },
  {
    id: "return-1",
    date: "2023-07-21",
    type: "return-to-production",
    title: "Returned to production",
    description: "Brought back online with no measurable interference.",
    meta: { rate: "705 BOE/d", interference: "None", choke: '32/64"' },
  },
  {
    id: "recompletion",
    date: "2024-03-10",
    type: "recompletion",
    title: "Recompletion",
    description: "Added perforations in an uphole bench.",
    meta: { bench: "Niobrara A", addedPerfs: "8,900–9,150 ft", addedStages: 4 },
  },
  {
    id: "inspection-1",
    date: "2024-09-05",
    type: "inspection",
    title: "Mechanical integrity test",
    description: "Annual MIT passed.",
    meta: { testType: "Mechanical integrity (MIT)", result: "Pass", testPressure: "1,500 psi" },
  },
  {
    id: "incident-1",
    date: "2025-01-22",
    type: "incident",
    title: "Surface line leak",
    description: "Minor flowline leak; contained and repaired same day.",
    meta: { severity: "Minor", volumeReleased: "3 bbl", contained: "Yes", reported: "COGCC Form 19" },
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
