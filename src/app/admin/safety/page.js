"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, doc, onSnapshot, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { writeAdminLog } from "@/lib/adminLog";
import { priorityBadge, reportPriority, userLabel } from "@/lib/adminDomain";
import AdminShell, { formatAdminDate } from "@/components/admin/AdminShell";

const PRIORITIES = ["Düşük", "Normal", "Yüksek", "Acil"];

export default function AdminSafetyPage() {
  const router = useRouter();
  const [users, setUsers] = useState([]);
  const [events, setEvents] = useState([]);
  const [reports, setReports] = useState([]);
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    const unsubUsers = onSnapshot(collection(db, "users"), (snap) => {
      setUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    const unsubEvents = onSnapshot(collection(db, "groups"), (snap) => {
      setEvents(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    const unsubReports = onSnapshot(collection(db, "reports"), (snap) => {
      setReports(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    const unsubLogs = onSnapshot(collection(db, "admin_logs"), (snap) => {
      setLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => {
      unsubUsers();
      unsubEvents();
      unsubReports();
      unsubLogs();
    };
  }, []);

  const userMap = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])), [users]);

  const reportsByUser = useMemo(() => {
    const map = {};
    reports.forEach((r) => {
      const key = r.reportedUserId || r.reportedUserEmail || "unknown";
      if (!map[key]) map[key] = [];
      map[key].push(r);
    });
    return Object.entries(map)
      .map(([key, items]) => ({ key, items, count: items.length }))
      .sort((a, b) => b.count - a.count);
  }, [reports]);

  const reportsByEvent = useMemo(() => {
    const map = {};
    reports.forEach((r) => {
      const key = r.groupId || r.eventId;
      if (!key) return;
      if (!map[key]) map[key] = [];
      map[key].push(r);
    });
    return Object.entries(map)
      .map(([key, items]) => ({ key, items, count: items.length }))
      .sort((a, b) => b.count - a.count);
  }, [reports]);

  const urgent = reports.filter((r) => reportPriority(r) === "Acil");
  const repeats = reportsByUser.filter((row) => row.count >= 2);
  const reviewUsers = users.filter((u) => u.reviewStatus === "İncelemede");
  const reviewEvents = events.filter((e) => e.reviewStatus === "İncelemede" || e.status === "Yayından Alındı");
  const blockHistory = logs.filter((log) => log.action === "user_suspend" || log.action === "user_unsuspend");

  const setPriority = async (report, priority) => {
    try {
      await updateDoc(doc(db, "reports", report.id), { priority });
      await writeAdminLog({
        action: "report_priority",
        targetType: "report",
        targetId: report.id,
        targetLabel: report.reportedUserEmail || report.id,
        before: report.priority || "Normal",
        after: priority,
      });
    } catch (err) {
      alert("Öncelik güncellenemedi: " + err.message);
    }
  };

  return (
    <AdminShell active="safety">
      <div className="cloop-admin-panel">
        <h2>Güvenlik Merkezi</h2>
        <p>Risk işaretleri yalnızca inceleme ihtiyacını gösterir. Kullanıcı otomatik suçlu sayılmaz.</p>
      </div>

      <div className="cloop-admin-grid" style={{ marginTop: 16 }}>
        <article><span>Açık şikayet</span><strong>{reports.filter((r) => (r.status || "Bekliyor") === "Bekliyor").length}</strong></article>
        <article><span>Acil şikayet</span><strong>{urgent.length}</strong></article>
        <article><span>Tekrarlayan hedef</span><strong>{repeats.length}</strong></article>
        <article><span>İncelemedeki hesap</span><strong>{reviewUsers.length}</strong></article>
      </div>

      <div className="cloop-admin-panel" style={{ marginTop: 16 }}>
        <h2>Acil şikayetler</h2>
        {urgent.length === 0 ? <p>Acil öncelikli şikayet yok.</p> : (
          <ul className="cloop-admin-history">
            {urgent.map((r) => (
              <li key={r.id}>
                <strong>{r.messageText || r.reason || "Detay yok"}</strong>
                <span>{r.reportedUserEmail || r.reportedUserId}</span>
                {r.groupId && (
                  <button type="button" className="cloop-admin-link" onClick={() => router.push(`/admin/events/${r.groupId}?source=groups`)}>
                    Etkinliğe git
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="cloop-admin-table-wrap" style={{ marginTop: 16 }}>
        <table className="cloop-admin-table">
          <thead>
            <tr>
              <th>Çok şikayet alan kullanıcı</th>
              <th>Adet</th>
              <th>Son şikayet</th>
              <th>İşlem</th>
            </tr>
          </thead>
          <tbody>
            {reportsByUser.length === 0 ? (
              <tr><td colSpan={4}>Şikayet yok.</td></tr>
            ) : reportsByUser.map((row) => {
              const user = userMap[row.key];
              return (
                <tr key={row.key}>
                  <td>{userLabel(user, row.items[0]?.reportedUserEmail || row.key)}</td>
                  <td>{row.count}</td>
                  <td>{formatAdminDate(row.items[0]?.createdAt)}</td>
                  <td>
                    {user?.id && (
                      <button type="button" className="is-warn" onClick={() => router.push(`/admin/users/${user.id}`)}>İncele</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="cloop-admin-table-wrap" style={{ marginTop: 16 }}>
        <table className="cloop-admin-table">
          <thead>
            <tr>
              <th>Şikayet alan etkinlik</th>
              <th>Adet</th>
              <th>İşlem</th>
            </tr>
          </thead>
          <tbody>
            {reportsByEvent.length === 0 ? (
              <tr><td colSpan={3}>Etkinlik şikayeti yok.</td></tr>
            ) : reportsByEvent.map((row) => {
              const event = events.find((e) => e.id === row.key);
              return (
                <tr key={row.key}>
                  <td>{event?.title || row.items[0]?.groupTitle || row.key}</td>
                  <td>{row.count}</td>
                  <td>
                    <button type="button" className="is-warn" onClick={() => router.push(`/admin/events/${row.key}?source=groups`)}>
                      Etkinlik detayı
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="cloop-admin-split">
        <div className="cloop-admin-panel">
          <h2>İncelemedeki hesaplar</h2>
          {reviewUsers.length === 0 ? <p>İncelemede kullanıcı yok.</p> : (
            <ul className="cloop-admin-history">
              {reviewUsers.map((u) => (
                <li key={u.id}>
                  <button type="button" className="cloop-admin-link" onClick={() => router.push(`/admin/users/${u.id}`)}>{userLabel(u)}</button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="cloop-admin-panel">
          <h2>Riskli / yayından alınan etkinlikler</h2>
          {reviewEvents.length === 0 ? <p>İşaretli etkinlik yok.</p> : (
            <ul className="cloop-admin-history">
              {reviewEvents.map((e) => (
                <li key={e.id}>
                  <button type="button" className="cloop-admin-link" onClick={() => router.push(`/admin/events/${e.id}?source=groups`)}>{e.title || e.id}</button>
                  <small>{e.status} {e.reviewStatus ? `· ${e.reviewStatus}` : ""}</small>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="cloop-admin-panel">
          <h2>Engelleme geçmişi</h2>
          {blockHistory.length === 0 ? <p>Engel kaydı yok.</p> : (
            <ul className="cloop-admin-history">
              {blockHistory.slice(0, 12).map((log) => (
                <li key={log.id}>
                  <strong>{log.action}</strong>
                  <span>{log.targetLabel}</span>
                  <small>{log.reason || "—"} · {formatAdminDate(log.createdAt)}</small>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="cloop-admin-table-wrap" style={{ marginTop: 16 }}>
        <table className="cloop-admin-table">
          <thead>
            <tr>
              <th>Şikayet</th>
              <th>Hedef</th>
              <th>Öncelik</th>
              <th>Durum</th>
            </tr>
          </thead>
          <tbody>
            {reports.length === 0 ? (
              <tr><td colSpan={4}>Şikayet yok.</td></tr>
            ) : reports.map((report) => (
              <tr key={report.id}>
                <td>{report.messageText || report.reason || report.id}</td>
                <td>
                  {report.groupId ? (
                    <button type="button" className="cloop-admin-link" onClick={() => router.push(`/admin/events/${report.groupId}?source=groups`)}>
                      {report.groupTitle || "Etkinlik"}
                    </button>
                  ) : (report.reportedUserEmail || report.reportedUserId || "—")}
                </td>
                <td>
                  <select value={reportPriority(report)} onChange={(e) => setPriority(report, e.target.value)}>
                    {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <span className={`cloop-admin-badge ${priorityBadge(reportPriority(report))}`}>{reportPriority(report)}</span>
                </td>
                <td>{report.status || "Bekliyor"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
