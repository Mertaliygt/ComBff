"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { arrayRemove, arrayUnion, collection, doc, getDoc, onSnapshot, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { writeAdminLog } from "@/lib/adminLog";
import { eventCapacity, participantLists, userLabel } from "@/lib/adminDomain";
import AdminShell, { formatAdminDate, toDate } from "@/components/admin/AdminShell";

function ParticipantTable({ ids, users, empty, onOpen, actionLabel, onAction }) {
  if (!ids.length) return <p>{empty}</p>;
  return (
    <div className="cloop-admin-table-wrap">
      <table className="cloop-admin-table">
        <thead>
          <tr>
            <th>Kullanıcı</th>
            <th>E-posta</th>
            <th>İşlem</th>
          </tr>
        </thead>
        <tbody>
          {ids.map((uid) => {
            const user = users[uid];
            return (
              <tr key={uid}>
                <td>
                  <button type="button" className="cloop-admin-link" onClick={() => onOpen(uid)}>
                    {userLabel(user, uid)}
                  </button>
                </td>
                <td>{user?.email || "—"}</td>
                <td>
                  {onAction ? (
                    <button type="button" className="is-warn" onClick={() => onAction(uid)}>{actionLabel}</button>
                  ) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminEventDetailPage() {
  return (
    <Suspense fallback={<AdminShell active="events"><p>Etkinlik yükleniyor...</p></AdminShell>}>
      <AdminEventDetailInner />
    </Suspense>
  );
}

function AdminEventDetailInner() {
  const { id } = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const preferred = searchParams.get("source") || "groups";
  const [item, setItem] = useState(null);
  const [source, setSource] = useState(preferred);
  const [users, setUsers] = useState({});
  const [reports, setReports] = useState([]);
  const [logs, setLogs] = useState([]);
  const [tab, setTab] = useState("genel");
  const [capacityInput, setCapacityInput] = useState("");
  const [missing, setMissing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) {
      setMissing(true);
      setLoading(false);
      return;
    }
    let unsubDoc = () => {};
    let cancelled = false;
    setLoading(true);
    setLoadError("");
    setMissing(false);
    setItem(null);

    async function attach() {
      try {
        const first = preferred === "events" ? "events" : "groups";
        const second = first === "groups" ? "events" : "groups";
        const [snapA, snapB] = await Promise.all([
          getDoc(doc(db, first, String(id))),
          getDoc(doc(db, second, String(id))),
        ]);
        if (cancelled) return;
        const chosen = snapA.exists() ? first : snapB.exists() ? second : null;
        if (!chosen) {
          setMissing(true);
          setItem(null);
          setLoading(false);
          return;
        }
        setSource(chosen);
        unsubDoc = onSnapshot(
          doc(db, chosen, String(id)),
          (docSnap) => {
            if (!docSnap.exists()) {
              setMissing(true);
              setItem(null);
              setLoading(false);
              return;
            }
            const data = { id: docSnap.id, ...docSnap.data() };
            setMissing(false);
            setLoadError("");
            setItem(data);
            setCapacityInput(data.capacity ? String(data.capacity) : "");
            setLoading(false);
          },
          (err) => {
            setLoadError(err.message || "Etkinlik dinlenemedi.");
            setLoading(false);
          }
        );
      } catch (err) {
        if (!cancelled) {
          setLoadError(err.message || "Etkinlik yüklenemedi.");
          setLoading(false);
        }
      }
    }

    attach();
    const unsubUsers = onSnapshot(collection(db, "users"), (snap) => {
      const map = {};
      snap.forEach((d) => { map[d.id] = { id: d.id, ...d.data() }; });
      setUsers(map);
    });
    const unsubReports = onSnapshot(collection(db, "reports"), (snap) => {
      setReports(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    const unsubLogs = onSnapshot(collection(db, "admin_logs"), (snap) => {
      setLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    return () => {
      cancelled = true;
      unsubDoc();
      unsubUsers();
      unsubReports();
      unsubLogs();
    };
  }, [id, preferred]);

  const lists = useMemo(() => participantLists(item || {}), [item]);
  const capacity = eventCapacity(item);
  const eventReports = useMemo(
    () => reports.filter((r) => r.groupId === id || r.eventId === id),
    [reports, id]
  );
  const decisions = useMemo(
    () => logs
      .filter((log) => log.targetId === id)
      .sort((a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0)),
    [logs, id]
  );

  const mutate = async (payload, log) => {
    if (!item) return;
    try {
      await updateDoc(doc(db, source, item.id), payload);
      await writeAdminLog({
        targetType: "event",
        targetId: item.id,
        targetLabel: item.title,
        ...log,
      });
    } catch (err) {
      alert("İşlem başarısız: " + err.message);
    }
  };

  const unpublish = async () => {
    if (!confirm("Etkinlik geçici olarak yayından alınacak. Silinmeyecek.")) return;
    const reason = window.prompt("Gerekçe");
    if (!reason) return;
    await mutate(
      { status: "Yayından Alındı", isApproved: false },
      { action: "event_unpublish", reason, before: item?.status, after: "Yayından Alındı" }
    );
  };

  const republish = async () => {
    if (!confirm("Etkinlik yeniden yayına alınacak.")) return;
    const reason = window.prompt("Gerekçe") || "Yeniden yayın";
    await mutate(
      { status: "Aktif", isApproved: true },
      { action: "event_republish", reason, before: item?.status, after: "Aktif" }
    );
  };

  const markReview = async () => {
    const reason = window.prompt("İnceleme gerekçesi");
    if (!reason) return;
    await mutate(
      { reviewStatus: "İncelemede" },
      { action: "event_review", reason, before: item.reviewStatus || "yok", after: "İncelemede" }
    );
  };

  const saveCapacity = async (e) => {
    e.preventDefault();
    const value = Number(capacityInput);
    if (capacityInput && (!Number.isFinite(value) || value < 1)) {
      return alert("Kontenjan 1 veya daha büyük olmalı.");
    }
    await mutate(
      { capacity: capacityInput ? value : null },
      { action: "event_capacity", reason: "Kontenjan güncellendi", before: item.capacity || "yok", after: capacityInput || "sınırsız" }
    );
  };

  const removeMember = async (uid) => {
    if (uid === item.createdBy) return alert("Etkinlik sahibi çıkarılamaz.");
    if (!confirm("Bu katılımcı etkinlikten çıkarılacak.")) return;
    const reason = window.prompt("Gerekçe");
    if (!reason) return;
    await mutate(
      {
        members: arrayRemove(uid),
        leftMembers: arrayUnion(uid),
        memberCount: Math.max(1, lists.members.length - 1),
      },
      { action: "event_remove_member", reason, targetLabel: `${item.title} / ${uid}`, before: "üye", after: "çıkarıldı" }
    );
  };

  const promoteWaitlist = async (uid) => {
    if (lists.members.includes(uid)) return alert("Kullanıcı zaten katılımcı.");
    if (capacity && lists.members.length >= capacity) return alert("Kontenjan dolu.");
    if (!confirm("Bekleme listesindeki kullanıcı katılımcı yapılacak.")) return;
    await mutate(
      {
        members: arrayUnion(uid),
        waitlist: arrayRemove(uid),
        memberCount: lists.members.length + 1,
      },
      { action: "event_promote_waitlist", reason: "Admin kontenjan açtı", targetLabel: `${item.title} / ${uid}`, before: "bekleme", after: "üye" }
    );
  };

  const frame = (body) => (
    <AdminShell active="events">
      <button type="button" className="cloop-admin-link" onClick={() => router.push("/admin/events")}>← Etkinlik listesi</button>
      {body}
    </AdminShell>
  );

  if (loadError) {
    return frame(<p className="cloop-admin-alert is-error">Etkinlik yüklenemedi: {loadError}</p>);
  }
  if (loading) {
    return frame(<p>Etkinlik yükleniyor...</p>);
  }
  if (missing || !item) {
    return frame(<p>Etkinlik bulunamadı.</p>);
  }

  return frame(
    <EventDetailView
      item={item}
      users={users}
      lists={lists}
      capacity={capacity}
      tab={tab}
      setTab={setTab}
      router={router}
      eventReports={eventReports}
      decisions={decisions}
      capacityInput={capacityInput}
      setCapacityInput={setCapacityInput}
      unpublish={unpublish}
      republish={republish}
      markReview={markReview}
      saveCapacity={saveCapacity}
      removeMember={removeMember}
      promoteWaitlist={promoteWaitlist}
    />
  );
}

function EventDetailView({
  item,
  users,
  lists,
  capacity,
  tab,
  setTab,
  router,
  eventReports,
  decisions,
  capacityInput,
  setCapacityInput,
  unpublish,
  republish,
  markReview,
  saveCapacity,
  removeMember,
  promoteWaitlist,
}) {
  if (!item) return <p>Etkinlik bulunamadı.</p>;
  const eventStatus = item.status;
  const unpublished = eventStatus === "Yayından Alındı" || eventStatus === "Reddedildi";

  return (
    <>
          <div className="cloop-admin-tabs">
            <button type="button" className={tab === "genel" ? "is-active" : undefined} onClick={() => setTab("genel")}>Genel</button>
            <button type="button" className={tab === "katilimcilar" ? "is-active" : undefined} onClick={() => setTab("katilimcilar")}>Katılımcılar</button>
            <button type="button" className={tab === "guvenlik" ? "is-active" : undefined} onClick={() => setTab("guvenlik")}>Güvenlik</button>
          </div>

          {tab === "genel" && (
            <div className="cloop-admin-panel">
              {item.imageUrl ? <img className="cloop-admin-cover" src={item.imageUrl} alt="" /> : null}
              <h2>{item.title || "İsimsiz etkinlik"}</h2>
              <p>{item.desc || item.description || "Açıklama yok."}</p>
              <p>Oluşturan: <button type="button" className="cloop-admin-link" onClick={() => router.push(`/admin/users/${item.createdBy}`)}>{userLabel(users[item.createdBy], item.createdBy)}</button></p>
              <p>Kategori: {item.category || "—"}</p>
              <p>Tarih: {formatAdminDate(item.eventDate || item.createdAt)}</p>
              <p>Konum: {item.locationAddress || "—"}</p>
              <p>Durum: {eventStatus || "—"}</p>
              <p>Oluşturulma: {formatAdminDate(item.createdAt)}</p>
              <p>Katılımcı: {lists.members.length} / {capacity || "sınırsız"}</p>
              <div className="cloop-admin-actions" style={{ marginTop: 12 }}>
                {unpublished ? (
                  <button type="button" onClick={republish}>Yeniden yayına al</button>
                ) : (
                  <button type="button" className="is-danger" onClick={unpublish}>Geçici yayından kaldır</button>
                )}
                <button type="button" className="is-warn" onClick={markReview}>İncelemeye al</button>
              </div>
            </div>
          )}

          {tab === "katilimcilar" && (
            <>
              <form className="cloop-admin-panel cloop-admin-form" onSubmit={saveCapacity}>
                <h2>Kontenjan</h2>
                <p>Boş bırakılırsa katılım sınırsızdır. Kontenjan dolunca mobil katılım bekleme listesine düşer. Sahip onayı bu uygulamada yoktur.</p>
                <label>
                  Kontenjan
                  <input type="number" min="1" value={capacityInput} onChange={(e) => setCapacityInput(e.target.value)} placeholder="Sınırsız" />
                </label>
                <button type="submit">Kontenjanı kaydet</button>
              </form>
              <div className="cloop-admin-panel" style={{ marginTop: 16 }}>
                <h2>Onaylanan katılımcılar ({lists.members.length})</h2>
                <ParticipantTable
                  ids={lists.members}
                  users={users}
                  empty="Katılımcı yok."
                  onOpen={(uid) => router.push(`/admin/users/${uid}`)}
                  actionLabel="Çıkar"
                  onAction={removeMember}
                />
              </div>
              <div className="cloop-admin-panel" style={{ marginTop: 16 }}>
                <h2>Bekleme listesi ({lists.waitlist.length})</h2>
                <ParticipantTable
                  ids={lists.waitlist}
                  users={users}
                  empty="Bekleme listesi boş. Kontenjan tanımlı ve dolu olduğunda burada görünür."
                  onOpen={(uid) => router.push(`/admin/users/${uid}`)}
                  actionLabel="Katılımcı yap"
                  onAction={promoteWaitlist}
                />
              </div>
              <div className="cloop-admin-panel" style={{ marginTop: 16 }}>
                <h2>Ayrılanlar ({lists.leftMembers.length})</h2>
                <ParticipantTable
                  ids={lists.leftMembers}
                  users={users}
                  empty="Ayrılan kullanıcı kaydı yok."
                  onOpen={(uid) => router.push(`/admin/users/${uid}`)}
                />
              </div>
              <div className="cloop-admin-panel" style={{ marginTop: 16 }}>
                <h2>Katılma isteği / red</h2>
                {lists.joinRequests.length === 0 && lists.rejectedMembers.length === 0 ? (
                  <p>Bu uygulamada katılım isteği onayı yok. Kullanıcı doğrudan `members` listesine eklenir.</p>
                ) : (
                  <p>İstek: {lists.joinRequests.length} · Red: {lists.rejectedMembers.length}</p>
                )}
              </div>
            </>
          )}

          {tab === "guvenlik" && (
            <>
              <div className="cloop-admin-panel">
                <h2>Şikayetler ({eventReports.length})</h2>
                {eventReports.length >= 2 && <p className="cloop-admin-alert is-error">Birden fazla şikayet var. Bu bir inceleme işaretidir, otomatik ceza değildir.</p>}
                {eventReports.length === 0 ? <p>Bu etkinliğe şikayet yok.</p> : (
                  <ul className="cloop-admin-history">
                    {eventReports.map((r) => (
                      <li key={r.id}>
                        <strong>{r.messageText || r.reason || "Detay yok"}</strong>
                        <span>{r.reportedUserEmail || r.reportedUserId || "—"}</span>
                        <small>{r.status || "Bekliyor"} · {formatAdminDate(r.createdAt)}</small>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="cloop-admin-panel" style={{ marginTop: 16 }}>
                <h2>Moderasyon kararları</h2>
                {decisions.length === 0 ? <p>Karar kaydı yok.</p> : (
                  <ul className="cloop-admin-history">
                    {decisions.map((log) => (
                      <li key={log.id}>
                        <strong>{log.action}</strong>
                        <span>{log.reason || "Gerekçe yok"}</span>
                        <small>{log.adminEmail} · {formatAdminDate(log.createdAt)}</small>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </>
  );
}
