"use client";

import { MenuIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useAnalysisController } from "@/features/analysis/analysis-provider";
import { cn } from "@/lib/utils";
import { Wordmark } from "./wordmark";

const NAV = [
  { href: "/dashboard", label: "Home" },
  { href: "/care-window", label: "Plan my care" },
  { href: "/history", label: "History" },
  { href: "/profile", label: "Profile" },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Page title shown beside the wordmark on phones, outside the menu. */
function mobileTitle(pathname: string): string {
  if (pathname === "/dashboard") return "Home";
  if (pathname.startsWith("/care-window")) return "Plan my care";
  if (pathname.startsWith("/history")) return "History";
  if (pathname.startsWith("/profile")) return "Profile";
  if (pathname === "/sign-in") return "Sign in";
  if (pathname.startsWith("/analysis/new")) return "New analysis";
  if (pathname.endsWith("/intake")) return "Describe";
  if (pathname.endsWith("/confirm")) return "Confirm";
  if (pathname.endsWith("/compare")) return "Compare";
  return "";
}

export function SiteHeader() {
  const pathname = usePathname();
  const { adapters } = useAnalysisController();
  const [menuOpen, setMenuOpen] = useState(false);
  const demo = adapters.mode === "demo";
  const title = mobileTitle(pathname);

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
      <div className="mx-auto flex h-14 max-w-[1120px] items-center gap-3 px-4 sm:gap-6 sm:px-5 md:h-16 md:px-8">
        <Wordmark />

        <nav aria-label="Main" className="hidden flex-1 items-center gap-1 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(pathname, item.href) ? "page" : undefined}
              className={cn(
                "inline-flex h-11 items-center rounded-md px-3 text-[15px] text-muted-foreground transition-colors hover:text-foreground",
                "aria-[current=page]:font-medium aria-[current=page]:text-foreground",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-4 md:flex">
          {demo && <DemoLabel />}
          <Button asChild>
            <Link href="/analysis/new">New analysis</Link>
          </Button>
        </div>

        {title && <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-muted-foreground md:hidden">{title}</span>}

        <div className="ml-auto flex shrink-0 items-center gap-2 md:hidden">
          {demo && <DemoLabel compact />}
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm">
                <MenuIcon aria-hidden />
                Menu
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[min(20rem,100vw)]">
              <SheetHeader>
                <SheetTitle>Menu</SheetTitle>
                <SheetDescription>{demo ? "Demo mode with synthetic data." : "CareWindow"}</SheetDescription>
              </SheetHeader>
              <nav aria-label="Mobile" className="flex flex-col gap-1 px-4">
                {[NAV[0], { href: "/analysis/new", label: "New analysis" }, ...NAV.slice(1)].map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    aria-current={isActive(pathname, item.href) ? "page" : undefined}
                    className="flex h-12 items-center rounded-md px-3 text-base hover:bg-muted aria-[current=page]:bg-accent aria-[current=page]:font-medium aria-[current=page]:text-accent-foreground"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

function DemoLabel({ compact = false }: { compact?: boolean }) {
  return (
    <span className="rounded-md border border-primary/25 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-primary" title="Synthetic data. Services are simulated.">
      {compact ? "Demo" : "Demo mode"}
      {compact && <span className="sr-only"> mode: synthetic data, simulated services</span>}
    </span>
  );
}
