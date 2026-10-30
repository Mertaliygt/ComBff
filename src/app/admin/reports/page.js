"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, deleteDoc, doc, onSnapshot, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { writeAdminLog } from "@/lib/adminLog";
import { priorityBadge, reportPriority } from "@/lib/adminDomain";
import AdminShell, { formatAdminDate } from "@/components/admin/AdminShell";

export default function AdminReportsPage() {
  const router = useRouter();
  const [reports, setReports] = useState([]);
  const [busyId, setBusyId] = useState("");

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "reports"), (snapshot) => {
      const list = [];
      snapshot.forEach((docSnap) => list.push({ id: docSnap.id, ...docSnap.data() }));
      list.sort((a, b) => {
        const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return bTime - aTime;
      });
      setReports(list);
    });
    return () => unsub();
  }, []);

  const resolve = async (report, extra = {}) => {
    setBusyId(report.id);
    try {
      const nextStatus = extra.status || "Çözüldü";
      const payload = { status: nextStatus };
      if (nextStatus !== "İnceleniyor") payload.resolvedAt = new Date();
      await updateDoc(doc(db, "reports", report.id), payload);
      await writeAdminLog({
        action: "report_status",
        targetType: "report",
        targetId: report.id,
        targetLabel: report.reportedUserEmail || report.reportedUserId || report.id,
        reason: extra.reason || extra.status || "Çözüldü",
        before: report.status || "Bekliyor",
        after: extra.status || "Çözüldü",
      });
    } catch (err) {
      alert("Şikayet güncellenemedi: " + err.message);
    } finally {
      setBusyId("");
    }
  };

  const removeContent = async (report) => {
    if (!confirm("Şikayet edilen içeriği kaldırmak istiyor musunuz?")) return;
    setBusyId(report.id);
    try {
      if (report.groupId && report.messageId) {
        await deleteDoc(doc(db, "groups", report.groupId, "messages", report.messageId));
      }
      if (report.eventId && report.contentId) {
        await deleteDoc(doc(db, "events", report.eventId, "messages", report.contentId));
      }
      await updateDoc(doc(db, "reports", report.id), {
        status: "Çözüldü (İçerik Kaldırıldı)",
        resolvedAt: new Date(),
      });
      await writeAdminLog({
        action: "report_remove_content",
        targetType: "report",
        targetId: report.id,
        targetLabel: report.groupTitle || report.eventTitle || report.id,
        before: report.status || "Bekliyor",
        after: "Çözüldü (İçerik Kaldırıldı)",
      });
    } catch (err) {
      alert("İçerik kaldırılamadı: " + err.message);
    } finally {
      setBusyId("");
    }
  };

  return (
    <AdminShell active="reports">
      <div className="cloop-admin-toolbar">
        <span>{reports.filter((r) => r.status === "Bekliyor").length} açık şikayet</span>
      </div>
      <div className="cloop-admin-table-wrap">
        <table className="cloop-admin-table">
          <thead>
            <tr>
              <th>Şikayet edilen</th>
              <th>İçerik / detay</th>
              <th>Öncelik</th>
              <th>Tarih</th>
              <th>Durum</th>
              <th>İşlem</th>
            </tr>
          </thead>
          <tbody>
            {reports.length === 0 ? (
              <tr>
                <td colSpan={6}>Şikayet bulunamadı.</td>
              </tr>
            ) : (
              reports.map((report) => (
                <tr key={report.id}>
                  <td>
                    {report.reportedUserId ? (
                      <button type="button" className="cloop-admin-link" onClick={() => router.push(`/admin/users/${report.reportedUserId}`)}>
                        {report.reportedUserEmail || report.reportedUserName || report.reportedUserId}
                      </button>
                    ) : (
                      <strong>{report.reportedUserEmail || report.reportedUserName || report.reportedUserId || "Bilinmiyor"}</strong>
                    )}
                    <small>Bildiren: {report.reportedBy || "—"}</small>
                  </td>
                  <td>
                    <p className="cloop-admin-quote">“{report.messageText || report.content || report.reason || "Detay yok"}”</p>
                    <small>
                      {report.groupId ? (
                        <button type="button" className="cloop-admin-link" onClick={() => router.push(`/admin/events/${report.groupId}?source=groups`)}>
                          {report.groupTitle || "Etkinliğe git"}
                        </button>
                      ) : (report.groupTitle || report.eventTitle || "İçerik")}
                    </small>
                  </td>
                  <td>
                    <span className={`cloop-admin-badge ${priorityBadge(reportPriority(report))}`}>
                      {reportPriority(report)}
                    </span>
                  </td>
                  <td>{formatAdminDate(report.createdAt)}</td>
                  <td>
                    <span className={`cloop-admin-badge ${report.status === "Bekliyor" ? "is-warn" : "is-ok"}`}>
                      {report.status || "Bekliyor"}
                    </span>
                  </td>
                  <td className="cloop-admin-actions">
                    {(report.status === "Bekliyor" || report.status === "İnceleniyor") && (
                      <>
                        {report.status === "Bekliyor" && (
                          <button type="button" className="is-warn" disabled={busyId === report.id} onClick={() => resolve(report, { status: "İnceleniyor" })}>
                            İncele
                          </button>
                        )}
                        <button type="button" className="is-danger" disabled={busyId === report.id} onClick={() => removeContent(report)}>
                          İçeriği Kaldır
                        </button>
                        <button type="button" disabled={busyId === report.id} onClick={() => resolve(report)}>
                          Çözüldü
                        </button>
                        <button type="button" className="is-warn" disabled={busyId === report.id} onClick={() => resolve(report, { status: "İşlem yapılmadı", reason: "İşlem gerekmedi" })}>
                          İşlem yok
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
