"use client";

import { useEffect, useState } from "react";
import { collection, doc, getDocs, limit, onSnapshot, query, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { writeAdminLog } from "@/lib/adminLog";
import AdminShell, { formatAdminDate } from "@/components/admin/AdminShell";

export default function AdminSystemPage() {
  const [firestore, setFirestore] = useState({ status: "Kontrol ediliyor", error: "" });
  const [failedNotes, setFailedNotes] = useState([]);
  const [errors, setErrors] = useState([]);
  const [errorsAvailable, setErrorsAvailable] = useState(false);
  const [maintenance, setMaintenance] = useState(false);
  const [statusNote, setStatusNote] = useState("Mobil uygulama henüz bakım bayrağını okumuyor.");

  useEffect(() => {
    let cancelled = false;
    async function ping() {
      try {
        await getDocs(query(collection(db, "users"), limit(1)));
        if (!cancelled) setFirestore({ status: "Bağlı", error: "" });
      } catch (err) {
        if (!cancelled) setFirestore({ status: "Bağlantı yok", error: err.message });
      }
    }
    ping();

    const unsubNotes = onSnapshot(collection(db, "notifications"), (snap) => {
      const failed = [];
      snap.forEach((d) => {
        const data = d.data();
        if (data.status === "failed" || data.deliveryFailed === true) {
          failed.push({ id: d.id, ...data });
        }
      });
      setFailedNotes(failed);
    }, () => setFailedNotes([]));

    const unsubErrors = onSnapshot(collection(db, "system_errors"), (snap) => {
      setErrorsAvailable(true);
      setErrors(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, () => {
      setErrorsAvailable(false);
      setErrors([]);
    });

    const unsubStatus = onSnapshot(doc(db, "system", "status"), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setMaintenance(Boolean(data.maintenance));
        if (data.note) setStatusNote(data.note);
      }
    });

    return () => {
      cancelled = true;
      unsubNotes();
      unsubErrors();
      unsubStatus();
    };
  }, []);

  const toggleMaintenance = async () => {
    if (!confirm(maintenance ? "Bakım kapatılsın mı?" : "Bakım açılsın mı? Bu bayrak şu an yalnızca admin panelinde saklanır.")) return;
    try {
      await setDoc(doc(db, "system", "status"), {
        maintenance: !maintenance,
        note: "Mobil uygulama henüz bakım bayrağını okumuyor.",
        updatedAt: new Date(),
      }, { merge: true });
      await writeAdminLog({
        action: "system_maintenance",
        targetType: "system",
        targetId: "status",
        before: maintenance ? "açık" : "kapalı",
        after: !maintenance ? "açık" : "kapalı",
      });
    } catch (err) {
      alert("Durum kaydedilemedi: " + err.message);
    }
  };

  return (
    <AdminShell active="system">
      <div className="cloop-admin-panel">
        <h2>Sistem İzleme</h2>
        <p>Sahte sağlık verisi gösterilmez. Ölçülemeyen entegrasyonlar açıkça belirtilir.</p>
      </div>
      <div className="cloop-admin-grid" style={{ marginTop: 16 }}>
        <article>
          <span>Firestore</span>
          <strong>{firestore.status}</strong>
        </article>
        <article>
          <span>Kimlik (Auth)</span>
          <strong>{auth.currentUser ? "Oturum açık" : "Oturum yok"}</strong>
        </article>
        <article>
          <span>Ayrı API katmanı</span>
          <strong>Yok</strong>
        </article>
        <article>
          <span>Bakım bayrağı</span>
          <strong>{maintenance ? "Açık" : "Kapalı"}</strong>
        </article>
      </div>
      {firestore.error && <p className="cloop-admin-alert is-error" style={{ marginTop: 12 }}>{firestore.error}</p>}
      <p style={{ marginTop: 12 }}>{statusNote}</p>
      <div className="cloop-admin-actions" style={{ marginTop: 12 }}>
        <button type="button" className="is-warn" onClick={toggleMaintenance}>
          {maintenance ? "Bakımı kapat" : "Bakımı aç"}
        </button>
      </div>

      <div className="cloop-admin-panel" style={{ marginTop: 16 }}>
        <h2>Başarısız bildirimler</h2>
        {failedNotes.length === 0 ? (
          <p>Başarısız olarak işaretlenmiş bildirim kaydı yok.</p>
        ) : (
          <ul className="cloop-admin-history">
            {failedNotes.map((n) => (
              <li key={n.id}>
                <strong>{n.title || "Bildirim"}</strong>
                <small>{formatAdminDate(n.createdAt)}</small>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="cloop-admin-panel" style={{ marginTop: 16 }}>
        <h2>Sistem hataları</h2>
        {!errorsAvailable ? (
          <p>`system_errors` koleksiyonu yok veya okunamadı. Örnek hata üretilmedi.</p>
        ) : errors.length === 0 ? (
          <p>Kayıtlı sistem hatası yok.</p>
        ) : (
          <ul className="cloop-admin-history">
            {errors.map((err) => (
              <li key={err.id}>
                <strong>{err.message || err.code || "Hata"}</strong>
                <small>{formatAdminDate(err.createdAt)}</small>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AdminShell>
  );
}
