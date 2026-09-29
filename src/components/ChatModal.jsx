"use client";
import { useState, useEffect, useRef } from "react";
import { db, auth } from "@/lib/firebase";
import { collection, addDoc, query, orderBy, onSnapshot, doc, updateDoc, arrayUnion, arrayRemove, getDoc, getDocs } from "firebase/firestore";
import { getUserTitle } from "@/app/dashboard/page";
import { sendFollowRequest } from "@/lib/followService";
import { fetchEventWeather, getAtmosphereFromWeather, estimateWeatherFallback } from "@/utils/weatherHelper";

// 🎯 Daha Alaycı ve Keskin Meme Listesi
const memeList = [
  { img: "/memes/1.PNG", text: "Kesinlikle sadece etkinlik için katıldın, evet :))" },
  { img: "/memes/2.PNG", text: "Yemezler aslanım, amacını biliyoruz 😏" },
  { img: "/memes/3.PNG", text: "Çok hızlıydın şampiyon, yavaş biraz :)" },
  { img: "/memes/4.PNG", text: "Niyet 0.5 saniyede belli oldu haa 🕵️‍♂️" },
  { img: "/memes/5.PNG", text: "Seni uyanık seni, yakalandın! 🚨" },
  { img: "/memes/6.PNG", text: "Rastgele tıkladın dimi? Tabii tabii... :D" },
  { img: "/memes/7.PNG", text: "Aradığın 'arkadaş' burada olmayabilir ama deniyorsun 😂" }
];

export default function ChatModal({ group, onClose, onSwitchGroup, onShowOnMap }) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [isMember, setIsMember] = useState(group.members?.includes(auth.currentUser?.uid));
  const [selectedUserForProfile, setSelectedUserForProfile] = useState(null);
  const [userJoinedGroups, setUserJoinedGroups] = useState([]);
  const [followStatus, setFollowStatus] = useState("none");
  const [selectedMessageForReport, setSelectedMessageForReport] = useState(null);
  const [isChatClosed, setIsChatClosed] = useState(group.chatStatus === "Kapalı");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  
  // 🎯 Meme Popup State
  const [activeMeme, setActiveMeme] = useState(null);

  const chatContainerRef = useRef(null);
  const fileInputRef = useRef(null);

  const [weatherAtmosphere, setWeatherAtmosphere] = useState(() =>
    getAtmosphereFromWeather(
      estimateWeatherFallback({ latitude: group.latitude, eventDate: group.eventDate })
    )
  );

  const isEventExpired = Boolean(
    group.eventDate &&
    (Date.now() - new Date(group.eventDate).getTime()) >= 24 * 60 * 60 * 1000
  );
  const chatLocked = isChatClosed || isEventExpired;

  useEffect(() => {
    let cancelled = false;
    fetchEventWeather({
      latitude: group.latitude,
      longitude: group.longitude,
      eventDate: group.eventDate,
    }).then((weather) => {
      if (!cancelled) setWeatherAtmosphere(getAtmosphereFromWeather(weather));
    });
    return () => { cancelled = true; };
  }, [group.id, group.latitude, group.longitude, group.eventDate]);

  useEffect(() => {
    if (group.chatStatus === "Kapalı" || isEventExpired) {
      alert("Bu etkinliğin sohbeti kapanmıştır. Anıları Anılar barından veya Tamamlanan Etkinlikler sekmesinden inceleyebilirsiniz.");
      onClose?.();
    }
  }, [group.id]);

  const checkCanUploadPhoto = () => {
    if (!group.eventDate) return false;
    const eventTime = new Date(group.eventDate).getTime();
    const now = new Date().getTime();
    const fifteenMinutes = 15 * 60 * 1000;
    return (now - eventTime) >= fifteenMinutes;
  };

  const handlePhotoIconClick = () => {
    if (!checkCanUploadPhoto()) {
      alert("Etkinlik tamamlandıktan 15 dk sonra paylaşıma açılacaktır.");
      return;
    }
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const scrollToBottom = () => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      scrollToBottom();
    }, 150);
    return () => clearTimeout(timer);
  }, [messages]);

  useEffect(() => {
    const unsubGroup = onSnapshot(doc(db, "groups", group.id), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setIsChatClosed(data.chatStatus === "Kapalı");
      }
    });

    const q = query(collection(db, "groups", group.id, "messages"), orderBy("createdAt", "asc"));
    const unsubMessages = onSnapshot(q, (snapshot) => {
      const list = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });
      setMessages(list);
    });

    return () => {
      unsubGroup();
      unsubMessages();
    };
  }, [group.id]);

  const fetchUserJoinedGroups = async (targetUid) => {
    try {
      const querySnapshot = await getDocs(collection(db, "groups"));
      const groupList = [];
      querySnapshot.forEach((docSnap) => {
        const gData = docSnap.data();
        if (
          gData.members && 
          gData.members.includes(targetUid) && 
          gData.status !== "Onay Bekliyor" && 
          gData.chatStatus !== "Kapalı"
        ) {
          groupList.push({ id: docSnap.id, ...gData });
        }
      });
      setUserJoinedGroups(groupList);
    } catch (err) {
      console.error("Kullanıcının katıldığı gruplar çekilemedi:", err);
    }
  };

  const openUserProfile = async (messageUser) => {
    try {
      const targetUid = messageUser.senderId;
      if (!targetUid) return;

      await fetchUserJoinedGroups(targetUid);

      const userRef = doc(db, "users", targetUid);
      const userSnap = await getDoc(userRef);

      if (auth.currentUser && auth.currentUser.uid !== targetUid) {
        const followingSnap = await getDoc(doc(db, "users", auth.currentUser.uid, "following", targetUid));
        if (followingSnap.exists()) {
          setFollowStatus("following");
        } else {
          setFollowStatus("none");
        }
      }

      if (userSnap.exists()) {
        const uData = userSnap.data();
        setSelectedUserForProfile({
          uid: targetUid,
          fullName: uData.fullName || messageUser.senderName,
          age: uData.age || messageUser.senderAge,
          gender: uData.gender || messageUser.senderGender,
          bio: uData.bio || messageUser.senderBio,
          photoUrl: uData.photoUrl || messageUser.senderPhoto,
          instagram: uData.instagram || "",
          showInsta: uData.showInsta ?? true,
          messageCount: uData.messageCount || messageUser.senderMessageCount || 0
        });
      }
    } catch (err) {
      console.error("Profil alınamadı:", err);
    }
  };

  const handleUploadEventPhoto = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingPhoto(true);

    const reader = new FileReader();
    reader.onload = async (uploadEvent) => {
      try {
        const originalBase64 = uploadEvent.target.result;
        await addDoc(collection(db, "event_photos"), {
          groupId: group.id,
          groupTitle: group.title,
          photoUrl: originalBase64,
          uploaderUid: auth.currentUser.uid,
          uploaderName: auth.currentUser.displayName || auth.currentUser.email?.split("@")[0] || "Gezgin",
          status: "pending",
          createdAt: new Date()
        });
        alert("Buluşma fotoğrafı orijinal kalitede moderatör onayına gönderildi! Onaylandıktan sonra Anılar kısmında görünür.");
      } catch (err) {
        alert("Fotoğraf yükleme hatası: " + err.message);
      } finally {
        setUploadingPhoto(false);
      }
    };
    reader.onerror = () => {
      alert("Dosya okunamadı.");
      setUploadingPhoto(false);
    };
    reader.readAsDataURL(file);
  };

  const handleSendFollow = async () => {
    if (!selectedUserForProfile?.uid) return;
    try {
      await sendFollowRequest(auth.currentUser, selectedUserForProfile.uid);
      setFollowStatus("requested");
      alert("Takip isteği gönderildi!");
    } catch (err) {
      alert("Hata: " + err.message);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (chatLocked) return alert("Bu etkinliğin sohbeti kapanmıştır. Mesaj gönderilemez.");
    if (!newMessage.trim()) return;

    try {
      const userRef = doc(db, "users", auth.currentUser.uid);
      const userDoc = await getDoc(userRef);
      const uData = userDoc.exists() ? userDoc.data() : {};

      await updateDoc(userRef, { messageCount: (uData.messageCount || 0) + 1 });

      await addDoc(collection(db, "groups", group.id, "messages"), {
        text: newMessage,
        senderId: auth.currentUser.uid,
        senderEmail: uData.email || "",
        senderName: uData.fullName || "Kullanıcı",
        senderAge: uData.age || "-",
        senderGender: uData.gender || "-",
        senderBio: uData.bio || "Biyografi yok.",
        senderPhoto: uData.photoUrl || "",
        senderInstagram: uData.instagram || "",
        senderShowInsta: uData.showInsta ?? true,
        senderMessageCount: uData.messageCount || 0,
        createdAt: new Date(),
      });
      setNewMessage("");
    } catch (err) {
      alert("Mesaj gönderilemedi: " + err.message);
    }
  };

  const handleToggleJoin = async () => {
    if (chatLocked && !isMember) {
      return alert("Bu etkinlik tamamlandığı için artık katılım alınmıyor.");
    }

    const groupRef = doc(db, "groups", group.id);
    try {
      if (isMember) {
        if (chatLocked) {
          return alert("Tamamlanan etkinliklerden ayrılamazsınız. Sohbet kapalıdır.");
        }
        await updateDoc(groupRef, {
          members: arrayRemove(auth.currentUser.uid),
          memberCount: Math.max(1, (group.memberCount || 1) - 1)
        });
        setIsMember(false);
      } else {
        const userSnap = await getDoc(doc(db, "users", auth.currentUser.uid));
        const userGender = userSnap.exists() ? (userSnap.data().gender || "") : "";
        const audience = group.genderAudience || "Herkese Açık";

        if (audience === "Sadece Kadınlara Özel" && userGender !== "Kadın") {
          return alert("Bu etkinlik sadece kadınlara özeldir.");
        }
        if (audience === "Sadece Erkeklere Özel" && userGender !== "Erkek") {
          return alert("Bu etkinlik sadece erkeklere özeldir.");
        }
        if (!userGender && audience !== "Herkese Açık") {
          return alert("Bu etkinliğe katılmak için profilinizde cinsiyet bilgisi zorunludur.");
        }

        await updateDoc(groupRef, {
          members: arrayUnion(auth.currentUser.uid),
          memberCount: (group.memberCount || 0) + 1
        });
        setIsMember(true);

        const randomMeme = memeList[Math.floor(Math.random() * memeList.length)];
        setActiveMeme(randomMeme);

        setTimeout(() => {
          setActiveMeme(null);
        }, 2000);
      }
    } catch (err) {
      alert("İşlem başarısız: " + err.message);
    }
  };

  const handleReportMessage = async () => {
    if (!selectedMessageForReport) return;
    try {
      await addDoc(collection(db, "reports"), {
        messageId: selectedMessageForReport.id || "bilinmiyor",
        messageText: selectedMessageForReport.text || "",
        reportedUserId: selectedMessageForReport.senderId || "bilinmiyor",
        reportedUserEmail: selectedMessageForReport.senderEmail || selectedMessageForReport.senderName || "Bilinmiyor",
        reportedBy: auth.currentUser.email || "Yönetici",
        groupId: group.id,
        groupTitle: group.title || "Grup",
        status: "Bekliyor",
        createdAt: new Date(),
      });
      alert("Şikayet yönetime iletildi.");
      setSelectedMessageForReport(null);
    } catch (err) {
      alert("Hata: " + err.message);
    }
  };

  const formattedDate = group.eventDate ? new Date(group.eventDate).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }) : 'Belirtilmedi';

  return (
    <div className="tb-chat tb-overlay fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4">
      {/* 🌤️ Hava Durumuna Göre Dinamik Atmosferik Arka Plan (Border ve Gölge Efekti) */}
      <div className={`bg-panel border-2 ${weatherAtmosphere.bgAtmosphere} w-full max-w-lg h-[90vh] rounded-2xl flex flex-col overflow-hidden shadow-2xl relative transition-all duration-500`}>
        
        {/* Üst Atmosferik Işık Parıltısı (Glow) */}
        <div className={`absolute top-0 left-0 right-0 h-24 bg-gradient-to-b ${weatherAtmosphere.glowColor} to-transparent pointer-events-none`} />

        {/* Header */}
        <div className="p-3.5 bg-panel/90 border-b border-line flex justify-between items-center shrink-0 z-10">
          <div>
            <div className="flex items-center space-x-1.5">
              <h3 className="font-bold text-sm text-brand">{group.title} {isChatClosed && <span className="text-rose-500 font-bold">(KAPALI)</span>}</h3>
              <span className="text-[11px] bg-inset text-muted px-1.5 py-0.5 rounded border border-line">
                🌤️ {weatherAtmosphere.text} {weatherAtmosphere.temp}
              </span>
            </div>
            <p className="text-[12px] text-muted mt-0.5">📅 {formattedDate} • 👤 {group.memberCount || 1} Katılımcı</p>
            {group.locationAddress && (
              <p className="text-[11px] text-muted mt-0.5">📍 {group.locationAddress}</p>
            )}
          </div>
          <div className="flex items-center space-x-1.5">
            {group.latitude && group.longitude && onShowOnMap && !chatLocked && (
              <button
                onClick={() => onShowOnMap(group)}
                className="px-2 py-1 bg-blue-600/20 hover:bg-blue-600 text-brand hover:text-white border border-blue-500/30 rounded-xl text-[11px] font-bold transition cursor-pointer flex items-center space-x-1"
                title="Haritada Göster"
              >
                <span>🗺️️ Harita</span>
              </button>
            )}

            {!chatLocked && (
              <button
                onClick={handleToggleJoin}
                className={`px-3 py-1 rounded-xl text-[12px] font-semibold transition cursor-pointer ${
                  isMember ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'bg-blue-600 text-white hover:bg-blue-500'
                }`}
              >
                {isMember ? "Ayrıl" : "Katıl"}
              </button>
            )}
            <button onClick={onClose} className="text-muted hover:text-white text-sm px-2 cursor-pointer">✕</button>
          </div>
        </div>

        {/* Grup Bilgi */}
        <div className="p-3 bg-inset/40 border-b border-line shrink-0 space-y-1 z-10">
          {group.imageUrl && (
            <div className="w-full h-28 rounded-lg overflow-hidden mb-2">
              <img 
                src={group.imageUrl} 
                className="w-full h-full object-cover" 
                onLoad={scrollToBottom} 
              />
            </div>
          )}
          <p className="text-[13px] text-muted">{group.desc}</p>
          {group.locationAddress && (
            <p className="text-[12px] text-brand font-medium">📍 {group.locationAddress}</p>
          )}
          {group.genderAudience && group.genderAudience !== "Herkese Açık" && (
            <p className="text-[11px] text-amber-400 font-semibold">{group.genderAudience}</p>
          )}
        </div>

        {!chatLocked && (
          <div className="px-3 py-2 bg-blue-500/10 border-b border-blue-500/20 shrink-0 z-10">
            <p className="text-[11px] text-brand leading-relaxed">
              💡 İpucu: Mesajı şikayet etmek için üzerine dokunabilirsiniz. Profil için kullanıcı adına dokunun.
            </p>
          </div>
        )}

        {/* Mesaj Akışı */}
        <div 
          ref={chatContainerRef} 
          className="flex-grow p-3 overflow-y-auto space-y-2.5 flex flex-col z-10"
        >
          {chatLocked ? (
            <p className="text-center text-[13px] text-muted my-auto px-4 leading-relaxed">
              Bu etkinlik tamamlandı. Eski sohbet arşivlendi; anıları Anılar barından veya Tamamlanan Etkinlikler sekmesinden inceleyebilirsiniz.
            </p>
          ) : messages.length === 0 ? (
            <p className="text-center text-[13px] text-muted my-auto">Henüz mesaj yazılmamış.</p>
          ) : (
            messages.map((m) => {
              const isMe = m.senderId === auth.currentUser?.uid;
              const senderTitle = getUserTitle(m.senderMessageCount || 0);
              return (
                <div key={m.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                  <span 
                    onClick={() => openUserProfile(m)}
                    className="text-[12px] font-bold text-brand mb-0.5 px-1 cursor-pointer hover:underline flex items-center space-x-1"
                  >
                    <span>{m.senderName || m.senderEmail}</span>
                    <span className="text-[11px] text-muted font-normal">({senderTitle.title})</span>
                  </span>
                  <div 
                    onClick={() => setSelectedMessageForReport(m)}
                    title="Şikayet için tıkla"
                    className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm cursor-pointer transition ${
                      isMe ? 'bg-blue-600 text-white rounded-br-none' : 'bg-inset text-ink rounded-bl-none border border-line/50'
                    }`}
                  >
                    {m.text}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Form veya Kapalı Alan */}
        {chatLocked ? (
          <div className="p-3 bg-rose-950/40 border-t border-rose-900/50 text-center text-[13px] text-rose-400 shrink-0 font-semibold z-10">
            🚫 Bu etkinliğin sohbeti kapanmıştır. Anıları üst bardan inceleyebilirsiniz.
          </div>
        ) : isMember ? (
          <form onSubmit={handleSendMessage} className="p-3 bg-panel border-t border-line flex items-center space-x-2 shrink-0 z-10">
            <button
              type="button"
              onClick={handlePhotoIconClick}
              className="p-2 bg-inset hover:bg-inset text-muted rounded-xl border border-line cursor-pointer transition text-sm shrink-0"
              title="Buluşma Anısı Paylaş"
            >
              📷
            </button>
            <input 
              ref={fileInputRef} 
              type="file" 
              accept="image/*" 
              onChange={handleUploadEventPhoto} 
              disabled={uploadingPhoto} 
              className="hidden" 
            />

            <input
              type="text"
              placeholder={uploadingPhoto ? "Fotoğraf yükleniyor..." : "Mesaj yaz..."}
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              className="flex-grow bg-inset border border-line rounded-xl px-3 py-2 text-sm text-ink focus:outline-none focus:border-blue-500"
            />
            <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-sm font-semibold cursor-pointer">Gönder</button>
          </form>
        ) : (
          <div className="p-3 bg-panel border-t border-line text-center text-[13px] text-muted shrink-0 z-10">
            Mesaj yazmak için <span className="text-brand font-bold">"Katıl"</span>malısın.
          </div>
        )}

        {/* 🎯 BÜYÜTÜLMÜŞ MEME / EASTER EGG POPUP (2 Saniye Gösterilir) */}
        {activeMeme && (
          <div className="absolute inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fadeIn">
            <div className="bg-panel border-2 border-blue-500 rounded-3xl p-5 max-w-sm w-full flex flex-col items-center text-center space-y-4 shadow-2xl shadow-blue-600/50">
              <span className="text-sm sm:text-sm font-black text-brand tracking-wide bg-blue-500/20 px-4 py-2 rounded-2xl border border-blue-500/40">
                {activeMeme.text}
              </span>
              <div className="w-full h-72 rounded-2xl overflow-hidden border border-line bg-canvas flex items-center justify-center shadow-inner">
                <img src={activeMeme.img} className="w-full h-full object-contain" alt="Meme" />
              </div>
            </div>
          </div>
        )}

        {/* PROFİL KARTI MODALI */}
        {selectedUserForProfile && (
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-panel border border-line w-full max-w-xs rounded-2xl p-4 flex flex-col items-center text-center shadow-2xl space-y-3 max-h-[85vh] overflow-y-auto">
              <div className="w-16 h-16 rounded-full bg-blue-600/30 border-2 border-blue-500/50 flex items-center justify-center text-brand font-bold text-lg overflow-hidden shrink-0">
                {selectedUserForProfile.photoUrl ? (
                  <img src={selectedUserForProfile.photoUrl} className="w-full h-full object-cover" />
                ) : (
                  selectedUserForProfile.fullName?.charAt(0).toUpperCase() || "U"
                )}
              </div>
              <div>
                <h4 className="font-bold text-sm text-ink">{selectedUserForProfile.fullName} ({selectedUserForProfile.age || "-"})</h4>
                <p className="text-[12px] text-brand font-semibold mt-0.5">{getUserTitle(selectedUserForProfile.messageCount || 0).title}</p>
                <p className="text-[12px] text-muted">{selectedUserForProfile.gender || "-"}</p>
              </div>
              <p className="text-[13px] text-muted italic bg-inset/50 p-2 rounded-xl w-full">{selectedUserForProfile.bio || "Biyografi yok."}</p>

              {selectedUserForProfile.uid && selectedUserForProfile.uid !== auth.currentUser?.uid && (
                <div className="w-full">
                  {followStatus === "following" ? (
                    <div className="w-full py-1.5 bg-emerald-500/20 text-emerald-400 text-sm font-semibold rounded-xl border border-emerald-500/30">
                      ✓ Takip Ediyorsunuz
                    </div>
                  ) : followStatus === "requested" ? (
                    <div className="w-full py-1.5 bg-amber-500/20 text-amber-400 text-sm font-semibold rounded-xl border border-amber-500/30">
                      ⏳ İstek Gönderildi
                    </div>
                  ) : (
                    <button
                      onClick={handleSendFollow}
                      className="w-full py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl transition shadow-md shadow-blue-600/30 cursor-pointer"
                    >
                      Takip Et 👤
                    </button>
                  )}
                </div>
              )}

              <div className="w-full text-left space-y-1.5 pt-1 border-t border-line">
                <span className="text-[12px] text-brand font-bold block">
                  Katıldığı Etkinlikler ({userJoinedGroups.length})
                </span>
                {userJoinedGroups.length === 0 ? (
                  <p className="text-[11px] text-muted">Katıldığı aktif etkinlik bulunmuyor.</p>
                ) : (
                  <div className="space-y-1 max-h-28 overflow-y-auto pr-1">
                    {userJoinedGroups.map((g) => (
                      <div
                        key={g.id}
                        onClick={() => {
                          setSelectedUserForProfile(null);
                          if (onSwitchGroup) onSwitchGroup(g);
                        }}
                        className="p-1.5 rounded-lg bg-inset/70 hover:bg-blue-950/60 border border-line/60 hover:border-blue-500/50 flex items-center justify-between transition cursor-pointer"
                      >
                        <span className="text-[12px] text-ink font-medium truncate">{g.title}</span>
                        <span className="text-[11px] bg-blue-500/20 text-brand px-1.5 py-0.5 rounded border border-blue-500/30 shrink-0 ml-1">Sohbete Git →</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {selectedUserForProfile.showInsta !== false && selectedUserForProfile.instagram && (
                <a 
                  href={`https://instagram.com/${selectedUserForProfile.instagram}`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-[13px] text-brand hover:underline font-semibold block pt-1"
                >
                  📸 @{selectedUserForProfile.instagram}
                </a>
              )}

              <button onClick={() => setSelectedUserForProfile(null)} className="w-full bg-inset hover:bg-inset text-ink text-sm py-1.5 rounded-xl font-semibold transition cursor-pointer">Kapat</button>
            </div>
          </div>
        )}

        {/* ŞİKAYET MODALI */}
        {selectedMessageForReport && (
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-panel border border-line w-full max-w-xs rounded-2xl p-5 flex flex-col shadow-2xl space-y-3">
              <h4 className="font-bold text-sm text-rose-400">Mesajı Şikayet Et</h4>
              <p className="text-[12px] text-muted bg-inset p-2.5 rounded-xl italic">"{selectedMessageForReport.text}"</p>
              <button onClick={handleReportMessage} className="w-full bg-rose-600 text-white text-sm py-2 rounded-xl font-semibold cursor-pointer">Şikayet Et</button>
              <button onClick={() => setSelectedMessageForReport(null)} className="w-full bg-inset text-muted text-sm py-2 rounded-xl font-semibold cursor-pointer">İptal</button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}