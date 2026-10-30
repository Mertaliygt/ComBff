"use client";

import { useEffect, useState } from "react";
import { addDoc, collection, deleteDoc, doc, onSnapshot, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { writeAdminLog } from "@/lib/adminLog";
import AdminShell from "@/components/admin/AdminShell";

const EMPTY_FORM = { name: "", icon: "🏷️", description: "" };

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "categories"), (snapshot) => {
      const list = [];
      snapshot.forEach((docSnap) => list.push({ id: docSnap.id, ...docSnap.data() }));
      list.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "tr"));
      setCategories(list);
    });
    return () => unsub();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return alert("Kategori adı zorunlu.");
    setSaving(true);
    try {
      await addDoc(collection(db, "categories"), {
        name: form.name.trim(),
        icon: form.icon.trim() || "🏷️",
        description: form.description.trim(),
        isActive: true,
        createdAt: new Date(),
      });
      await writeAdminLog({
        action: "category_create",
        targetType: "category",
        targetLabel: form.name.trim(),
        after: "aktif",
      });
      setForm(EMPTY_FORM);
      setOpen(false);
    } catch (err) {
      alert("Kategori eklenemedi: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const setActive = async (item, isActive) => {
    try {
      await updateDoc(doc(db, "categories", item.id), { isActive });
      await writeAdminLog({
        action: isActive ? "category_activate" : "category_deactivate",
        targetType: "category",
        targetId: item.id,
        targetLabel: item.name,
        before: item.isActive === false ? "pasif" : "aktif",
        after: isActive ? "aktif" : "pasif",
      });
    } catch (err) {
      alert("Güncellenemedi: " + err.message);
    }
  };

  const remove = async (item) => {
    if (!confirm(`"${item.name}" kategorisini silmek yerine pasifleştirmek daha güvenlidir. Yine de silmek istiyor musunuz?`)) return;
    try {
      await deleteDoc(doc(db, "categories", item.id));
      await writeAdminLog({
        action: "category_delete",
        targetType: "category",
        targetId: item.id,
        targetLabel: item.name,
        before: "aktif",
        after: "silindi",
      });
    } catch (err) {
      alert("Silinemedi: " + err.message);
    }
  };

  return (
    <AdminShell active="categories">
      <div className="cloop-admin-toolbar">
        <span>{categories.length} kategori</span>
        <button type="button" onClick={() => setOpen(true)}>Yeni Kategori Ekle</button>
      </div>

      <div className="cloop-admin-table-wrap">
        <table className="cloop-admin-table">
          <thead>
            <tr>
              <th>Kategori</th>
              <th>Açıklama</th>
              <th>Durum</th>
              <th>İşlem</th>
            </tr>
          </thead>
          <tbody>
            {categories.length === 0 ? (
              <tr>
                <td colSpan={4}>Henüz kategori yok. İlkini sen ekle.</td>
              </tr>
            ) : (
              categories.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.icon || "🏷️"} {item.name}</strong>
                  </td>
                  <td>{item.description || "—"}</td>
                  <td>
                    <span className={`cloop-admin-badge ${item.isActive === false ? "is-warn" : "is-ok"}`}>
                      {item.isActive === false ? "Pasif" : "Aktif"}
                    </span>
                  </td>
                  <td className="cloop-admin-actions">
                    {item.isActive === false ? (
                      <button type="button" onClick={() => setActive(item, true)}>Aktif Et</button>
                    ) : (
                      <button type="button" className="is-warn" onClick={() => setActive(item, false)}>Pasife Al</button>
                    )}
                    <button type="button" className="is-danger" onClick={() => remove(item)}>Sil</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {open && (
        <div className="cloop-admin-modal" onClick={() => setOpen(false)}>
          <form className="cloop-admin-modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleCreate}>
            <h2>Yeni Kategori</h2>
            <label>
              Kategori Adı
              <input
                required
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Örn: Motor / Sürüş"
              />
            </label>
            <label>
              İkon
              <input
                value={form.icon}
                onChange={(e) => setForm((prev) => ({ ...prev, icon: e.target.value }))}
                placeholder="🏍️"
              />
            </label>
            <label>
              Açıklama
              <textarea
                rows={3}
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Kısa açıklama"
              />
            </label>
            <div className="cloop-admin-actions">
              <button type="button" className="is-warn" onClick={() => setOpen(false)}>Vazgeç</button>
              <button type="submit" disabled={saving}>{saving ? "Kaydediliyor..." : "Kategoriyi Ekle"}</button>
            </div>
          </form>
        </div>
      )}
    </AdminShell>
  );
}
