import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    getFirestore, 
    doc, 
    setDoc, 
    getDoc, 
    collection, 
    query, 
    where, 
    getDocs, 
    updateDoc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyBlt17y-JckKVV1dDMOx6-3nP65dT6yKRA",
    authDomain: "combff-52df7.firebaseapp.com",
    projectId: "combff-52df7",
    storageBucket: "combff-52df7.firebasestorage.app",
    messagingSenderId: "715897785866",
    appId: "1:715897785866:web:b59a5ce80e23995c2319f3",
    measurementId: "G-17R7YLT3NT"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- DOM ELEMENTLERİ ---
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const authBtn = document.getElementById('auth-btn');
const toggleModeBtn = document.getElementById('toggle-mode-btn');
const toggleText = document.getElementById('toggle-text');
const registerFields = document.getElementById('register-fields');

const fullNameInput = document.getElementById('fullName');
const ageInput = document.getElementById('age');
const genderSelect = document.getElementById('gender');
const bioInput = document.getElementById('bio');

const logoutBtnPending = document.getElementById('logout-btn-pending');
const logoutBtnMain = document.getElementById('logout-btn-main');

const openModPanelBtn = document.getElementById('open-mod-panel-btn');
const closeModPanelBtn = document.getElementById('close-mod-panel-btn');
const modModal = document.getElementById('mod-modal');
const pendingUsersContainer = document.getElementById('pending-users-container');

// Profil Alanları
const profileName = document.getElementById('profile-name');
const profileEmail = document.getElementById('profile-email');
const profileBio = document.getElementById('profile-bio');

let isRegisterMode = false;
let mapInstance = null;

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

// --- SEKME (TAB) GEÇİŞLERİ ---
const tabButtons = document.querySelectorAll('.tab-btn');
tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        const targetViewId = btn.getAttribute('data-target');

        // Sekme görünümlerini değiştir
        document.querySelectorAll('.tab-view').forEach(v => v.classList.remove('active'));
        document.getElementById(targetViewId).classList.add('active');

        // Buton renklerini güncelle
        tabButtons.forEach(b => {
            b.classList.remove('text-indigo-400');
            b.classList.add('text-slate-400');
        });
        btn.classList.remove('text-slate-400');
        btn.classList.add('text-indigo-400');

        // Eğer Harita sekmesine tıklandıysa ve harita henüz yüklenmediyse başlat
        if (targetViewId === 'view-map') {
            setTimeout(() => {
                initMap();
            }, 100);
        }
    });
});

// --- GİRİŞ / KAYIT MODU ---
toggleModeBtn.addEventListener('click', () => {
    isRegisterMode = !isRegisterMode;
    if (isRegisterMode) {
        registerFields.classList.remove('hidden');
        authBtn.textContent = 'Kayıt Ol ve Onaya Gönder';
        toggleText.textContent = 'Zaten hesabın var mı?';
        toggleModeBtn.textContent = 'Giriş Yap';
    } else {
        registerFields.classList.add('hidden');
        authBtn.textContent = 'Giriş Yap';
        toggleText.textContent = 'Hesabın yok mu?';
        toggleModeBtn.textContent = 'Kayıt Ol';
    }
});

// --- AUTH İŞLEMLERİ ---
authBtn.addEventListener('click', async () => {
    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

    if (!email || !password) {
        alert("Lütfen e-posta ve şifre alanlarını doldurun.");
        return;
    }

    if (isRegisterMode) {
        const fullName = fullNameInput.value.trim();
        const age = parseInt(ageInput.value);
        const gender = genderSelect.value;
        const bio = bioInput.value.trim();

        if (!fullName || !age || !gender || !bio) {
            alert("Lütfen tüm kayıt bilgilerini eksiksiz doldurun.");
            return;
        }

        if (age < 18) {
            alert("Üzgünüz, uygulama 18 yaş ve üzeri kullanıcılar içindir.");
            return;
        }

        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            await setDoc(doc(db, "users", user.uid), {
                uid: user.uid,
                email: email,
                fullName: fullName,
                age: age,
                gender: gender,
                bio: bio,
                role: "user", 
                status: 0,
                createdAt: new Date()
            });

            alert("Kayıt başarılı! Hesabınız moderatör onayına iletildi.");
        } catch (error) {
            alert("Kayıt hatası: " + error.message);
        }
    } else {
        try {
            await signInWithEmailAndPassword(auth, email, password);
        } catch (error) {
            alert("Giriş hatası: " + error.message);
        }
    }
});

// --- ROUTER GUARD & PROFİL YÜKLEME ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        const userDocRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
            const userData = userDoc.data();
            const role = userData.role ? String(userData.role).trim().toLowerCase() : "user";
            const status = userData.status;

            if (status === 0) {
                showScreen('pending-screen');
            } else if (status === 1) {
                showScreen('main-screen');

                // Profil bilgilerini doldur
                profileName.textContent = `${userData.fullName} (${userData.age})`;
                profileEmail.textContent = userData.email;
                profileBio.textContent = userData.bio || "Henüz biyografi eklenmemiş.";

                // Admin veya moderatörse Mod Paneli butonunu göster
                if (role === "admin" || role === "moderator") {
                    openModPanelBtn.classList.remove('hidden');
                } else {
                    openModPanelBtn.classList.add('hidden');
                }
            } else {
                alert("Hesabınız reddedilmiştir.");
                await signOut(auth);
            }
        } else {
            showScreen('auth-screen');
        }
    } else {
        showScreen('auth-screen');
    }
});

// --- MODAL İŞLEMLERİ ---
openModPanelBtn.addEventListener('click', () => {
    modModal.classList.remove('hidden');
    modModal.classList.add('flex');
    loadPendingUsers();
});

closeModPanelBtn.addEventListener('click', () => {
    modModal.classList.remove('flex');
    modModal.classList.add('hidden');
});

// --- BEKLEYENLERİ LİSTELEME ---
async function loadPendingUsers() {
    pendingUsersContainer.innerHTML = '<p class="text-center text-xs text-slate-500 mt-6">Yükleniyor...</p>';
    
    try {
        const q = query(collection(db, "users"), where("status", "==", 0));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            pendingUsersContainer.innerHTML = '<p class="text-center text-xs text-slate-500 mt-6">Onay bekleyen kimse yok.</p>';
            return;
        }

        pendingUsersContainer.innerHTML = '';
        querySnapshot.forEach((documentSnapshot) => {
            const uData = documentSnapshot.data();
            
            const card = document.createElement('div');
            card.className = "bg-slate-800 border border-slate-700/60 p-3.5 rounded-xl flex flex-col space-y-2 shadow-md";
            card.innerHTML = `
                <div class="flex justify-between items-start">
                    <div>
                        <h4 class="font-bold text-slate-200 text-xs">${uData.fullName} (${uData.age}) - <span class="text-indigo-400">${uData.gender}</span></h4>
                        <p class="text-[10px] text-slate-400">${uData.email}</p>
                    </div>
                    <span class="text-[9px] bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full border border-amber-500/30">Bekliyor</span>
                </div>
                <p class="text-[11px] text-slate-300 bg-slate-900/60 p-2 rounded-lg italic leading-relaxed">"${uData.bio}"</p>
                <div class="flex space-x-2 pt-1">
                    <button data-id="${uData.uid}" class="approve-btn flex-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold py-1.5 rounded-lg transition">Onayla</button>
                    <button data-id="${uData.uid}" class="reject-btn px-3 bg-rose-600/20 hover:bg-rose-600/30 text-rose-400 text-[11px] font-semibold py-1.5 rounded-lg transition border border-rose-500/30">Reddet</button>
                </div>
            `;
            pendingUsersContainer.appendChild(card);
        });

        document.querySelectorAll('.approve-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const targetUid = e.target.getAttribute('data-id');
                await updateUserStatus(targetUid, 1);
            });
        });

        document.querySelectorAll('.reject-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const targetUid = e.target.getAttribute('data-id');
                await updateUserStatus(targetUid, -1);
            });
        });

    } catch (error) {
        console.error("Hata:", error);
        pendingUsersContainer.innerHTML = '<p class="text-center text-xs text-rose-400">Yüklenirken hata oluştu.</p>';
    }
}

async function updateUserStatus(uid, newStatus) {
    try {
        const userRef = doc(db, "users", uid);
        await updateDoc(userRef, { status: newStatus });
        alert(newStatus === 1 ? "Kullanıcı onaylandı!" : "Kullanıcı reddedildi.");
        loadPendingUsers();
    } catch (error) {
        alert("İşlem başarısız: " + error.message);
    }
}

logoutBtnPending.addEventListener('click', () => signOut(auth));
logoutBtnMain.addEventListener('click', () => signOut(auth));

// --- HARİTA BAŞLATMA ---
function initMap() {
    if (mapInstance) {
        mapInstance.invalidateSize();
        return;
    }
    mapInstance = L.map('map').setView([40.9923, 29.0294], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(mapInstance);
    setTimeout(() => { mapInstance.invalidateSize(); }, 200);
}