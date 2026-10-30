"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { roleLabel } from "@/lib/adminAuth";

export const ADMIN_NAV_GROUPS = [
  {
    title: "GENEL",
    items: [{ id: "dashboard", label: "Dashboard", hint: "Özet ve istatistikler" }],
  },
  {
    title: "YÖNETİM",
    items: [
      { id: "users", label: "Kullanıcılar", hint: "Üye yönetimi" },
      { id: "events", label: "Etkinlikler", hint: "Kullanıcı etkinlikleri" },
      { id: "reports", label: "Şikayetler", hint: "Moderasyon kuyruğu" },
      { id: "categories", label: "Kategoriler", hint: "Etkinlik kategorileri" },
    ],
  },
  {
    title: "İLETİŞİM VE ANALİZ",
    items: [
      { id: "notifications", label: "Bildirimler", hint: "Duyuru gönderimi" },
      { id: "analytics", label: "İstatistikler", hint: "Kullanım analizi" },
      { id: "feedback", label: "Geri Bildirimler", hint: "Destek kayıtları" },
    ],
  },
  {
    title: "SİSTEM",
    items: [
      { id: "staff", label: "Admin Yönetimi", hint: "Roller ve yetkiler" },
      { id: "logs", label: "İşlem Geçmişi", hint: "Audit kayıtları" },
      { id: "settings", label: "Ayarlar", hint: "Profil ve güvenlik" },
    ],
  },
];

export const ADMIN_NAV = ADMIN_NAV_GROUPS.flatMap((group) => group.items);

export default function AdminLayout({
  profile,
  active = "dashboard",
  onNavigate,
  onLogout,
  pendingReports = 0,
  children,
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const menuRef = useRef(null);
  const displayName = profile?.fullName || profile?.email || "Yönetici";
  const initial = displayName.charAt(0).toUpperCase();

  useEffect(() => {
    const close = (e) => {
      if (!menuRef.current?.contains(e.target)) {
        setMenuOpen(false);
        setNotifOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    const q = search.trim();
    router.push(q ? `/admin/users?q=${encodeURIComponent(q)}` : "/admin/users");
  };

  return (
    <div className="cloop-admin">
      <aside className="cloop-admin-sidebar">
        <div className="cloop-admin-brand">
          <span className="cloop-admin-mark">C</span>
          <div>
            <strong>Cloop</strong>
            <em>Yönetim Paneli</em>
          </div>
        </div>

        <nav aria-label="Yönetim menüsü">
          {ADMIN_NAV_GROUPS.map((group) => (
            <div key={group.title} className="cloop-admin-nav-group">
              <p>{group.title}</p>
              {group.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-current={active === item.id ? "page" : undefined}
                  className={active === item.id ? "is-active" : undefined}
                  onClick={() => onNavigate?.(item.id)}
                >
                  <span>
                    <b>{item.label}</b>
                    <small>{item.hint}</small>
                  </span>
                </button>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <div className="cloop-admin-main">
        <header className="cloop-admin-topbar" ref={menuRef}>
          <form className="cloop-admin-top-search" onSubmit={handleSearch}>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Kullanıcı adı veya e-posta ara"
            />
            <button type="submit">Ara</button>
          </form>

          <div className="cloop-admin-user">
            <button
              type="button"
              className="cloop-admin-icon-btn"
              onClick={() => { setNotifOpen((v) => !v); setMenuOpen(false); }}
              aria-label="Bildirimler"
            >
              🔔
              {pendingReports > 0 && <em>{pendingReports}</em>}
            </button>
            {notifOpen && (
              <div className="cloop-admin-pop">
                <p>Bekleyen şikayet: {pendingReports}</p>
                <button type="button" onClick={() => onNavigate?.("reports")}>Şikayetlere git</button>
              </div>
            )}
            <button type="button" className="cloop-admin-avatar-btn" onClick={() => { setMenuOpen((v) => !v); setNotifOpen(false); }}>
              <span className="cloop-admin-avatar" aria-hidden="true">{initial}</span>
              <span>
                <strong>{displayName}</strong>
                <em>{roleLabel(profile?.role)}</em>
              </span>
            </button>
            {menuOpen && (
              <div className="cloop-admin-pop is-right">
                <button type="button" onClick={() => onNavigate?.("settings")}>Profil ve ayarlar</button>
                <button type="button" className="is-danger" onClick={onLogout}>Çıkış Yap</button>
              </div>
            )}
          </div>
        </header>
        <section className="cloop-admin-content">{children}</section>
      </div>
    </div>
  );
}
