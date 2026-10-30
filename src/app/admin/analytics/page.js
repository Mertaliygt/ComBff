"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import AdminShell, { toDate } from "@/components/admin/AdminShell";

export default function AdminAnalyticsPage() {
  const [users, setUsers] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [usersSnap, groupsSnap] = await Promise.all([
          getDocs(collection(db, "users")),
          getDocs(collection(db, "groups")),
        ]);
        if (cancelled) return;
        setUsers(usersSnap.docs.map((d) => d.data()));
        setEvents(groupsSnap.docs.map((d) => d.data()));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const popular = useMemo(() => {
    return [...events]
      .sort((a, b) => (b.memberCount || b.members?.length || 0) - (a.memberCount || a.members?.length || 0))
      .slice(0, 8);
  }, [events]);

  const avgJoin = useMemo(() => {
    if (!events.length) return 0;
    const total = events.reduce((sum, item) => sum + (item.memberCount || item.members?.length || 0), 0);
    return Math.round((total / events.length) * 10) / 10;
  }, [events]);

  return (
    <AdminShell active="analytics">
      {loading ? <p>İstatistikler yükleniyor...</p> : (
        <>
          <div className="cloop-admin-grid">
            <article><span>Toplam kullanıcı</span><strong>{users.length}</strong></article>
            <article><span>Toplam etkinlik</span><strong>{events.length}</strong></article>
            <article><span>Ortalama katılım</span><strong>{avgJoin}</strong></article>
            <article>
              <span>Son 30 gün kayıt</span>
              <strong>
                {users.filter((u) => {
                  const d = toDate(u.createdAt);
                  return d && Date.now() - d.getTime() <= 30 * 24 * 60 * 60 * 1000;
                }).length}
              </strong>
            </article>
          </div>
          <div className="cloop-admin-panel" style={{ marginTop: 16 }}>
            <h2>En popüler etkinlikler</h2>
            {popular.length === 0 ? <p>Gösterilecek etkinlik yok.</p> : (
              <ul className="cloop-admin-history">
                {popular.map((item, idx) => (
                  <li key={`${item.title}-${idx}`}>
                    <strong>{item.title || "İsimsiz"}</strong>
                    <span>{item.category || "Kategori yok"}</span>
                    <small>{item.memberCount || item.members?.length || 0} katılımcı</small>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </AdminShell>
  );
}
