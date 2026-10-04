import Link from "next/link";

/** Simple CareWindow wordmark: a framed opening — the window of permitted dates. */
export function Wordmark() {
  return (
    <Link href="/" className="inline-flex h-11 shrink-0 items-center gap-2 rounded-md text-base font-semibold sm:text-[17px] tracking-tight text-foreground">
      <svg aria-hidden viewBox="0 0 20 20" className="size-5 text-primary">
        <rect x="1.5" y="1.5" width="17" height="17" rx="4" fill="none" stroke="currentColor" strokeWidth="1.75" />
        <path d="M10 1.5v17" stroke="currentColor" strokeWidth="1.75" />
        <rect x="11.5" y="5" width="4" height="10" rx="1.25" fill="currentColor" />
      </svg>
      CareWindow
    </Link>
  );
}
