"use client";
import { useState, useEffect, useRef } from "react";
import { db, auth } from "@/lib/firebase";
import { collection, addDoc, query, orderBy, onSnapshot, doc, updateDoc, arrayUnion, arrayRemove, getDoc } from "firebase/firestore";
import { getUserTitle } from "@/app/dashboard/page";
import { sendFollowRequest } from "@/lib/followService";

export default function ChatModal({ group, onClose }) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [isMember, setIsMember] = useState(group.members?.includes(auth.currentUser.uid));
  const [selectedUserForProfile, setSelectedUserForProfile] = useState(null);
  const [followStatus, setFollowStatus] = useState("none"); // "none", "requested", "following"
  const [selectedMessageForReport, setSelectedMessageForReport] = useState(null);
  const [isChatClosed, setIsChatClosed] = useState(group.chatStatus === "Kapalı");
  const messagesEndRef = useRef(null);

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
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    });

    return () => {
      unsubGroup();
      unsubMessages();
    };
  }, [group.id]);

  // ChatModal.jsx içinde openUserProfile fonksiyonuna katıldığı grupları ekleme:
const openUserProfile = async (messageUser) => {
  try {
    const targetUid = messageUser.senderId;
    if (!targetUid) return;

    // Kullanıcının katıldığı grupları bul
    const userGroups = group ? [group] : []; // veya Firestore groups koleksiyonundan üyeliği çek

    const userRef = doc(db, "users", targetUid);
    const userSnap = await getDoc(userRef);

    // Takip Durum Kontrolü...
    if (auth.currentUser && auth.currentUser.uid !== targetUid) {
      const followingSnap = await getDoc(doc(db, "users", auth.currentUser.uid, "following", targetUid));
      setFollowStatus(followingSnap.exists() ? "following" : "none");
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
        messageCount: uData.messageCount || 0
      });
    }
  } catch (err) {
    console.error("Profil yüklenemedi:", err);
  }
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
          <div className="flex items-center space-x-2">
            <button
              onClick={handleToggleJoin}
              className={`px-3 py-1 rounded-xl text-[10px] font-semibold transition ${
                isMember ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'bg-indigo-600 text-white hover:bg-indigo-500'
              }`}
            >
              {isMember ? "Ayrıl" : "Katıl"}
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-white text-xs px-2">✕</button>
          </div>
        </div>

        {/* Grup Bilgi */}
        <div className="p-3 bg-slate-800/40 border-b border-slate-800 shrink-0 space-y-1">
          {group.imageUrl && <div className="w-full h-28 rounded-lg overflow-hidden mb-2"><img src={group.imageUrl} className="w-full h-full object-cover" /></div>}
          <p className="text-[11px] text-slate-300">{group.desc}</p>
        </div>

        {/* Mesaj Akışı */}
        <div className="flex-grow p-3 overflow-y-auto space-y-2.5 flex flex-col">
          {messages.length === 0 ? (
            <p className="text-center text-[11px] text-slate-500 my-auto">Henüz mesaj yazılmamış.</p>
          ) : (
            messages.map((m) => {
              const isMe = m.senderId === auth.currentUser.uid;
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
          <div ref={messagesEndRef} />
        </div>

        {/* Mesaj Formu veya Kapalı Uyarısı */}
        {isChatClosed ? (
          <div className="p-3 bg-rose-950/40 border-t border-rose-900/50 text-center text-[11px] text-rose-400 shrink-0 font-semibold">
            🚫 Bu grubun sohbeti moderatör tarafından kapatılmıştır.
          </div>
        ) : isMember ? (
          <form onSubmit={handleSendMessage} className="p-3 bg-slate-900 border-t border-slate-800 flex space-x-2 shrink-0">
            <input
              type="text"
              placeholder="Mesaj yaz..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              className="flex-grow bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            />
            <button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-xs font-semibold">Gönder</button>
          </form>
        ) : (
          <div className="p-3 bg-slate-900 border-t border-slate-800 text-center text-[11px] text-slate-400 shrink-0">
            Mesaj yazmak için <span className="text-indigo-400 font-bold">"Katıl"</span>malısın.
          </div>
        )}

        {/* PROFİL KARTI MODALI */}
        {selectedUserForProfile && (
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 w-full max-w-xs rounded-2xl p-5 flex flex-col items-center text-center shadow-2xl space-y-3">
              <div className="w-16 h-16 rounded-full bg-indigo-600/30 border-2 border-indigo-500/50 flex items-center justify-center text-indigo-300 font-bold text-lg overflow-hidden">
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

              {/* Takip Et Butonu (Kendisi değilse) */}
              {selectedUserForProfile.uid && selectedUserForProfile.uid !== auth.currentUser.uid && (
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
                      className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl transition shadow-md shadow-indigo-600/30"
                    >
                      Takip Et 👤
                    </button>
                  )}
                </div>
              )}

              {/* Gerçek Zamanlı Instagram Gizlilik Kontrolü */}
              {selectedUserForProfile.showInsta !== false && selectedUserForProfile.instagram && (
                <a 
                  href={`https://instagram.com/${selectedUserForProfile.instagram}`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-[11px] text-indigo-400 hover:underline font-semibold"
                >
                  📸 @{selectedUserForProfile.instagram}
                </a>
              )}

              <button onClick={() => setSelectedUserForProfile(null)} className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs py-1.5 rounded-xl font-semibold transition">Kapat</button>
            </div>
          </div>
        )}

        {/* ŞİKAYET MODALI */}
        {selectedMessageForReport && (
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 w-full max-w-xs rounded-2xl p-5 flex flex-col shadow-2xl space-y-3">
              <h4 className="font-bold text-xs text-rose-400">Mesajı Şikayet Et</h4>
              <p className="text-[10px] text-slate-300 bg-slate-800 p-2.5 rounded-xl italic">"{selectedMessageForReport.text}"</p>
              <button onClick={handleReportMessage} className="w-full bg-rose-600 text-white text-xs py-2 rounded-xl font-semibold">Şikayet Et</button>
              <button onClick={() => setSelectedMessageForReport(null)} className="w-full bg-slate-800 text-slate-300 text-xs py-2 rounded-xl font-semibold">İptal</button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}