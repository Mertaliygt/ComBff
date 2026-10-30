"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import AdminShell, { formatAdminDate, toDate } from "@/components/admin/AdminShell";

export default function AdminLogsPage() {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "admin_logs"), (snapshot) => {
      const list = [];
      snapshot.forEach((docSnap) => list.push({ id: docSnap.id, ...docSnap.data() }));
      list.sort((a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0));
      setLogs(list);
    });
    return () => unsub();
  }, []);

  return (
    <AdminShell active="logs">
      <div className="cloop-admin-panel">
        <h2>İşlem Geçmişi</h2>
        <p>Admin işlemleri yalnızca eklenir, bu ekrandan düzenlenemez veya silinemez.</p>
      </div>
      <div className="cloop-admin-table-wrap" style={{ marginTop: 16 }}>
        <table className="cloop-admin-table">
          <thead>
            <tr>
              <th>Admin</th>
              <th>İşlem</th>
              <th>Hedef</th>
              <th>Gerekçe</th>
              <th>Tarih</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr><td colSpan={5}>Henüz işlem kaydı yok.</td></tr>
            ) : logs.map((log) => (
              <tr key={log.id}>
                <td>{log.adminEmail || log.adminUid}</td>
                <td>{log.action}</td>
                <td>{log.targetLabel || log.targetId || "—"}</td>
                <td>{log.reason || "—"}</td>
                <td>{formatAdminDate(log.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
