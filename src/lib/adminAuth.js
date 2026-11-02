import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

export function normalizeRole(role) {
  const value = String(role || "").trim().toLowerCase();
  if (value === "mod") return "moderator";
  if (value === "super-admin") return "superadmin";
  return value;
}

export function canAccessAdminPanel(role) {
  return ["superadmin", "admin", "moderator", "support", "analyst"].includes(normalizeRole(role));
}

export function canWriteAdmin(role) {
  return ["superadmin", "admin", "moderator"].includes(normalizeRole(role));
}

/** Rol değiştirme: yalnızca superadmin (firestore.rules ile aynı). */
export function isSuperAdmin(role) {
  return normalizeRole(role) === "superadmin";
}

/** Kullanıcı silme ve banlama: admin ve superadmin (firestore.rules ile aynı). */
export function canManageUsers(role) {
  return ["superadmin", "admin"].includes(normalizeRole(role));
}

export function isAdminRole(role) {
  return canAccessAdminPanel(role);
}

export function roleLabel(role) {
  const map = {
    superadmin: "Süper Admin",
    admin: "Admin",
    moderator: "Moderatör",
    support: "Destek",
    analyst: "Analist",
    user: "Kullanıcı",
  };
  return map[normalizeRole(role)] || "Kullanıcı";
}

export async function fetchUserProfile(uid) {
  if (!uid) return null;
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return null;
  return { uid, ...snap.data() };
}

export async function requireAdminProfile(user) {
  if (!user?.uid) return null;
  const profile = await fetchUserProfile(user.uid);
  if (!profile || !canAccessAdminPanel(profile.role)) return null;
  if (profile.banned || profile.isSuspended) return null;
  return profile;
}

/** Oturumdaki yöneticinin rolü (yüklenene kadar boş string). Butonları rolle kısıtlamak için. */
export function useCurrentAdminRole() {
  const [role, setRole] = useState("");
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      const profile = user ? await fetchUserProfile(user.uid) : null;
      setRole(normalizeRole(profile?.role));
    });
    return () => unsub();
  }, []);
  return role;
}

export async function rejectNonAdminSession(message = "Bu panele yalnızca yetkili yöneticiler girebilir.") {
  try {
    await signOut(auth);
  } catch (err) {
    console.error("Admin oturumu kapatılamadı:", err);
  }
  return message;
}
