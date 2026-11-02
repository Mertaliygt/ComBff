"use client";

import { useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { addDoc, collection, deleteDoc, doc, getDocs, onSnapshot } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { writeAdminLog } from "@/lib/adminLog";
import { eventScheduleMs, isEventArchived, isEventLive, sortEventsBySchedule } from "@/lib/adminDomain";
import AdminShell, { AdminPager, formatAdminDate } from "@/components/admin/AdminShell";

export default function AdminNotificationsPage() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [target, setTarget] = useState("all");
  const [groups, setGroups] = useState([]);
  const [eventTab, setEventTab] = useState("current");
  const [now] = useState(() => Date.now());
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(5);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [history, setHistory] = useState([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const unsubGroups = onSnapshot(collection(db, "groups"), (snapshot) => {
      const list = [];
      snapshot.forEach((docSnap) => list.push({ id: docSnap.id, ...docSnap.data() }));
      setGroups(list.sort((a, b) => String(a.title || "").localeCompare(String(b.title || ""), "tr")));
    });
    const unsubNotes = onSnapshot(collection(db, "notifications"), (snapshot) => {
      const list = [];
      snapshot.forEach((docSnap) => list.push({ id: docSnap.id, ...docSnap.data() }));
      list.sort((a, b) => {
        const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return bTime - aTime;
      });
      setHistory(list);
    });
    return () => {
      unsubGroups();
      unsubNotes();
    };
  }, []);

  const { currentEvents, pastEvents } = useMemo(
    () => ({
      currentEvents: sortEventsBySchedule(groups.filter((g) => isEventLive(g, now)), now),
      pastEvents: groups.filter((g) => isEventArchived(g, now)).sort((a, b) => (eventScheduleMs(b) || 0) - (eventScheduleMs(a) || 0)),
    }),
    [groups, now]
  );
  const visibleEvents = eventTab === "current" ? currentEvents : pastEvents;
  const selectedGroup = groups.find((g) => g.id === target);

  const pages = Math.max(1, Math.ceil(history.length / pageSize));
  const currentPage = Math.min(page, pages - 1);
  const pagedHistory = history.slice(currentPage * pageSize, (currentPage + 1) * pageSize);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, "notifications", deleteTarget.id));
      await writeAdminLog({
        action: "notification_delete",
        targetType: "notification",
        targetId: deleteTarget.id,
        targetLabel: deleteTarget.title,
        before: "yayında",
        after: "silindi",
      });
      setDeleteTarget(null);
    } catch (err) {
      alert("Duyuru silinemedi: " + err.message);
    } finally {
      setDeleting(false);
    }
  };

  const switchEventTab = (tab) => {
    setEventTab(tab);
    // Seçili etkinlik diğer sekmede kalırsa kitleyi sessizce değiştirmemek için varsayılana döneriz.
    setTarget("all");
  };

  const resolveRecipients = async () => {
    if (target === "all") {
      const usersSnap = await getDocs(collection(db, "users"));
      return usersSnap.docs.map((d) => d.id);
    }
    const group = groups.find((g) => g.id === target);
    return Array.isArray(group?.members) ? group.members.filter(Boolean) : [];
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return alert("Başlık ve mesaj zorunlu.");
    setSending(true);
    try {
      const recipientIds = await resolveRecipients();
      const payload = {
        title: title.trim(),
        body: body.trim(),
        message: body.trim(),
        target: target === "all" ? "all" : "group",
        groupId: target === "all" ? null : target,
        recipientCount: recipientIds.length,
        sentBy: auth.currentUser?.uid || "admin",
        type: "admin_announcement",
        isRead: false,
        createdAt: new Date(),
      };

      await addDoc(collection(db, "notifications"), payload);

      await Promise.all(
        recipientIds
          .filter((uid) => uid && uid !== "anonim")
          .map((uid) =>
            addDoc(collection(db, "users", uid, "notifications"), {
              title: payload.title,
              message: payload.body,
              type: "admin_announcement",
              isRead: false,
              createdAt: new Date(),
            })
          )
      );

      await writeAdminLog({
        action: "notification_send",
        targetType: "notification",
        targetLabel: payload.title,
        after: `${recipientIds.length} alıcı`,
      });
      setTitle("");
      setBody("");
      setTarget("all");
      alert(`Duyuru gönderildi. ${recipientIds.length} kullanıcıya iletildi.`);
    } catch (err) {
      alert("Duyuru gönderilemedi: " + err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <AdminShell active="notifications">
      <form className="cloop-admin-panel cloop-admin-form" onSubmit={handleSend}>
        <h2>Duyuru Gönder</h2>
        <label>
          Başlık (Title)
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Örn: Hafta sonu sürüşü" />
        </label>
        <label>
          Mesaj (Body)
          <textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Kullanıcılara gidecek duyuru metni" />
        </label>
        <div role="tablist" aria-label="Etkinlik türü" style={{ display: "flex", gap: 8 }}>
          {[
            ["current", `Güncel Etkinlikler (${currentEvents.length})`],
            ["past", `Geçmiş Etkinlikler (${pastEvents.length})`],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={eventTab === key}
              onClick={() => switchEventTab(key)}
              style={{ flex: 1, opacity: eventTab === key ? 1 : 0.55, fontWeight: eventTab === key ? 800 : 600 }}
            >
              {label}
            </button>
          ))}
        </div>
        <label>
          Hedef
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="all">Tüm kullanıcılar</option>
            {visibleEvents.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title || g.id}
                {g.eventDate ? ` · ${formatAdminDate(g.eventDate)}` : ""}
              </option>
            ))}
          </select>
        </label>
        <small>
          Alıcılar: {selectedGroup ? `${selectedGroup.title || selectedGroup.id} üyeleri` : "Tüm kullanıcılar"}
          {visibleEvents.length === 0 ? " · Bu sekmede etkinlik yok" : ""}
        </small>
        <button type="submit" disabled={sending}>
          {sending ? "Gönderiliyor..." : "Duyuruyu Gönder"}
        </button>
      </form>

      <div className="cloop-admin-panel" style={{ marginTop: 16 }}>
        <div className="cloop-admin-toolbar" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>Son duyurular</h2>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
            Sayfa başına
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(0);
              }}
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
            </select>
          </label>
        </div>
        {history.length === 0 ? (
          <p>Henüz gönderilmiş duyuru yok.</p>
        ) : (
          <div className="cloop-admin-table-wrap" style={{ marginTop: 12 }}>
            <table className="cloop-admin-table">
              <thead>
                <tr>
                  <th>Duyuru</th>
                  <th>Hedef</th>
                  <th>Tarih</th>
                  <th>İşlem</th>
                </tr>
              </thead>
              <tbody>
                {pagedHistory.map((n) => (
                  <tr key={n.id}>
                    <td>
                      <strong>{n.title}</strong>
                      <small>{n.body || n.message}</small>
                    </td>
                    <td>
                      {n.target === "group" ? "Belirli grup" : "Tüm kullanıcılar"}
                      <small>{n.recipientCount || 0} kişi</small>
                    </td>
                    <td>{formatAdminDate(n.createdAt)}</td>
                    <td className="cloop-admin-actions">
                      <button type="button" className="is-danger" onClick={() => setDeleteTarget(n)}>
                        <Trash2 size={14} aria-hidden="true" />
                        Sil
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <AdminPager page={currentPage} pages={pages} onPage={setPage} numbered />
          </div>
        )}
      </div>

      {deleteTarget && (
        <div className="cloop-admin-modal" onClick={() => !deleting && setDeleteTarget(null)}>
          <div className="cloop-admin-modal-card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2>Duyuru silinsin mi?</h2>
            <p style={{ margin: 0 }}>
              <strong>&quot;{deleteTarget.title}&quot;</strong> duyurusu geçmiş listesinden kalıcı olarak silinecek. Bu işlem geri alınamaz.
              Kullanıcıların kendi bildirim kutusuna daha önce düşen kopyalar silinmez.
            </p>
            <div className="cloop-admin-modal-actions">
              <button type="button" className="is-warn" disabled={deleting} onClick={() => setDeleteTarget(null)}>
                Vazgeç
              </button>
              <button type="button" className="is-danger" disabled={deleting} onClick={confirmDelete}>
                {deleting ? "Siliniyor..." : "Evet, sil"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
