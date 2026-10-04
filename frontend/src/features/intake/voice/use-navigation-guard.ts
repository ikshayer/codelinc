"use client";

import { useEffect, useState } from "react";

function isModifiedClick(event: MouseEvent): boolean {
  return event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

/** The in-app destination of a plain left click on an internal link, or null if the click should pass through. */
function internalDestination(event: MouseEvent): string | null {
  if (event.defaultPrevented || isModifiedClick(event) || !(event.target instanceof Element)) return null;
  const anchor = event.target.closest("a[href]");
  if (!(anchor instanceof HTMLAnchorElement)) return null;
  if ((anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download")) return null;
  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return null;
  // Same page (or a hash on it) doesn't leave the conversation.
  if (url.pathname === window.location.pathname && url.search === window.location.search) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * While a conversation is active, internal link clicks (including switching
 * intake method) are held until the person chooses to stay or leave. The
 * capture-phase listener runs before Next's Link handler, so nothing navigates
 * first. `beforeunload` covers reload, tab close and external links.
 * Returns the held destination and a way to clear it.
 */
export function useNavigationGuard(active: boolean): { pendingHref: string | null; clearPending: () => void } {
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;
    const onClick = (event: MouseEvent) => {
      const href = internalDestination(event);
      if (href === null) return;
      event.preventDefault();
      event.stopPropagation();
      setPendingHref(href);
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    document.addEventListener("click", onClick, true);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [active]);

  return { pendingHref: active ? pendingHref : null, clearPending: () => setPendingHref(null) };
}
