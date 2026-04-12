/** Replace with LinkedIn, portfolio, or personal site when ready. */
const AUTHOR_LINK_HREF: string | null = null;
const AUTHOR_LINK_LABEL = "Site";

function BicycleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="6.5" cy="15.5" r="3.25" />
      <circle cx="17.5" cy="15.5" r="3.25" />
      <path d="M6.5 15.5h3l2.5-7 3 4h3.5" />
      <path d="M12 8.5 9.5 15.5" />
    </svg>
  );
}

export function Footer() {
  return (
    <footer
      className="shrink-0 border-t border-[#F5F5F5]/[0.06] px-4 py-3 text-center text-[11px] leading-relaxed text-[#666] sm:text-xs sm:py-4"
      role="contentinfo"
    >
      <p className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1">
        <BicycleIcon className="inline h-3.5 w-3.5 shrink-0 opacity-90 sm:h-4 sm:w-4" />
        <span>Built by Josue Cifuentes</span>
        {AUTHOR_LINK_HREF ? (
          <>
            <span className="text-[#555]" aria-hidden>
              ·
            </span>
            <a
              href={AUTHOR_LINK_HREF}
              className="text-[#666] underline decoration-[#666]/40 underline-offset-2 transition-colors hover:text-[#888] hover:decoration-[#888]/60"
              target="_blank"
              rel="noopener noreferrer"
            >
              {AUTHOR_LINK_LABEL}
            </a>
          </>
        ) : null}
      </p>
    </footer>
  );
}
