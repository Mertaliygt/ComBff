"use client";
import { useState } from "react";

export default function WelcomeModal({ userName, onClose }) {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const handleStart = () => {
    if (dontShowAgain) {
      localStorage.setItem("tripbff_welcome_seen", "true");
    }
    onClose();
  };

  const firstName = userName ? userName.split(" ")[0] : "Gezgin";

  return (
    <div className="tb-welcome tb-overlay fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fadeIn">
      <div className="bg-panel border border-line w-full max-w-sm rounded-3xl p-6 flex flex-col shadow-2xl space-y-5 text-center relative overflow-hidden">
        
        {/* Arka Plan Glow Efekti */}
        <div className="absolute -top-12 -left-12 w-32 h-32 bg-blue-600/20 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute -bottom-12 -right-12 w-32 h-32 bg-blue-500/20 rounded-full blur-2xl pointer-events-none" />

        {/* Rozet / İkon */}
        <div className="w-16 h-16 bg-gradient-to-tr from-blue-600 to-blue-400 rounded-2xl mx-auto flex items-center justify-center text-3xl shadow-lg shadow-blue-600/30 transform hover:rotate-6 transition duration-300">
          🚀
        </div>

        {/* Başlık ve Karşılama */}
        <div className="space-y-1">
          <h2 className="text-lg font-black text-ink">
            Aramıza Hoş Geldin, <span className="text-brand">{firstName}</span>!
          </h2>
          <p className="text-[13px] text-muted leading-relaxed">
            TripBFF ile çevrendeki insanlarla tanışmaya ve yeni maceralara atılmaya hazırsın.
          </p>
        </div>

        {/* Amaç ve Kurallar Kartları */}
        <div className="space-y-2 text-left">
          <div className="bg-inset/60 border border-line/60 p-2.5 rounded-xl flex items-start space-x-3">
            <span className="text-base bg-blue-500/20 p-1.5 rounded-lg border border-blue-500/30">🗺️</span>
            <div>
              <h4 className="text-[13px] font-bold text-brand">Haritada Keşfet</h4>
              <p className="text-[11px] text-muted">Yakınındaki aktif etkinlikleri canlı haritadan incele.</p>
            </div>
          </div>

          <div className="bg-inset/60 border border-line/60 p-2.5 rounded-xl flex items-start space-x-3">
            <span className="text-base bg-emerald-500/20 p-1.5 rounded-lg border border-emerald-500/30">💬</span>
            <div>
              <h4 className="text-[13px] font-bold text-emerald-300">Gruplara Katıl & Mesajlaş</h4>
              <p className="text-[11px] text-muted">Etkinlik sohbetlerine katılarak detayları planla.</p>
            </div>
          </div>

          <div className="bg-inset/60 border border-line/60 p-2.5 rounded-xl flex items-start space-x-3">
            <span className="text-base bg-amber-500/20 p-1.5 rounded-lg border border-amber-500/30">🤝</span>
            <div>
              <h4 className="text-[13px] font-bold text-amber-300">Saygılı ve Güvenli Ol</h4>
              <p className="text-[11px] text-muted">Topluluk kurallarına uy, keyifli anların tadını çıkar.</p>
            </div>
          </div>
        </div>

        {/* Bir Daha Gösterme Kutusu */}
        <div className="flex items-center justify-center space-x-2 pt-1">
          <input
            type="checkbox"
            id="dontShow"
            checked={dontShowAgain}
            onChange={(e) => setDontShowAgain(e.target.checked)}
            className="w-3.5 h-3.5 accent-blue-600 rounded cursor-pointer"
          />
          <label htmlFor="dontShow" className="text-[12px] text-muted cursor-pointer select-none">
            Bu karşılama ekranını bir daha gösterme
          </label>
        </div>

        {/* Aksiyon Butonu */}
        <button
          onClick={handleStart}
          className="w-full py-3 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white text-sm font-bold rounded-xl shadow-lg shadow-blue-600/30 transition transform active:scale-95 cursor-pointer"
        >
          Keşfetmeye Başla ✨
        </button>

      </div>
    </div>
  );
}