"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { collection, onSnapshot, updateDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { writeAdminLog } from "@/lib/adminLog";
import AdminShell, { formatAdminDate, toDate } from "@/components/admin/AdminShell";

function isUserSuspended(user) {
  return Boolean(user.isSuspended || user.banned);
}

export default function AdminUsersPage() {
  return (
    <Suspense fallback={<AdminShell active="users"><p>Kullanıcılar yükleniyor...</p></AdminShell>}>
      <AdminUsersInner />
    </Suspense>
  );
}

function AdminUsersInner() {
  const searchParams = useSearchParams();
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [queryText, setQueryText] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [busyId, setBusyId] = useState("");

  useEffect(() => {
    setQueryText(searchParams.get("q") || "");
  }, [searchParams]);

  useEffect(() => {
    const unsubUsers = onSnapshot(collection(db, "users"), (snapshot) => {
      const list = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });
      list.sort((a, b) => String(a.fullName || "").localeCompare(String(b.fullName || ""), "tr"));
      setUsers(list);
    });
    const unsubGroups = onSnapshot(collection(db, "groups"), (snapshot) => {
      setGroups(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
    });
    return () => {
      unsubUsers();
      unsubGroups();
    };
  }, []);

  const countsFor = (userId) => ({
    created: groups.filter((g) => g.createdBy === userId).length,
    joined: groups.filter((g) => Array.isArray(g.members) && g.members.includes(userId)).length,
  });

  const filtered = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    return users.filter((u) => {
      const name = String(u.fullName || "").toLowerCase();
      const email = String(u.email || "").toLowerCase();
      const matchesQuery = !q || name.includes(q) || email.includes(q);
      const suspended = isUserSuspended(u);
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && !suspended && u.approved !== false) ||
        (statusFilter === "pending" && u.approved === false && !suspended) ||
        (statusFilter === "suspended" && suspended);
      const created = toDate(u.createdAt);
      const matchesDate = !fromDate || (created && created >= new Date(fromDate));
      return matchesQuery && matchesStatus && matchesDate;
    });
  }, [users, queryText, statusFilter, fromDate]);

  const setSuspended = async (user, next) => {
    const actionLabel = next ? "askıya almak / engellemek" : "engeli kaldırmak";
    if (!confirm(`${user.fullName || user.email} hesabını ${actionLabel} istiyor musunuz?`)) return;
    const reason = next ? window.prompt("İşlem gerekçesi") : "Engel kaldırıldı";
    if (next && !reason) return;
    setBusyId(user.id);
    try {
      await updateDoc(doc(db, "users", user.id), {
        isSuspended: next,
        banned: next,
      });
      await writeAdminLog({
        action: next ? "user_suspend" : "user_unsuspend",
        targetType: "user",
        targetId: user.id,
        targetLabel: user.email || user.fullName,
        reason,
        before: user.banned || user.isSuspended ? "askıda" : "aktif",
        after: next ? "askıda" : "aktif",
      });
    } catch (err) {
      alert("Durum güncellenemedi: " + err.message);
    } finally {
      setBusyId("");
    }
  };

  return (
    <AdminShell active="users">
      <div className="cloop-admin-toolbar">
        <input
          type="search"
          value={queryText}
          onChange={(e) => setQueryText(e.target.value)}
          placeholder="İsim veya e-posta ara"
          className="cloop-admin-search"
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">Tüm durumlar</option>
          <option value="active">Aktif</option>
          <option value="pending">Askıda / onay bekliyor</option>
          <option value="suspended">Engelli</option>
        </select>
        <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        <span>{filtered.length} kullanıcı</span>
      </div>

      <div className="cloop-admin-table-wrap">
        <table className="cloop-admin-table">
          <thead>
            <tr>
              <th>Kullanıcı</th>
              <th>E-posta</th>
              <th>Kayıt</th>
              <th>Oluşturduğu</th>
              <th>Katıldığı</th>
              <th>Durum</th>
              <th>İşlem</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7}>Kullanıcı bulunamadı.</td>
              </tr>
            ) : (
              filtered.map((u) => {
                const suspended = isUserSuspended(u);
                const counts = countsFor(u.id);
                return (
                  <tr key={u.id}>
                    <td>
                      {u.photoUrl ? <img className="cloop-admin-user-photo" src={u.photoUrl} alt="" /> : null}
                      <strong>{u.fullName || "İsimsiz"}</strong>
                      <small>{u.role || "user"}</small>
                    </td>
                    <td>{u.email || "—"}</td>
                    <td>{formatAdminDate(u.createdAt)}</td>
                    <td>{counts.created}</td>
                    <td>{counts.joined}</td>
                    <td>
                      <span className={`cloop-admin-badge ${suspended ? "is-warn" : "is-ok"}`}>
                        {suspended ? "Askıda" : u.approved === false ? "Onay bekliyor" : "Aktif"}
                      </span>
                    </td>
                    <td>
                      {suspended ? (
                        <button
                          type="button"
                          disabled={busyId === u.id}
                          onClick={() => setSuspended(u, false)}
                        >
                          Aktif Et
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="is-danger"
                          disabled={busyId === u.id}
                          onClick={() => setSuspended(u, true)}
                        >
                          Askıya Al / Engelle
                        </button>
                      )}
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
