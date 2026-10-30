"use client";

import { useEffect, useState } from "react";
import { addDoc, collection, getDocs, onSnapshot } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { writeAdminLog } from "@/lib/adminLog";
import AdminShell, { formatAdminDate } from "@/components/admin/AdminShell";

export default function AdminNotificationsPage() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [target, setTarget] = useState("all");
  const [groups, setGroups] = useState([]);
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
      setHistory(list.slice(0, 20));
    });
    return () => {
      unsubGroups();
      unsubNotes();
    };
  }, []);

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
        <label>
          Hedef
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="all">Tüm kullanıcılar</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                Grup: {g.title || g.id}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={sending}>
          {sending ? "Gönderiliyor..." : "Duyuruyu Gönder"}
        </button>
      </form>

      <div className="cloop-admin-panel" style={{ marginTop: 16 }}>
        <h2>Son duyurular</h2>
        {history.length === 0 ? (
          <p>Henüz gönderilmiş duyuru yok.</p>
        ) : (
          <ul className="cloop-admin-history">
            {history.map((n) => (
              <li key={n.id}>
                <strong>{n.title}</strong>
                <span>{n.body || n.message}</span>
                <small>
                  {n.target === "group" ? "Belirli grup" : "Tüm kullanıcılar"} · {n.recipientCount || 0} kişi · {formatAdminDate(n.createdAt)}
                </small>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AdminShell>
  );
}
