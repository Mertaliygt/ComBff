"use client";
import { useState, useEffect, useRef } from "react";
import { db, auth } from "@/lib/firebase";
import { collection, addDoc, query, orderBy, onSnapshot, doc, updateDoc, arrayUnion, arrayRemove, getDoc, getDocs } from "firebase/firestore";
import { getUserTitle } from "@/app/dashboard/page";
import { sendFollowRequest } from "@/lib/followService";

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

  // 🎯 FOTOĞRAF KALİTESİ DÜŞMEDEN ORİJİNAL OKuma (FileReader ile)
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
          photoUrl: originalBase64, // Orijinal, sıkıştırılmamış yüksek kaliteli görsel
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
    if (isChatClosed) return alert("Bu grubun sohbeti moderatör tarafından kapatılmıştır.");
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
    const groupRef = doc(db, "groups", group.id);
    try {
      if (isMember) {
        await updateDoc(groupRef, {
          members: arrayRemove(auth.currentUser.uid),
          memberCount: Math.max(1, (group.memberCount || 1) - 1)
        });
        setIsMember(false);
      } else {
        await updateDoc(groupRef, {
          members: arrayUnion(auth.currentUser.uid),
          memberCount: (group.memberCount || 0) + 1
        });
        setIsMember(true);

        // 🎯 Rastgele Meme Seç ve Göster
        const randomMeme = memeList[Math.floor(Math.random() * memeList.length)];
        setActiveMeme(randomMeme);

        // 🎯 Süre 2 Saniye (2000ms)
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
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-lg h-[90vh] rounded-2xl flex flex-col overflow-hidden shadow-2xl relative">
        
        {/* Header */}
        <div className="p-3.5 bg-slate-900/90 border-b border-slate-800 flex justify-between items-center shrink-0">
          <div>
            <h3 className="font-bold text-xs text-indigo-400">{group.title} {isChatClosed && <span className="text-rose-500 font-bold">(KAPALI)</span>}</h3>
            <p className="text-[10px] text-slate-400">📅 {formattedDate} • 👤 {group.memberCount || 1} Katılımcı</p>
          </div>
          <div className="flex items-center space-x-1.5">
            {group.latitude && group.longitude && onShowOnMap && (
              <button
                onClick={() => onShowOnMap(group)}
                className="px-2 py-1 bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/30 rounded-xl text-[9px] font-bold transition cursor-pointer flex items-center space-x-1"
                title="Haritada Göster"
              >
                <span>🗺️ Harita</span>
              </button>
            )}

            <button
              onClick={handleToggleJoin}
              className={`px-3 py-1 rounded-xl text-[10px] font-semibold transition cursor-pointer ${
                isMember ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'bg-indigo-600 text-white hover:bg-indigo-500'
              }`}
            >
              {isMember ? "Ayrıl" : "Katıl"}
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-white text-xs px-2 cursor-pointer">✕</button>
          </div>
        </div>

        {/* Grup Bilgi */}
        <div className="p-3 bg-slate-800/40 border-b border-slate-800 shrink-0 space-y-1">
          {group.imageUrl && (
            <div className="w-full h-28 rounded-lg overflow-hidden mb-2">
              <img 
                src={group.imageUrl} 
                className="w-full h-full object-cover" 
                onLoad={scrollToBottom} 
              />
            </div>
          )}
          <p className="text-[11px] text-slate-300">{group.desc}</p>
        </div>

        {/* Mesaj Akışı */}
        <div 
          ref={chatContainerRef} 
          className="flex-grow p-3 overflow-y-auto space-y-2.5 flex flex-col"
        >
          {messages.length === 0 ? (
            <p className="text-center text-[11px] text-slate-500 my-auto">Henüz mesaj yazılmamış.</p>
          ) : (
            messages.map((m) => {
              const isMe = m.senderId === auth.currentUser?.uid;
              const senderTitle = getUserTitle(m.senderMessageCount || 0);
              return (
                <div key={m.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                  <span 
                    onClick={() => openUserProfile(m)}
                    className="text-[10px] font-bold text-indigo-400 mb-0.5 px-1 cursor-pointer hover:underline flex items-center space-x-1"
                  >
                    <span>{m.senderName || m.senderEmail}</span>
                    <span className="text-[9px] text-slate-400 font-normal">({senderTitle.title})</span>
                  </span>
                  <div 
                    onClick={() => setSelectedMessageForReport(m)}
                    title="Şikayet için tıkla"
                    className={`max-w-[80%] rounded-2xl px-3 py-2 text-xs cursor-pointer transition ${
                      isMe ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-slate-800 text-slate-200 rounded-bl-none border border-slate-700/50'
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
        {isChatClosed ? (
          <div className="p-3 bg-rose-950/40 border-t border-rose-900/50 text-center text-[11px] text-rose-400 shrink-0 font-semibold">
            🚫 Bu grubun sohbeti moderatör tarafından kapatılmıştır.
          </div>
        ) : isMember ? (
          <form onSubmit={handleSendMessage} className="p-3 bg-slate-900 border-t border-slate-800 flex items-center space-x-2 shrink-0">
            <button
              type="button"
              onClick={handlePhotoIconClick}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 cursor-pointer transition text-xs shrink-0"
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
              className="flex-grow bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            />
            <button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer">Gönder</button>
          </form>
        ) : (
          <div className="p-3 bg-slate-900 border-t border-slate-800 text-center text-[11px] text-slate-400 shrink-0">
            Mesaj yazmak için <span className="text-indigo-400 font-bold">"Katıl"</span>malısın.
          </div>
        )}

        {/* 🎯 BÜYÜTÜLMÜŞ MEME / EASTER EGG POPUP (2 Saniye Gösterilir) */}
        {activeMeme && (
          <div className="absolute inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fadeIn">
            <div className="bg-slate-900 border-2 border-indigo-500 rounded-3xl p-5 max-w-sm w-full flex flex-col items-center text-center space-y-4 shadow-2xl shadow-indigo-600/50">
              <span className="text-xs sm:text-sm font-black text-indigo-300 tracking-wide bg-indigo-500/20 px-4 py-2 rounded-2xl border border-indigo-500/40">
                {activeMeme.text}
              </span>
              <div className="w-full h-72 rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 flex items-center justify-center shadow-inner">
                <img src={activeMeme.img} className="w-full h-full object-contain" alt="Meme" />
              </div>
            </div>
          </div>
        )}

        {/* PROFİL KARTI MODALI */}
        {selectedUserForProfile && (
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 w-full max-w-xs rounded-2xl p-4 flex flex-col items-center text-center shadow-2xl space-y-3 max-h-[85vh] overflow-y-auto">
              <div className="w-16 h-16 rounded-full bg-indigo-600/30 border-2 border-indigo-500/50 flex items-center justify-center text-indigo-300 font-bold text-lg overflow-hidden shrink-0">
                {selectedUserForProfile.photoUrl ? (
                  <img src={selectedUserForProfile.photoUrl} className="w-full h-full object-cover" />
                ) : (
                  selectedUserForProfile.fullName?.charAt(0).toUpperCase() || "U"
                )}
              </div>
              <div>
                <h4 className="font-bold text-sm text-slate-100">{selectedUserForProfile.fullName} ({selectedUserForProfile.age || "-"})</h4>
                <p className="text-[10px] text-indigo-400 font-semibold mt-0.5">{getUserTitle(selectedUserForProfile.messageCount || 0).title}</p>
                <p className="text-[10px] text-slate-400">{selectedUserForProfile.gender || "-"}</p>
              </div>
              <p className="text-[11px] text-slate-300 italic bg-slate-800/50 p-2 rounded-xl w-full">{selectedUserForProfile.bio || "Biyografi yok."}</p>

              {selectedUserForProfile.uid && selectedUserForProfile.uid !== auth.currentUser?.uid && (
                <div className="w-full">
                  {followStatus === "following" ? (
                    <div className="w-full py-1.5 bg-emerald-500/20 text-emerald-400 text-xs font-semibold rounded-xl border border-emerald-500/30">
                      ✓ Takip Ediyorsunuz
                    </div>
                  ) : followStatus === "requested" ? (
                    <div className="w-full py-1.5 bg-amber-500/20 text-amber-400 text-xs font-semibold rounded-xl border border-amber-500/30">
                      ⏳ İstek Gönderildi
                    </div>
                  ) : (
                    <button
                      onClick={handleSendFollow}
                      className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl transition shadow-md shadow-indigo-600/30 cursor-pointer"
                    >
                      Takip Et 👤
                    </button>
                  )}
                </div>
              )}

              <div className="w-full text-left space-y-1.5 pt-1 border-t border-slate-800">
                <span className="text-[10px] text-indigo-300 font-bold block">
                  Katıldığı Etkinlikler ({userJoinedGroups.length})
                </span>
                {userJoinedGroups.length === 0 ? (
                  <p className="text-[9px] text-slate-500">Katıldığı aktif etkinlik bulunmuyor.</p>
                ) : (
                  <div className="space-y-1 max-h-28 overflow-y-auto pr-1">
                    {userJoinedGroups.map((g) => (
                      <div
                        key={g.id}
                        onClick={() => {
                          setSelectedUserForProfile(null);
                          if (onSwitchGroup) onSwitchGroup(g);
                        }}
                        className="p-1.5 rounded-lg bg-slate-800/70 hover:bg-indigo-950/60 border border-slate-700/60 hover:border-indigo-500/50 flex items-center justify-between transition cursor-pointer"
                      >
                        <span className="text-[10px] text-slate-200 font-medium truncate">{g.title}</span>
                        <span className="text-[8px] bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-500/30 shrink-0 ml-1">Sohbete Git →</span>
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
                  className="text-[11px] text-indigo-400 hover:underline font-semibold block pt-1"
                >
                  📸 @{selectedUserForProfile.instagram}
                </a>
              )}

              <button onClick={() => setSelectedUserForProfile(null)} className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs py-1.5 rounded-xl font-semibold transition cursor-pointer">Kapat</button>
            </div>
          </div>
        )}

        {/* ŞİKAYET MODALI */}
        {selectedMessageForReport && (
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 w-full max-w-xs rounded-2xl p-5 flex flex-col shadow-2xl space-y-3">
              <h4 className="font-bold text-xs text-rose-400">Mesajı Şikayet Et</h4>
              <p className="text-[10px] text-slate-300 bg-slate-800 p-2.5 rounded-xl italic">"{selectedMessageForReport.text}"</p>
              <button onClick={handleReportMessage} className="w-full bg-rose-600 text-white text-xs py-2 rounded-xl font-semibold cursor-pointer">Şikayet Et</button>
              <button onClick={() => setSelectedMessageForReport(null)} className="w-full bg-slate-800 text-slate-300 text-xs py-2 rounded-xl font-semibold cursor-pointer">İptal</button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}