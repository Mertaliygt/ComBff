"use client";
import { useState, useEffect } from "react";
import { auth, db } from "@/lib/firebase";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { resizeAndConvertImage } from "@/utils/imageHelper";

export default function LoginPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("Erkek");
  const [instagram, setInstagram] = useState("");
  const [bio, setBio] = useState("");
  const [photoFile, setPhotoFile] = useState(null);
  
  const [pendingApprovalUser, setPendingApprovalUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const userDoc = await getDoc(doc(db, "users", user.uid));
          if (userDoc.exists()) {
            const data = userDoc.data();
            if (data.banned) {
              await signOut(auth);
              alert("Bu hesap banlanmıştır.");
              setLoading(false);
              return;
            }
            if (data.approved === false) {
              setPendingApprovalUser(user);
              setLoading(false);
              return;
            }
            router.push("/dashboard");
          }
        } catch (err) {
          console.error("Oturum kontrol hatası:", err);
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [router]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (isLogin) {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const userDoc = await getDoc(doc(db, "users", userCredential.user.uid));
        
        if (userDoc.exists()) {
          const data = userDoc.data();
          if (data.banned) {
            await signOut(auth);
            alert("Bu hesap banlanmıştır.");
            return;
          }
          if (data.approved === false) {
            setPendingApprovalUser(userCredential.user);
            return;
          }
        }
        router.push("/dashboard");
      } else {
        let photoUrl = "";
        if (photoFile) {
          photoUrl = await resizeAndConvertImage(photoFile, 300, 300, 0.7);
        }

        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const uid = userCredential.user.uid;

        // Statü 0 (approved: false) olarak kaydediliyor ve onaya düşüyor
        await setDoc(doc(db, "users", uid), {
          uid,
          email,
          fullName,
          age: Number(age),
          gender,
          instagram,
          bio: bio || "Yeni bir gezgin!",
          showInsta: true,
          photoUrl,
          role: "user",
          approved: false, 
          banned: false,
          messageCount: 0,
          createdAt: new Date()
        });

        setPendingApprovalUser(userCredential.user);
      }
    } catch (err) {
      alert("Hata: " + err.message);
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center text-xs">Yükleniyor...</div>;
  }

  // ONAY BEKLİYOR EKRANI (Bekleme Sayfası)
  if (pendingApprovalUser) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl flex flex-col items-center text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-2xl animate-pulse">
            ⏳
          </div>
          <div className="space-y-1">
            <h3 className="font-bold text-base text-slate-100">Hesabınız Onay Bekliyor</h3>
            <p className="text-[11px] text-slate-400">
              Başvurunuz moderatörler tarafından inceleniyor. Onaylandığında sisteme otomatik olarak giriş yapabileceksiniz.
            </p>
          </div>
          <button 
            onClick={() => signOut(auth).then(() => setPendingApprovalUser(null))}
            className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-xl text-xs transition border border-slate-700"
          >
            Çıkış Yap
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl flex flex-col space-y-5">
        
        <div className="text-center space-y-1">
          <h2 className="text-2xl font-black text-indigo-400 tracking-wider">TRIPBFF</h2>
          <p className="text-xs text-slate-400">{isLogin ? "Etkinlikler ve yeni arkadaşlar keşfet" : "Yeni hesap oluştur ve onaya gönder"}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {!isLogin && (
            <>
              <div>
                <input type="text" placeholder="Ad Soyad" required value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <input type="number" placeholder="Yaş" required value={age} onChange={(e) => setAge(e.target.value)} className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <select value={gender} onChange={(e) => setGender(e.target.value)} className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500">
                    <option value="Erkek">Erkek</option>
                    <option value="Kadın">Kadın</option>
                    <option value="Diğer">Diğer</option>
                  </select>
                </div>
              </div>
              <div>
                <input type="text" placeholder="Instagram Hesabı Beyanı (Örn: kullanici_adi)" required value={instagram} onChange={(e) => setInstagram(e.target.value)} className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500" />
              </div>
              <div>
                <textarea placeholder="Biyografi / Kendinden Bahset" rows="2" value={bio} onChange={(e) => setBio(e.target.value)} className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl px-3.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 resize-none" />
              </div>
            </>
          )}

          <div>
            <input type="email" placeholder="E-posta Adresi" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500" />
          </div>

          <div>
            <input type="password" placeholder="Şifre" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500" />
          </div>

          {!isLogin && (
            <div className="flex flex-col space-y-1 pt-0.5">
              <label className="text-[10px] text-slate-400">Profil Fotoğrafı Seç (İsteğe bağlı)</label>
              <input type="file" accept="image/*" onChange={(e) => setPhotoFile(e.target.files[0])} className="text-[10px] text-slate-400 file:mr-3 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-[10px] file:bg-indigo-600 file:text-white cursor-pointer" />
            </div>
          )}

          <button type="submit" className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold rounded-xl text-xs transition shadow-lg shadow-indigo-600/30 mt-2">
            {isLogin ? "Giriş Yap" : "Kayıt Ol ve Onaya Gönder"}
          </button>
        </form>

        <div className="text-center pt-1">
          <button onClick={() => setIsLogin(!isLogin)} className="text-[11px] text-indigo-400 hover:underline">
            {isLogin ? "Zaten hesabın yok mu? Kayıt Ol" : "Zaten hesabın var mı? Giriş Yap"}
          </button>
        </div>

      </div>
    </div>
  );
}