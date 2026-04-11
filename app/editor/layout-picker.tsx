"use client";

import type { PresetId } from "./preset-config";
import { PRESET_META, PRESET_ORDER } from "./preset-config";

const BG = "#0A0A0A";
const GLASS = "rgba(245,245,245,0.14)";
const HI = "#E8FF00";
const ACC = "rgba(245,245,245,0.85)";

function Thumbnail({ id }: { id: PresetId }) {
  switch (id) {
    case "minimal":
      return (
        <svg viewBox="0 0 48 48" className="h-full w-full" aria-hidden>
          <rect width={48} height={48} fill={BG} rx={4} />
          <rect x={6} y={34} width={36} height={8} fill={GLASS} rx={2} stroke={ACC} strokeWidth={0.4} />
          <rect x={10} y={36} width={10} height={2} fill={HI} rx={0.5} />
          <rect x={26} y={36} width={12} height={2} fill={ACC} rx={0.5} opacity={0.7} />
        </svg>
      );
    case "full":
      return (
        <svg viewBox="0 0 48 48" className="h-full w-full" aria-hidden>
          <rect width={48} height={48} fill={BG} rx={4} />
          <rect x={6} y={6} width={36} height={10} fill={GLASS} rx={2} stroke={ACC} strokeWidth={0.4} />
          <rect x={28} y={28} width={14} height={14} fill={GLASS} rx={2} stroke={ACC} strokeWidth={0.4} />
          <rect x={6} y={30} width={18} height={12} fill={GLASS} rx={2} stroke={ACC} strokeWidth={0.4} />
        </svg>
      );
    case "mapFocus":
      return (
        <svg viewBox="0 0 48 48" className="h-full w-full" aria-hidden>
          <rect width={48} height={48} fill={BG} rx={4} />
          <rect x={4} y={6} width={19} height={36} fill={GLASS} rx={2} stroke={HI} strokeWidth={0.5} />
          <path
            d="M8 28 L12 20 L16 26 L20 18"
            fill="none"
            stroke={HI}
            strokeWidth={1.2}
            strokeLinecap="round"
          />
          <rect x={26} y={8} width={18} height={4} fill={ACC} rx={1} opacity={0.5} />
          <rect x={26} y={14} width={18} height={4} fill={ACC} rx={1} opacity={0.5} />
          <rect x={26} y={20} width={18} height={4} fill={HI} rx={1} opacity={0.9} />
          <rect x={26} y={26} width={18} height={4} fill={ACC} rx={1} opacity={0.5} />
        </svg>
      );
    case "storyMode":
      return (
        <svg viewBox="0 0 48 56" className="h-full w-full" aria-hidden>
          <rect width={48} height={56} fill={BG} rx={4} />
          <rect x={8} y={10} width={32} height={40} fill={GLASS} rx={3} stroke={ACC} strokeWidth={0.4} />
          <rect x={12} y={14} width={16} height={2} fill={HI} rx={0.5} />
          <rect x={12} y={20} width={20} height={2} fill={ACC} rx={0.5} opacity={0.6} />
          <rect x={12} y={26} width={18} height={2} fill={ACC} rx={0.5} opacity={0.6} />
          <rect x={12} y={32} width={22} height={2} fill={HI} rx={0.5} opacity={0.8} />
          <rect x={12} y={38} width={14} height={2} fill={ACC} rx={0.5} opacity={0.6} />
        </svg>
      );
    case "darkCard":
      return (
        <svg viewBox="0 0 48 48" className="h-full w-full" aria-hidden>
          <rect width={48} height={48} fill={BG} rx={4} />
          <rect x={10} y={12} width={28} height={24} fill="rgba(18,18,20,0.92)" rx={3} stroke={GLASS} strokeWidth={0.6} />
          <rect x={14} y={16} width={6} height={3} fill={HI} rx={0.5} />
          <rect x={22} y={16} width={6} height={3} fill={ACC} rx={0.5} opacity={0.5} />
          <rect x={30} y={16} width={6} height={3} fill={ACC} rx={0.5} opacity={0.5} />
          <rect x={14} y={22} width={6} height={3} fill={ACC} rx={0.5} opacity={0.5} />
          <rect x={22} y={22} width={6} height={3} fill={HI} rx={0.5} opacity={0.8} />
          <rect x={30} y={22} width={6} height={3} fill={ACC} rx={0.5} opacity={0.5} />
        </svg>
      );
    default:
      return null;
  }
}

export function LayoutPicker({
  value,
  onChange,
  transitioning,
}: {
  value: PresetId;
  onChange: (id: PresetId) => void;
  transitioning: boolean;
}) {
  return (
    <div className="shrink-0">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#F5F5F5]/50">
        Layout preset
      </p>
      <div
        className="-mx-1 flex gap-2 overflow-x-auto pb-1 pt-0.5 [scrollbar-width:thin]"
        role="listbox"
        aria-label="Layout presets"
      >
        {PRESET_ORDER.map((id) => {
          const active = value === id;
          const meta = PRESET_META[id];
          return (
            <button
              key={id}
              type="button"
              role="option"
              aria-selected={active}
              title={meta.description}
              onClick={() => onChange(id)}
              className={`flex shrink-0 flex-col items-center gap-1.5 rounded-2xl border px-2.5 py-2 transition-all duration-300 ease-out ${
                active
                  ? "border-[#E8FF00]/80 bg-[#F5F5F5]/10 shadow-[0_0_24px_-4px_rgba(232,255,0,0.35)] backdrop-blur-md"
                  : "border-[#F5F5F5]/10 bg-[#F5F5F5]/[0.04] backdrop-blur-md hover:border-[#F5F5F5]/25"
              } ${transitioning ? "pointer-events-none opacity-60" : ""}`}
            >
              <div
                className={`h-14 w-12 overflow-hidden rounded-lg transition-transform duration-300 sm:h-16 sm:w-[52px] ${
                  active ? "scale-105" : "scale-100"
                }`}
              >
                <Thumbnail id={id} />
              </div>
              <span
                className={`max-w-[4.5rem] text-center text-[10px] font-bold leading-tight sm:max-w-[5rem] sm:text-[11px] ${
                  active ? "text-[#E8FF00]" : "text-[#F5F5F5]/70"
                }`}
              >
                {meta.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
