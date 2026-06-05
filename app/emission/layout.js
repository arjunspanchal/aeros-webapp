// Emission · Service OS — isolated route-module layout. Owns its own theme,
// fonts, and PIN gate. Completely independent of the host Aeros app's layout,
// nav, and auth (this subtree is not in middleware.js's matcher).
import "./emission.css";
import Shell from "./_components/Shell";

export const metadata = {
  title: "Emission · Service OS",
  description: "Internal job book, money visibility, and warranty-claim tracking for Emission Electronics.",
};

export default function EmissionLayout({ children }) {
  return (
    <div className="emission-root">
      <Shell>{children}</Shell>
    </div>
  );
}
