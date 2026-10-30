"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, updateDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import AdminShell, { formatAdminDate } from "@/components/admin/AdminShell";

export default function AdminFeedbackPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "feedback"),
      (snapshot) => {
        const list = [];
        snapshot.forEach((docSnap) => list.push({ id: docSnap.id, ...docSnap.data() }));
        setItems(list);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, []);

  const setStatus = async (item, status) => {
    try {
      await updateDoc(doc(db, "feedback", item.id), { status, updatedAt: new Date() });
    } catch (err) {
      alert("Durum güncellenemedi: " + err.message);
    }
  };

  return (
    <AdminShell active="feedback">
      {loading ? <p>Geri bildirimler yükleniyor...</p> : items.length === 0 ? (
        <div className="cloop-admin-panel">
          <h2>Geri Bildirimler</h2>
          <p>Mobil uygulamadan henüz geri bildirim gelmedi. Kayıtlar `feedback` koleksiyonunda görünecek.</p>
        </div>
      ) : (
        <div className="cloop-admin-table-wrap">
          <table className="cloop-admin-table">
            <thead>
              <tr>
                <th>Kategori</th>
                <th>Mesaj</th>
                <th>Tarih</th>
                <th>Durum</th>
                <th>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.category || "Genel"}</td>
                  <td>{item.message || item.text || "—"}</td>
                  <td>{formatAdminDate(item.createdAt)}</td>
                  <td>{item.status || "Yeni"}</td>
                  <td className="cloop-admin-actions">
                    <button type="button" onClick={() => setStatus(item, "İnceleniyor")}>İncele</button>
                    <button type="button" onClick={() => setStatus(item, "Çözüldü")}>Çözüldü</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminShell>
  );
}
