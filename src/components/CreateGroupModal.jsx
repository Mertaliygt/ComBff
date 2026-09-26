"use client";
import { useState, useRef, useEffect } from "react";
import { db, auth } from "@/lib/firebase";
import { collection, addDoc } from "firebase/firestore";
import { resizeAndConvertImage } from "@/utils/imageHelper";

export default function CreateGroupModal({ onClose }) {
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [category, setCategory] = useState("Genel");
  const [eventDate, setEventDate] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);
  const [lat, setLat] = useState(40.9923);
  const [lng, setLng] = useState(29.0294);

  useEffect(() => {
    if (typeof window === "undefined") return;

    import("leaflet").then((L) => {
      if (!mapInstanceRef.current && mapRef.current) {
        const map = L.map(mapRef.current).setView([40.9923, 29.0294], 13);
        mapInstanceRef.current = map;

        L.tileLayer('https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}', {
          maxZoom: 20,
          subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        }).addTo(map);

        // Varsayılan ikon hatasını önlemek için özel HTML pin kullanıyoruz
        const customIcon = L.divIcon({
          className: 'custom-pin',
          html: '<div style="background:#6366f1;width:16px;height:16px;border-radius:50%;border:2px solid white;box-shadow:0 0 10px rgba(99,102,241,0.8);"></div>',
          iconSize: [16, 16],
          iconAnchor: [8, 8]
        });

        const marker = L.marker([40.9923, 29.0294], { draggable: true, icon: customIcon }).addTo(map);
        markerRef.current = marker;

        marker.on('dragend', (e) => {
          const pos = e.target.getLatLng();
          setLat(pos.lat);
          setLng(pos.lng);
        });

        map.on('click', (e) => {
          marker.setLatLng(e.latlng);
          setLat(e.latlng.lat);
          setLng(e.latlng.lng);
        });
      }
    });
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title || !desc || !eventDate) return alert("Lütfen zorunlu alanları doldurun.");

    setLoading(true);
    try {
      let imageUrl = "";
      if (imageFile) {
        imageUrl = await resizeAndConvertImage(imageFile, 600, 600, 0.7);
      }

      await addDoc(collection(db, "groups"), {
        title,
        desc,
        category,
        eventDate,
        latitude: lat,
        longitude: lng,
        imageUrl,
        creatorId: auth.currentUser.uid,
        creatorEmail: auth.currentUser.email,
        status: "Onay Bekliyor", // Moderatör onay sistemi
        memberCount: 1,
        createdAt: new Date(),
      });

      alert("Etkinlik başarıyla oluşturuldu, onay bekleniyor!");
      onClose();
    } catch (err) {
      alert("Hata: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl p-5 space-y-4 shadow-2xl my-auto">
        <div className="flex justify-between items-center border-b border-slate-800 pb-3">
          <h3 className="font-bold text-sm text-indigo-400">Yeni Etkinlik / Grup Oluştur</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xs">✕ İptal</button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col space-y-3">
          <input
            type="text"
            placeholder="Etkinlik Başlığı"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
          />
          <textarea
            placeholder="Açıklama"
            rows="2"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 resize-none"
          />
          <div className="flex space-x-2">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-1/2 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
            >
              <option value="Genel">Genel</option>
              <option value="Yemek / İçki">Yemek / İçki</option>
              <option value="Konser / Müzik">Konser / Müzik</option>
              <option value="Gezi / Seyahat">Gezi / Seyahat</option>
              <option value="Spor">Spor</option>
            </select>
            <input
              type="datetime-local"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className="w-1/2 bg-slate-800 border border-slate-700 rounded-xl px-2 py-2 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex flex-col space-y-1">
            <label className="text-[10px] text-slate-400 font-medium">Haritadan Konum Seç (Pin'i sürükleyebilirsin)</label>
            <div ref={mapRef} className="w-full h-36 rounded-xl border border-slate-700 overflow-hidden z-0" />
          </div>

          <div className="flex flex-col space-y-1">
            <label className="text-[10px] text-slate-400 font-medium">Etkinlik Görseli</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setImageFile(e.target.files[0])}
              className="text-[10px] text-slate-400 file:mr-3 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-[10px] file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-500 cursor-pointer"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2.5 rounded-xl text-xs transition shadow-lg shadow-indigo-600/30 disabled:opacity-50"
          >
            {loading ? "Oluşturuluyor..." : "Etkinliği Oluştur"}
          </button>
        </form>
      </div>
    </div>
  );
}