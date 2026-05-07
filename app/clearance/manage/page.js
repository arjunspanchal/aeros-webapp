import { permanentRedirect } from "next/navigation";

// Old `/clearance/manage` URL kept as a permanent redirect to the new
// location under WarehouseOS. Bookmarks keep working.
export default function LegacyClearanceManageRedirect() {
  permanentRedirect("/warehouse/clearance/manage");
}
