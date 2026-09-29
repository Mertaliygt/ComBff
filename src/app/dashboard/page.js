"use client";
import { useState, useEffect, Suspense, useRef } from "react";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, updateDoc, collection, onSnapshot, deleteDoc, arrayUnion, query, orderBy, addDoc } from "firebase/firestore";
import { signOut, onAuthStateChanged } from "firebase/auth";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import CreateGroupModal from "@/components/CreateGroupModal";
import ChatModal from "@/components/ChatModal";
import WelcomeModal from "@/components/WelcomeModal";

import StoriesBar from "@/components/StoriesBar";
import EventWeatherBadge from "@/components/EventWeatherBadge";
import ThanksWall from "@/components/ThanksWall";
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
  loading: () => <div className="flex items-center justify-center h-full text-sm text-muted">Harita yükleniyor...</div>
});

function calculateDistance(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 9999;
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function getMatchScore(userInterests = [], groupCategory = "") {
  if (!groupCategory) return 75;
  const match = userInterests.some(i => i.toLowerCase() === groupCategory.toLowerCase());
  return match ? 95 : 80;
}

export function getUserTitle(messageCount = 0) {
  if (messageCount >= 200) return { level: 4, title: "Efsane Gezgin 👑", badges: ["🔥 4 Hafta Seri", "👑 VIP", "🏍️ Yol Kaptanı"] };
  if (messageCount >= 100) return { level: 3, title: "Kıdemli Üye 🚀", badges: ["🔥 3 Hafta Seri", "☕ Kahve Gurmesi"] };
  if (messageCount >= 30) return { level: 2, title: "Aktif Katılımcı ✨", badges: ["🔥 2 Hafta Seri"] };
  return { level: 1, title: "Normal Kullanıcı 🌱", badges: ["🌱 Yeni Gezgin"] };
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

const EVENT_COVER_FALLBACK = "https://images.unsplash.com/photo-1511632765486-a01980e01a18?w=800&q=80";

function getGroupLocationLabel(group = {}) {
  if (group.locationAddress) return group.locationAddress;
  if (group.locationName) return group.locationName;
  if (group.city && group.district) return `${group.city} • ${group.district}`;
  if (group.city && group.area) return `${group.city} • ${group.area}`;
  if (group.city) return group.city;
  if (group.address) return group.address;
  if (typeof group.location === "string" && group.location.trim()) return group.location;
  return "Antalya • Konyaaltı";
}

function isGroupExpiredOrClosed(group) {
  if (!group) return true;
  if (group.chatStatus === "Kapalı") return true;
  if (group.eventDate) {
    const diffHours = (Date.now() - new Date(group.eventDate).getTime()) / (1000 * 60 * 60);
    if (diffHours >= 24) return true;
  }
  return false;
}

function canUserSeeGroup(group, userGender = "") {
  const audience = group?.genderAudience || "Herkese Açık";
  if (audience === "Herkese Açık") return true;
  if (!userGender) return false;
  if (audience === "Sadece Kadınlara Özel") return userGender === "Kadın";
  if (audience === "Sadece Erkeklere Özel") return userGender === "Erkek";
  return true;
}

function GroupMemberAvatars({ memberIds = [], maxVisible = 4 }) {
  const [profiles, setProfiles] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const ids = (memberIds || []).filter(Boolean).slice(0, maxVisible);

    async function loadProfiles() {
      if (ids.length === 0) {
        if (!cancelled) setProfiles([]);
        return;
      }
      try {
        const results = await Promise.all(
          ids.map(async (uid) => {
            if (uid === "anonim") return { id: uid, fullName: "Kullanıcı", photoUrl: "" };
            const userSnap = await getDoc(doc(db, "users", uid));
            if (userSnap.exists()) {
              return { id: uid, ...userSnap.data() };
            }
            return { id: uid, fullName: "Kullanıcı", photoUrl: "" };
          })
        );
        if (!cancelled) setProfiles(results);
      } catch (err) {
        console.error("Katılımcı avatars alınamadı:", err);
        if (!cancelled) setProfiles([]);
      }
    }

    setProfiles(null);
    loadProfiles();
    return () => { cancelled = true; };
  }, [memberIds.join("|"), maxVisible]);

  if (profiles === null) {
    return (
      <div className="h-7 w-7 rounded-full bg-inset border border-line shrink-0 animate-pulse" />
    );
  }

  if (profiles.length === 0) {
    return (
      <div className="inline-flex h-7 w-7 rounded-full ring-2 ring-[var(--tb-panel)] bg-blue-600/30 border border-blue-400/30 items-center justify-center text-[10px] font-bold text-brand shrink-0">
        U
      </div>
    );
  }

  return (
    <div className="flex -space-x-2 items-center shrink-0">
      {profiles.map((m, idx) => (
        <div
          key={m.id || idx}
          title={m.fullName}
          className="inline-flex h-7 w-7 rounded-full ring-2 ring-[var(--tb-panel)] overflow-hidden bg-blue-600/40 border border-blue-400/30 items-center justify-center text-[10px] font-bold text-brand shrink-0"
        >
          {m.photoUrl ? (
            <img src={m.photoUrl} alt={m.fullName || "Katılımcı"} className="w-full h-full object-cover" />
          ) : (
            m.fullName?.charAt(0).toUpperCase() || "U"
          )}
        </div>
      ))}
    </div>
  );
}

function DashboardPageContent() {
  const [userData, setUserData] = useState(null);
  const [activeTab, setActiveTab] = useState("map");
  const [adminSubTab, setAdminSubTab] = useState("groups_approval");
  const [groups, setGroups] = useState([]);
  const [reports, setReports] = useState([]);
  const [pendingUsers, setPendingUsers] = useState([]);
  const [pendingPhotos, setPendingPhotos] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const notifPanelRef = useRef(null);
  const notifButtonRef = useRef(null);

  // 🌙 GECE / GÜNDÜZ TEMA STATE'İ
  const [isDarkMode, setIsDarkMode] = useState(true);

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
  const [interests, setInterests] = useState([]);
  const [gender, setGender] = useState("");
  const [photoFile, setPhotoFile] = useState(null);
  const [updatingProfile, setUpdatingProfile] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();
  const targetGroupId = searchParams.get("groupId");

  useEffect(() => {
    const savedTheme = localStorage.getItem("tripbff_theme");
    if (savedTheme === "light") {
      setIsDarkMode(false);
    }
  }, []);

  const toggleTheme = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    localStorage.setItem("tripbff_theme", newMode ? "dark" : "light");
  };

  useEffect(() => {
    const isSeen = localStorage.getItem("tripbff_welcome_seen");
    if (!isSeen) {
      setShowWelcomeModal(true);
    }
  }, []);

  useEffect(() => {
    if (!isNotifOpen) return;

    const handleOutsideClick = (e) => {
      const panel = notifPanelRef.current;
      const button = notifButtonRef.current;
      if (panel?.contains(e.target) || button?.contains(e.target)) return;
      setIsNotifOpen(false);
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("touchstart", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("touchstart", handleOutsideClick);
    };
  }, [isNotifOpen]);

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
          setInterests(data.interests || ["Motor", "Kahve"]);
          setGender(data.gender || "");
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
        const groupStatus = data.status || "Onay Bekliyor";

        const eventTime = new Date(data.eventDate).getTime();
        const now = new Date().getTime();
        const diffHours = (now - eventTime) / (1000 * 60 * 60);

        if (diffHours >= 24 && data.chatStatus !== "Kapalı") {
          updateDoc(doc(db, "groups", docSnap.id), { chatStatus: "Kapalı" });
        }

        list.push({ 
          id: docSnap.id, 
          ...data,
          status: groupStatus
        });
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

    const unsubscribePhotos = onSnapshot(collection(db, "event_photos"), (snapshot) => {
      const list = [];
      snapshot.forEach((docSnap) => {
        if (docSnap.data().status === "pending") {
          list.push({ id: docSnap.id, ...docSnap.data() });
        }
      });
      setPendingPhotos(list);
    });

    return () => {
      unsubscribeGroups();
      unsubscribeReports();
      unsubscribeUsers();
      unsubscribePhotos();
    };
  }, []);

  useEffect(() => {
    if (targetGroupId && groups.length > 0) {
      const foundGroup = groups.find((g) => g.id === targetGroupId);
      if (foundGroup && !isGroupExpiredOrClosed(foundGroup) && canUserSeeGroup(foundGroup, gender || userData?.gender)) {
        setSelectedGroup(foundGroup);
      }
    }
  }, [targetGroupId, groups, gender, userData?.gender]);

  const openGroupChat = (g) => {
    if (isGroupExpiredOrClosed(g)) {
      alert("Bu etkinliğin sohbeti kapanmıştır. Anıları Anılar barından veya Tamamlanan Etkinlikler sekmesinden inceleyebilirsiniz.");
      return;
    }
    if (!canUserSeeGroup(g, gender || userData?.gender)) {
      alert("Bu etkinlik cinsiyet kısıtlaması nedeniyle size açık değil.");
      return;
    }
    setSelectedGroup(g);
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setUpdatingProfile(true);
    try {
      let photoUrl = userData.photoUrl || "";
      if (photoFile) {
        photoUrl = await resizeAndConvertImage(photoFile, 300, 300, 0.7);
      }
      const userRef = doc(db, "users", auth.currentUser.uid);
      // Cinsiyet güvenlik nedeniyle profil güncellemesinde değiştirilemez
      await updateDoc(userRef, { bio, instagram, showInsta, photoUrl, interests });
      setUserData(prev => ({ ...prev, bio, instagram, showInsta, photoUrl, interests }));
      alert("Profil başarıyla güncellendi!");
    } catch (err) {
      alert("Hata: " + err.message);
    } finally {
      setUpdatingProfile(false);
    }
  };

  /* MODERATÖR İŞLEMLERİ */
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

  const handleApproveGroup = async (groupId) => {
    try {
      const groupRef = doc(db, "groups", groupId);
      const groupSnap = await getDoc(groupRef);
      
      await updateDoc(groupRef, { status: "Aktif" });

      if (groupSnap.exists()) {
        const groupData = groupSnap.data();
        if (groupData.createdBy && groupData.createdBy !== "anonim") {
          await addDoc(collection(db, "users", groupData.createdBy, "notifications"), {
            title: "Etkinliğin Onaylandı! 🎉",
            message: `"${groupData.title}" adlı etkinlik grubun moderatör tarafından onaylandı ve haritada yayına alındı.`,
            type: "group_approved",
            isRead: false,
            createdAt: new Date()
          });
        }
      }

      alert("Grup onaylandı, yayına alındı ve kullanıcıya bildirim gönderildi!");
    } catch (err) {
      alert("Hata: " + err.message);
    }
  };

  const handleRejectGroup = async (groupId) => {
    if (!confirm("Etkinlik grubunu reddetmek ve silmek istediğinize emin misiniz?")) return;
    try {
      const groupRef = doc(db, "groups", groupId);
      const groupSnap = await getDoc(groupRef);

      if (groupSnap.exists()) {
        const groupData = groupSnap.data();
        if (groupData.createdBy && groupData.createdBy !== "anonim") {
          await addDoc(collection(db, "users", groupData.createdBy, "notifications"), {
            title: "Etkinliğin Reddedildi ⚠️",
            message: `"${groupData.title}" adlı etkinlik grubun kurallara uygun bulunmadığı için onaylanmadı.`,
            type: "group_rejected",
            isRead: false,
            createdAt: new Date()
          });
        }
      }

      await deleteDoc(groupRef);
      alert("Grup silindi ve sahibine bildirim iletildi.");
    } catch (err) {
      alert("Hata: " + err.message);
    }
  };

  const handleToggleGroupChat = async (groupId, currentChatStatus) => {
    const newStatus = currentChatStatus === "Kapalı" ? "Açık" : "Kapalı";
    try {
      await updateDoc(doc(db, "groups", groupId), { chatStatus: newStatus });
      alert(`Sohbet durumu "${newStatus}" olarak güncellendi.`);
    } catch (err) {
      alert("Hata: " + err.message);
    }
  };

  const handleResolveReport = async (reportId) => {
    try {
      await updateDoc(doc(db, "reports", reportId), { status: "Çözüldü" });
      alert("Şikayet çözüldü olarak işaretlendi.");
    } catch (err) {
      alert("Hata: " + err.message);
    }
  };

  const handleDeleteReportedMessage = async (report) => {
    if (!confirm("Şikayet edilen mesajı silmek ve şikayeti kapatmak istiyor musunuz?")) return;
    try {
      if (report.groupId && report.messageId) {
        await deleteDoc(doc(db, "groups", report.groupId, "messages", report.messageId));
      }
      await updateDoc(doc(db, "reports", report.id), { status: "Çözüldü (Mesaj Silindi)" });
      alert("Mesaj silindi ve şikayet kapatıldı.");
    } catch (err) {
      alert("Hata: " + err.message);
    }
  };

  const handleApprovePhoto = async (photoId) => {
    try {
      await updateDoc(doc(db, "event_photos", photoId), { 
        status: "approved",
        createdAt: new Date()
      });
      alert("Fotoğraf onaylandı ve Anılar barına eklendi!");
    } catch (err) {
      alert("Hata: " + err.message);
    }
  };

  const handleRejectPhoto = async (photoId) => {
    if (!confirm("Fotoğrafı reddedip silmek istediğinize emin misiniz?")) return;
    try {
      await deleteDoc(doc(db, "event_photos", photoId));
      alert("Fotoğraf reddedildi ve silindi.");
    } catch (err) {
      alert("Hata: " + err.message);
    }
  };

  if (loading || !userData) {
    return <div className="min-h-screen bg-canvas text-ink flex items-center justify-center text-sm">Yükleniyor...</div>;
  }

  const userRole = userData.role ? userData.role.trim().toLowerCase() : "";
  const isAdmin = userRole === "admin" || userRole === "mod";
  const pendingUsersCount = pendingUsers.length;
  
  const pendingGroupsList = groups.filter(g => g.status === "Onay Bekliyor");
  const pendingGroupsCount = pendingGroupsList.length;

  const activePublishedGroups = groups.filter(g => g.status === "Aktif");

  const pendingReportsList = reports.filter(r => r.status === "Bekliyor");
  const pendingReportsCount = pendingReportsList.length;
  const totalAdminBadgeCount = pendingUsersCount + pendingGroupsCount + pendingReportsCount + pendingPhotos.length;

  const unreadNotifCount = notifications.filter(n => !n.isRead).length;

  const userGender = gender || userData?.gender || "";

  let activeGroups = groups.filter(g =>
    g.status === "Aktif" &&
    g.chatStatus !== "Kapalı" &&
    !isGroupExpiredOrClosed(g) &&
    canUserSeeGroup(g, userGender)
  );
  if (sortByNearby && userLocation) {
    activeGroups = activeGroups.map(g => ({
      ...g,
      distance: calculateDistance(userLocation.latitude, userLocation.longitude, g.latitude, g.longitude)
    })).sort((a, b) => a.distance - b.distance);
  }

  const completedGroups = groups.filter(g => (g.status === "Aktif" && g.chatStatus === "Kapalı") || (new Date().getTime() - new Date(g.eventDate).getTime()) >= 24 * 60 * 60 * 1000);

  const myJoinedGroups = groups.filter(g => g.members?.includes(auth.currentUser.uid));
  
  const nowTime = new Date().getTime();
  const calendarEvents = groups.filter(g => {
    if (!g.eventDate || g.chatStatus === "Kapalı" || g.status !== "Aktif") return false;
    if (!canUserSeeGroup(g, userGender)) return false;
    const eventTime = new Date(g.eventDate).getTime();
    const diffHours = (eventTime - nowTime) / (1000 * 60 * 60);
    return diffHours >= 168;
  });

  const userTitleInfo = getUserTitle(userData.messageCount || 0);
  const firstName = userData.fullName ? userData.fullName.split(" ")[0] : "Gezgin";

  // 🌙 Tema Sınıfları Değişkeni
  const themeClasses = isDarkMode 
    ? "bg-canvas text-ink" 
    : "bg-canvas text-ink";

  const cardThemeClasses = isDarkMode
    ? "bg-panel/80 border-line text-ink"
    : "bg-panel/90 border-line text-ink shadow-sm";

  return (
    <div data-theme={isDarkMode ? "dark" : "light"} className={`tb-dashboard min-h-screen ${isDarkMode ? 'bg-canvas' : 'bg-inset'} text-ink flex items-center justify-center overflow-hidden select-none`}>
      <div className={`tb-shell w-full max-w-md h-screen sm:h-[90vh] sm:max-h-[850px] ${isDarkMode ? 'bg-canvas border-line' : 'bg-canvas border-line'} sm:border sm:rounded-3xl flex flex-col overflow-hidden shadow-2xl relative transition-colors duration-300`}>
        
        {/* HEADER */}
        <header className={`tb-header h-16 ${isDarkMode ? 'bg-panel/80 border-line' : 'bg-panel/80 border-line'} backdrop-blur-md px-4 flex justify-between items-center shrink-0 z-25 relative transition-colors duration-300`}>
          <div className="flex flex-col cursor-pointer" onClick={() => { setActiveTab("map"); setIsNotifOpen(false); }}>
            <h2 className={`font-black ${isDarkMode ? 'text-brand' : 'text-brand'} text-sm tracking-wider`}>ComBFF</h2>
            <span className={`text-[12px] ${isDarkMode ? 'text-muted' : 'text-muted'} font-semibold flex items-center gap-1`}>
              <span>Hoş geldin,</span>
              <span className={`${isDarkMode ? 'text-brand' : 'text-brand'} font-bold`}>{firstName}</span>
              <span>👋</span>
            </span>
          </div>
          
          <div className="flex items-center space-x-1.5">
            {/* 🌙 GECE / GÜNDÜZ TOGGLE BUTONU */}
            <button 
              type="button"
              onClick={toggleTheme}
              className={`p-2 ${isDarkMode ? 'bg-inset hover:bg-inset text-amber-300 border-line' : 'bg-inset hover:bg-inset text-brand border-line'} rounded-xl border transition flex items-center justify-center cursor-pointer`}
              title={isDarkMode ? "Gündüz Moduna Geç" : "Gece Moduna Geç"}
            >
              <span className="text-sm">{isDarkMode ? "☀️" : "🌙"}</span>
            </button>

            <button 
              type="button"
              ref={notifButtonRef}
              onClick={() => setIsNotifOpen(!isNotifOpen)}
              className={`relative p-2 ${isDarkMode ? 'bg-inset hover:bg-inset text-muted border-line' : 'bg-inset hover:bg-inset text-muted border-line'} rounded-xl border transition flex items-center justify-center cursor-pointer`}
              title="Bildirimler"
            >
              <span className="text-base">🔔</span>
              {unreadNotifCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-[11px] w-4 h-4 rounded-full flex items-center justify-center font-bold animate-pulse">
                  {unreadNotifCount}
                </span>
              )}
            </button>

            {isAdmin && (
              <button 
                onClick={() => { setActiveTab("admin"); setIsNotifOpen(false); }}
                className={`relative px-2 py-1 text-[12px] font-semibold rounded-lg border transition flex items-center space-x-1 ${
                  activeTab === 'admin' ? 'bg-amber-500/20 text-amber-400 border-amber-500/40' : isDarkMode ? 'bg-inset hover:bg-inset text-muted border-line' : 'bg-inset hover:bg-inset text-muted border-line'
                }`}
              >
                <span>🛡️ Yönetim</span>
                {totalAdminBadgeCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[11px] w-4 h-4 rounded-full flex items-center justify-center font-bold">
                    {totalAdminBadgeCount}
                  </span>
                )}
              </button>
            )}
            <button 
              onClick={() => signOut(auth).then(() => router.push("/login"))}
              className={`px-2 py-1 ${isDarkMode ? 'bg-inset hover:bg-inset text-muted border-line' : 'bg-inset hover:bg-inset text-muted border-line'} text-[12px] font-semibold rounded-lg border transition cursor-pointer`}
            >
              Çıkış
            </button>
          </div>

          {/* BİLDİRİM DROPDOWN */}
          {isNotifOpen && (
            <div
              ref={notifPanelRef}
              className={`tb-notifications absolute right-4 top-16 w-80 ${isDarkMode ? 'bg-panel border-line text-ink' : 'bg-panel border-line text-ink shadow-xl'} rounded-2xl p-3 z-50 space-y-2 max-h-80 overflow-y-auto backdrop-blur-md transition-colors duration-300`}
            >
              <div className={`flex justify-between items-center border-b ${isDarkMode ? 'border-line' : 'border-line'} pb-2`}>
                <h4 className="font-bold text-sm text-brand flex items-center gap-1.5">
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
                      className="text-[11px] text-rose-400 hover:text-rose-300 font-semibold bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20 transition cursor-pointer"
                    >
                      Tümünü Temizle 🗑️
                    </button>
                  )}
                  <button onClick={() => setIsNotifOpen(false)} className="text-[12px] text-muted hover:text-white px-1 cursor-pointer">✕</button>
                </div>
              </div>

              {notifications.length === 0 ? (
                <p className="text-center text-[12px] text-muted py-4">Henüz bir bildiriminiz yok.</p>
              ) : (
                notifications.map((n) => (
                  <div key={n.id} className={`p-2.5 rounded-xl border text-[13px] space-y-1 relative group ${n.isRead ? 'opacity-70 bg-inset/20 border-line/40' : 'bg-blue-950/30 border-blue-500/30'}`}>
                    <div className="flex justify-between items-start pr-4">
                      <span className="font-bold text-brand text-[12px]">{n.title}</span>
                      <span className="text-[11px] text-muted">
                        {n.createdAt ? new Date(n.createdAt.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                      </span>
                    </div>
                    <p className="text-[12px] leading-relaxed pr-3">{n.message}</p>
                    <button 
                      onClick={async () => { await deleteNotification(auth.currentUser.uid, n.id); }}
                      className="absolute top-2 right-2 text-muted hover:text-rose-400 text-sm p-0.5 transition cursor-pointer"
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
                          className="flex-1 py-1 bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold rounded-lg transition cursor-pointer"
                        >
                          Kabul Et ✓
                        </button>
                        <button
                          onClick={async () => { await rejectFollowRequest(auth.currentUser.uid, n.id); }}
                          className="flex-1 py-1 bg-inset text-ink text-[11px] font-semibold rounded-lg transition cursor-pointer"
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

        {/* ANILAR BAR */}
        <StoriesBar />

        {/* MAIN CONTENT */}
        <main className={`tb-main flex-grow relative overflow-y-auto flex flex-col pb-16 ${isDarkMode ? 'bg-canvas text-ink' : 'bg-canvas text-ink'} transition-colors duration-300`}>
          
          {/* HARİTA */}
          {activeTab === "map" && (
            <div className="h-full w-full absolute inset-0 z-10">
              <MapComponent 
                groups={activeGroups} 
                onSelectGroup={(g) => openGroupChat(g)}
                externalSelectedGroup={mapFocusedGroup}
              />
            </div>
          )}

          {/* AKTİF GRUPLAR */}
          {activeTab === "groups" && (
            <div className="tb-groups p-4 space-y-3.5 transition-all duration-300 ease-out">
              <div className={`tb-discovery ${isDarkMode ? 'text-ink' : 'text-ink'} relative overflow-hidden transition-colors duration-300`}>
                <div className="tb-discovery-hero">
                  <div className="tb-discovery-copy min-w-0">
                    <h3>Yeni rotalar, yeni arkadaşlar</h3>
                    <p className={`${isDarkMode ? 'text-muted' : 'text-muted'}`}>Çevrendeki maceralara katıl veya yeni bir etkinlik başlat!</p>
                  </div>
                  <button
                    onClick={() => setIsCreateModalOpen(true)}
                    className="tb-discovery-create bg-blue-600 hover:bg-blue-500 text-white font-bold px-3 py-2 rounded-xl text-[12px] transition shadow-lg shadow-blue-600/40 cursor-pointer shrink-0"
                  >
                    + Etkinlik Oluştur
                  </button>
                </div>

                <div className="tb-discovery-actions flex space-x-2">
                  <button
                    onClick={() => {
                      if (!navigator.geolocation) return alert("Konum desteklenmiyor.");
                      navigator.geolocation.getCurrentPosition(
                        (pos) => { setUserLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }); setSortByNearby(true); },
                        (err) => alert("Konum alınamadı: " + err.message)
                      );
                    }}
                    className={`flex-1 py-1.5 px-3 rounded-xl text-[12px] font-semibold transition border cursor-pointer ${
                      sortByNearby ? 'bg-blue-600 text-white border-blue-500' : isDarkMode ? 'bg-inset/80 hover:bg-inset text-muted border-line' : 'bg-panel hover:bg-canvas text-muted border-line'
                    }`}
                  >
                    📍 Yakınımdaki Etkinlikler
                  </button>
                  {sortByNearby && (
                    <button onClick={() => setSortByNearby(false)} className={`px-3 py-1.5 ${isDarkMode ? 'bg-inset text-muted border-line' : 'bg-panel text-muted border-line'} rounded-xl text-[12px] border cursor-pointer`}>Sıfırla</button>
                  )}
                </div>
              </div>

              <h3 className="tb-section-title">Etkinlik Grupları</h3>
              <div className="tb-event-grid flex flex-col">
                {activeGroups.length === 0 ? (
                  <div className="text-center py-10 space-y-2">
                    <span className="text-2xl block">🎉</span>
                    <p className={`text-sm ${isDarkMode ? 'text-muted' : 'text-muted'} font-medium`}>Şu an onaylanmış aktif etkinlik bulunmuyor.</p>
                    <p className="text-[12px] text-muted">İlk etkinliği sen oluşturmaya ne dersin?</p>
                  </div>
                ) : (
                  activeGroups.map((g) => {
                    const matchScore = getMatchScore(interests, g.category);
                    const locationLabel = getGroupLocationLabel(g);
                    const memberCount = g.memberCount || g.members?.length || 1;
                    const dateLabel = g.eventDate
                      ? new Date(g.eventDate).toLocaleString("tr-TR", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "Tarih Belirtilmedi";

                    return (
                      <div
                        key={g.id}
                        onClick={() => openGroupChat(g)}
                        className={`tb-event-card ${isDarkMode ? "bg-panel/80 border-line text-ink" : "bg-panel border-line text-ink shadow-sm"} border hover:border-blue-500/60 rounded-2xl cursor-pointer transition-all duration-200 active:scale-[0.995] group relative overflow-hidden`}
                      >
                        <div className="tb-event-cover w-full overflow-hidden relative">
                          <img
                            src={g.imageUrl || EVENT_COVER_FALLBACK}
                            alt={g.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                          />
                          <span className="absolute top-2.5 right-2.5 text-[10px] font-bold backdrop-blur-md px-2 py-0.5 rounded-full border border-white/15">
                            {g.category || "Genel"}
                          </span>
                          <span className="absolute top-2.5 left-2.5 text-[10px] font-bold backdrop-blur-md px-2 py-0.5 rounded-full border border-emerald-400/40">
                            %{matchScore} Uyumlu ✨
                          </span>
                        </div>

                        <div className="tb-event-body">
                          <h4 className={`font-bold ${isDarkMode ? "text-ink" : "text-ink"} group-hover:text-brand transition`}>
                            {g.title}
                          </h4>
                          <p className={`tb-event-location ${isDarkMode ? "text-muted" : "text-muted"} flex items-center gap-1`}>
                            <span aria-hidden="true">📍</span>
                            <span className="truncate">{locationLabel}</span>
                          </p>
                          {g.genderAudience && g.genderAudience !== "Herkese Açık" && (
                            <p className="text-[10px] text-amber-400 font-semibold mt-0.5">{g.genderAudience}</p>
                          )}
                        </div>

                        <div className="tb-event-meta flex items-center flex-nowrap gap-1.5 overflow-x-auto">
                          <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-lg border shrink-0 ${isDarkMode ? "bg-inset/80 border-line text-ink" : "bg-inset border-line text-ink"}`}>
                            <span aria-hidden="true">📅</span>
                            <span>{dateLabel}</span>
                          </span>
                          <span className="inline-flex items-center text-[11px] font-semibold px-2 py-1 rounded-lg border shrink-0 bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
                            Aktif
                          </span>
                          <EventWeatherBadge
                            latitude={g.latitude}
                            longitude={g.longitude}
                            eventDate={g.eventDate}
                            className="shrink-0"
                          />
                        </div>

                        <div className={`tb-event-footer flex justify-between items-center border-t ${isDarkMode ? "border-line/80" : "border-line"}`}>
                          <div className="flex items-center gap-2 min-w-0">
                            <GroupMemberAvatars memberIds={g.members || []} maxVisible={4} />
                            <span className={`text-[11px] font-semibold ${isDarkMode ? "text-muted" : "text-muted"} truncate`}>
                              {memberCount} katılımcı
                            </span>
                          </div>
                          <span className="tb-chat-link shrink-0 font-bold">
                            Sohbete Git →
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* TAMAMLANAN ETKİNLİKLER */}
          {activeTab === "completed" && (
            <div className="p-4 space-y-3">
              <div className="mb-2">
                <h3 className={`font-bold text-sm ${isDarkMode ? 'text-ink' : 'text-ink'}`}>Tamamlanan Etkinlikler 🏁</h3>
                <p className="text-[12px] text-muted">Süresi dolmuş veya sonlanmış geçmiş etkinlikler</p>
              </div>

              {completedGroups.length === 0 ? (
                <p className="text-center text-sm text-muted mt-8">Henüz tamamlanan bir etkinlik bulunmuyor.</p>
              ) : (
                completedGroups.map(g => (
                  <div 
                    key={g.id} 
                    className={`${isDarkMode ? 'bg-panel/60 border-line' : 'bg-panel border-line shadow-sm'} border rounded-xl p-3.5 space-y-2 opacity-90`}
                  >
                    <div className="flex justify-between items-start">
                      <h4 className="font-bold text-muted text-sm line-through">{g.title}</h4>
                      <span className="text-[11px] bg-rose-500/20 text-rose-400 px-2 py-0.5 rounded-full border border-rose-500/30 font-semibold">🏁 Tamamlandı</span>
                    </div>
                    <p className="text-[12px] text-muted line-clamp-2">{g.desc}</p>
                    {g.locationAddress && (
                      <p className="text-[11px] text-muted">📍 {g.locationAddress}</p>
                    )}
                    <div className={`flex justify-between items-center text-[11px] text-muted pt-1 border-t ${isDarkMode ? 'border-line' : 'border-line'}`}>
                      <span>👤 {g.memberCount || 1} Katılımcı</span>
                      <span>📅 {g.eventDate ? new Date(g.eventDate).toLocaleDateString('tr-TR') : 'Tarih Yok'}</span>
                    </div>
                    <p className="text-[11px] text-brand font-medium pt-0.5">
                      Sohbet kapalı. Anıları üstteki Anılar barından inceleyebilirsiniz.
                    </p>
                    <ThanksWall
                      groupId={g.id}
                      members={g.members || []}
                      authorName={userData.fullName || firstName}
                      isDarkMode={isDarkMode}
                    />
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAKVİM */}
          {activeTab === "calendar" && (
            <div className="p-4 space-y-3">
              <div className="mb-2">
                <h3 className={`font-bold text-sm ${isDarkMode ? 'text-ink' : 'text-ink'}`}>Etkinlik Takvimi (Ön Reklam)</h3>
                <p className="text-[12px] text-muted">Etkinliğe 7 gün ve üzeri süre kalan gelecekteki buluşmalar</p>
              </div>

              {calendarEvents.length === 0 ? (
                <p className="text-center text-sm text-muted mt-8">Şu an takvimde 7 günden daha uzun süreli etkinlik bulunmuyor.</p>
              ) : (
                calendarEvents.map(g => {
                  const dateInfo = formatEventDate(g.eventDate);
                  const isAlreadyRequested = g.preApprovals?.includes(auth.currentUser.uid);
                  
                  return (
                    <div key={g.id} className={`${isDarkMode ? 'bg-panel/90 border-line text-ink' : 'bg-panel border-line text-ink shadow-md'} border rounded-2xl p-3.5 flex flex-col space-y-3 relative overflow-hidden`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="w-14 h-14 bg-blue-600/30 border border-blue-500/40 rounded-xl flex flex-col items-center justify-center shrink-0">
                            <span className="text-[11px] font-bold text-brand uppercase">{dateInfo.month}</span>
                            <span className="text-base font-black text-white">{dateInfo.day}</span>
                          </div>
                          <div>
                            <h4 className="font-bold text-sm">{g.title}</h4>
                            <p className="text-[12px] text-brand font-medium">{g.category}</p>
                            <p className={`text-[12px] ${isDarkMode ? 'text-muted' : 'text-muted'} line-clamp-1`}>{g.desc}</p>
                          </div>
                        </div>
                        <span className="text-[11px] bg-amber-500/20 text-amber-400 px-2.5 py-1 rounded-full border border-amber-500/30 font-semibold">⏳ Takvim İlanı</span>
                      </div>

                      <div className={`flex justify-between items-center pt-2 border-t ${isDarkMode ? 'border-line' : 'border-line'} text-[12px]`}>
                        <span className="text-muted">📅 Saat: {dateInfo.time}</span>
                        <button 
                          onClick={async () => {
                            await updateDoc(doc(db, "groups", g.id), { preApprovals: arrayUnion(auth.currentUser.uid) });
                            alert("Ön onay isteği yollandı!");
                          }}
                          disabled={isAlreadyRequested}
                          className={`px-4 py-1.5 rounded-xl font-bold transition shadow-md cursor-pointer ${
                            isAlreadyRequested ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 cursor-default' : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/30'
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

          {/* YÖNETİCİ PANELİ */}
          {activeTab === "admin" && isAdmin && (
            <div className="p-4 space-y-4">
              <div className={`${isDarkMode ? 'bg-panel border-line' : 'bg-panel border-line shadow-xl'} border rounded-2xl p-4 space-y-4`}>
                <div className={`flex justify-between items-center border-b ${isDarkMode ? 'border-line' : 'border-line'} pb-3`}>
                  <h3 className="font-bold text-sm text-amber-400">Moderatör Yönetim Paneli</h3>
                  <button onClick={() => setActiveTab("map")} className="bg-inset hover:bg-inset text-muted text-[12px] px-3 py-1 rounded-lg font-semibold transition cursor-pointer">Kapat</button>
                </div>

                <div className={`tb-admin-tabs grid grid-cols-5 gap-1 ${isDarkMode ? 'bg-canvas border-line' : 'bg-canvas border-line'} p-1 rounded-xl border text-[11px] font-semibold text-center`}>
                  <button 
                    onClick={() => setAdminSubTab("user_approvals")}
                    className={`py-1.5 rounded-lg transition cursor-pointer ${adminSubTab === 'user_approvals' ? 'bg-blue-600 text-white' : 'text-muted hover:text-white'}`}
                  >
                    Üye ({pendingUsersCount})
                  </button>
                  <button 
                    onClick={() => setAdminSubTab("groups_approval")}
                    className={`py-1.5 rounded-lg transition cursor-pointer ${adminSubTab === 'groups_approval' ? 'bg-blue-600 text-white' : 'text-muted hover:text-white'}`}
                  >
                    Grup Onay ({pendingGroupsCount})
                  </button>
                  <button 
                    onClick={() => setAdminSubTab("chat_management")}
                    className={`py-1.5 rounded-lg transition cursor-pointer ${adminSubTab === 'chat_management' ? 'bg-blue-600 text-white' : 'text-muted hover:text-white'}`}
                  >
                    Chat Yön ({activePublishedGroups.length})
                  </button>
                  <button 
                    onClick={() => setAdminSubTab("reports_approval")}
                    className={`py-1.5 rounded-lg transition cursor-pointer ${adminSubTab === 'reports_approval' ? 'bg-blue-600 text-white' : 'text-muted hover:text-white'}`}
                  >
                    Şikayet ({pendingReportsCount})
                  </button>
                  <button 
                    onClick={() => setAdminSubTab("photo_approvals")}
                    className={`py-1.5 rounded-lg transition cursor-pointer ${adminSubTab === 'photo_approvals' ? 'bg-blue-600 text-white' : 'text-muted hover:text-white'}`}
                  >
                    Foto ({pendingPhotos.length})
                  </button>
                </div>

                {/* 1. ÜYE ONAYLARI */}
                {adminSubTab === "user_approvals" && (
                  <div className="space-y-2.5 max-h-[400px] overflow-y-auto pr-1">
                    <h4 className="font-bold text-[13px] text-brand">Onay Bekleyen Üyeler ({pendingUsersCount})</h4>
                    {pendingUsers.length === 0 ? (
                      <p className="text-[12px] text-muted">Onay bekleyen üye yok.</p>
                    ) : (
                      pendingUsers.map(u => (
                        <div key={u.id} className={`${isDarkMode ? 'bg-inset/60 border-line' : 'bg-canvas border-line'} border rounded-xl p-3 space-y-2 shadow-md`}>
                          <div>
                            <h5 className="font-bold text-sm">{u.fullName} ({u.age})</h5>
                            <p className="text-[12px] text-muted">{u.email}</p>
                          </div>
                          <div className="flex space-x-2 pt-1">
                            <button onClick={() => handleApproveUser(u.id)} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-1.5 rounded-lg text-[12px] font-semibold cursor-pointer">Onayla ✓</button>
                            <button onClick={() => handleRejectUser(u.id)} className="flex-1 bg-rose-600 hover:bg-rose-500 text-white py-1.5 rounded-lg text-[12px] font-semibold cursor-pointer">Reddet ✕</button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* 2. GRUP ONAYLARI */}
                {adminSubTab === "groups_approval" && (
                  <div className="space-y-2.5 max-h-[400px] overflow-y-auto pr-1">
                    <h4 className="font-bold text-[13px] text-brand">Onay Bekleyen Gruplar ({pendingGroupsCount})</h4>
                    {pendingGroupsList.length === 0 ? (
                      <p className="text-[12px] text-muted">Onay bekleyen grup bulunmuyor.</p>
                    ) : (
                      pendingGroupsList.map(g => (
                        <div key={g.id} className={`${isDarkMode ? 'bg-inset/60 border-line' : 'bg-canvas border-line'} border rounded-xl p-3 space-y-2 shadow-md`}>
                          <div className="flex justify-between items-start">
                            <div>
                              <h5 className="font-bold text-sm">{g.title}</h5>
                              <p className="text-[12px] text-brand">{g.category} • {g.eventDate ? new Date(g.eventDate).toLocaleDateString('tr-TR') : 'Tarih Yok'}</p>
                            </div>
                            <span className="text-[11px] px-2 py-0.5 rounded font-bold border bg-amber-500/20 text-amber-300 border-amber-500/30">
                              Onay Bekliyor
                            </span>
                          </div>
                          <p className={`text-[12px] ${isDarkMode ? 'text-muted' : 'text-muted'} line-clamp-2`}>{g.desc}</p>
                          
                          <div className={`flex space-x-2 pt-1 border-t ${isDarkMode ? 'border-line/60' : 'border-line'}`}>
                            <button onClick={() => handleApproveGroup(g.id)} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-1.5 rounded-lg text-[12px] font-semibold cursor-pointer">Grubu Onayla ✓</button>
                            <button onClick={() => handleRejectGroup(g.id)} className="flex-1 bg-rose-600 hover:bg-rose-500 text-white py-1.5 rounded-lg text-[12px] font-semibold cursor-pointer">Grubu Sil ✕</button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* 3. CHAT YÖNETİMİ */}
                {adminSubTab === "chat_management" && (
                  <div className="space-y-2.5 max-h-[400px] overflow-y-auto pr-1">
                    <h4 className="font-bold text-[13px] text-brand">Aktif Gruplar - Chat Yönetimi ({activePublishedGroups.length})</h4>
                    {activePublishedGroups.length === 0 ? (
                      <p className="text-[12px] text-muted">Yayında aktif grup bulunmuyor.</p>
                    ) : (
                      activePublishedGroups.map(g => (
                        <div key={g.id} className={`${isDarkMode ? 'bg-inset/60 border-line' : 'bg-canvas border-line'} border rounded-xl p-3 space-y-2 shadow-md`}>
                          <div className="flex justify-between items-start">
                            <div>
                              <h5 className="font-bold text-sm">{g.title}</h5>
                              <p className="text-[12px] text-brand">{g.category}</p>
                            </div>
                            <span className={`text-[11px] px-2 py-0.5 rounded font-bold border ${g.chatStatus === 'Kapalı' ? 'bg-rose-500/20 text-rose-300 border-rose-500/30' : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'}`}>
                              Chat: {g.chatStatus || "Açık"}
                            </span>
                          </div>
                          <button 
                            onClick={() => handleToggleGroupChat(g.id, g.chatStatus)}
                            className={`w-full py-1.5 rounded-lg text-[12px] font-semibold transition border cursor-pointer ${g.chatStatus === 'Kapalı' ? 'bg-emerald-600/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-600 hover:text-white' : 'bg-rose-600/20 text-rose-300 border-rose-500/40 hover:bg-rose-600 hover:text-white'}`}
                          >
                            {g.chatStatus === 'Kapalı' ? 'Sohbeti Tekrar Aç 🔓' : 'Sohbeti Kapat / Kilitle 🚫'}
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* 4. ŞİKAYET ONAYLARI */}
                {adminSubTab === "reports_approval" && (
                  <div className="space-y-2.5 max-h-[400px] overflow-y-auto pr-1">
                    <h4 className="font-bold text-[13px] text-brand">Onay Bekleyen Şikayetler ({pendingReportsCount})</h4>
                    {pendingReportsList.length === 0 ? (
                      <p className="text-[12px] text-muted">Bekleyen şikayet yok.</p>
                    ) : (
                      pendingReportsList.map(r => (
                        <div key={r.id} className={`${isDarkMode ? 'bg-inset/60 border-line' : 'bg-canvas border-line'} border rounded-xl p-3 space-y-2 shadow-md`}>
                          <div>
                            <span className="text-[11px] bg-rose-500/20 text-rose-300 px-2 py-0.5 rounded font-bold">{r.groupTitle || "Grup"}</span>
                            <p className={`text-[13px] ${isDarkMode ? 'text-ink bg-panel/60' : 'text-ink bg-panel'} italic mt-1 p-2 rounded-lg`}>"{r.messageText}"</p>
                            <p className="text-[11px] text-muted mt-1">Şikayet Eden: {r.reportedBy} | Bildirilen: {r.reportedUserEmail}</p>
                          </div>
                          <div className="flex space-x-2 pt-1">
                            <button onClick={() => handleDeleteReportedMessage(r)} className="flex-1 bg-rose-600 hover:bg-rose-500 text-white py-1.5 rounded-lg text-[11px] font-semibold cursor-pointer">Mesajı Sil & Kapat</button>
                            <button onClick={() => handleResolveReport(r.id)} className="flex-1 bg-inset hover:bg-inset text-ink py-1.5 rounded-lg text-[11px] font-semibold cursor-pointer">Çözüldü İşaretle</button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* 5. FOTOĞRAF ONAYLARI */}
                {adminSubTab === "photo_approvals" && (
                  <div className="space-y-2.5 max-h-[400px] overflow-y-auto pr-1">
                    <h4 className="font-bold text-[13px] text-brand">Onay Bekleyen Anılar ({pendingPhotos.length})</h4>
                    {pendingPhotos.length === 0 ? (
                      <p className="text-[12px] text-muted">Onay bekleyen fotoğraf yok.</p>
                    ) : (
                      pendingPhotos.map(p => (
                        <div key={p.id} className={`${isDarkMode ? 'bg-inset/60 border-line' : 'bg-canvas border-line'} border rounded-xl p-3 space-y-2 shadow-md`}>
                          <div className="w-full h-32 rounded-lg overflow-hidden border border-line">
                            <img src={p.photoUrl} className="w-full h-full object-cover" />
                          </div>
                          <div>
                            <h5 className="font-bold text-sm">{p.groupTitle}</h5>
                            <p className="text-[12px] text-muted">Yükleyen: {p.uploaderName}</p>
                          </div>
                          <div className="flex space-x-2 pt-1">
                            <button onClick={() => handleApprovePhoto(p.id)} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-1.5 rounded-lg text-[12px] font-semibold cursor-pointer">Onayla ✓</button>
                            <button onClick={() => handleRejectPhoto(p.id)} className="flex-1 bg-rose-600 hover:bg-rose-500 text-white py-1.5 rounded-lg text-[12px] font-semibold cursor-pointer">Reddet ✕</button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* PROFİL */}
          {activeTab === "profile" && (
            <div className="p-3.5 space-y-3">
              <div className={`${isDarkMode ? 'bg-panel/80 border-line text-ink' : 'bg-panel border-line text-ink shadow-lg'} border p-3.5 rounded-2xl flex flex-col items-center text-center space-y-2`}>
                <div className="w-16 h-16 rounded-full bg-blue-600/30 border-2 border-blue-500/50 flex items-center justify-center text-brand font-bold text-lg overflow-hidden shrink-0">
                  {userData.photoUrl ? (
                    <img src={userData.photoUrl} alt="Profil" className="w-full h-full object-cover" />
                  ) : (
                    userData.fullName?.charAt(0).toUpperCase() || "U"
                  )}
                </div>
                <div>
                  <h3 className="font-bold text-sm">{userData.fullName} ({userData.age})</h3>
                  <p className="text-[11px] text-brand font-semibold mt-0.5">{userTitleInfo.title}</p>
                  <p className="text-[12px] text-muted">{userData.email}</p>
                  <p className="text-[11px] text-muted mt-1">
                    Cinsiyet: <span className="font-semibold text-ink">{userData.gender || gender || "Belirtilmedi"}</span>
                    <span className="text-muted"> · değiştirilemez</span>
                  </p>
                </div>

                <div className="flex flex-wrap gap-1 justify-center pt-1">
                  {userTitleInfo.badges.map((b, i) => (
                    <span key={i} className="text-[11px] bg-blue-500/20 text-brand px-2 py-0.5 rounded-full border border-blue-500/30 font-bold">
                      {b}
                    </span>
                  ))}
                </div>

                {userData.bio && <p className="text-[12px] text-muted italic px-2">{userData.bio}</p>}

                <div className={`flex space-x-2 w-full pt-1.5 border-t ${isDarkMode ? 'border-line/80' : 'border-line'}`}>
                  <button
                    onClick={async () => {
                      const list = await getFollowersList(auth.currentUser.uid);
                      setFollowUserList(list);
                      setFollowModalType("followers");
                    }}
                    className={`flex-1 py-1.5 ${isDarkMode ? 'bg-inset hover:bg-inset/80 border-line/80' : 'bg-canvas hover:bg-inset border-line'} rounded-xl text-center transition cursor-pointer border`}
                  >
                    <span className="block text-sm font-bold text-brand">{followersCount}</span>
                    <span className="text-[11px] text-muted">Takipçi</span>
                  </button>

                  <button
                    onClick={async () => {
                      const list = await getFollowingList(auth.currentUser.uid);
                      setFollowUserList(list);
                      setFollowModalType("following");
                    }}
                    className={`flex-1 py-1.5 ${isDarkMode ? 'bg-inset hover:bg-inset/80 border-line/80' : 'bg-canvas hover:bg-inset border-line'} rounded-xl text-center transition cursor-pointer border`}
                  >
                    <span className="block text-sm font-bold text-brand">{followingCount}</span>
                    <span className="text-[11px] text-muted">Takip Edilen</span>
                  </button>
                </div>
              </div>

              <form onSubmit={handleUpdateProfile} className={`${isDarkMode ? 'bg-panel/60 border-line' : 'bg-panel border-line shadow-sm'} border p-3 rounded-2xl space-y-2.5`}>
                <h4 className="font-bold text-sm text-brand">Profili Düzenle</h4>
                <div className="flex flex-col space-y-1">
                  <label className="text-[11px] text-muted">Profil Fotoğrafı Değiştir</label>
                  <input type="file" accept="image/*" onChange={(e) => setPhotoFile(e.target.files[0])} className="text-[11px] text-muted file:mr-2 file:py-1 file:px-2 file:rounded-lg file:border-0 file:text-[11px] file:bg-blue-600 file:text-white cursor-pointer" />
                </div>
                <div className="flex flex-col space-y-1">
                  <label className="text-[11px] text-muted">Biyografi</label>
                  <textarea rows="2" value={bio} onChange={(e) => setBio(e.target.value)} className={`${isDarkMode ? 'bg-inset border-line text-ink' : 'bg-canvas border-line text-ink'} border rounded-xl px-2.5 py-1.5 text-[13px] focus:outline-none focus:border-blue-500 resize-none`} />
                </div>
                <div className="flex flex-col space-y-1">
                  <label className="text-[11px] text-muted">Instagram Kullanıcı Adı</label>
                  <input type="text" value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="örn: kullanıcı_adı" className={`${isDarkMode ? 'bg-inset border-line text-ink' : 'bg-canvas border-line text-ink'} border rounded-xl px-2.5 py-1.5 text-[13px] focus:outline-none focus:border-blue-500`} />
                </div>
                <div className="flex items-center justify-between pt-0.5">
                  <span className="text-[11px]">Instagram adresim görünsün</span>
                  <input type="checkbox" checked={showInsta} onChange={(e) => setShowInsta(e.target.checked)} className="w-3.5 h-3.5 accent-blue-600 rounded cursor-pointer" />
                </div>
                <button type="submit" disabled={updatingProfile} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-1.5 rounded-xl text-sm transition shadow-md shadow-blue-600/30 cursor-pointer">
                  {updatingProfile ? "Kaydediliyor..." : "Değişiklikleri Kaydet"}
                </button>
              </form>

              <div className="space-y-2 pt-1">
                <h4 className="font-bold text-sm text-brand">Katıldığım Gruplar ({myJoinedGroups.length})</h4>
                {myJoinedGroups.length === 0 ? (
                  <p className="text-[12px] text-muted italic">Henüz katıldığın bir etkinlik grubu yok.</p>
                ) : (
                  myJoinedGroups.map(g => {
                    const chatLocked = isGroupExpiredOrClosed(g);
                    return (
                    <div 
                      key={g.id}
                      onClick={() => openGroupChat(g)}
                      className={`${isDarkMode ? 'bg-panel/70 border-line' : 'bg-panel border-line shadow-sm'} border hover:border-blue-500/50 rounded-xl p-2 flex items-center justify-between cursor-pointer transition ${chatLocked ? 'opacity-70' : ''}`}
                    >
                      <div className="flex items-center space-x-2.5">
                        <div className={`w-8 h-8 rounded-lg overflow-hidden ${isDarkMode ? 'bg-inset border-line' : 'bg-canvas border-line'} shrink-0 border flex items-center justify-center`}>
                          {g.imageUrl ? (
                            <img src={g.imageUrl} className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-[12px] font-bold text-brand">
                              {g.title.charAt(0).toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div>
                          <h5 className="font-bold text-[13px] line-clamp-1">{g.title}</h5>
                          <p className="text-[11px] text-muted">{g.category} • 👤 {g.memberCount || 1}</p>
                        </div>
                      </div>
                      <span className={`text-[11px] font-bold shrink-0 ml-2 ${chatLocked ? 'text-muted' : 'text-brand'}`}>
                        {chatLocked ? "Kapalı" : "Sohbet →"}
                      </span>
                    </div>
                    );
                  })
                )}
              </div>

            </div>
          )}

        </main>

        {/* BOTTOM NAV */}
        <nav aria-label="Ana gezinme" className={`tb-nav h-16 ${isDarkMode ? 'bg-panel/90 border-line' : 'bg-panel/90 border-line shadow-lg'} backdrop-blur-md border-t grid grid-cols-5 items-center shrink-0 z-20 absolute bottom-0 left-0 right-0 transition-colors duration-300`}>
          <button aria-current={activeTab === "groups" ? "page" : undefined} onClick={() => { setActiveTab("groups"); setIsNotifOpen(false); }} className={`flex flex-col items-center justify-center py-1 transition cursor-pointer ${activeTab === 'groups' ? 'text-brand font-bold' : 'text-muted'}`}>
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            <span className="text-[11px] mt-0.5 font-medium">Gruplar</span>
          </button>
          <button aria-current={activeTab === "map" ? "page" : undefined} onClick={() => { setActiveTab("map"); setIsNotifOpen(false); }} className={`flex flex-col items-center justify-center py-1 transition cursor-pointer ${activeTab === 'map' ? 'text-brand font-bold' : 'text-muted'}`}>
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6ZM9 3v15M15 6v15"/></svg>
            <span className="text-[11px] mt-0.5 font-medium">Harita</span>
          </button>
          <button aria-current={activeTab === "completed" ? "page" : undefined} onClick={() => { setActiveTab("completed"); setIsNotifOpen(false); }} className={`flex flex-col items-center justify-center py-1 transition cursor-pointer ${activeTab === 'completed' ? 'text-brand font-bold' : 'text-muted'}`}>
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 22V3m0 0c6-4 10 4 16 0v11c-6 4-10-4-16 0"/><path d="M8 2v11m4-10v11m4-10v11M4 8c6-4 10 4 16 0"/></svg>
            <span className="text-[11px] mt-0.5 font-medium">Bitenler</span>
          </button>
          <button aria-current={activeTab === "calendar" ? "page" : undefined} onClick={() => { setActiveTab("calendar"); setIsNotifOpen(false); }} className={`flex flex-col items-center justify-center py-1 transition cursor-pointer ${activeTab === 'calendar' ? 'text-brand font-bold' : 'text-muted'}`}>
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 11h18m-12 5h.01M12 16h.01M15 16h.01"/></svg>
            <span className="text-[11px] mt-0.5 font-medium">Takvim</span>
          </button>
          <button aria-current={activeTab === "profile" ? "page" : undefined} onClick={() => { setActiveTab("profile"); setIsNotifOpen(false); }} className={`flex flex-col items-center justify-center py-1 transition cursor-pointer ${activeTab === 'profile' ? 'text-brand font-bold' : 'text-muted'}`}>
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></svg>
            <span className="text-[11px] mt-0.5 font-medium">Profil</span>
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
            <div className={`${isDarkMode ? 'bg-panel border-line' : 'bg-panel border-line'} border w-full max-w-xs rounded-2xl p-4 flex flex-col space-y-3 shadow-2xl max-h-96 overflow-y-auto`}>
              <div className={`flex justify-between items-center border-b ${isDarkMode ? 'border-line' : 'border-line'} pb-2`}>
                <h4 className="font-bold text-sm text-brand">
                  {followModalType === "followers" ? "Takipçilerim" : "Takip Ettiklerim"} ({followUserList.length})
                </h4>
                <button onClick={() => setFollowModalType(null)} className="text-muted hover:text-white text-sm px-1 cursor-pointer">✕</button>
              </div>

              {followUserList.length === 0 ? (
                <p className="text-center text-[12px] text-muted py-4">Kullanıcı bulunamadı.</p>
              ) : (
                followUserList.map((u) => (
                  <div key={u.id} className={`flex items-center space-x-2.5 p-2 rounded-xl ${isDarkMode ? 'bg-inset/50 border-line/50' : 'bg-canvas border-line'} border`}>
                    <div className="w-8 h-8 rounded-full bg-blue-600/30 overflow-hidden shrink-0 border border-blue-500/30 flex items-center justify-center text-sm font-bold text-brand">
                      {u.photoUrl ? <img src={u.photoUrl} className="w-full h-full object-cover" /> : u.fullName?.charAt(0)}
                    </div>
                    <div>
                      <h5 className="font-bold text-sm">{u.fullName}</h5>
                      <p className="text-[11px] text-brand">{getUserTitle(u.messageCount || 0).title}</p>
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
            onSwitchGroup={(newGroup) => openGroupChat(newGroup)}
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
    <Suspense fallback={<div className="min-h-screen bg-canvas text-ink flex items-center justify-center text-sm">Yükleniyor...</div>}>
      <DashboardPageContent />
    </Suspense>
  );
}