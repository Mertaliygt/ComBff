"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { collection, doc, onSnapshot, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { writeAdminLog } from "@/lib/adminLog";
import { getEmailVerification, getPhoneVerification, userLabel } from "@/lib/adminDomain";
import AdminShell, { formatAdminDate, toDate } from "@/components/admin/AdminShell";

export default function AdminUserDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [groups, setGroups] = useState([]);
  const [reports, setReports] = useState([]);
  const [logs, setLogs] = useState([]);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!id) return;
    const unsubUser = onSnapshot(doc(db, "users", id), (snap) => {
      if (!snap.exists()) {
        setMissing(true);
        setUser(null);
        return;
      }
      setMissing(false);
      setUser({ id: snap.id, ...snap.data() });
    });
    const unsubGroups = onSnapshot(collection(db, "groups"), (snap) => {
      setGroups(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    const unsubReports = onSnapshot(collection(db, "reports"), (snap) => {
      setReports(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    const unsubLogs = onSnapshot(collection(db, "admin_logs"), (snap) => {
      setLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => {
      unsubUser();
      unsubGroups();
      unsubReports();
      unsubLogs();
    };
  }, [id]);

  const created = useMemo(() => groups.filter((g) => g.createdBy === id), [groups, id]);
  const joined = useMemo(() => groups.filter((g) => Array.isArray(g.members) && g.members.includes(id)), [groups, id]);
  const receivedReports = useMemo(
    () => reports.filter((r) => r.reportedUserId === id || r.reportedUserEmail === user?.email),
    [reports, id, user]
  );
  const history = useMemo(
    () => logs
      .filter((log) => log.targetId === id || (log.targetType === "user" && log.targetLabel === user?.email))
      .sort((a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0)),
    [logs, id, user]
  );

  const setReview = async (next) => {
    if (!user) return;
    const reason = window.prompt(next ? "İncelemeye alma gerekçesi" : "İncelemeyi kapatma gerekçesi");
    if (!reason) return;
    try {
      await updateDoc(doc(db, "users", user.id), { reviewStatus: next ? "İncelemede" : "" });
      await writeAdminLog({
        action: next ? "user_review_open" : "user_review_close",
        targetType: "user",
        targetId: user.id,
        targetLabel: userLabel(user),
        reason,
        before: user.reviewStatus || "yok",
        after: next ? "İncelemede" : "kapalı",
      });
    } catch (err) {
      alert("Güncellenemedi: " + err.message);
    }
  };

  const setSuspended = async (next) => {
    if (!user) return;
    if (!confirm(next ? "Kullanıcı askıya alınacak. Onaylıyor musunuz?" : "Engel kaldırılacak. Onaylıyor musunuz?")) return;
    const reason = next ? window.prompt("İşlem gerekçesi") : "Engel kaldırıldı";
    if (next && !reason) return;
    try {
      await updateDoc(doc(db, "users", user.id), { isSuspended: next, banned: next });
      await writeAdminLog({
        action: next ? "user_suspend" : "user_unsuspend",
        targetType: "user",
        targetId: user.id,
        targetLabel: userLabel(user),
        reason,
        before: user.banned || user.isSuspended ? "askıda" : "aktif",
        after: next ? "askıda" : "aktif",
      });
    } catch (err) {
      alert("Durum güncellenemedi: " + err.message);
    }
  };

  return (
    <AdminShell active="users">
      <button type="button" className="cloop-admin-link" onClick={() => router.push("/admin/users")}>← Kullanıcı listesi</button>
      {missing ? <p>Kullanıcı bulunamadı.</p> : !user ? <p>Kullanıcı yükleniyor...</p> : (
        <>
          <div className="cloop-admin-panel" style={{ marginTop: 16 }}>
            <h2>{userLabel(user)}</h2>
            <p>E-posta: {user.email || "—"}</p>
            <p>Üyelik: {formatAdminDate(user.createdAt)}</p>
            <p>Rol: {user.role || "user"}</p>
            <p>Hesap: {user.banned || user.isSuspended ? "Askıda / engelli" : user.approved === false ? "Onay bekliyor" : "Aktif"}</p>
            <p>Şifre: görüntülenemez</p>
            {user.reviewStatus === "İncelemede" && (
              <p className="cloop-admin-alert is-error">Bu hesap incelemede. Otomatik suçlu sayılmaz.</p>
            )}
            <div className="cloop-admin-actions" style={{ marginTop: 12 }}>
              {user.reviewStatus === "İncelemede" ? (
                <button type="button" className="is-warn" onClick={() => setReview(false)}>İncelemeyi kapat</button>
              ) : (
                <button type="button" className="is-warn" onClick={() => setReview(true)}>Şüpheli: incelemeye al</button>
              )}
              {user.banned || user.isSuspended ? (
                <button type="button" onClick={() => setSuspended(false)}>Engeli kaldır</button>
              ) : (
                <button type="button" className="is-danger" onClick={() => setSuspended(true)}>Askıya al / Engelle</button>
              )}
            </div>
          </div>

          <div className="cloop-admin-split">
            <div className="cloop-admin-panel">
              <h2>Doğrulama</h2>
              <p>
                E-posta:{" "}
                <span className={`cloop-admin-badge ${getEmailVerification(user).badge}`}>
                  {getEmailVerification(user).status}
                </span>
              </p>
              {getEmailVerification(user).note && <p>{getEmailVerification(user).note}</p>}
              <p>
                Telefon:{" "}
                <span className={`cloop-admin-badge ${getPhoneVerification(user).badge}`}>
                  {getPhoneVerification(user).status}
                </span>
              </p>
              <p>{getPhoneVerification(user).note}</p>
            </div>
            <div className="cloop-admin-panel">
              <h2>Doğrulama geçmişi</h2>
              <p>Ayrı bir doğrulama günlüğü yok. Görünen durum, kullanıcının bir sonraki girişinde Firebase Auth `emailVerified` alanından senkronize edilir.</p>
              <p>Kayıtlı e-posta doğrulama değeri: {user.emailVerified === true ? "true" : user.emailVerified === false ? "false" : "yok"}</p>
            </div>
          </div>

          <div className="cloop-admin-split">
            <div className="cloop-admin-panel">
              <h2>Oluşturduğu etkinlikler</h2>
              {created.length === 0 ? <p>Etkinlik yok.</p> : (
                <ul className="cloop-admin-history">
                  {created.map((g) => (
                    <li key={g.id}>
                      <button type="button" className="cloop-admin-link" onClick={() => router.push(`/admin/events/${g.id}?source=groups`)}>
                        {g.title || "İsimsiz"}
                      </button>
                      <small>{g.status || "—"} · {formatAdminDate(g.eventDate || g.createdAt)}</small>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="cloop-admin-panel">
              <h2>Katıldığı etkinlikler</h2>
              {joined.length === 0 ? <p>Katılım yok.</p> : (
                <ul className="cloop-admin-history">
                  {joined.map((g) => (
                    <li key={g.id}>
                      <button type="button" className="cloop-admin-link" onClick={() => router.push(`/admin/events/${g.id}?source=groups`)}>
                        {g.title || "İsimsiz"}
                      </button>
                      <small>{g.memberCount || g.members?.length || 0} katılımcı</small>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="cloop-admin-panel">
              <h2>Aldığı şikayetler</h2>
              {receivedReports.length === 0 ? <p>Şikayet yok.</p> : (
                <ul className="cloop-admin-history">
                  {receivedReports.map((r) => (
                    <li key={r.id}>
                      <strong>{r.messageText || r.reason || "Detay yok"}</strong>
                      <small>{r.status || "Bekliyor"} · {formatAdminDate(r.createdAt)}</small>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="cloop-admin-panel">
              <h2>Moderasyon geçmişi</h2>
              {history.length === 0 ? <p>Kayıt yok.</p> : (
                <ul className="cloop-admin-history">
                  {history.map((log) => (
                    <li key={log.id}>
                      <strong>{log.action}</strong>
                      <span>{log.reason || "Gerekçe yok"}</span>
                      <small>{log.adminEmail} · {formatAdminDate(log.createdAt)}</small>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </AdminShell>
  );
}
