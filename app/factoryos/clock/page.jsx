// Factory-worker punch clock. Public surface (no hub session) — workers sign
// in with phone + SMS OTP, then check in / check out for the day. Auth is the
// employee session cookie; the client drives everything off the clock API.
import ClockClient from "./ClockClient";
import { getEmpSession } from "@/lib/factoryos/empAuth";

export const metadata = { title: "Attendance · Aeros" };

export default function ClockPage() {
  const session = getEmpSession();
  return <ClockClient initialSignedIn={!!session} />;
}
