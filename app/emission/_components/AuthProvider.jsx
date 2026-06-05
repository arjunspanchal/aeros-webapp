"use client";
import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { loadSession, clearSession, verifyPin } from "../_lib/auth";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null); // { token, role, expiresAt }
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSession(loadSession());
    setReady(true);
    // Re-check on focus so an expired trusted-device token re-prompts promptly.
    const onFocus = () => setSession(loadSession());
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const login = useCallback(async (role, pin) => {
    const res = await verifyPin(role, pin);
    if (res.ok) setSession(res.session);
    return res;
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setSession(null);
  }, []);

  return (
    <AuthCtx.Provider value={{ session, ready, login, logout, isAdmin: session?.role === "admin" }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
