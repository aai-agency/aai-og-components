import { ArrowRight } from "lucide-react";
import type { CSSProperties } from "react";

import { FONT_FAMILY, PRIMARY, TEXT_FAINT, TEXT_HEADING, TEXT_MUTED, TEXT_SECONDARY } from "../../theme";
import type { DrilldownRecord, OperationalSummaryData, OperationalSummaryInsight } from "./asset-breakdown.types";

export interface OperationalSummaryProps {
  summary: OperationalSummaryData;
  records?: readonly DrilldownRecord[];
  onInsightSelect?: (insight: OperationalSummaryInsight, evidence: readonly DrilldownRecord[]) => void;
  className?: string;
  style?: CSSProperties;
}

export const OperationalSummary = ({
  summary,
  records = [],
  onInsightSelect,
  className,
  style,
}: OperationalSummaryProps) => {
  const recordsById = new Map(records.map((record) => [record.id, record]));
  const range = [summary.dateRange?.from, summary.dateRange?.to].filter(Boolean).join(" – ");
  return (
    <section
      className={className}
      aria-label={summary.title ?? "Operational summary"}
      style={{
        padding: 14,
        border: "1px solid #e4e4e7",
        borderRadius: 8,
        background: "#ffffff",
        fontFamily: FONT_FAMILY,
        ...style,
      }}
    >
      <header
        style={{ display: "flex", flexWrap: "wrap", alignItems: "start", justifyContent: "space-between", gap: 8 }}
      >
        <div>
          <h3 style={{ margin: 0, color: TEXT_HEADING, fontSize: 14 }}>{summary.title ?? "Operational summary"}</h3>
          <p style={{ margin: "3px 0 0", color: TEXT_MUTED, fontSize: 11 }}>
            {summary.assetCount} asset{summary.assetCount === 1 ? "" : "s"}
            {range ? ` · ${range}` : ""}
          </p>
        </div>
        <span
          style={{
            borderRadius: 999,
            background: "#f4f4f5",
            padding: "4px 7px",
            color: TEXT_SECONDARY,
            fontSize: 10,
            fontWeight: 700,
          }}
        >
          {summary.generation === "ai" ? "AI briefing" : "evidence rollup"}
        </span>
      </header>
      <div style={{ display: "grid", gap: 7, marginTop: 12 }}>
        {summary.insights.map((insight) => {
          const evidence = insight.evidenceRecordIds.flatMap((id) => {
            const record = recordsById.get(id);
            return record ? [record] : [];
          });
          return (
            <button
              key={insight.id}
              type="button"
              aria-haspopup={onInsightSelect ? "dialog" : undefined}
              disabled={!onInsightSelect}
              title={onInsightSelect ? `Open ${evidence.length} supporting records` : undefined}
              onClick={() => onInsightSelect?.(insight, evidence)}
              style={{
                display: "grid",
                gridTemplateColumns: "88px minmax(0, 1fr) 18px",
                gap: 8,
                alignItems: "start",
                padding: "9px 10px",
                border: "1px solid #f0f0f1",
                borderRadius: 7,
                background: "#ffffff",
                color: TEXT_SECONDARY,
                cursor: onInsightSelect ? "pointer" : "default",
                fontFamily: FONT_FAMILY,
                textAlign: "left",
              }}
            >
              <span
                style={{
                  color: insight.kind === "observed" ? "#0369a1" : "#7e22ce",
                  fontSize: 9,
                  fontWeight: 800,
                  letterSpacing: "0.05em",
                }}
              >
                {insight.kind.toUpperCase()}
              </span>
              <span style={{ fontSize: 12, lineHeight: 1.45 }}>
                {insight.text}
                <small style={{ display: "block", marginTop: 3, color: TEXT_FAINT, fontSize: 10 }}>
                  {insight.evidenceLabel ?? `${evidence.length} supporting record${evidence.length === 1 ? "" : "s"}`}
                </small>
              </span>
              {onInsightSelect ? <ArrowRight size={14} color={PRIMARY} aria-hidden="true" /> : null}
            </button>
          );
        })}
      </div>
    </section>
  );
};

OperationalSummary.displayName = "OperationalSummary";
