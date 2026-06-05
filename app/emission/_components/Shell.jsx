"use client";
import { usePathname } from "next/navigation";
import { AuthProvider, useAuth } from "./AuthProvider";
import PinGate from "./PinGate";
import TopBar from "./TopBar";

// Routes that are reachable WITHOUT a PIN (public, anon).
const PUBLIC_PATHS = ["/emission/status"];

function Gate({ children }) {
  const { session, ready } = useAuth();
  const pathname = usePathname();
  const isPublic = PUBLIC_PATHS.includes(pathname);

  if (isPublic) return children;
  if (!ready) return <div style={{ minHeight: "100vh" }} />; // avoid PIN/flash before localStorage read
  if (!session) return <PinGate />;

  return (
    <>
      <TopBar />
      <main style={{ maxWidth: 1080, margin: "0 auto", padding: "20px 16px 80px" }}>{children}</main>
    </>
  );
}

export default function Shell({ children }) {
  return (
    <AuthProvider>
      <Gate>{children}</Gate>
    </AuthProvider>
  );
}
