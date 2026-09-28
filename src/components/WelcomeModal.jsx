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
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-sm rounded-3xl p-6 flex flex-col shadow-2xl space-y-5 text-center relative overflow-hidden">
        
        {/* Arka Plan Glow Efekti */}
        <div className="absolute -top-12 -left-12 w-32 h-32 bg-indigo-600/20 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute -bottom-12 -right-12 w-32 h-32 bg-indigo-500/20 rounded-full blur-2xl pointer-events-none" />

        {/* Rozet / İkon */}
        <div className="w-16 h-16 bg-gradient-to-tr from-indigo-600 to-indigo-400 rounded-2xl mx-auto flex items-center justify-center text-3xl shadow-lg shadow-indigo-600/30 transform hover:rotate-6 transition duration-300">
          🚀
        </div>

        {/* Başlık ve Karşılama */}
        <div className="space-y-1">
          <h2 className="text-lg font-black text-slate-100">
            Aramıza Hoş Geldin, <span className="text-indigo-400">{firstName}</span>!
          </h2>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            TripBFF ile çevrendeki insanlarla tanışmaya ve yeni maceralara atılmaya hazırsın.
          </p>
        </div>

        {/* Amaç ve Kurallar Kartları */}
        <div className="space-y-2 text-left">
          <div className="bg-slate-800/60 border border-slate-700/60 p-2.5 rounded-xl flex items-start space-x-3">
            <span className="text-base bg-indigo-500/20 p-1.5 rounded-lg border border-indigo-500/30">🗺️</span>
            <div>
              <h4 className="text-[11px] font-bold text-indigo-300">Haritada Keşfet</h4>
              <p className="text-[9px] text-slate-400">Yakınındaki aktif etkinlikleri canlı haritadan incele.</p>
            </div>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/60 p-2.5 rounded-xl flex items-start space-x-3">
            <span className="text-base bg-emerald-500/20 p-1.5 rounded-lg border border-emerald-500/30">💬</span>
            <div>
              <h4 className="text-[11px] font-bold text-emerald-300">Gruplara Katıl & Mesajlaş</h4>
              <p className="text-[9px] text-slate-400">Etkinlik sohbetlerine katılarak detayları planla.</p>
            </div>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/60 p-2.5 rounded-xl flex items-start space-x-3">
            <span className="text-base bg-amber-500/20 p-1.5 rounded-lg border border-amber-500/30">🤝</span>
            <div>
              <h4 className="text-[11px] font-bold text-amber-300">Saygılı ve Güvenli Ol</h4>
              <p className="text-[9px] text-slate-400">Topluluk kurallarına uy, keyifli anların tadını çıkar.</p>
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
            className="w-3.5 h-3.5 accent-indigo-600 rounded cursor-pointer"
          />
          <label htmlFor="dontShow" className="text-[10px] text-slate-400 cursor-pointer select-none">
            Bu karşılama ekranını bir daha gösterme
          </label>
        </div>

        {/* Aksiyon Butonu */}
        <button
          onClick={handleStart}
          className="w-full py-3 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-600/30 transition transform active:scale-95 cursor-pointer"
        >
          Keşfetmeye Başla ✨
        </button>

      </div>
    </div>
  );
}