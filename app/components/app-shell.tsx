"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconActivities,
  IconCoach,
  IconEditor,
  IconHome,
  IconLink,
} from "./nav-icons";

const nav = [
  { href: "/", label: "Home", Icon: IconHome },
  { href: "/login", label: "Connect", Icon: IconLink },
  { href: "/activities", label: "Activities", Icon: IconActivities },
  { href: "/editor", label: "Editor", Icon: IconEditor },
  { href: "/coach", label: "Coach", Icon: IconCoach },
] as const;

export function AppShell({
  children,
  footer,
}: {
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-[100dvh] flex-1 flex-col bg-[#0A0A0A] pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))]">
      <main className="flex min-h-0 flex-1 flex-col">{children}</main>
      {footer}

      <nav
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#F5F5F5]/10 bg-[#0A0A0A]/80 backdrop-blur-xl"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        aria-label="Primary"
      >
        <ul className="mx-auto flex max-w-lg items-stretch justify-around gap-1 px-2 pt-2">
          {nav.map(({ href, label, Icon }) => {
            const active =
              href === "/"
                ? pathname === "/"
                : pathname === href || pathname.startsWith(`${href}/`);
            return (
              <li key={href} className="min-w-0 flex-1">
                <Link
                  href={href}
                  className={`flex min-h-[3.25rem] flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1.5 text-[10px] font-semibold tracking-wide transition-colors duration-200 sm:min-h-14 sm:text-xs ${
                    active
                      ? "text-[#E8FF00]"
                      : "text-[#F5F5F5]/45 hover:text-[#F5F5F5]/85"
                  }`}
                >
                  <Icon
                    className={`h-6 w-6 shrink-0 sm:h-7 sm:w-7 ${active ? "stroke-[2.25px]" : ""}`}
                  />
                  <span className="truncate">{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
