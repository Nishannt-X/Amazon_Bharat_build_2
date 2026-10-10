/**
 * MapHero: compact product intro strip above the reporting map.
 *
 * Static Server Component (no client directive, no state, no motion).
 * Replaces the long header paragraph so the map stays dominant on phones:
 * one short h1 plus one short supporting sentence on 320-430px viewports,
 * with a secondary trust line revealed at 480px and up. No CTA, no imagery,
 * no live status or statistics. Copy matches the location-first workflow and
 * the device-local boundary in src/lib/report.ts.
 */
export default function MapHero() {
  return (
    <section
      aria-labelledby="map-hero-heading"
      className="ff-hero min-w-0 shrink-0 border-b border-border bg-surface px-4 py-3 sm:py-4"
    >
      <h1
        id="map-hero-heading"
        className="min-w-0 max-w-[22ch] text-2xl font-semibold leading-[1.15] tracking-[-0.02em] text-foreground min-[420px]:text-[28px] sm:text-[32px]"
        style={{ textWrap: "balance" }}
      >
        Report waterlogging where you are
      </h1>
      <span
        aria-hidden="true"
        className="mt-2.5 block h-1 w-11 rounded-full bg-accent"
      />
      <p className="mt-2 min-w-0 max-w-[62ch] text-base leading-relaxed text-foreground-secondary">
        Report waterlogging where you are. GPS binds the photo to your position.
      </p>
    </section>
  );
}
