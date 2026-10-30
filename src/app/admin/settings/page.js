"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, sendPasswordResetEmail, signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { requireAdminProfile, roleLabel } from "@/lib/adminAuth";
import AdminShell from "@/components/admin/AdminShell";

export default function AdminSettingsPage() {
  const [profile, setProfile] = useState(null);
  const [info, setInfo] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setProfile(null);
        return;
      }
      setProfile(await requireAdminProfile(user));
    });
    return () => unsub();
  }, []);

  const handleReset = async () => {
    if (!profile?.email) {
      setError("E-posta bulunamadı.");
      return;
    }
    setSending(true);
    setError("");
    setInfo("");
    try {
      await sendPasswordResetEmail(auth, profile.email);
      setInfo("Şifre sıfırlama bağlantısı e-posta adresinize gönderildi.");
    } catch (err) {
      setError("Şifre sıfırlama gönderilemedi: " + err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <AdminShell active="settings">
      {!profile ? (
        <p>Profil yükleniyor...</p>
      ) : (
        <>
          <div className="cloop-admin-panel">
            <h2>Admin profili</h2>
            <p>Ad: {profile.fullName || "—"}</p>
            <p>E-posta: {profile.email || "—"}</p>
            <p>Rol: {roleLabel(profile.role)}</p>
            <p>Şifreler bu panelde görüntülenmez.</p>
          </div>
          <div className="cloop-admin-panel" style={{ marginTop: 16 }}>
            <h2>Güvenlik</h2>
            {error && <p className="cloop-admin-alert is-error">{error}</p>}
            {info && <p className="cloop-admin-alert is-ok">{info}</p>}
            <div className="cloop-admin-actions" style={{ marginTop: 12 }}>
              <button type="button" disabled={sending} onClick={handleReset}>
                {sending ? "Gönderiliyor..." : "Şifre sıfırlama e-postası gönder"}
              </button>
              <button type="button" className="is-danger" onClick={() => signOut(auth)}>
                Oturumu kapat
              </button>
            </div>
          </div>
        </>
      )}
    </AdminShell>
  );
}
