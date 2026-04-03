import React, { memo, useRef, useState, useCallback, useEffect } from "react";
import { ACCENT, BORDER, FONT_FAMILY, HOVER_BG, TEXT_FAINT, TEXT_MUTED, TEXT_SECONDARY } from "../../theme";

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

// ── Arrow Button ─────────────────────────────────────────────────────────────

const ScrollArrow = ({ direction, onClick }: { direction: "left" | "right"; onClick: () => void }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 22,
        height: 22,
        borderRadius: 4,
        border: BORDER,
        background: "#ffffff",
        cursor: "pointer",
        flexShrink: 0,
        color: TEXT_MUTED,
        padding: 0,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background = HOVER_BG;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = "#ffffff";
      }}
    >
      <svg
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        aria-hidden="true"
      >
        {direction === "left" ? <polyline points="15 18 9 12 15 6" /> : <polyline points="9 6 15 12 9 18" />}
      </svg>
    </button>
  );
};

// ── Component ────────────────────────────────────────────────────────────────

export const FilterChips = memo(function FilterChips({ chips, activeIds, onToggle, onClearAll }: FilterChipsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateArrows = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  }, []);

  const scroll = useCallback((direction: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: direction === "left" ? -150 : 150, behavior: "smooth" });
    setTimeout(updateArrows, 200);
  }, []);

  // Check overflow on mount and when chips change
  useEffect(() => {
    updateArrows();
  }, [chips, updateArrows]);

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
    <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 8px" }}>
      {canScrollLeft && <ScrollArrow direction="left" onClick={() => scroll("left")} />}

      <div
        ref={scrollRef}
        onScroll={updateArrows}
        onLoad={updateArrows}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          overflowX: "auto",
          padding: "4px 4px",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          flex: 1,
          minWidth: 0,
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

        {Array.from(categories.entries()).map(([category, categoryChips]) => (
          <React.Fragment key={category}>
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

      {canScrollRight && <ScrollArrow direction="right" onClick={() => scroll("right")} />}
    </div>
  );
});
