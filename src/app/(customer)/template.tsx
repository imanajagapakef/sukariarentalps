/**
 * Customer route arrival.
 *
 * A `template` (not a `layout`) is re-created on navigation, which is exactly
 * what a page-arrival animation needs — and it sits *below* `(customer)/layout.tsx`,
 * so the header and footer stay mounted while only the page content plays. A 6px
 * rise is enough to read as "new view" without taxing a page the visitor already
 * asked for. `prefers-reduced-motion` drops it to a single frame (see globals.css).
 */
export default function CustomerTemplate({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="animate-page-in">{children}</div>;
}
