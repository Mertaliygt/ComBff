"use client";
import { useState, useEffect, Suspense } from "react";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, updateDoc, collection, onSnapshot, deleteDoc, arrayUnion, query, orderBy } from "firebase/firestore";
import { signOut, onAuthStateChanged } from "firebase/auth";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import CreateGroupModal from "@/components/CreateGroupModal";
import ChatModal from "@/components/ChatModal";
import WelcomeModal from "@/components/WelcomeModal";
import { resizeAndConvertImage } from "@/utils/imageHelper";
import { 
  acceptFollowRequest, 
  rejectFollowRequest, 
  sendFollowRequest, 
  deleteNotification, 
  clearAllNotifications,
  getFollowersList,
  getFollowingList
} from "@/lib/followService";

const MapComponent = dynamic(() => import("@/components/MapComponent"), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-full text-xs text-slate-400">Harita yükleniyor...</div>
});

function calculateDistance(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 9999;
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export function getUserTitle(messageCount = 0) {
  if (messageCount >= 200) return { level: 4, title: "Efsane Gezgin 👑" };
  if (messageCount >= 100) return { level: 3, title: "Kıdemli Üye 🚀" };
  if (messageCount >= 30) return { level: 2, title: "Aktif Katılımcı ✨" };
  return { level: 1, title: "Normal Kullanıcı 🌱" };
}

function formatEventDate(dateString) {
  if (!dateString) return { month: "EYL", day: "01", time: "00:00" };
  const d = new Date(dateString);
  const months = ["OCA", "ŞUB", "MAR", "NİS", "MAY", "HAZ", "TEM", "AĞU", "EYL", "EKİ", "KAS", "ARA"];
  return {
    month: months[d.getMonth()] || "EYL",
    day: d.getDate().toString().padStart(2, "0"),
    time: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    dateObj: d
  };
}

function DashboardPageContent() {
  const [userData, setUserData] = useState(null);
  // İLK AÇILIŞ TAB'I "map" OLARAK AYARLANDI
  const [activeTab, setActiveTab] = useState("map");
  const [adminSubTab, setAdminSubTab] = useState("user_approvals");
  const [groups, setGroups] = useState([]);
  const [reports, setReports] = useState([]);
  const [pendingUsers, setPendingUsers] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [isNotifOpen, setIsNotifOpen] = useState(false);

  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [followModalType, setFollowModalType] = useState(null);
  const [followUserList, setFollowUserList] = useState([]);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [mapFocusedGroup, setMapFocusedGroup] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [sortByNearby, setSortByNearby] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);

  const [bio, setBio] = useState("");
  const [instagram, setInstagram] = useState("");
  const [showInsta, setShowInsta] = useState(true);
  const [photoFile, setPhotoFile] = useState(null);
  const [updatingProfile, setUpdatingProfile] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();
  const targetGroupId = searchParams.get("groupId");

  useEffect(() => {
    const isSeen = localStorage.getItem("tripbff_welcome_seen");
    if (!isSeen) {
      setShowWelcomeModal(true);
    }
  }, []);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/login");
        return;
      }
      try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          if (data.banned || data.approved === false) {
            await signOut(auth);
            router.push("/login");
            return;
          }
          setUserData(data);
          setBio(data.bio || "");
          setInstagram(data.instagram || "");
          setShowInsta(data.showInsta ?? true);
        }
      } catch (err) {
        console.error("Kullanıcı çekilemedi:", err);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, [router]);

  useEffect(() => {
    if (!auth.currentUser) return;

    const notifRef = collection(db, "users", auth.currentUser.uid, "notifications");
    const qNotifs = query(notifRef, orderBy("createdAt", "desc"));
    const unsubscribeNotifs = onSnapshot(qNotifs, (snapshot) => {
      const list = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });
      setNotifications(list);
    });

    const followersRef = collection(db, "users", auth.currentUser.uid, "followers");
    const unsubscribeFollowers = onSnapshot(followersRef, (snapshot) => {
      setFollowersCount(snapshot.size);
    });

    const followingRef = collection(db, "users", auth.currentUser.uid, "following");
    const unsubscribeFollowing = onSnapshot(followingRef, (snapshot) => {
      setFollowingCount(snapshot.size);
    });

    return () => {
      unsubscribeNotifs();
      unsubscribeFollowers();
      unsubscribeFollowing();
    };
  }, [auth.currentUser]);

  useEffect(() => {
    const unsubscribeGroups = onSnapshot(collection(db, "groups"), (snapshot) => {
      const list = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const eventTime = new Date(data.eventDate).getTime();
        const now = new Date().getTime();
        const diffHours = (now - eventTime) / (1000 * 60 * 60);

        const hoursToEvent = (eventTime - now) / (1000 * 60 * 60);
        if (hoursToEvent <= 24 && hoursToEvent > 0 && data.status === "Onay Bekliyor") {
          updateDoc(doc(db, "groups", docSnap.id), { status: "Aktif" });
        }

        if (diffHours >= 24 && data.chatStatus !== "Kapalı") {
          updateDoc(doc(db, "groups", docSnap.id), { chatStatus: "Kapalı" });
        }

        list.push({ id: docSnap.id, ...data });
      });
      setGroups(list);
    });

    const unsubscribeReports = onSnapshot(collection(db, "reports"), (snapshot) => {
      const list = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });
      setReports(list);
    });

    const unsubscribeUsers = onSnapshot(collection(db, "users"), (snapshot) => {
      const list = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.approved === false && !data.banned) {
          list.push({ id: docSnap.id, ...data });
        }
      });
      setPendingUsers(list);
    });

    return () => {
      unsubscribeGroups();
      unsubscribeReports();
      unsubscribeUsers();
    };
  }, []);

  useEffect(() => {
    if (targetGroupId && groups.length > 0) {
      const foundGroup = groups.find((g) => g.id === targetGroupId);
      if (foundGroup) {
        setSelectedGroup(foundGroup);
      }
    }
  }, [targetGroupId, groups]);

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setUpdatingProfile(true);
    try {
      let photoUrl = userData.photoUrl || "";
      if (photoFile) {
        photoUrl = await resizeAndConvertImage(photoFile, 300, 300, 0.7);
      }
      const userRef = doc(db, "users", auth.currentUser.uid);
      await updateDoc(userRef, { bio, instagram, showInsta, photoUrl });
      setUserData(prev => ({ ...prev, bio, instagram, showInsta, photoUrl }));
      alert("Profil başarıyla güncellendi!");
    } catch (err) {
      alert("Hata: " + err.message);
    } finally {
      setUpdatingProfile(false);
    }
  };

  const handleApproveUser = async (userId) => {
    try {
      await updateDoc(doc(db, "users", userId), { approved: true });
      alert("Kullanıcı onaylandı!");
    } catch (err) {
      alert("Hata: " + err.message);
    }
  };

  const handleRejectUser = async (userId) => {
    if (!confirm("Kullanıcıyı reddetmek istiyor musunuz?")) return;
    try {
      await deleteDoc(doc(db, "users", userId));
      alert("Kullanıcı reddedildi.");
    } catch (err) {
      alert("Hata: " + err.message);
    }
  };

  if (loading || !userData) {
    return <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center text-xs">Yükleniyor...</div>;
  }

  const userRole = userData.role ? userData.role.trim().toLowerCase() : "";
  const isAdmin = userRole === "admin" || userRole === "mod";
  const pendingUsersCount = pendingUsers.length;
  const pendingGroupsCount = groups.filter(g => g.status === "Onay Bekliyor").length;
  const pendingReportsCount = reports.filter(r => r.status === "Bekliyor").length;
  const totalAdminBadgeCount = pendingUsersCount + pendingGroupsCount + pendingReportsCount;

  const unreadNotifCount = notifications.filter(n => !n.isRead).length;

  let activeGroups = groups.filter(g => g.status !== "Onay Bekliyor" && g.chatStatus !== "Kapalı");
  if (sortByNearby && userLocation) {
    activeGroups = activeGroups.map(g => ({
      ...g,
      distance: calculateDistance(userLocation.latitude, userLocation.longitude, g.latitude, g.longitude)
    })).sort((a, b) => a.distance - b.distance);
  }

  const completedGroups = groups.filter(g => g.chatStatus === "Kapalı" || (new Date().getTime() - new Date(g.eventDate).getTime()) >= 24 * 60 * 60 * 1000);

  const myJoinedGroups = groups.filter(g => g.members?.includes(auth.currentUser.uid));
  const nowTime = new Date().getTime();
  const calendarEvents = groups.filter(g => {
    if (!g.eventDate || g.chatStatus === "Kapalı") return false;
    const eventTime = new Date(g.eventDate).getTime();
    const diffHours = (eventTime - nowTime) / (1000 * 60 * 60);
    return diffHours > 0 && diffHours <= 168;
  });

  const userTitleInfo = getUserTitle(userData.messageCount || 0);
  const firstName = userData.fullName ? userData.fullName.split(" ")[0] : "Gezgin";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center overflow-hidden select-none">
      <div className="w-full max-w-md h-screen sm:h-[90vh] sm:max-h-[850px] bg-slate-950 sm:border sm:border-slate-800 sm:rounded-3xl flex flex-col overflow-hidden shadow-2xl relative">
        
        {/* HEADER */}
        <header className="h-16 bg-slate-900/80 backdrop-blur-md border-b border-slate-800 px-4 flex justify-between items-center shrink-0 z-25 relative">
          <div className="flex flex-col cursor-pointer" onClick={() => setActiveTab("map")}>
            <h2 className="font-black text-indigo-400 text-sm tracking-wider">TRIPBFF</h2>
            <span className="text-[10px] text-slate-300 font-semibold flex items-center gap-1">
              <span>Hoş geldin,</span>
              <span className="text-indigo-300 font-bold">{firstName}</span>
              <span>👋</span>
            </span>
          </div>
          
          <div className="flex items-center space-x-2">
            <button 
              type="button"
              onClick={() => setIsNotifOpen(!isNotifOpen)}
              className="relative p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 transition flex items-center justify-center cursor-pointer"
              title="Bildirimler"
            >
              <span className="text-base">🔔</span>
              {unreadNotifCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-indigo-500 text-white text-[9px] w-4 h-4 rounded-full flex items-center justify-center font-bold animate-pulse">
                  {unreadNotifCount}
                </span>
              )}
            </button>

            {isAdmin && (
              <button 
                onClick={() => setActiveTab("admin")}
                className={`relative px-2.5 py-1 text-[10px] font-semibold rounded-lg border transition flex items-center space-x-1 ${
                  activeTab === 'admin' ? 'bg-amber-500/20 text-amber-400 border-amber-500/40' : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                }`}
              >
                <span>🛡️ Yönetim</span>
                {totalAdminBadgeCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[9px] w-4 h-4 rounded-full flex items-center justify-center font-bold">
                    {totalAdminBadgeCount}
                  </span>
                )}
              </button>
            )}
            <button 
              onClick={() => signOut(auth).then(() => router.push("/login"))}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-semibold rounded-lg border border-slate-700 transition"
            >
              Çıkış
            </button>
          </div>

          {/* BİLDİRİM DROPDOWN */}
          {isNotifOpen && (
            <div className="absolute right-4 top-16 w-80 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-3 z-50 space-y-2 max-h-80 overflow-y-auto backdrop-blur-md">
              <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                <h4 className="font-bold text-xs text-indigo-300 flex items-center gap-1.5">
                  <span>🔔</span> Bildirimler
                </h4>
                <div className="flex items-center space-x-2">
                  {notifications.length > 0 && (
                    <button 
                      onClick={async () => {
                        if (confirm("Tüm bildirimleri silmek istediğinize emin misiniz?")) {
                          await clearAllNotifications(auth.currentUser.uid);
                        }
                      }}
                      className="text-[9px] text-rose-400 hover:text-rose-300 font-semibold bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20 transition"
                    >
                      Tümünü Temizle 🗑️
                    </button>
                  )}
                  <button onClick={() => setIsNotifOpen(false)} className="text-[10px] text-slate-400 hover:text-white px-1">✕</button>
                </div>
              </div>

              {notifications.length === 0 ? (
                <p className="text-center text-[10px] text-slate-500 py-4">Henüz bir bildiriminiz yok.</p>
              ) : (
                notifications.map((n) => (
                  <div key={n.id} className={`p-2.5 rounded-xl border text-[11px] space-y-1 relative group ${n.isRead ? 'bg-slate-950/40 border-slate-800/60 opacity-70' : 'bg-indigo-950/40 border-indigo-500/30'}`}>
                    <div className="flex justify-between items-start pr-4">
                      <span className="font-bold text-indigo-300 text-[10px]">{n.title}</span>
                      <span className="text-[8px] text-slate-500">
                        {n.createdAt ? new Date(n.createdAt.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                      </span>
                    </div>
                    <p className="text-slate-300 text-[10px] leading-relaxed pr-3">{n.message}</p>
                    <button 
                      onClick={async () => { await deleteNotification(auth.currentUser.uid, n.id); }}
                      className="absolute top-2 right-2 text-slate-500 hover:text-rose-400 text-xs p-0.5 transition"
                    >
                      ✕
                    </button>

                    {n.type === "follow_request" && !n.isRead && (
                      <div className="flex space-x-1.5 pt-1">
                        <button
                          onClick={async () => {
                            await acceptFollowRequest(auth.currentUser.uid, n.id, n.senderUid, n.senderName);
                            alert(`${n.senderName} kabul edildi.`);
                          }}
                          className="flex-1 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-[9px] font-bold rounded-lg transition"
                        >
                          Kabul Et ✓
                        </button>
                        <button
                          onClick={async () => { await rejectFollowRequest(auth.currentUser.uid, n.id); }}
                          className="flex-1 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[9px] font-semibold rounded-lg border border-slate-700 transition"
                        >
                          Reddet
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </header>

        {/* Main Content */}
        <main className="flex-grow relative overflow-y-auto flex flex-col pb-16">
          
          {/* SEKME: HARİTA (VARSAYILAN OLARAK İLK AÇILAN SEKME) */}
          {activeTab === "map" && (
            <div className="h-full w-full absolute inset-0 z-10">
              <MapComponent 
                groups={groups} 
                onSelectGroup={(g) => setSelectedGroup(g)}
                externalSelectedGroup={mapFocusedGroup}
              />
            </div>
          )}

          {/* SEKME: AKTİF GRUPLAR */}
          {activeTab === "groups" && (
            <div className="p-4 space-y-3.5 transition-all duration-300 ease-out">
              
              {/* CANLI BAŞLIK BANNER'I */}
              <div className="bg-gradient-to-r from-indigo-900/40 via-slate-900 to-indigo-950/40 border border-indigo-500/30 p-4 rounded-2xl flex flex-col space-y-3 shadow-xl backdrop-blur-md relative overflow-hidden">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="font-extrabold text-xs text-slate-100 flex items-center gap-1.5">
                      <span>🔥 Etkinlik Grupları</span>
                    </h3>
                    <p className="text-[10px] text-slate-400 mt-0.5">Çevrendeki maceralara katıl veya yeni bir etkinlik başlat!</p>
                  </div>
                  <button
                    onClick={() => setIsCreateModalOpen(true)}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-3 py-2 rounded-xl text-[10px] transition shadow-lg shadow-indigo-600/40 flex items-center space-x-1 cursor-pointer hover:scale-105 transform duration-150"
                  >
                    <span>+ Etkinlik Oluştur</span>
                  </button>
                </div>

                <div className="flex space-x-2 pt-1 border-t border-slate-800/80">
                  <button
                    onClick={() => {
                      if (!navigator.geolocation) return alert("Konum desteklenmiyor.");
                      navigator.geolocation.getCurrentPosition(
                        (pos) => { setUserLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }); setSortByNearby(true); },
                        (err) => alert("Konum alınamadı: " + err.message)
                      );
                    }}
                    className={`flex-1 py-1.5 px-3 rounded-xl text-[10px] font-semibold transition border ${
                      sortByNearby ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border-slate-700'
                    }`}
                  >
                    📍 Yakınımdaki Etkinlikler
                  </button>
                  {sortByNearby && (
                    <button onClick={() => setSortByNearby(false)} className="px-3 py-1.5 bg-slate-800 text-slate-400 rounded-xl text-[10px] border border-slate-700">Sıfırla</button>
                  )}
                </div>
              </div>

              {/* ETKİNLİK KARTLARI */}
              <div className="flex flex-col space-y-3">
                {activeGroups.length === 0 ? (
                  <div className="text-center py-10 space-y-2">
                    <span className="text-2xl block">🎉</span>
                    <p className="text-xs text-slate-400 font-medium">Şu an aktif etkinlik bulunmuyor.</p>
                    <p className="text-[10px] text-slate-500">İlk etkinliği sen oluşturmaya ne dersin?</p>
                  </div>
                ) : (
                  activeGroups.map((g) => (
                    <div 
                      key={g.id} 
                      onClick={() => setSelectedGroup(g)}
                      className="bg-slate-900/80 border border-slate-800 hover:border-indigo-500/60 rounded-2xl p-3.5 space-y-2.5 cursor-pointer transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] shadow-md hover:shadow-indigo-500/10 group"
                    >
                      {g.imageUrl && (
                        <div className="w-full h-32 overflow-hidden rounded-xl mb-1 relative border border-slate-800">
                          <img src={g.imageUrl} className="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
                          <span className="absolute top-2 right-2 text-[9px] font-bold bg-slate-950/80 backdrop-blur-md text-indigo-300 px-2.5 py-1 rounded-lg border border-indigo-500/30">
                            {g.category || "Genel"}
                          </span>
                        </div>
                      )}
                      
                      <div className="flex justify-between items-start">
                        <h4 className="font-bold text-slate-100 group-hover:text-indigo-400 text-xs transition">{g.title}</h4>
                        <div className="flex items-center space-x-1 shrink-0 ml-2">
                          {g.distance !== undefined && (
                            <span className="text-[9px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-md border border-indigo-500/30">~{g.distance.toFixed(1)} km</span>
                          )}
                          <span className="text-[9px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-md border border-emerald-500/30 font-semibold">Aktif</span>
                        </div>
                      </div>

                      <p className="text-[11px] text-slate-300 line-clamp-2 leading-relaxed">{g.desc}</p>

                      <div className="flex justify-between items-center text-[10px] text-slate-400 pt-2 border-t border-slate-800/80">
                        <span className="flex items-center space-x-1 font-medium">
                          <span>👤</span>
                          <span className="text-slate-200 font-bold">{g.memberCount || 1} Katılımcı</span>
                        </span>
                        <span className="text-indigo-400 font-bold group-hover:translate-x-1 transition duration-150 flex items-center gap-1">
                          Sohbete Git →
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* SEKME: TAMAMLANAN ETKİNLİKLER */}
          {activeTab === "completed" && (
            <div className="p-4 space-y-3">
              <div className="mb-2">
                <h3 className="font-bold text-sm text-slate-100">Tamamlanan Etkinlikler 🏁</h3>
                <p className="text-[10px] text-slate-400">Süresi dolmuş veya sonlanmış geçmiş etkinlikler</p>
              </div>

              {completedGroups.length === 0 ? (
                <p className="text-center text-xs text-slate-500 mt-8">Henüz tamamlanan bir etkinlik bulunmuyor.</p>
              ) : (
                completedGroups.map(g => (
                  <div 
                    key={g.id} 
                    onClick={() => setSelectedGroup(g)}
                    className="bg-slate-900/60 border border-slate-800 rounded-xl p-3.5 space-y-2 opacity-75 hover:opacity-100 cursor-pointer transition"
                  >
                    <div className="flex justify-between items-start">
                      <h4 className="font-bold text-slate-300 text-xs line-through">{g.title}</h4>
                      <span className="text-[9px] bg-rose-500/20 text-rose-400 px-2 py-0.5 rounded-full border border-rose-500/30 font-semibold">🏁 Tamamlandı</span>
                    </div>
                    <p className="text-[10px] text-slate-400 line-clamp-2">{g.desc}</p>
                    <div className="flex justify-between items-center text-[9px] text-slate-500 pt-1 border-t border-slate-800">
                      <span>👤 {g.memberCount || 1} Katılımcı</span>
                      <span>📅 {g.eventDate ? new Date(g.eventDate).toLocaleDateString('tr-TR') : 'Tarih Yok'}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* SEKME: TAKVİM */}
          {activeTab === "calendar" && (
            <div className="p-4 space-y-3">
              <div className="mb-2">
                <h3 className="font-bold text-sm text-slate-100">Etkinlik Takvimi (Ön Reklam)</h3>
                <p className="text-[10px] text-slate-400">Son 1 hafta kalan etkinlikler ve ön onay sistemi</p>
              </div>

              {calendarEvents.length === 0 ? (
                <p className="text-center text-xs text-slate-500 mt-8">Şu an takvimde 1 haftadan az kalan etkinlik bulunmuyor.</p>
              ) : (
                calendarEvents.map(g => {
                  const dateInfo = formatEventDate(g.eventDate);
                  const isAlreadyRequested = g.preApprovals?.includes(auth.currentUser.uid);
                  
                  return (
                    <div key={g.id} className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 flex flex-col space-y-3 shadow-lg relative overflow-hidden">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="w-14 h-14 bg-indigo-600/30 border border-indigo-500/40 rounded-xl flex flex-col items-center justify-center shrink-0">
                            <span className="text-[9px] font-bold text-indigo-300 uppercase">{dateInfo.month}</span>
                            <span className="text-base font-black text-white">{dateInfo.day}</span>
                          </div>
                          <div>
                            <h4 className="font-bold text-xs text-slate-100">{g.title}</h4>
                            <p className="text-[10px] text-indigo-400 font-medium">{g.category}</p>
                            <p className="text-[10px] text-slate-300 line-clamp-1">{g.desc}</p>
                          </div>
                        </div>
                        <span className="text-[9px] bg-amber-500/20 text-amber-400 px-2.5 py-1 rounded-full border border-amber-500/30 font-semibold">⏳ Sayaç Aktif</span>
                      </div>

                      <div className="flex justify-between items-center pt-2 border-t border-slate-800 text-[10px]">
                        <span className="text-slate-400">📅 Saat: {dateInfo.time}</span>
                        <button 
                          onClick={async () => {
                            await updateDoc(doc(db, "groups", g.id), { preApprovals: arrayUnion(auth.currentUser.uid) });
                            alert("Ön onay isteği yollandı!");
                          }}
                          disabled={isAlreadyRequested}
                          className={`px-4 py-1.5 rounded-xl font-bold transition shadow-md ${
                            isAlreadyRequested ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 cursor-default' : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/30'
                          }`}
                        >
                          {isAlreadyRequested ? "Ön Onay Gönderildi ✓" : "Ön Onay İsteği Yolla"}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* SEKME: YÖNETİCİ PANELİ */}
          {activeTab === "admin" && isAdmin && (
            <div className="p-4 space-y-4">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-4">
                <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                  <h3 className="font-bold text-xs text-amber-400">Moderatör Yönetim Paneli</h3>
                  <button onClick={() => setActiveTab("map")} className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] px-3 py-1 rounded-lg font-semibold transition">Kapat</button>
                </div>

                <div className="grid grid-cols-2 gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
                  <button 
                    onClick={() => setAdminSubTab("user_approvals")}
                    className={`py-1.5 rounded-lg text-[10px] font-semibold transition ${adminSubTab === 'user_approvals' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
                  >
                    Üye Onayları ({pendingUsersCount})
                  </button>
                  <button 
                    onClick={() => setAdminSubTab("groups_approval")}
                    className={`py-1.5 rounded-lg text-[10px] font-semibold transition ${adminSubTab === 'groups_approval' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
                  >
                    Grup Onayları
                  </button>
                </div>

                {adminSubTab === "user_approvals" && (
                  <div className="space-y-2.5 max-h-[400px] overflow-y-auto pr-1">
                    <h4 className="font-bold text-[11px] text-indigo-300">Onay Bekleyen Üyeler ({pendingUsersCount})</h4>
                    {pendingUsers.length === 0 ? (
                      <p className="text-[10px] text-slate-500">Onay bekleyen üye yok.</p>
                    ) : (
                      pendingUsers.map(u => (
                        <div key={u.id} className="bg-slate-800/60 border border-slate-700 rounded-xl p-3 space-y-2 shadow-md">
                          <div>
                            <h5 className="font-bold text-xs text-slate-100">{u.fullName} ({u.age})</h5>
                            <p className="text-[10px] text-slate-400">{u.email}</p>
                          </div>
                          <div className="flex space-x-2 pt-1">
                            <button onClick={() => handleApproveUser(u.id)} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-1.5 rounded-lg text-[10px] font-semibold">Onayla ✓</button>
                            <button onClick={() => handleRejectUser(u.id)} className="flex-1 bg-rose-600 hover:bg-rose-500 text-white py-1.5 rounded-lg text-[10px] font-semibold">Reddet ✕</button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SEKME: PROFİL */}
          {activeTab === "profile" && (
            <div className="p-3.5 space-y-3">
              {/* KULLANICI BİLGİ KARTI */}
              <div className="bg-slate-900/80 border border-slate-800 p-3.5 rounded-2xl flex flex-col items-center text-center shadow-lg space-y-2">
                <div className="w-16 h-16 rounded-full bg-indigo-600/30 border-2 border-indigo-500/50 flex items-center justify-center text-indigo-300 font-bold text-lg overflow-hidden shrink-0">
                  {userData.photoUrl ? (
                    <img src={userData.photoUrl} alt="Profil" className="w-full h-full object-cover" />
                  ) : (
                    userData.fullName?.charAt(0).toUpperCase() || "U"
                  )}
                </div>
                <div>
                  <h3 className="font-bold text-xs text-slate-100">{userData.fullName} ({userData.age})</h3>
                  <p className="text-[9px] text-indigo-400 font-semibold mt-0.5">{userTitleInfo.title}</p>
                  <p className="text-[10px] text-slate-400">{userData.email}</p>
                </div>
                {userData.bio && <p className="text-[10px] text-slate-300 italic px-2">{userData.bio}</p>}

                <div className="flex space-x-2 w-full pt-1.5 border-t border-slate-800/80">
                  <button
                    onClick={async () => {
                      const list = await getFollowersList(auth.currentUser.uid);
                      setFollowUserList(list);
                      setFollowModalType("followers");
                    }}
                    className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700/80 rounded-xl border border-slate-700/80 text-center transition cursor-pointer"
                  >
                    <span className="block text-xs font-bold text-indigo-400">{followersCount}</span>
                    <span className="text-[9px] text-slate-400">Takipçi</span>
                  </button>

                  <button
                    onClick={async () => {
                      const list = await getFollowingList(auth.currentUser.uid);
                      setFollowUserList(list);
                      setFollowModalType("following");
                    }}
                    className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700/80 rounded-xl border border-slate-700/80 text-center transition cursor-pointer"
                  >
                    <span className="block text-xs font-bold text-indigo-400">{followingCount}</span>
                    <span className="text-[9px] text-slate-400">Takip Edilen</span>
                  </button>
                </div>
              </div>

              {/* PROFİLİ DÜZENLE FORMU */}
              <form onSubmit={handleUpdateProfile} className="bg-slate-900/60 border border-slate-800 p-3 rounded-2xl space-y-2.5 shadow-md">
                <h4 className="font-bold text-xs text-indigo-400">Profili Düzenle</h4>
                <div className="flex flex-col space-y-1">
                  <label className="text-[9px] text-slate-400">Profil Fotoğrafı Değiştir</label>
                  <input type="file" accept="image/*" onChange={(e) => setPhotoFile(e.target.files[0])} className="text-[9px] text-slate-400 file:mr-2 file:py-1 file:px-2 file:rounded-lg file:border-0 file:text-[9px] file:bg-indigo-600 file:text-white cursor-pointer" />
                </div>
                <div className="flex flex-col space-y-1">
                  <label className="text-[9px] text-slate-400">Biyografi</label>
                  <textarea rows="2" value={bio} onChange={(e) => setBio(e.target.value)} className="bg-slate-800 border border-slate-700/80 rounded-xl px-2.5 py-1.5 text-[11px] text-slate-200 focus:outline-none focus:border-indigo-500 resize-none" />
                </div>
                <div className="flex flex-col space-y-1">
                  <label className="text-[9px] text-slate-400">Instagram Kullanıcı Adı</label>
                  <input type="text" value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="örn: kullanıcı_adı" className="bg-slate-800 border border-slate-700/80 rounded-xl px-2.5 py-1.5 text-[11px] text-slate-200 focus:outline-none focus:border-indigo-500" />
                </div>
                <div className="flex items-center justify-between pt-0.5">
                  <span className="text-[9px] text-slate-300">Instagram adresim görünsün</span>
                  <input type="checkbox" checked={showInsta} onChange={(e) => setShowInsta(e.target.checked)} className="w-3.5 h-3.5 accent-indigo-600 rounded cursor-pointer" />
                </div>
                <button type="submit" disabled={updatingProfile} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-1.5 rounded-xl text-xs transition shadow-md shadow-indigo-600/30">
                  {updatingProfile ? "Kaydediliyor..." : "Değişiklikleri Kaydet"}
                </button>
              </form>

              {/* KATILDIĞIM GRUPLAR / AKTİF ETKİNLİKLERİM */}
              <div className="space-y-2 pt-1">
                <h4 className="font-bold text-xs text-indigo-300">Katıldığım Gruplar ({myJoinedGroups.length})</h4>
                {myJoinedGroups.length === 0 ? (
                  <p className="text-[10px] text-slate-500 italic">Henüz katıldığın bir etkinlik grubu yok.</p>
                ) : (
                  myJoinedGroups.map(g => (
                    <div 
                      key={g.id}
                      onClick={() => setSelectedGroup(g)}
                      className="bg-slate-900/70 border border-slate-800 hover:border-indigo-500/50 rounded-xl p-2 flex items-center justify-between cursor-pointer transition shadow-sm"
                    >
                      <div className="flex items-center space-x-2.5">
                        <div className="w-8 h-8 rounded-lg overflow-hidden bg-slate-800 shrink-0 border border-slate-700 flex items-center justify-center">
                          {g.imageUrl ? (
                            <img src={g.imageUrl} className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-[10px] font-bold text-indigo-300">
                              {g.title.charAt(0).toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div>
                          <h5 className="font-bold text-[11px] text-slate-100 line-clamp-1">{g.title}</h5>
                          <p className="text-[8px] text-slate-400">{g.category} • 👤 {g.memberCount || 1}</p>
                        </div>
                      </div>
                      <span className="text-[9px] text-indigo-400 font-bold shrink-0 ml-2">Sohbet →</span>
                    </div>
                  ))
                )}
              </div>

            </div>
          )}

        </main>

        {/* 5 ELEMANLI BOTTOM NAV BAR */}
        <nav className="h-16 bg-slate-900/90 backdrop-blur-md border-t border-slate-800 grid grid-cols-5 items-center shrink-0 z-20 absolute bottom-0 left-0 right-0">
          <button onClick={() => setActiveTab("groups")} className={`flex flex-col items-center justify-center py-1 transition ${activeTab === 'groups' ? 'text-indigo-400 font-bold' : 'text-slate-400'}`}>
            <span className="text-base">💬</span>
            <span className="text-[8px] mt-0.5 font-medium">Gruplar</span>
          </button>
          <button onClick={() => setActiveTab("map")} className={`flex flex-col items-center justify-center py-1 transition ${activeTab === 'map' ? 'text-indigo-400 font-bold' : 'text-slate-400'}`}>
            <span className="text-base">🗺️</span>
            <span className="text-[8px] mt-0.5 font-medium">Harita</span>
          </button>
          <button onClick={() => setActiveTab("completed")} className={`flex flex-col items-center justify-center py-1 transition ${activeTab === 'completed' ? 'text-indigo-400 font-bold' : 'text-slate-400'}`}>
            <span className="text-base">🏁</span>
            <span className="text-[8px] mt-0.5 font-medium">Bitenler</span>
          </button>
          <button onClick={() => setActiveTab("calendar")} className={`flex flex-col items-center justify-center py-1 transition ${activeTab === 'calendar' ? 'text-indigo-400 font-bold' : 'text-slate-400'}`}>
            <span className="text-base">📅</span>
            <span className="text-[8px] mt-0.5 font-medium">Takvim</span>
          </button>
          <button onClick={() => setActiveTab("profile")} className={`flex flex-col items-center justify-center py-1 transition ${activeTab === 'profile' ? 'text-indigo-400 font-bold' : 'text-slate-400'}`}>
            <span className="text-base">⚙️</span>
            <span className="text-[8px] mt-0.5 font-medium">Profil</span>
          </button>
        </nav>

        {/* MODALLAR */}
        {showWelcomeModal && (
          <WelcomeModal 
            userName={userData?.fullName} 
            onClose={() => setShowWelcomeModal(false)} 
          />
        )}

        {followModalType && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 w-full max-w-xs rounded-2xl p-4 flex flex-col space-y-3 shadow-2xl max-h-96 overflow-y-auto">
              <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                <h4 className="font-bold text-xs text-indigo-300">
                  {followModalType === "followers" ? "Takipçilerim" : "Takip Ettiklerim"} ({followUserList.length})
                </h4>
                <button onClick={() => setFollowModalType(null)} className="text-slate-400 hover:text-white text-xs px-1 cursor-pointer">✕</button>
              </div>

              {followUserList.length === 0 ? (
                <p className="text-center text-[10px] text-slate-500 py-4">Kullanıcı bulunamadı.</p>
              ) : (
                followUserList.map((u) => (
                  <div key={u.id} className="flex items-center space-x-2.5 p-2 rounded-xl bg-slate-800/50 border border-slate-700/50">
                    <div className="w-8 h-8 rounded-full bg-indigo-600/30 overflow-hidden shrink-0 border border-indigo-500/30 flex items-center justify-center text-xs font-bold text-indigo-300">
                      {u.photoUrl ? <img src={u.photoUrl} className="w-full h-full object-cover" /> : u.fullName?.charAt(0)}
                    </div>
                    <div>
                      <h5 className="font-bold text-xs text-slate-100">{u.fullName}</h5>
                      <p className="text-[9px] text-indigo-400">{getUserTitle(u.messageCount || 0).title}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {isCreateModalOpen && <CreateGroupModal onClose={() => setIsCreateModalOpen(false)} />}
        {selectedGroup && (
          <ChatModal 
            group={selectedGroup} 
            onClose={() => setSelectedGroup(null)} 
            onSwitchGroup={(newGroup) => setSelectedGroup(newGroup)}
            onShowOnMap={(groupToMap) => {
              setSelectedGroup(null);
              setMapFocusedGroup(groupToMap);
              setActiveTab("map");
            }}
          />
        )}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center text-xs">Yükleniyor...</div>}>
      <DashboardPageContent />
    </Suspense>
  );
}