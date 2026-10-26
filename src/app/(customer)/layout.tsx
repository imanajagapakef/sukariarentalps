import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-chrome";

export default function CustomerLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // The horizontal clip also lives here, on a plain wrapper, not only on `html`:
    // iOS Safari ignores `overflow` set on `html`/`body` whenever a viewport meta
    // tag is present, which is why a root guard by itself still let this page
    // drag. On an ordinary element the clip is honoured. `clip`, not `hidden`:
    // `hidden` would make this div a scroll container and unstick the header,
    // while `clip` clips without becoming a scrolling box, so the sticky header
    // keeps resolving against the viewport.
    <div className="flex min-h-dvh flex-col overflow-x-clip">
      <SiteHeader />
      <main id="konten" className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
