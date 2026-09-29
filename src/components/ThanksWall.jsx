"use client";
import { useState, useEffect } from "react";
import { db, auth } from "@/lib/firebase";
import { collection, addDoc, query, orderBy, onSnapshot } from "firebase/firestore";

export default function ThanksWall({ groupId, members = [], authorName = "Gezgin", isDarkMode = true }) {
  const [notes, setNotes] = useState([]);
  const [text, setText] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [sending, setSending] = useState(false);

  const uid = auth.currentUser?.uid;
  const isMember = Boolean(uid && members?.includes(uid));

  useEffect(() => {
    if (!groupId) return;
    const q = query(collection(db, "groups", groupId, "thanks"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list = [];
        snapshot.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...docSnap.data() });
        });
        setNotes(list);
      },
      (err) => {
        console.error("Teşekkür duvarı dinlenemedi:", err);
      }
    );
    return () => unsub();
  }, [groupId]);

  const handleSend = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isMember) {
      return alert("Teşekkür bırakmak için bu etkinliğin katılımcısı olmalısın.");
    }
    const trimmed = text.trim();
    if (!trimmed) return;
    if (trimmed.length > 180) {
      return alert("Not en fazla 180 karakter olabilir.");
    }

    setSending(true);
    try {
      await addDoc(collection(db, "groups", groupId, "thanks"), {
        text: trimmed,
        authorUid: uid,
        authorName: isAnonymous ? "Anonim Yoldaş" : (authorName || "Gezgin"),
        isAnonymous: Boolean(isAnonymous),
        createdAt: new Date(),
      });
      setText("");
      setIsAnonymous(false);
    } catch (err) {
      alert("Not gönderilemedi: " + err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className={`tb-thanks-wall mt-2 pt-2 border-t ${isDarkMode ? "border-line/70" : "border-line"} space-y-2`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-2">
        <h5 className="text-[12px] font-bold text-brand flex items-center gap-1">
          <span>💌</span>
          <span>Yoldaştan Teşekkürler</span>
        </h5>
        <span className="text-[10px] text-muted">{notes.length} not</span>
      </div>

      <div className="space-y-1.5 max-h-36 overflow-y-auto pr-0.5">
        {notes.length === 0 ? (
          <p className="text-[11px] text-muted italic">Henüz teşekkür notu yok. İlk notu sen bırak!</p>
        ) : (
          notes.map((n) => (
            <div
              key={n.id}
              className={`rounded-xl px-2.5 py-1.5 border text-[12px] ${
                isDarkMode ? "bg-inset/50 border-line/60" : "bg-canvas border-line"
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-0.5">
                <span className={`font-semibold ${n.isAnonymous ? "text-muted" : "text-brand"}`}>
                  {n.isAnonymous ? "🙈 Anonim Yoldaş" : (n.authorName || "Gezgin")}
                </span>
                <span className="text-[10px] text-muted shrink-0">
                  {n.createdAt?.toDate
                    ? n.createdAt.toDate().toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" })
                    : n.createdAt instanceof Date
                      ? n.createdAt.toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" })
                      : ""}
                </span>
              </div>
              <p className="text-ink leading-relaxed">{n.text}</p>
            </div>
          ))
        )}
      </div>

      {isMember ? (
        <form onSubmit={handleSend} className="space-y-1.5 pt-0.5">
          <textarea
            rows={2}
            value={text}
            maxLength={180}
            onChange={(e) => setText(e.target.value)}
            placeholder='Örn: "Bugünkü sürüş çok iyiydi, teşekkürler kanka!"'
            className={`w-full border rounded-xl px-2.5 py-1.5 text-[12px] resize-none focus:outline-none focus:border-blue-500 ${
              isDarkMode ? "bg-inset border-line text-ink" : "bg-canvas border-line text-ink"
            }`}
          />
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-1.5 text-[11px] text-muted cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isAnonymous}
                onChange={(e) => setIsAnonymous(e.target.checked)}
                className="w-3.5 h-3.5 accent-blue-600 rounded cursor-pointer"
              />
              Anonim bırak
            </label>
            <button
              type="submit"
              disabled={sending || !text.trim()}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold rounded-lg transition cursor-pointer disabled:opacity-50"
            >
              {sending ? "Gönderiliyor..." : "Not Bırak"}
            </button>
          </div>
        </form>
      ) : (
        <p className="text-[11px] text-muted italic">Not bırakmak için bu etkinliğe katılmış olmalısın.</p>
      )}
    </div>
  );
}
