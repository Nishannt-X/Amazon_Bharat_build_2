'use client';

import { useId, useState } from 'react';
import { Crosshair, MapPin, Search } from 'lucide-react';

export interface PlaceSearchResult {
  id: string;
  label: string;
  /** Extra context for ambiguous names, e.g. "Bengaluru, Karnataka". */
  detail?: string;
  lat: number;
  lng: number;
}

export type LocationSearchBarStatus =
  | 'idle'
  | 'searching'
  | 'ready'
  | 'empty'
  | 'error';

export interface PlaceSearchAttribution {
  text: string;
  photonUrl: string;
  osmUrl: string;
}

export interface LocationSearchBarProps {
  helpText?: string;
  /** Results supplied by the parent provider. This component never fetches. */
  results?: PlaceSearchResult[];
  status?: LocationSearchBarStatus;
  errorMessage?: string | null;
  /** False when no geocoder provider is configured. Search stays honestly
   *  unavailable, but the input remains editable so typed text is never lost. */
  hasProvider?: boolean;
  /** Visible credit for the search backend, rendered near the field. */
  attribution?: PlaceSearchAttribution | null;
  /** Last explicitly submitted text, for the "results for X" caption. */
  committedQuery?: string;
  /** Hide the built-in location button when the parent already renders its
   *  own location request UI (avoids duplicate actions). */
  hideLocationButton?: boolean;
  /** True while the parent GPS request is in flight. Disables only the GPS button. */
  isLocating?: boolean;
  /** Uncontrolled initial text. Ignored once `query` is provided. */
  defaultQuery?: string;
  /** Controlled input text. When provided with `onQueryChange`, typing
   *  survives phase unmount/remount because the parent owns the state. */
  query?: string;
  onQueryChange?: (query: string) => void;
  selectedResultId?: string | null;
  onSearch: (query: string) => void;
  onSelectResult: (result: PlaceSearchResult) => void;
  onRequestLocation: () => void;
}

export default function LocationSearchBar({
  helpText = 'Choose a search result to focus this location.',
  results = [],
  status = 'idle',
  errorMessage = null,
  hasProvider = false,
  hideLocationButton = false,
  isLocating = false,
  defaultQuery = '',
  query: controlledQuery,
  onQueryChange,
  attribution = null,
  committedQuery = '',
  selectedResultId = null,
  onSearch,
  onSelectResult,
  onRequestLocation,
}: LocationSearchBarProps) {
  const [uncontrolledQuery, setUncontrolledQuery] = useState(defaultQuery);
  const isControlled = controlledQuery !== undefined;
  const query = isControlled ? controlledQuery : uncontrolledQuery;
  function setQuery(next: string) {
    if (isControlled) onQueryChange?.(next);
    else setUncontrolledQuery(next);
  }
  const baseId = useId();
  const inputId = `${baseId}-input`;
  const helpId = `${baseId}-help`;
  const statusId = `${baseId}-status`;

  const trimmed = query.trim();
  const searchDisabled = !hasProvider || status === 'searching' || trimmed.length === 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (searchDisabled) return;
    onSearch(trimmed);
  }

  return (
    <section
      aria-label="Place search"
      className="ff-plate w-full min-w-0 p-3.5"
    >
      <div className="flex min-w-0 flex-col gap-2 min-[360px]:flex-row min-[360px]:items-center min-[360px]:justify-between">
        <label
          htmlFor={inputId}
          className="min-w-0 shrink-0 text-base font-medium text-foreground"
        >
          Search location
        </label>
        {hideLocationButton ? null : (
          <button
            type="button"
            onClick={onRequestLocation}
            disabled={isLocating}
            aria-live="polite"
            className="inline-flex min-h-12 min-w-11 shrink-0 items-center justify-center gap-2 self-end rounded-xl border border-border bg-accent-soft px-3.5 text-base font-semibold text-accent transition-transform active:scale-[0.98] disabled:opacity-60 min-[360px]:self-auto"
          >
            <Crosshair className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
            {isLocating ? 'Finding you…' : 'Use my location'}
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} noValidate className="mt-2.5 min-w-0">
        <div className="flex min-w-0 gap-2">
          <span className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-foreground-secondary"
              aria-hidden="true"
            />
            <input
              id={inputId}
              type="search"
              autoComplete="off"
              enterKeyHint="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Area or address"
              aria-describedby={`${helpId} ${statusId}`}
              aria-busy={status === 'searching'}
              className="ff-field min-w-0 !pl-10 disabled:opacity-60"
            />
          </span>
          <button
            type="submit"
            disabled={searchDisabled}
            title={
              !hasProvider
                ? 'Place search needs a location search provider before it can run'
                : undefined
            }
            aria-describedby={statusId}
            className="inline-flex min-h-12 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-border-strong bg-surface px-4 text-base font-semibold text-foreground transition-transform active:scale-[0.98] disabled:opacity-50"
          >
            <Search className="h-5 w-5 shrink-0" aria-hidden="true" />
            Search
          </button>
        </div>

        <p id={helpId} className="ff-help mt-2">
          {helpText}
          {hasProvider && attribution ? (
            <>
              {' '}Search by{' '}
              <a
                href={attribution.photonUrl}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                Photon
              </a>{' '}
              · ©{' '}
              <a
                href={attribution.osmUrl}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                OpenStreetMap
              </a>{' '}
              contributors.
            </>
          ) : null}
        </p>

        <div id={statusId} aria-live="polite" className="mt-1.5 min-w-0">
          {!hasProvider ? (
            <p className="ff-help">
              Place search isn&apos;t available yet — it needs a location
              search provider before it can run. Your text stays here. Use
              your location or drag the pin.
            </p>
          ) : null}
          {hasProvider && status === 'searching' ? (
            <p role="status" className="ff-help">
              Searching…
            </p>
          ) : null}
          {hasProvider && status === 'empty' ? (
            <p role="status" className="ff-help">
              No matches. Try an area or address, or place the pin by hand.
            </p>
          ) : null}
          {hasProvider && status === 'error' ? (
            <p role="alert" className="ff-help !text-foreground">
              {errorMessage ?? 'Search failed. Try again.'}
            </p>
          ) : null}
        </div>
      </form>

      {hasProvider && (status === 'ready' || status === 'empty') && committedQuery ? (
        <p className="ff-help mt-2 truncate">
          Results for “{committedQuery}”. Tap a result to select it.
        </p>
      ) : null}
      {hasProvider && status === 'ready' && results.length > 0 ? (
        <ul
          aria-label="Place results"
          className="mt-2 max-h-60 min-w-0 space-y-1 overflow-y-auto scroll-pb-4"
        >
          {results.map((r) => {
            const selected = r.id === selectedResultId;
            return (
              <li key={r.id} className="min-w-0">
                <button
                  type="button"
                  onClick={() => onSelectResult(r)}
                  aria-current={selected ? 'true' : undefined}
                  aria-label={`${r.label}${r.detail ? `, ${r.detail}` : ''}`}
                  className={`flex min-h-11 w-full min-w-0 items-center gap-2 rounded-lg border px-3 py-2 text-left transition-transform active:scale-[0.99] ${
                    selected
                      ? 'border-accent bg-accent-soft'
                      : 'border-border bg-surface'
                  }`}
                >
                  <MapPin
                    className="h-4 w-4 shrink-0 text-foreground-secondary"
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-medium text-foreground">
                      {r.label}
                    </span>
                    {r.detail ? (
                      <span className="block truncate text-sm text-foreground-secondary">
                        {r.detail}
                      </span>
                    ) : null}
                    <span className="ff-coords block truncate text-foreground-secondary">
                      {r.lat.toFixed(5)}, {r.lng.toFixed(5)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
