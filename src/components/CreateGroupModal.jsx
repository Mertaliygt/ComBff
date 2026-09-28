"use client";
import { useState, useEffect } from "react";
import { db, auth } from "@/lib/firebase";
import { collection, addDoc } from "firebase/firestore";
import dynamic from "next/dynamic";
import { resizeAndConvertImage } from "@/utils/imageHelper";

const MapPicker = dynamic(() => import("@/components/MapPicker"), { 
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-full text-xs text-slate-400">Harita yükleniyor...</div>
});

export default function CreateGroupModal({ onClose }) {
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [category, setCategory] = useState("Yemek / İçki");
  const [eventDate, setEventDate] = useState("");
  const [location, setLocation] = useState({ lat: 41.0082, lng: 28.9784 });
  const [photoFile, setPhotoFile] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        () => {}
      );
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !desc.trim() || !eventDate) {
      return alert("Lütfen tüm zorunlu alanları doldurun.");
    }

    setLoading(true);
    try {
      let imageUrl = "";
      if (photoFile) {
        imageUrl = await resizeAndConvertImage(photoFile, 600, 600, 0.7);
      }

      await addDoc(collection(db, "groups"), {
        title: title.trim(),
        desc: desc.trim(),
        category,
        eventDate,
        latitude: location.lat,
        longitude: location.lng,
        imageUrl,
        createdBy: auth.currentUser?.uid || "anonim",
        members: [auth.currentUser?.uid || "anonim"],
        memberCount: 1,
        status: "Onay Bekliyor",
        chatStatus: "Açık",
        createdAt: new Date(),
      });

      alert("Etkinlik grubu oluşturuldu ve moderatör onayına gönderildi!");
      onClose();
    } catch (err) {
      alert("Hata: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-3">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-sm rounded-2xl p-4 flex flex-col space-y-3 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center border-b border-slate-800 pb-2">
          <h3 className="font-bold text-xs text-indigo-400">Yeni Etkinlik / Grup Oluştur</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xs cursor-pointer">✕ İptal</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-2.5">
          <input
            type="text"
            placeholder="Etkinlik Başlığı"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700/80 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
          />

          <textarea
            rows="2"
            placeholder="Etkinlik Açıklaması ve Detaylar"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700/80 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 resize-none"
          />

          <div className="grid grid-cols-2 gap-2">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="bg-slate-800 border border-slate-700/80 rounded-xl px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              <option value="Yemek / İçki">Yemek / İçki</option>
              <option value="Motor / Sürüş">Motor / Sürüş</option>
              <option value="Kamp / Doğa">Kamp / Doğa</option>
              <option value="Spor / Fitness">Spor / Fitness</option>
              <option value="Gezi / Şehir">Gezi / Şehir</option>
              <option value="Kahve / Sohbet">Kahve / Sohbet</option>
            </select>

            <input
              type="datetime-local"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className="bg-slate-800 border border-slate-700/80 rounded-xl px-2 py-1.5 text-[10px] text-slate-200 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] text-slate-400">Haritadan Konum Seç (Tıkla veya Pin'i Sürükle)</label>
            <div className="h-36 rounded-xl overflow-hidden border border-slate-700 relative">
              <MapPicker location={location} setLocation={setLocation} />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] text-slate-400">Etkinlik Görseli</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setPhotoFile(e.target.files[0])}
              className="text-[9px] text-slate-400 file:mr-2 file:py-1 file:px-2 file:rounded-lg file:border-0 file:text-[9px] file:bg-indigo-600 file:text-white cursor-pointer"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 rounded-xl text-xs transition shadow-lg shadow-indigo-600/30 cursor-pointer"
          >
            {loading ? "Oluşturuluyor..." : "Etkinliği Oluştur"}
          </button>
        </form>
      </div>
    </div>
  );
}