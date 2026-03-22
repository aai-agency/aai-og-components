import React, { memo, useRef, useState, useCallback } from "react";
import {
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  TEXT_MUTED,
  TEXT_FAINT,
  ACCENT,
  ACCENT_15,
  BORDER,
  FONT_FAMILY,
  HOVER_BG,
} from "../theme";

// ── Types ────────────────────────────────────────────────────────────────────

export interface FilterChip {
  id: string;
  label: string;
  count: number;
  color?: string;
  /** Category this chip belongs to (e.g., "type", "status", "operator") */
  category: string;
}

export interface FilterChipsProps {
  chips: FilterChip[];
  /** Currently active chip IDs */
  activeIds: Set<string>;
  /** Called when a chip is toggled */
  onToggle: (chipId: string) => void;
  /** Called when all filters are cleared */
  onClearAll?: () => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export const FilterChips = memo(function FilterChips({
  chips,
  activeIds,
  onToggle,
  onClearAll,
}: FilterChipsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(true);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setShowLeftFade(el.scrollLeft > 4);
    setShowRightFade(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  }, []);

  if (chips.length === 0) return null;

  const hasActive = activeIds.size > 0;

  // Group chips by category for visual separators
  const categories = new Map<string, FilterChip[]>();
  for (const chip of chips) {
    const arr = categories.get(chip.category);
    if (arr) arr.push(chip);
    else categories.set(chip.category, [chip]);
  }

  return (
    <div style={{ position: "relative" }}>
      {/* Left fade */}
      {showLeftFade && (
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: 24,
            background: "linear-gradient(to right, rgba(255,255,255,0.95), transparent)",
            zIndex: 2,
            pointerEvents: "none",
            borderRadius: "8px 0 0 8px",
          }}
        />
      )}

      {/* Right fade */}
      {showRightFade && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: 0,
            bottom: 0,
            width: 24,
            background: "linear-gradient(to left, rgba(255,255,255,0.95), transparent)",
            zIndex: 2,
            pointerEvents: "none",
            borderRadius: "0 8px 8px 0",
          }}
        />
      )}

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          overflowX: "auto",
          padding: "8px 12px",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        }}
      >
        {/* "All" chip */}
        <button
          type="button"
          onClick={onClearAll}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "5px 12px",
            borderRadius: 20,
            border: hasActive ? BORDER : "1px solid transparent",
            background: hasActive ? "transparent" : ACCENT,
            color: hasActive ? TEXT_MUTED : "#ffffff",
            fontSize: 11,
            fontWeight: 600,
            fontFamily: FONT_FAMILY,
            cursor: "pointer",
            whiteSpace: "nowrap",
            flexShrink: 0,
            transition: "all 0.15s",
          }}
        >
          All
        </button>

        {Array.from(categories.entries()).map(([category, categoryChips], catIdx) => (
          <React.Fragment key={category}>
            {/* Category separator (thin dot) */}
            {catIdx > 0 && (
              <div
                style={{
                  width: 3,
                  height: 3,
                  borderRadius: "50%",
                  background: TEXT_FAINT,
                  flexShrink: 0,
                  margin: "0 2px",
                }}
              />
            )}

            {categoryChips.map((chip) => {
              const isActive = activeIds.has(chip.id);
              return (
                <button
                  type="button"
                  key={chip.id}
                  onClick={() => onToggle(chip.id)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    padding: "5px 12px",
                    borderRadius: 20,
                    border: isActive ? `1px solid ${chip.color ?? ACCENT}40` : BORDER,
                    background: isActive ? `${chip.color ?? ACCENT}15` : "transparent",
                    color: isActive ? (chip.color ?? ACCENT) : TEXT_SECONDARY,
                    fontSize: 11,
                    fontWeight: 500,
                    fontFamily: FONT_FAMILY,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                    transition: "all 0.15s",
                  }}
                >
                  {chip.color && (
                    <div
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: chip.color,
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <span>{chip.label}</span>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      color: isActive ? (chip.color ?? ACCENT) : TEXT_FAINT,
                      opacity: isActive ? 0.8 : 1,
                    }}
                  >
                    {chip.count}
                  </span>
                </button>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
});
