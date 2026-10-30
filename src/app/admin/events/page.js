"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { addDoc, collection, deleteDoc, doc, getDoc, onSnapshot, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { writeAdminLog } from "@/lib/adminLog";
import { eventCapacity, participantLists } from "@/lib/adminDomain";
import AdminShell, { formatAdminDate } from "@/components/admin/AdminShell";

function isPendingEvent(item) {
  if (item.source === "groups") return item.status === "Onay Bekliyor" || item.isApproved === false;
  return item.isApproved !== true;
}

function isBrandEvent(item) {
  return Boolean(item.brandName || item.brand || item.organizationName || item.isBrand || item.type === "brand");
}

export default function AdminEventsPage() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [busyId, setBusyId] = useState("");

  useEffect(() => {
    const mapSnap = (snapshot, source) =>
      snapshot.docs.map((docSnap) => ({ id: docSnap.id, source, ...docSnap.data() }));

    let groups = [];
    let events = [];

    const publish = () => {
      setItems([...groups, ...events].sort((a, b) => String(a.title || "").localeCompare(String(b.title || ""), "tr")));
    };

    const unsubGroups = onSnapshot(collection(db, "groups"), (snap) => {
      groups = mapSnap(snap, "groups");
      publish();
    });
    const unsubEvents = onSnapshot(collection(db, "events"), (snap) => {
      events = mapSnap(snap, "events");
      publish();
    });

    return () => {
      unsubGroups();
      unsubEvents();
    };
  }, []);

  const notifyOwner = async (item, title, message, type) => {
    if (!item.createdBy || item.createdBy === "anonim") return;
    await addDoc(collection(db, "users", item.createdBy, "notifications"), {
      title,
      message,
      type,
      isRead: false,
      createdAt: new Date(),
    });
  };

  const approve = async (item) => {
    setBusyId(item.id);
    try {
      await updateDoc(doc(db, item.source, item.id), {
        isApproved: true,
        status: "Aktif",
      });
      await notifyOwner(
        item,
        "Etkinliğin Onaylandı! 🎉",
        `"${item.title || "Etkinlik"}" yayına alındı.`,
        "group_approved"
      );
      await writeAdminLog({
        action: "event_approve",
        targetType: "event",
        targetId: item.id,
        targetLabel: item.title,
        before: item.status || "Onay Bekliyor",
        after: "Aktif",
      });
    } catch (err) {
      alert("Onaylanamadı: " + err.message);
    } finally {
      setBusyId("");
    }
  };

  const reject = async (item) => {
    if (!confirm("Bu etkinliği reddetmek istiyor musunuz?")) return;
    const reason = window.prompt("Red gerekçesi");
    if (!reason) return;
    setBusyId(item.id);
    try {
      await updateDoc(doc(db, item.source, item.id), {
        isApproved: false,
        status: "Reddedildi",
      });
      await notifyOwner(
        item,
        "Etkinliğin Reddedildi ⚠️",
        `"${item.title || "Etkinlik"}" onaylanmadı.`,
        "group_rejected"
      );
      await writeAdminLog({
        action: "event_reject",
        targetType: "event",
        targetId: item.id,
        targetLabel: item.title,
        reason,
        before: item.status || "Onay Bekliyor",
        after: "Reddedildi",
      });
    } catch (err) {
      alert("Reddedilemedi: " + err.message);
    } finally {
      setBusyId("");
    }
  };

  const remove = async (item) => {
    if (!confirm("Etkinliği tamamen yayından kaldırmak istiyor musunuz?")) return;
    const reason = window.prompt("Yayından kaldırma gerekçesi");
    if (!reason) return;
    setBusyId(item.id);
    try {
      const ref = doc(db, item.source, item.id);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        await notifyOwner(
          { ...item, ...snap.data() },
          "Etkinliğin Kaldırıldı",
          `"${item.title || "Etkinlik"}" yönetim tarafından yayından alındı.`,
          "group_removed"
        );
      }
      await deleteDoc(ref);
      await writeAdminLog({
        action: "event_remove",
        targetType: "event",
        targetId: item.id,
        targetLabel: item.title,
        reason,
        before: item.status || "Aktif",
        after: "silindi",
      });
    } catch (err) {
      alert("Silinemedi: " + err.message);
    } finally {
      setBusyId("");
    }
  };

  return (
    <AdminShell active="events">
      <div className="cloop-admin-toolbar">
        <span>{items.length} etkinlik / marka kaydı</span>
      </div>
      <div className="cloop-admin-table-wrap">
        <table className="cloop-admin-table">
          <thead>
            <tr>
              <th>Etkinlik</th>
              <th>Kaynak</th>
              <th>Katılım</th>
              <th>Tarih</th>
              <th>Durum</th>
              <th>İşlem</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={6}>Etkinlik bulunamadı.</td>
              </tr>
            ) : (
              items.map((item) => {
                const pending = isPendingEvent(item);
                return (
                  <tr key={`${item.source}-${item.id}`}>
                    <td>
                      <strong>{item.title || "İsimsiz etkinlik"}</strong>
                      <small>
                        {isBrandEvent(item) ? "Kurumsal / Marka" : item.category || "Genel"}
                        {item.locationAddress ? ` · ${item.locationAddress}` : ""}
                      </small>
                    </td>
                    <td>{item.source === "events" ? "events" : "groups"}</td>
                    <td>
                      {participantLists(item).members.length}
                      {eventCapacity(item) ? ` / ${eventCapacity(item)}` : " / sınırsız"}
                      {participantLists(item).waitlist.length ? ` · ${participantLists(item).waitlist.length} beklemede` : ""}
                    </td>
                    <td>{formatAdminDate(item.eventDate || item.createdAt)}</td>
                    <td>
                      <span className={`cloop-admin-badge ${pending ? "is-warn" : item.status === "Reddedildi" ? "is-danger" : "is-ok"}`}>
                        {item.status || (item.isApproved ? "Onaylı" : "Onay bekliyor")}
                      </span>
                    </td>
                    <td className="cloop-admin-actions">
                      <button type="button" className="is-warn" onClick={() => router.push(`/admin/events/${item.id}?source=${item.source}`)}>
                        Detay
                      </button>
                      {pending && (
                        <>
                          <button type="button" disabled={busyId === item.id} onClick={() => approve(item)}>
                            Onayla
                          </button>
                          <button type="button" className="is-warn" disabled={busyId === item.id} onClick={() => reject(item)}>
                            Reddet
                          </button>
                        </>
                      )}
                      <button type="button" className="is-danger" disabled={busyId === item.id} onClick={() => remove(item)}>
                        Yayından Kaldır
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
