"use client";
import { useState, useEffect } from "react";
import { collection, onSnapshot, query, where, doc, deleteDoc } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";

export default function StoriesBar() {
  const [stories, setStories] = useState([]);
  const [selectedStory, setSelectedStory] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "event_photos"), where("status", "==", "approved"));
    const unsub = onSnapshot(q, (snapshot) => {
      const list = [];
      const now = new Date().getTime();
      const SEVENTY_TWO_HOURS = 72 * 60 * 60 * 1000;

      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const createdAtTime = data.createdAt ? data.createdAt.toDate().getTime() : now;
        
        if (now - createdAtTime < SEVENTY_TWO_HOURS) {
          list.push({ id: docSnap.id, ...data });
        }
      });
      setStories(list);
    });

    return () => unsub();
  }, []);

  // 🎯 Kullanıcının Kendi Anısını Silme Fonksiyonu
  const handleDeleteMyStory = async (storyId) => {
    if (!confirm("Bu anıyı silmek istediğinize emin misiniz?")) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, "event_photos", storyId));
      setSelectedStory(null);
      alert("Anınız başarıyla silindi.");
    } catch (err) {
      alert("Silme hatası: " + err.message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="w-full bg-slate-900/60 border-b border-slate-800/80 p-2.5 overflow-x-auto shrink-0 min-h-[68px] flex items-center">
      <div className="flex space-x-3 items-center w-full">
        <span className="text-[10px] font-bold text-indigo-400 shrink-0 uppercase tracking-wider px-1 flex items-center gap-1">
          <span>📸</span> <span>Anılar</span>
        </span>

        {stories.length === 0 ? (
          <div className="text-[10px] text-slate-500 italic pl-2">
            Henüz paylaşılan bir anı bulunmuyor.
          </div>
        ) : (
          stories.map((s) => (
            <div
              key={s.id}
              onClick={() => setSelectedStory(s)}
              className="flex flex-col items-center space-y-1 shrink-0 cursor-pointer group"
            >
              <div className="w-11 h-11 rounded-full p-0.5 bg-gradient-to-tr from-amber-500 via-indigo-500 to-emerald-400 group-hover:scale-105 transition transform">
                <div className="w-full h-full rounded-full overflow-hidden border-2 border-slate-950 bg-slate-800">
                  <img src={s.photoUrl} className="w-full h-full object-cover" alt="Anı" />
                </div>
              </div>
              <span className="text-[8px] text-slate-300 font-medium truncate w-11 text-center">
                {s.uploaderName || "Gezgin"}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Story Pop-up Modal */}
      {selectedStory && (
        <div 
          onClick={() => setSelectedStory(null)}
          className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-4 cursor-pointer"
        >
          <div 
            onClick={(e) => e.stopPropagation()} 
            className="bg-slate-900 border border-slate-800 rounded-3xl p-4 max-w-xs w-full flex flex-col space-y-3 relative overflow-hidden shadow-2xl"
          >
            <div className="relative h-72 w-full rounded-2xl overflow-hidden border border-slate-800">
              <img src={selectedStory.photoUrl} className="w-full h-full object-cover" alt="Detay" />
              <div className="absolute top-2 left-2 bg-slate-950/80 backdrop-blur-md px-2.5 py-1 rounded-lg text-[9px] font-bold text-indigo-300">
                📍 {selectedStory.groupTitle || "Buluşma Anısı"}
              </div>
            </div>

            <div className="text-center">
              <h4 className="font-bold text-xs text-slate-100">Paylaşan: {selectedStory.uploaderName}</h4>
              <p className="text-[10px] text-slate-400 mt-0.5">Etkinlik buluşma kanıtı</p>
            </div>

            {/* 🎯 Sadece Anıyı Yükleyen Kişiye Görünen Sil Butonu */}
            {auth.currentUser && auth.currentUser.uid === selectedStory.uploaderUid && (
              <button
                onClick={() => handleDeleteMyStory(selectedStory.id)}
                disabled={deleting}
                className="w-full py-2 bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                {deleting ? "Siliniyor..." : "Anımı Sil 🗑️"}
              </button>
            )}

            <button 
              onClick={() => setSelectedStory(null)}
              className="w-full py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition cursor-pointer"
            >
              Kapat
            </button>
          </div>
        </div>
      )}
    </div>
  );
}