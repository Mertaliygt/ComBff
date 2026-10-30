"use client";

import { useEffect, useState } from "react";
import { addDoc, collection, doc, onSnapshot, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { writeAdminLog } from "@/lib/adminLog";
import AdminShell, { formatAdminDate } from "@/components/admin/AdminShell";

const EMPTY = { type: "silme", userEmail: "", note: "" };

export default function AdminPrivacyPage() {
  const [items, setItems] = useState([]);
  const [logs, setLogs] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "privacy_requests"), (snap) => {
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, () => setItems([]));
    const unsubLogs = onSnapshot(collection(db, "admin_logs"), (snap) => {
      setLogs(snap.docs.filter((d) => d.data().targetType === "privacy").map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => {
      unsub();
      unsubLogs();
    };
  }, []);

  const createRequest = async (e) => {
    e.preventDefault();
    if (!form.userEmail.trim()) return alert("Kullanıcı e-postası gerekli.");
    setSaving(true);
    try {
      const ref = await addDoc(collection(db, "privacy_requests"), {
        type: form.type,
        userEmail: form.userEmail.trim(),
        note: form.note.trim(),
        status: "Bekliyor",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await writeAdminLog({
        action: "privacy_create",
        targetType: "privacy",
        targetId: ref.id,
        targetLabel: form.userEmail.trim(),
        after: form.type,
      });
      setForm(EMPTY);
    } catch (err) {
      alert("Talep kaydedilemedi: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (item, status) => {
    if (!confirm(`Talep durumu "${status}" olarak güncellensin mi?`)) return;
    try {
      await updateDoc(doc(db, "privacy_requests", item.id), { status, updatedAt: new Date() });
      await writeAdminLog({
        action: "privacy_status",
        targetType: "privacy",
        targetId: item.id,
        targetLabel: item.userEmail,
        before: item.status,
        after: status,
      });
    } catch (err) {
      alert("Durum güncellenemedi: " + err.message);
    }
  };

  return (
    <AdminShell active="privacy">
      <div className="cloop-admin-panel">
        <h2>Veri ve Gizlilik</h2>
        <p>Mobil uygulamada henüz otomatik silme/dışa aktarma akışı yok. Burada yalnızca iletilen talepler kayda alınır. Şifre ve token saklanmaz.</p>
      </div>

      <form className="cloop-admin-panel cloop-admin-form" style={{ marginTop: 16 }} onSubmit={createRequest}>
        <h2>Yeni talep kaydı</h2>
        <label>
          Tür
          <select value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}>
            <option value="silme">Hesap / veri silme</option>
            <option value="erişim">Kişisel veri talebi</option>
            <option value="dışa aktarma">Veri dışa aktarma</option>
          </select>
        </label>
        <label>
          Kullanıcı e-postası
          <input value={form.userEmail} onChange={(e) => setForm((p) => ({ ...p, userEmail: e.target.value }))} placeholder="kayitli@eposta.com" />
        </label>
        <label>
          Not
          <textarea rows={3} value={form.note} onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))} placeholder="Talep özeti. Gereksiz kişisel veri yazmayın." />
        </label>
        <button type="submit" disabled={saving}>{saving ? "Kaydediliyor..." : "Talebi kaydet"}</button>
      </form>

      <div className="cloop-admin-table-wrap" style={{ marginTop: 16 }}>
        <table className="cloop-admin-table">
          <thead>
            <tr>
              <th>Tür</th>
              <th>Kullanıcı</th>
              <th>Durum</th>
              <th>Tarih</th>
              <th>İşlem</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={5}>Henüz gizlilik talebi yok.</td></tr>
            ) : items.map((item) => (
              <tr key={item.id}>
                <td>{item.type}</td>
                <td>{item.userEmail}</td>
                <td>{item.status}</td>
                <td>{formatAdminDate(item.createdAt)}</td>
                <td className="cloop-admin-actions">
                  <button type="button" className="is-warn" onClick={() => setStatus(item, "İşleniyor")}>İşleniyor</button>
                  <button type="button" onClick={() => setStatus(item, "Tamamlandı")}>Tamamlandı</button>
                  <button type="button" className="is-danger" onClick={() => setStatus(item, "Reddedildi")}>Reddet</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="cloop-admin-panel" style={{ marginTop: 16 }}>
        <h2>Erişim / işlem kayıtları</h2>
        {logs.length === 0 ? <p>Gizlilik işlemi kaydı yok.</p> : (
          <ul className="cloop-admin-history">
            {logs.map((log) => (
              <li key={log.id}>
                <strong>{log.action}</strong>
                <span>{log.targetLabel}</span>
                <small>{log.adminEmail} · {formatAdminDate(log.createdAt)}</small>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AdminShell>
  );
}
