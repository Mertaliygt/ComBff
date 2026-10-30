"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import AdminShell, { formatAdminDate, toDate } from "@/components/admin/AdminShell";

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isActiveUser(user) {
  return !user.banned && !user.isSuspended && user.approved !== false;
}

function isActiveEvent(item) {
  if (item.status === "Kapalı" || item.status === "Reddedildi" || item.status === "İptal") return false;
  if (item.source === "groups") return item.status === "Aktif" && item.chatStatus !== "Kapalı";
  return item.isApproved === true;
}

const ACTIVITY_PAGE_SIZE = 8;
const ACTIVITY_LIMIT = 24;

function PagedActivityList({ title, items, empty, renderItem }) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(items.length / ACTIVITY_PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const slice = items.slice(current * ACTIVITY_PAGE_SIZE, current * ACTIVITY_PAGE_SIZE + ACTIVITY_PAGE_SIZE);

  return (
    <div className="cloop-admin-panel">
      <h2>{title}</h2>
      {items.length === 0 ? <p>{empty}</p> : (
        <>
          <ul className="cloop-admin-history">
            {slice.map(renderItem)}
          </ul>
          {pages > 1 && (
            <div className="cloop-admin-pager">
              <button type="button" disabled={current === 0} onClick={() => setPage(current - 1)}>Önceki</button>
              <span>{current + 1} / {pages}</span>
              <button type="button" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>Sonraki</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ChartList({ title, items, empty }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="cloop-admin-panel">
      <h2>{title}</h2>
      {items.every((i) => i.value === 0) ? (
        <p>{empty}</p>
      ) : (
        <div className="cloop-chart">
          {items.map((item) => (
            <div key={item.label} className="cloop-chart-row">
              <span>{item.label}</span>
              <div className="cloop-chart-track">
                <div className="cloop-chart-bar" style={{ width: `${(item.value / max) * 100}%` }} />
              </div>
              <b>{item.value}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [users, setUsers] = useState([]);
  const [events, setEvents] = useState([]);
  const [reports, setReports] = useState([]);
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const [usersSnap, groupsSnap, eventsSnap, reportsSnap, logsSnap] = await Promise.all([
          getDocs(collection(db, "users")),
          getDocs(collection(db, "groups")),
          getDocs(collection(db, "events")),
          getDocs(collection(db, "reports")),
          getDocs(collection(db, "admin_logs")),
        ]);

        if (cancelled) return;
        setUsers(usersSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setEvents([
          ...groupsSnap.docs.map((d) => ({ id: d.id, source: "groups", ...d.data() })),
          ...eventsSnap.docs.map((d) => ({ id: d.id, source: "events", ...d.data() })),
        ]);
        setReports(reportsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLogs(
          logsSnap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .sort((a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0))
            .slice(0, ACTIVITY_LIMIT)
        );
      } catch (err) {
        if (!cancelled) setError("Özet veriler yüklenemedi: " + err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  const stats = useMemo(() => {
    const today = startOfDay(new Date());
    return {
      users: users.length,
      activeUsers: users.filter(isActiveUser).length,
      dailySignups: users.filter((u) => {
        const d = toDate(u.createdAt);
        return d && d >= today;
      }).length,
      events: events.length,
      activeEvents: events.filter(isActiveEvent).length,
      pendingReports: reports.filter((r) => (r.status || "Bekliyor") === "Bekliyor").length,
    };
  }, [users, events, reports]);

  const userChart = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = startOfDay(new Date());
      d.setDate(d.getDate() - (6 - i));
      return d;
    });
    return days.map((day) => {
      const next = new Date(day);
      next.setDate(next.getDate() + 1);
      return {
        label: day.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit" }),
        value: users.filter((u) => {
          const created = toDate(u.createdAt);
          return created && created >= day && created < next;
        }).length,
      };
    });
  }, [users]);

  const eventChart = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = startOfDay(new Date());
      d.setDate(d.getDate() - (6 - i));
      return d;
    });
    return days.map((day) => {
      const next = new Date(day);
      next.setDate(next.getDate() + 1);
      return {
        label: day.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit" }),
        value: events.filter((item) => {
          const created = toDate(item.createdAt || item.eventDate);
          return created && created >= day && created < next;
        }).length,
      };
    });
  }, [events]);

  const categoryChart = useMemo(() => {
    const counts = {};
    events.forEach((item) => {
      const key = item.category || "Kategori yok";
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [events]);

  const joinChart = useMemo(() => {
    const buckets = [
      { label: "1 kişi", value: 0 },
      { label: "2-5 kişi", value: 0 },
      { label: "6+ kişi", value: 0 },
    ];
    events.forEach((item) => {
      const count = item.memberCount || item.members?.length || 0;
      if (count <= 1) buckets[0].value += 1;
      else if (count <= 5) buckets[1].value += 1;
      else buckets[2].value += 1;
    });
    return buckets;
  }, [events]);

  const cards = [
    { label: "Toplam kullanıcı", value: stats.users, href: "/admin/users" },
    { label: "Aktif kullanıcı", value: stats.activeUsers, href: "/admin/users" },
    { label: "Günlük yeni kayıt", value: stats.dailySignups, href: "/admin/users" },
    { label: "Toplam etkinlik", value: stats.events, href: "/admin/events" },
    { label: "Aktif etkinlik", value: stats.activeEvents, href: "/admin/events" },
    { label: "Bekleyen şikayet", value: stats.pendingReports, href: "/admin/reports" },
  ];

  const recentUsers = [...users]
    .sort((a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0))
    .slice(0, ACTIVITY_LIMIT);
  const recentEvents = [...events]
    .sort((a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0))
    .slice(0, ACTIVITY_LIMIT);
  const recentReports = [...reports]
    .sort((a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0))
    .slice(0, ACTIVITY_LIMIT);

  return (
    <AdminShell active="dashboard">
      {loading && <p className="cloop-admin-login-status">Dashboard yükleniyor...</p>}
      {error && <p className="cloop-admin-alert is-error">{error}</p>}

      {!loading && (
        <>
          <div className="cloop-admin-grid">
            {cards.map((card) => (
              <button key={card.label} type="button" className="cloop-stat-card" onClick={() => router.push(card.href)}>
                <span>{card.label}</span>
                <strong>{card.value}</strong>
              </button>
            ))}
          </div>

          <div className="cloop-admin-split">
            <ChartList title="Son 7 gün kullanıcı kaydı" items={userChart} empty="Bu aralıkta yeni kayıt yok." />
            <ChartList title="Son 7 gün etkinlik oluşturma" items={eventChart} empty="Bu aralıkta yeni etkinlik yok." />
            <ChartList title="Kategori dağılımı" items={categoryChart} empty="Kategori verisi yok." />
            <ChartList title="Katılım dağılımı" items={joinChart} empty="Katılım verisi yok." />
          </div>

          <div className="cloop-admin-rail">
            <PagedActivityList
              title="Son kayıt olan kullanıcılar"
              items={recentUsers}
              empty="Henüz kullanıcı yok."
              renderItem={(u) => (
                <li key={u.id}>
                  <strong>{u.fullName || "İsimsiz"}</strong>
                  <span>{u.email || "E-posta yok"}</span>
                  <small>{formatAdminDate(u.createdAt)}</small>
                </li>
              )}
            />
            <PagedActivityList
              title="Son oluşturulan etkinlikler"
              items={recentEvents}
              empty="Henüz etkinlik yok."
              renderItem={(item) => (
                <li key={`${item.source}-${item.id}`}>
                  <strong>{item.title || "İsimsiz etkinlik"}</strong>
                  <span>{item.category || "Kategori yok"} · {item.memberCount || item.members?.length || 0} katılımcı</span>
                  <small>{formatAdminDate(item.createdAt || item.eventDate)}</small>
                </li>
              )}
            />
            <PagedActivityList
              title="Yeni şikayetler"
              items={recentReports}
              empty="Yeni şikayet yok."
              renderItem={(r) => (
                <li key={r.id}>
                  <strong>{r.reportedUserEmail || r.reportedUserId || "Bilinmiyor"}</strong>
                  <span>{r.messageText || r.reason || "Detay yok"}</span>
                  <small>{r.status || "Bekliyor"} · {formatAdminDate(r.createdAt)}</small>
                </li>
              )}
            />
            <PagedActivityList
              title="Son admin işlemleri"
              items={logs}
              empty="Henüz kayıtlı admin işlemi yok."
              renderItem={(log) => (
                <li key={log.id}>
                  <strong>{log.action}</strong>
                  <span>{log.targetLabel || log.targetType || "Hedef yok"}</span>
                  <small>{log.adminEmail || log.adminUid} · {formatAdminDate(log.createdAt)}</small>
                </li>
              )}
            />
          </div>
        </>
      )}
    </AdminShell>
  );
}
