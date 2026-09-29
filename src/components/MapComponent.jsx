"use client";
import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";

function getTimeRemaining(eventDateStr) {
  if (!eventDateStr) return { text: "Tarih Belirtilmedi", color: "text-muted bg-inset/60 border-line" };
  const eventTime = new Date(eventDateStr).getTime();
  const now = new Date().getTime();
  const diff = eventTime - now;

  if (diff <= 0) {
    return { text: "Tamamlandı 🏁", color: "text-rose-400 bg-rose-500/10 border-rose-500/30" };
  }

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return { text: `⏳ ${days} gün kaldı`, color: "text-amber-400 bg-amber-500/10 border-amber-500/30" };
  } else if (hours > 0) {
    return { text: `🔥 ${hours} saat kaldı`, color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" };
  } else {
    return { text: `⚡ Çok yakında başlıyor!`, color: "text-brand bg-blue-500/10 border-blue-500/30 animate-pulse" };
  }
}

export default function MapComponent({ groups = [], onSelectGroup, externalSelectedGroup }) {
  const [isMounted, setIsMounted] = useState(false);
  const [activeGroup, setActiveGroup] = useState(externalSelectedGroup || null);
  const [memberProfiles, setMemberProfiles] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (externalSelectedGroup) {
      handleMarkerClick(externalSelectedGroup);
    }
  }, [externalSelectedGroup]);

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

  const handleShareEvent = async (group) => {
    const shareUrl = `${window.location.origin}/dashboard?groupId=${group.id}`;
    const shareData = {
      title: `ComBFF: ${group.title}`,
      text: `${group.title} etkinliğine davetlisin! ComBFF'te birlikte katılalım: ${group.desc}`,
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
      <div className="flex items-center justify-center h-full text-sm text-muted">
        Harita hazırlanıyor...
      </div>
    );
  }

  const centerLat = activeGroup?.latitude || groups[0]?.latitude || 40.9901;
  const centerLng = activeGroup?.longitude || groups[0]?.longitude || 29.0291;

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
    <div className="tb-map w-full h-full relative overflow-hidden">
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
          const now = new Date().getTime();
          const eventTime = g.eventDate ? new Date(g.eventDate).getTime() : 0;
          const isExpired = eventTime > 0 && (now - eventTime) >= 24 * 60 * 60 * 1000;

          // Onay bekleyen, sohbeti kapalı olan veya 24 saat süresi dolmuş etkinlikleri haritada gösterme
          if (!g.latitude || !g.longitude || g.status === "Onay Bekliyor" || g.chatStatus === "Kapalı" || isExpired) {
            return null;
          }

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

      {/* BOTTOM SHEET */}
      {activeGroup && (() => {
        const timeRemaining = getTimeRemaining(activeGroup.eventDate);

        return (
          <div 
            className="tb-map-backdrop absolute inset-0 bg-black/60 z-30 flex flex-col justify-end pb-16 animate-fadeIn"
            onClick={() => setActiveGroup(null)}
          >
            <div 
              className="tb-map-sheet bg-panel border-t border-line w-full rounded-t-3xl p-4 shadow-2xl space-y-3 relative transition-all duration-200 ease-out max-h-[80%] overflow-y-auto"
              style={{ willChange: "transform, opacity" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-10 h-1 bg-inset rounded-full mx-auto mb-1 opacity-70" />

              <div className="absolute top-3 right-3 flex items-center space-x-1.5">
                <button 
                  onClick={() => handleShareEvent(activeGroup)}
                  title="Etkinliği Paylaş"
                  className="w-7 h-7 bg-blue-600/20 hover:bg-blue-600 text-brand hover:text-white border border-blue-500/30 rounded-full flex items-center justify-center text-[12px] font-bold transition cursor-pointer"
                >
                  🔗
                </button>
                <button 
                  onClick={() => setActiveGroup(null)}
                  className="w-7 h-7 bg-inset hover:bg-inset text-muted rounded-full flex items-center justify-center text-[12px] font-bold transition cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="flex space-x-3 items-center">
                <div className="w-14 h-14 rounded-xl overflow-hidden bg-inset shrink-0 border border-line shadow-md">
                  <img 
                    src={activeGroup.imageUrl || "https://images.unsplash.com/photo-1511632765486-a01980e01a18?w=100&q=80"} 
                    className="w-full h-full object-cover" 
                    alt={activeGroup.title} 
                  />
                </div>
                <div className="space-y-1 overflow-hidden pr-12">
                  <div className="flex items-center space-x-1.5 flex-wrap">
                    <span className="text-[11px] font-bold uppercase tracking-wider bg-blue-500/20 text-brand px-2 py-0.5 rounded border border-blue-500/30">
                      {activeGroup.category || "Genel"}
                    </span>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded border ${timeRemaining.color}`}>
                      {timeRemaining.text}
                    </span>
                  </div>
                  <h3 className="font-bold text-sm text-ink truncate mt-0.5">{activeGroup.title}</h3>
                  <p className="text-[12px] text-muted truncate">{activeGroup.desc}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 bg-canvas/80 p-2.5 rounded-xl border border-line/80 text-[12px]">
                <div>
                  <span className="text-muted block text-[11px] font-medium">📅 Tarih</span>
                  <span className="text-ink font-semibold truncate block">
                    {activeGroup.eventDate ? new Date(activeGroup.eventDate).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) : 'Belirtilmedi'}
                  </span>
                </div>
                <div>
                  <span className="text-muted block text-[11px] font-medium">🚀 Katılım</span>
                  <span className="text-brand font-bold block">{activeGroup.memberCount || activeGroup.members?.length || 1} Kişi</span>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-[11px] text-muted font-semibold block">Katılımcılar:</span>
                <div className="flex items-center space-x-1">
                  {loadingMembers ? (
                    <span className="text-[11px] text-muted">Yükleniyor...</span>
                  ) : (
                    <div className="flex -space-x-2 overflow-hidden py-0.5">
                      {memberProfiles.map((m, idx) => (
                        <div 
                          key={m.id || idx} 
                          title={m.fullName}
                          className="inline-block h-7 w-7 rounded-full ring-2 ring-line overflow-hidden bg-blue-600/40 border border-blue-400/30 flex items-center justify-center text-[12px] font-bold text-brand shrink-0"
                        >
                          {m.photoUrl ? (
                            <img src={m.photoUrl} className="w-full h-full object-cover" />
                          ) : (
                            m.fullName?.charAt(0).toUpperCase() || "U"
                          )}
                        </div>
                      ))}
                      {(activeGroup.members?.length || 0) > 5 && (
                        <div className="inline-block h-7 w-7 rounded-full ring-2 ring-line bg-inset border border-line flex items-center justify-center text-[11px] font-bold text-muted">
                          +{(activeGroup.members?.length || 0) - 5}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex space-x-2 pt-1">
                {activeGroup.latitude && activeGroup.longitude && (
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${activeGroup.latitude},${activeGroup.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 py-2.5 bg-inset hover:bg-inset text-ink font-bold rounded-xl text-sm transition border border-line flex items-center justify-center space-x-1 cursor-pointer"
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
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-sm transition shadow-md shadow-blue-600/30 flex items-center justify-center space-x-1 cursor-pointer"
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