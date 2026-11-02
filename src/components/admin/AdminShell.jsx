"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { collection, onSnapshot } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { rejectNonAdminSession, requireAdminProfile } from "@/lib/adminAuth";
import AdminLayout from "@/components/admin/AdminLayout";

export default function AdminShell({ active, children }) {
  const router = useRouter();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pendingReports, setPendingReports] = useState(0);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/admin/login");
        return;
      }
      const adminProfile = await requireAdminProfile(user);
      if (!adminProfile) {
        await rejectNonAdminSession();
        router.replace("/admin/login");
        return;
      }
      setProfile(adminProfile);
      setLoading(false);
    });
    return () => unsub();
  }, [router]);

  useEffect(() => {
    if (!profile) return;
    const unsub = onSnapshot(collection(db, "reports"), (snapshot) => {
      let count = 0;
      snapshot.forEach((docSnap) => {
        if ((docSnap.data().status || "Bekliyor") === "Bekliyor") count += 1;
      });
      setPendingReports(count);
    });
    return () => unsub();
  }, [profile]);

  const handleLogout = async () => {
    await signOut(auth);
    router.replace("/admin/login");
  };

  const handleNavigate = (id) => {
    router.push(id === "dashboard" ? "/admin" : `/admin/${id}`);
  };

  if (loading || !profile) {
    return (
      <div className="cloop-admin-login">
        <p className="cloop-admin-login-status">Yönetim paneli hazırlanıyor...</p>
      </div>
    );
  }

  return (
    <AdminLayout
      profile={profile}
      active={active}
      pendingReports={pendingReports}
      onNavigate={handleNavigate}
      onLogout={handleLogout}
    >
      {children}
    </AdminLayout>
  );
}

export function formatAdminDate(value) {
  if (!value) return "—";
  const date = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" });
}

function pagerItems(page, pages) {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i);
  const items = [0];
  const from = Math.max(1, page - 1);
  const to = Math.min(pages - 2, page + 1);
  if (from > 1) items.push("gap-start");
  for (let i = from; i <= to; i += 1) items.push(i);
  if (to < pages - 2) items.push("gap-end");
  items.push(pages - 1);
  return items;
}

export function AdminPager({ page, pages, onPage, numbered = false }) {
  if (pages <= 1) return null;
  return (
    <div className="cloop-admin-pager">
      <button type="button" disabled={page <= 0} onClick={() => onPage(page - 1)}>Önceki</button>
      {numbered ? (
        <span className="cloop-admin-pager-numbers">
          {pagerItems(page, pages).map((item) =>
            typeof item === "string" ? (
              <span key={item}>…</span>
            ) : (
              <button
                key={item}
                type="button"
                className={item === page ? "is-current" : ""}
                aria-current={item === page ? "page" : undefined}
                onClick={() => onPage(item)}
              >
                {item + 1}
              </button>
            )
          )}
        </span>
      ) : (
        <span>{page + 1} / {pages}</span>
      )}
      <button type="button" disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>Sonraki</button>
    </div>
  );
}

export function toDate(value) {
  if (!value) return null;
  if (value?.toDate) return value.toDate();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
