"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, updateDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { normalizeRole, roleLabel } from "@/lib/adminAuth";
import { writeAdminLog } from "@/lib/adminLog";
import AdminShell from "@/components/admin/AdminShell";

const ROLES = ["superadmin", "admin", "moderator", "support", "analyst", "user"];

export default function AdminStaffPage() {
  const [users, setUsers] = useState([]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "users"), (snapshot) => {
      const list = [];
      snapshot.forEach((docSnap) => list.push({ id: docSnap.id, ...docSnap.data() }));
      setUsers(list);
    });
    return () => unsub();
  }, []);

  const staff = users.filter((u) => ["superadmin", "admin", "moderator", "support", "analyst"].includes(normalizeRole(u.role)));

  const changeRole = async (user, role) => {
    if (!confirm(`${user.fullName || user.email} rolünü ${roleLabel(role)} yapmak istiyor musunuz?`)) return;
    try {
      await updateDoc(doc(db, "users", user.id), { role });
      await writeAdminLog({
        action: "role_change",
        targetType: "user",
        targetId: user.id,
        targetLabel: user.email || user.fullName,
        before: user.role,
        after: role,
      });
    } catch (err) {
      alert("Rol güncellenemedi: " + err.message);
    }
  };

  return (
    <AdminShell active="staff">
      <div className="cloop-admin-panel">
        <h2>Admin Yönetimi</h2>
        <p>Mevcut `users` koleksiyonundaki yönetici rolleri listelenir. Yeni kullanıcı oluşturulmaz; yalnızca rol atanır.</p>
      </div>
      <div className="cloop-admin-table-wrap" style={{ marginTop: 16 }}>
        <table className="cloop-admin-table">
          <thead>
            <tr>
              <th>Yönetici</th>
              <th>Rol</th>
              <th>İşlem</th>
            </tr>
          </thead>
          <tbody>
            {staff.length === 0 ? (
              <tr><td colSpan={3}>Henüz yönetici rolü atanmış kullanıcı yok.</td></tr>
            ) : staff.map((user) => (
              <tr key={user.id}>
                <td>
                  <strong>{user.fullName || "İsimsiz"}</strong>
                  <small>{user.email}</small>
                </td>
                <td>{roleLabel(user.role)}</td>
                <td>
                  <select
                    defaultValue={normalizeRole(user.role)}
                    onChange={(e) => changeRole(user, e.target.value)}
                  >
                    {ROLES.map((role) => (
                      <option key={role} value={role}>{roleLabel(role)}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
