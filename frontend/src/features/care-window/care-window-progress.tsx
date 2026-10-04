export function CareWindowProgress() {
  return (
    <nav aria-label="Care planning steps" className="sticky top-14 z-30 grid grid-cols-2 gap-1 rounded-lg border bg-background/95 p-2 backdrop-blur sm:grid-cols-4 md:top-16">
      {[["passport-heading", "1 Benefits"], ["before-heading", "2 Find a visit"], ["after-heading", "3 Confirm care"], ["care-plan-heading", "4 My care plan"]].map(([id, label]) => (
        <a key={id} href={`#${id}`} className="rounded-md px-3 py-2 text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-primary">{label}</a>
      ))}
    </nav>
  );
}
