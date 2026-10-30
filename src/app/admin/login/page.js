"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { rejectNonAdminSession, requireAdminProfile } from "@/lib/adminAuth";
import { writeAdminLog } from "@/lib/adminLog";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [checking, setChecking] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      try {
        if (!user) return;
        const profile = await requireAdminProfile(user);
        if (profile) {
          router.replace("/admin");
          return;
        }
        await rejectNonAdminSession();
        setError("Bu hesap admin yetkisine sahip değil. Oturum kapatıldı.");
      } catch (err) {
        setError("Yetki kontrolü başarısız: " + (err?.message || "Bilinmeyen hata"));
      } finally {
        setChecking(false);
      }
    });
    return () => unsub();
  }, [router]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setInfo("");
    setSubmitting(true);
    try {
      const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
      const profile = await requireAdminProfile(credential.user);
      if (!profile) {
        await rejectNonAdminSession();
        setError("Admin yetkisi bulunamadı. Bu panele giremezsiniz.");
        return;
      }
      try {
        await writeAdminLog({
          action: "admin_login",
          targetType: "admin",
          targetId: profile.uid,
          targetLabel: profile.email || profile.fullName,
        });
      } catch (logErr) {
        console.warn("Giriş logu yazılamadı:", logErr);
      }
      router.replace("/admin");
    } catch (err) {
      setError(err?.code === "auth/invalid-credential" ? "E-posta veya şifre hatalı." : "Giriş başarısız: " + (err?.message || "Bilinmeyen hata"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotPassword = async () => {
    setError("");
    setInfo("");
    if (!email.trim()) {
      setError("Şifre sıfırlamak için e-posta adresini yazın.");
      return;
    }
    setResetting(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setInfo("Şifre sıfırlama bağlantısı e-posta adresinize gönderildi.");
    } catch (err) {
      setError("Şifre sıfırlama gönderilemedi: " + (err?.message || "Bilinmeyen hata"));
    } finally {
      setResetting(false);
    }
  };

  if (checking) {
    return (
      <div className="cloop-admin-login">
        <p className="cloop-admin-login-status">Yetki kontrol ediliyor...</p>
      </div>
    );
  }

  return (
    <div className="cloop-admin-login">
      <div className="cloop-admin-login-card">
        <p className="cloop-admin-kicker">Cloop Yönetim</p>
        <h1>Admin Paneli</h1>
        <p className="cloop-admin-login-copy">Yalnızca yetkili yöneticiler bu panele girebilir. Kullanıcı şifreleri burada görüntülenmez.</p>

        <form onSubmit={handleSubmit}>
          <label>
            E-posta
            <input
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@cloop.app"
            />
          </label>
          <label>
            Şifre
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </label>
          {error && <p className="cloop-admin-alert is-error">{error}</p>}
          {info && <p className="cloop-admin-alert is-ok">{info}</p>}
          <button type="submit" disabled={submitting}>
            {submitting ? "Giriş yapılıyor..." : "Giriş Yap"}
          </button>
          <button type="button" className="is-ghost" disabled={resetting} onClick={handleForgotPassword}>
            {resetting ? "Gönderiliyor..." : "Şifremi unuttum"}
          </button>
        </form>
      </div>
    </div>
  );
}
