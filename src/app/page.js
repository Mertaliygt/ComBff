"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LandingPage() {
  const [fadeIn, setFadeIn] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // Sayfa açıldığında hafif bir animasyon tetiklemek için
    setTimeout(() => setFadeIn(true), 100);
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center overflow-hidden p-4">
      
      {/* Mobil Telefon Çerçevesi / Ana Konteyner */}
      <div className={`w-full max-w-md h-[90vh] max-h-[850px] bg-gradient-to-b from-slate-900 via-slate-950 to-slate-950 border border-slate-800/80 rounded-3xl flex flex-col justify-between p-6 sm:p-8 shadow-2xl relative overflow-hidden transition-all duration-1000 ${fadeIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
        
        {/* Arka Plan Hareketli Işık Efektleri */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none animate-pulse"></div>
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-purple-600/20 rounded-full blur-3xl pointer-events-none animate-pulse"></div>

        {/* Üst Kısım: Logo ve Rozet */}
        <div className="flex flex-col items-center text-center space-y-3 z-10 pt-4">
          <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 text-[10px] font-bold tracking-wider uppercase animate-bounce">
            <span>✨ Sosyal Harita & Etkinlik Ağı</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400">
            TRIPBFF
          </h1>
        </div>

        {/* Orta Kısım: Neden Bu Site Var? (Özellik Kartları) */}
        <div className="flex flex-col space-y-3.5 z-10 my-auto">
          <div className="text-center pb-1">
            <h2 className="text-xs font-bold text-slate-200">Yalnız Seyahat Etmeye Son!</h2>
            <p className="text-[10px] text-slate-400">Çevrendeki macera ortaklarını keşfet, etkinliklere katıl.</p>
          </div>

          {/* Kart 1 */}
          <div className="bg-slate-900/80 border border-slate-800/80 p-3 rounded-2xl flex items-center space-x-3 shadow-lg backdrop-blur-md transform transition hover:scale-[1.02]">
            <div className="w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 text-base shrink-0">
              🗺️
            </div>
            <div>
              <h3 className="font-bold text-xs text-slate-200">Konum Bazlı Harita</h3>
              <p className="text-[10px] text-slate-400">Yakınındaki aktif etkinlikleri ve rotaları anında gör.</p>
            </div>
          </div>

          {/* Kart 2 */}
          <div className="bg-slate-900/80 border border-slate-800/80 p-3 rounded-2xl flex items-center space-x-3 shadow-lg backdrop-blur-md transform transition hover:scale-[1.02]">
            <div className="w-9 h-9 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400 text-base shrink-0">
              💬
            </div>
            <div>
              <h3 className="font-bold text-xs text-slate-200">Güvenli Canlı Sohbet</h3>
              <p className="text-[10px] text-slate-400">Etkinlik gruplarında tanış, seviye atla, ünvan kazan.</p>
            </div>
          </div>

          {/* Kart 3 */}
          <div className="bg-slate-900/80 border border-slate-800/80 p-3 rounded-2xl flex items-center space-x-3 shadow-lg backdrop-blur-md transform transition hover:scale-[1.02]">
            <div className="w-9 h-9 rounded-xl bg-pink-600/20 border border-pink-500/30 flex items-center justify-center text-pink-400 text-base shrink-0">
              🛡️
            </div>
            <div>
              <h3 className="font-bold text-xs text-slate-200">Moderatör Koruması</h3>
              <p className="text-[10px] text-slate-400">Ön onaylı etkinlikler ve güvenli topluluk denetimi.</p>
            </div>
          </div>
        </div>

        {/* Alt Kısım: Hadi Başlayalım Butonu */}
        <div className="flex flex-col space-y-3 z-10 pb-4">
          <button
            type="button"
            onClick={() => router.push("/login")}
            className="w-full py-3.5 bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold rounded-2xl text-xs transition shadow-lg shadow-indigo-600/30 transform active:scale-95 flex items-center justify-center space-x-2 cursor-pointer"
          >
            <span>Hadi Başlayalım</span>
            <span className="text-sm">🚀</span>
          </button>
          <p className="text-[9px] text-center text-slate-500">
            TripBff Sosyal Macera Ağı © 2026
          </p>
        </div>

      </div>
    </div>
  );
}