"use client";
import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";

// Etkinliğe ne kadar süre kaldığını hesaplayan yardımcı fonksiyon
function getTimeRemaining(eventDateStr) {
  if (!eventDateStr) return { text: "Tarih Belirtilmedi", color: "text-slate-400 bg-slate-800/60 border-slate-700" };
  const eventTime = new Date(eventDateStr).getTime();
  const now = new Date().getTime();
  const diff = eventTime - now;

  if (diff <= 0) {
    return { text: "Süresi Geçti ⌛", color: "text-rose-400 bg-rose-500/10 border-rose-500/30" };
  }

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return { text: `⏳ ${days} gün kaldı`, color: "text-amber-400 bg-amber-500/10 border-amber-500/30" };
  } else if (hours > 0) {
    return { text: `🔥 ${hours} saat kaldı`, color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" };
  } else {
    return { text: `⚡ Çok yakında başlıyor!`, color: "text-indigo-400 bg-indigo-500/10 border-indigo-500/30 animate-pulse" };
  }
}

export default function MapComponent({ groups = [], onSelectGroup }) {
  const [isMounted, setIsMounted] = useState(false);
  const [activeGroup, setActiveGroup] = useState(null);
  const [memberProfiles, setMemberProfiles] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const handleMarkerClick = async (group) => {
    setActiveGroup(group);
    setLoadingMembers(true);
    setMemberProfiles([]);

    if (group.members && group.members.length > 0) {
      try {
        const profiles = await Promise.all(
          group.members.slice(0, 5).map(async (uid) => {
            const userSnap = await getDoc(doc(db, "users", uid));
            if (userSnap.exists()) {
              return { id: uid, ...userSnap.data() };
            }
            return { id: uid, fullName: "Kullanıcı" };
          })
        );
        setMemberProfiles(profiles);
      } catch (err) {
        console.error("Katılımcı profilleri alınamadı:", err);
      }
    }
    setLoadingMembers(false);
  };

  // Etkinliği Paylaşma Fonksiyonu (Deep Link Destekli)
  const handleShareEvent = async (group) => {
    const shareUrl = `${window.location.origin}/dashboard?groupId=${group.id}`;
    const shareData = {
      title: `TripBFF: ${group.title}`,
      text: `${group.title} etkinliğine davetlisin! TripBFF'te birlikte katılalım: ${group.desc}`,
      url: shareUrl,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        console.log("Paylaşım iptal edildi:", err);
      }
    } else {
      navigator.clipboard.writeText(`${shareData.title}\n${shareData.text}\n${shareUrl}`);
      alert("Etkinlik davet linki panoya kopyalandı!");
    }
  };

  if (!isMounted) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-slate-400">
        Harita hazırlanıyor...
      </div>
    );
  }

  const centerLat = groups[0]?.latitude || 40.9901;
  const centerLng = groups[0]?.longitude || 29.0291;

  const createCustomIcon = (imageUrl) => {
    const fallbackImage = "https://images.unsplash.com/photo-1511632765486-a01980e01a18?w=100&q=80";
    const src = imageUrl || fallbackImage;

    return L.divIcon({
      className: "custom-map-marker",
      html: `
        <div style="
          width: 44px;
          height: 44px;
          border-radius: 50%;
          border: 3px solid #6366f1;
          box-shadow: 0 4px 12px rgba(0,0,0,0.45);
          overflow: hidden;
          background: #0f172a;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        ">
          <img src="${src}" style="width: 100%; height: 100%; object-fit: cover;" />
        </div>
      `,
      iconSize: [44, 44],
      iconAnchor: [22, 22]
    });
  };

  return (
    <div className="w-full h-full relative overflow-hidden">
      <MapContainer
        center={[centerLat, centerLng]}
        zoom={12}
        scrollWheelZoom={true}
        className="w-full h-full z-10"
      >
        <TileLayer
          attribution='&copy; <a href="https://maps.google.com">Google Maps</a>'
          url="http://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
          subdomains={['mt0', 'mt1', 'mt2', 'mt3']}
        />

        {groups.map((g) => {
          if (!g.latitude || !g.longitude || g.chatStatus === "Kapalı" || g.status === "Onay Bekliyor") return null;

          return (
            <Marker 
              key={g.id} 
              position={[g.latitude, g.longitude]} 
              icon={createCustomIcon(g.imageUrl)}
              eventHandlers={{
                click: () => handleMarkerClick(g)
              }}
            />
          );
        })}
      </MapContainer>

      {/* PERFORMANS VE YENİ ÖZELLİK ENTEGRELİ BOTTOM SHEET */}
      {activeGroup && (() => {
        const timeRemaining = getTimeRemaining(activeGroup.eventDate);

        return (
          <div 
            className="absolute inset-0 bg-black/60 z-30 flex flex-col justify-end pb-16 animate-fadeIn"
            onClick={() => setActiveGroup(null)}
          >
            <div 
              className="bg-slate-900 border-t border-slate-800 w-full rounded-t-3xl p-4 shadow-2xl space-y-3 relative transition-all duration-200 ease-out max-h-[80%] overflow-y-auto"
              style={{ willChange: "transform, opacity" }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Çekmece Çubuğu */}
              <div className="w-10 h-1 bg-slate-700 rounded-full mx-auto mb-1 opacity-70" />

              {/* Üst Sağ Aksiyon Butonları (Paylaş & Kapat) */}
              <div className="absolute top-3 right-3 flex items-center space-x-1.5">
                <button 
                  onClick={() => handleShareEvent(activeGroup)}
                  title="Etkinliği Paylaş"
                  className="w-7 h-7 bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/30 rounded-full flex items-center justify-center text-[10px] font-bold transition cursor-pointer"
                >
                  🔗
                </button>
                <button 
                  onClick={() => setActiveGroup(null)}
                  className="w-7 h-7 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-full flex items-center justify-center text-[10px] font-bold transition cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Görsel ve Başlık Bilgisi */}
              <div className="flex space-x-3 items-center">
                <div className="w-14 h-14 rounded-xl overflow-hidden bg-slate-800 shrink-0 border border-slate-700 shadow-md">
                  <img 
                    src={activeGroup.imageUrl || "https://images.unsplash.com/photo-1511632765486-a01980e01a18?w=100&q=80"} 
                    className="w-full h-full object-cover" 
                    alt={activeGroup.title} 
                  />
                </div>
                <div className="space-y-1 overflow-hidden pr-12">
                  <div className="flex items-center space-x-1.5 flex-wrap">
                    <span className="text-[8px] font-bold uppercase tracking-wider bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded border border-indigo-500/30">
                      {activeGroup.category || "Genel"}
                    </span>
                    {/* Canlı Süre Sayacı Rozeti */}
                    <span className={`text-[8px] font-bold px-2 py-0.5 rounded border ${timeRemaining.color}`}>
                      {timeRemaining.text}
                    </span>
                  </div>
                  <h3 className="font-bold text-xs text-slate-100 truncate mt-0.5">{activeGroup.title}</h3>
                  <p className="text-[10px] text-slate-400 truncate">{activeGroup.desc}</p>
                </div>
              </div>

              {/* Tarih ve Katılımcı Detayları */}
              <div className="grid grid-cols-2 gap-2 bg-slate-950/80 p-2.5 rounded-xl border border-slate-800/80 text-[10px]">
                <div>
                  <span className="text-slate-500 block text-[8px] font-medium">📅 Tarih</span>
                  <span className="text-slate-200 font-semibold truncate block">
                    {activeGroup.eventDate ? new Date(activeGroup.eventDate).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) : 'Belirtilmedi'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[8px] font-medium">🚀 Katılım</span>
                  <span className="text-indigo-400 font-bold block">{activeGroup.memberCount || activeGroup.members?.length || 1} Kişi</span>
                </div>
              </div>

              {/* Katılımcı Avatarları */}
              <div className="space-y-1">
                <span className="text-[9px] text-slate-400 font-semibold block">Katılımcılar:</span>
                <div className="flex items-center space-x-1">
                  {loadingMembers ? (
                    <span className="text-[9px] text-slate-500">Yükleniyor...</span>
                  ) : (
                    <div className="flex -space-x-2 overflow-hidden py-0.5">
                      {memberProfiles.map((m, idx) => (
                        <div 
                          key={m.id || idx} 
                          title={m.fullName}
                          className="inline-block h-7 w-7 rounded-full ring-2 ring-slate-900 overflow-hidden bg-indigo-600/40 border border-indigo-400/30 flex items-center justify-center text-[10px] font-bold text-indigo-200 shrink-0"
                        >
                          {m.photoUrl ? (
                            <img src={m.photoUrl} className="w-full h-full object-cover" />
                          ) : (
                            m.fullName?.charAt(0).toUpperCase() || "U"
                          )}
                        </div>
                      ))}
                      {(activeGroup.members?.length || 0) > 5 && (
                        <div className="inline-block h-7 w-7 rounded-full ring-2 ring-slate-900 bg-slate-800 border border-slate-700 flex items-center justify-center text-[8px] font-bold text-slate-300">
                          +{(activeGroup.members?.length || 0) - 5}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Buton Grubu: Yol Tarifi & Sohbete Git */}
              <div className="flex space-x-2 pt-1">
                {activeGroup.latitude && activeGroup.longitude && (
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${activeGroup.latitude},${activeGroup.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs transition border border-slate-700 flex items-center justify-center space-x-1 cursor-pointer"
                  >
                    <span>📍 Yol Tarifi</span>
                  </a>
                )}
                
                <button
                  onClick={() => {
                    const selected = activeGroup;
                    setActiveGroup(null);
                    if (onSelectGroup) onSelectGroup(selected);
                  }}
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs transition shadow-md shadow-indigo-600/30 flex items-center justify-center space-x-1 cursor-pointer"
                >
                  <span>Sohbete Git</span>
                  <span>💬 →</span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}