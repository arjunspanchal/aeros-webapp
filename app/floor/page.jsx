// Shop-floor operator page. PUBLIC — opened by scanning the QR pasted on the
// machine; no hub login (it sits outside the middleware matcher, like the
// punch clock). All data flows through /api/floor/* which run server-side with
// the service-role key. The page is a single big-button wizard.
import FloorClient from "./FloorClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Production — Aeros",
  robots: { index: false, follow: false },
};

export default function FloorPage() {
  return <FloorClient />;
}
