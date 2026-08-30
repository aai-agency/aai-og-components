import { ExternalLink } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

import { FONT_FAMILY, PRIMARY, TEXT_FAINT, TEXT_HEADING, TEXT_MUTED } from "../../theme";
import { Tooltip } from "../ui/tooltip";

export interface MetricCardProps {
  label: string;
  value: ReactNode;
  unit?: string;
  context?: ReactNode;
  contributorCount?: number;
  onClick?: () => void;
  tooltip?: string;
  className?: string;
  style?: CSSProperties;
}

export const MetricCard = ({
  label,
  value,
  unit,
  context,
  contributorCount,
  onClick,
  tooltip,
  className,
  style,
}: MetricCardProps) => {
  const content = (
    <button
      type="button"
      className={className}
      aria-haspopup={onClick ? "dialog" : undefined}
      disabled={!onClick}
      onClick={onClick}
      style={{
        display: "grid",
        minWidth: 0,
        minHeight: 112,
        padding: 14,
        border: "1px solid #e4e4e7",
        borderRadius: 8,
        background: "#ffffff",
        color: TEXT_HEADING,
        cursor: onClick ? "pointer" : "default",
        fontFamily: FONT_FAMILY,
        textAlign: "left",
        ...style,
      }}
    >
      <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ color: TEXT_FAINT, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em" }}>
          {label.toUpperCase()}
        </span>
        {onClick ? <ExternalLink size={13} color={PRIMARY} aria-hidden="true" /> : null}
      </span>
      <span style={{ alignSelf: "end", marginTop: 10, fontSize: 25, fontWeight: 700, lineHeight: 1 }}>
        {value} {unit ? <small style={{ color: TEXT_MUTED, fontSize: 11, fontWeight: 600 }}>{unit}</small> : null}
      </span>
      {context || contributorCount != null ? (
        <span style={{ marginTop: 7, color: TEXT_MUTED, fontSize: 11 }}>
          {context}
          {context && contributorCount != null ? " · " : null}
          {contributorCount != null ? `${contributorCount} contributor${contributorCount === 1 ? "" : "s"}` : null}
        </span>
      ) : null}
    </button>
  );
  return onClick ? <Tooltip label={tooltip ?? `Open ${label} contributors`}>{content}</Tooltip> : content;
};

MetricCard.displayName = "MetricCard";
