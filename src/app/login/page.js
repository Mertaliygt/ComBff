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
  const [gender, setGender] = useState("");
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
        if (!gender) {
          return alert("Lütfen cinsiyet seçin. Cinsiyet bilgisi zorunludur.");
        }
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
    return <div className="min-h-screen bg-canvas text-ink flex items-center justify-center text-sm">Yükleniyor...</div>;
  }

  // ONAY BEKLİYOR EKRANI (Bekleme Sayfası)
  if (pendingApprovalUser) {
    return (
      <div className="tb-auth min-h-screen bg-canvas text-ink flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-panel border border-line rounded-3xl p-6 sm:p-8 shadow-2xl flex flex-col items-center text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-2xl animate-pulse">
            ⏳
          </div>
          <div className="space-y-1">
            <h3 className="font-bold text-base text-ink">Hesabınız Onay Bekliyor</h3>
            <p className="text-[13px] text-muted">
              Başvurunuz moderatörler tarafından inceleniyor. Onaylandığında sisteme otomatik olarak giriş yapabileceksiniz.
            </p>
          </div>
          <button 
            onClick={() => signOut(auth).then(() => setPendingApprovalUser(null))}
            className="w-full py-2.5 bg-inset hover:bg-inset text-ink font-semibold rounded-xl text-sm transition border border-line"
          >
            Çıkış Yap
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="tb-auth min-h-screen bg-canvas text-ink flex items-center justify-center p-4">
      <div className="tb-auth-card w-full max-w-md bg-panel border border-line rounded-3xl p-6 sm:p-8 shadow-2xl flex flex-col space-y-5">
        
        <div className="text-center space-y-1">
          <h2 className="text-2xl font-black text-brand tracking-wider">TRIPBFF</h2>
          <p className="text-sm text-muted">{isLogin ? "Etkinlikler ve yeni arkadaşlar keşfet" : "Yeni hesap oluştur ve onaya gönder"}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {!isLogin && (
            <>
              <div>
                <input type="text" placeholder="Ad Soyad" required value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full bg-inset/80 border border-line/80 rounded-xl px-3.5 py-2.5 text-sm text-ink focus:outline-none focus:border-blue-500" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <input type="number" placeholder="Yaş" required value={age} onChange={(e) => setAge(e.target.value)} className="w-full bg-inset/80 border border-line/80 rounded-xl px-3.5 py-2.5 text-sm text-ink focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <select required value={gender} onChange={(e) => setGender(e.target.value)} className="w-full bg-inset/80 border border-line/80 rounded-xl px-3.5 py-2.5 text-sm text-ink focus:outline-none focus:border-blue-500">
                    <option value="" disabled>Cinsiyet (zorunlu)</option>
                    <option value="Erkek">Erkek</option>
                    <option value="Kadın">Kadın</option>
                    <option value="Diğer">Diğer</option>
                  </select>
                </div>
              </div>
              <div>
                <input type="text" placeholder="Instagram Hesabı Beyanı (Örn: kullanici_adi)" required value={instagram} onChange={(e) => setInstagram(e.target.value)} className="w-full bg-inset/80 border border-line/80 rounded-xl px-3.5 py-2.5 text-sm text-ink focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <textarea placeholder="Biyografi / Kendinden Bahset" rows="2" value={bio} onChange={(e) => setBio(e.target.value)} className="w-full bg-inset/80 border border-line/80 rounded-xl px-3.5 py-2 text-sm text-ink focus:outline-none focus:border-blue-500 resize-none" />
              </div>
            </>
          )}

          <div>
            <input type="email" placeholder="E-posta Adresi" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full bg-inset/80 border border-line/80 rounded-xl px-3.5 py-2.5 text-sm text-ink focus:outline-none focus:border-blue-500" />
          </div>

          <div>
            <input type="password" placeholder="Şifre" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-inset/80 border border-line/80 rounded-xl px-3.5 py-2.5 text-sm text-ink focus:outline-none focus:border-blue-500" />
          </div>

          {!isLogin && (
            <div className="flex flex-col space-y-1 pt-0.5">
              <label className="text-[12px] text-muted">Profil Fotoğrafı Seç (İsteğe bağlı)</label>
              <input type="file" accept="image/*" onChange={(e) => setPhotoFile(e.target.files[0])} className="text-[12px] text-muted file:mr-3 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-[12px] file:bg-blue-600 file:text-white cursor-pointer" />
            </div>
          )}

          <button type="submit" className="w-full py-3 bg-gradient-to-r from-blue-600 to-blue-600 hover:from-blue-500 hover:to-blue-500 text-white font-bold rounded-xl text-sm transition shadow-lg shadow-blue-600/30 mt-2">
            {isLogin ? "Giriş Yap" : "Kayıt Ol ve Onaya Gönder"}
          </button>
        </form>

        <div className="text-center pt-1">
          <button onClick={() => setIsLogin(!isLogin)} className="text-[13px] text-brand hover:underline">
            {isLogin ? "Zaten hesabın yok mu? Kayıt Ol" : "Zaten hesabın var mı? Giriş Yap"}
          </button>
        </div>

      </div>
    </div>
  );
}