"use client";

import { useRef } from "react";

type Option = [value: string, label: string];

/**
 * Filters for the bookings list. A plain GET form, so filters live in the page address
 * (bookmarkable) and work without JavaScript; dropdowns apply as soon as they change.
 */
export function FilterBar({
  action,
  values,
  options,
  sort,
  dir,
  filtered,
}: {
  action: string;
  values: Record<string, string>;
  options: { carriers: Option[]; vessels: Option[]; terminals: Option[]; statuses: Option[]; actions: Option[] };
  sort: string | null;
  dir: string;
  filtered: boolean;
}) {
  const form = useRef<HTMLFormElement>(null);
  const submit = () => form.current?.requestSubmit();
  const select = (name: string, label: string, opts: Option[], all: string) => (
    <label className="filter">
      <span>{label}</span>
      <select name={name} defaultValue={values[name] ?? ""} onChange={submit}>
        <option value="">{all}</option>
        {opts.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <form ref={form} method="get" action={action} className="filter-bar" role="search" aria-label="Filter bookings">
      {sort && <input type="hidden" name="sort" value={sort} />}
      {sort && <input type="hidden" name="dir" value={dir} />}
      <label className="filter filter-search">
        <span>Search</span>
        <input type="search" name="q" defaultValue={values.q ?? ""} placeholder="Booking or vessel" autoComplete="off" />
      </label>
      {select("carrier", "Carrier", options.carriers, "All carriers")}
      {select("vessel", "Vessel", options.vessels, "All vessels")}
      {select("status", "Status", options.statuses, "Any status")}
      {options.terminals.length > 1 && select("terminal", "Terminal", options.terminals, "All terminals")}
      {select("action", "Needs action", options.actions, "Anything")}
      <div className="filter-buttons">
        <button type="submit" className="secondary small-button">
          Apply
        </button>
        {filtered && (
          <a href={sort ? `${action}?sort=${sort}&dir=${dir}` : action} className="small">
            Clear
          </a>
        )}
      </div>
    </form>
  );
}
