import Link from "next/link";

import { LincolnAbe, LincolnLogo } from "@/components/brand/lincoln-logo";

/** Lincoln Financial logo with the CareWindow product name; the Abe mark alone on narrow phones. */
export function Wordmark() {
  return (
    <Link href="/" aria-label="CareWindow by Lincoln Financial, home" className="inline-flex h-11 shrink-0 items-center gap-2.5 rounded-md text-foreground sm:gap-3">
      <LincolnAbe className="h-8 sm:hidden" />
      <LincolnLogo className="hidden h-8 sm:block" />
      <span aria-hidden className="hidden h-6 w-px bg-border sm:block" />
      <span className="font-display text-[17px] leading-none font-semibold tracking-tight text-primary sm:text-lg">CareWindow</span>
    </Link>
  );
}
