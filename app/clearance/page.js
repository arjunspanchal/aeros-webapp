import { permanentRedirect } from "next/navigation";

// Old `/clearance` URL kept as a permanent redirect to the new location
// under WarehouseOS. WhatsApp deeplinks and any external links keep working.
export default function LegacyClearanceRedirect() {
  permanentRedirect("/warehouse/clearance");
}
