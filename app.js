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
    updateDoc,
    addDoc,
    orderBy,
    onSnapshot,
    serverTimestamp,
    deleteDoc,
    arrayUnion,
    arrayRemove
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

// DOM Elementleri
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
const registerPhotoInput = document.getElementById('register-photo');

const logoutBtnPending = document.getElementById('logout-btn-pending');
const logoutBtnMain = document.getElementById('logout-btn-main');

const openModPanelBtn = document.getElementById('open-mod-panel-btn');
const closeModPanelBtn = document.getElementById('close-mod-panel-btn');
const modModal = document.getElementById('mod-modal');
const pendingUsersContainer = document.getElementById('pending-users-container');
const reportsContainer = document.getElementById('reports-container');
const modGroupsContainer = document.getElementById('mod-groups-container');

const modTabApprovals = document.getElementById('mod-tab-approvals');
const modTabReports = document.getElementById('mod-tab-reports');
const modTabGroups = document.getElementById('mod-tab-groups');

const profileName = document.getElementById('profile-name');
const profileEmail = document.getElementById('profile-email');
const profileBio = document.getElementById('profile-bio');
const profileAvatarContainer = document.getElementById('profile-avatar-container');
const profileRoleBadge = document.getElementById('profile-role-badge');
const myGroupsContainer = document.getElementById('my-groups-container');

const updateProfilePhotoInput = document.getElementById('update-profile-photo');
const saveProfilePhotoBtn = document.getElementById('save-profile-photo-btn');

const groupsContainer = document.getElementById('groups-container');
const calendarContainer = document.getElementById('calendar-container');
const sortByDistanceBtn = document.getElementById('sort-by-distance-btn');
const openCreateGroupModalBtn = document.getElementById('open-create-group-modal');
const createGroupModal = document.getElementById('create-group-modal');
const submitCreateGroupBtn = document.getElementById('submit-create-group');
const cancelCreateGroupBtn = document.getElementById('cancel-create-group');
const newGroupTitle = document.getElementById('new-group-title');
const newGroupCategory = document.getElementById('new-group-category');
const newGroupDate = document.getElementById('new-group-date');
const newGroupDesc = document.getElementById('new-group-desc');
const newGroupImageInput = document.getElementById('new-group-image');
const selectedCoordsText = document.getElementById('selected-coords-text');

const chatMessagesContainer = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const chatSendBtn = document.getElementById('chat-send-btn');
const backToGroupsBtn = document.getElementById('back-to-groups-btn');
const chatGroupTitle = document.getElementById('chat-group-title');
const chatStatusBadge = document.getElementById('chat-status-badge');
const chatInputArea = document.getElementById('chat-input-area');

const reportModal = document.getElementById('report-modal');
const reportReasonSelect = document.getElementById('report-reason');
const submitReportBtn = document.getElementById('submit-report-btn');
const cancelReportBtn = document.getElementById('cancel-report-btn');

let isRegisterMode = false;
let mapInstance = null;
let miniMapInstance = null;
let selectedLat = 40.9923; 
let selectedLng = 29.0294;
let markerList = [];
let currentActiveGroupId = null;
let currentChatUnsubscribe = null;
let reportedMessageData = null;
let currentUserRole = "user";
let globalGroupsCache = []; 
let isSortedByDistance = false;
let userCurrentLat = null;
let userCurrentLng = null;

// --- GÖRSEL SIKIŞTIRMA ---
function resizeAndConvertImage(file, maxWidth = 500, maxHeight = 500, quality = 0.7) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > maxWidth) {
                        height *= maxWidth / width;
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width *= maxHeight / height;
                        height = maxHeight;
                    }
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                const dataUrl = canvas.toDataURL('image/jpeg', quality);
                resolve(dataUrl);
            };
            img.onerror = (error) => reject(error);
        };
        reader.onerror = (error) => reject(error);
    });
}

// Sansür Filtresi
const BAD_WORDS = ["küfür", "mal", "aptal", "salak"];
function filterBadWords(text) {
    let cleanedText = text;
    BAD_WORDS.forEach(word => {
        const regex = new RegExp(word, 'gi');
        cleanedText = cleanedText.replace(regex, '***');
    });
    return cleanedText;
}

// Haversine Formülü
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; 
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * 
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; 
}

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

// Sekme Geçişleri
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const targetViewId = btn.getAttribute('data-target');
        document.querySelectorAll('.tab-view').forEach(v => v.classList.remove('active'));
        document.getElementById(targetViewId).classList.add('active');

        document.querySelectorAll('.tab-btn').forEach(b => {
            b.classList.remove('text-indigo-400');
            b.classList.add('text-slate-400');
        });
        btn.classList.remove('text-slate-400');
        btn.classList.add('text-indigo-400');

        if (targetViewId === 'view-map') {
            setTimeout(() => { initMap(); }, 100);
        }
    });
});

// Giriş / Kayıt Modu
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

authBtn.addEventListener('click', async () => {
    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();
    if (!email || !password) return alert("E-posta ve şifre zorunludur.");

    if (isRegisterMode) {
        const fullName = fullNameInput.value.trim();
        const age = parseInt(ageInput.value);
        const gender = genderSelect.value;
        const bio = bioInput.value.trim();

        if (!fullName || !age || !gender || !bio) return alert("Lütfen tüm alanları doldurun.");
        if (age < 18) return alert("18 yaşından küçükler kayıt olamaz.");

        let photoUrl = '';
        if (registerPhotoInput && registerPhotoInput.files && registerPhotoInput.files[0]) {
            try {
                photoUrl = await resizeAndConvertImage(registerPhotoInput.files[0], 400, 400, 0.7);
            } catch (e) {
                console.error("Profil fotoğrafı yüklenemedi:", e);
            }
        }

        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            await setDoc(doc(db, "users", userCredential.user.uid), {
                uid: userCredential.user.uid,
                email, fullName, age, gender, bio,
                photoUrl: photoUrl,
                role: "user", status: 0, banned: false, createdAt: new Date()
            });
            alert("Kayıt başarılı! Onaya gönderildi.");
        } catch (error) {
            alert("Hata: " + error.message);
        }
    } else {
        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const userDoc = await getDoc(doc(db, "users", userCredential.user.uid));
            if (userDoc.exists() && userDoc.data().banned) {
                alert("Hesabınız banlanmıştır.");
                await signOut(auth);
            }
        } catch (error) {
            alert("Giriş hatası: " + error.message);
        }
    }
});

if (saveProfilePhotoBtn) {
    saveProfilePhotoBtn.addEventListener('click', async () => {
        if (!auth.currentUser) return;
        if (!updateProfilePhotoInput || !updateProfilePhotoInput.files || !updateProfilePhotoInput.files[0]) {
            return alert("Lütfen değiştirmek için bir fotoğraf seçin.");
        }

        saveProfilePhotoBtn.disabled = true;
        saveProfilePhotoBtn.textContent = "Güncelleniyor...";

        try {
            const optimizedPhoto = await resizeAndConvertImage(updateProfilePhotoInput.files[0], 400, 400, 0.7);
            
            await updateDoc(doc(db, "users", auth.currentUser.uid), {
                photoUrl: optimizedPhoto
            });

            if (profileAvatarContainer) {
                profileAvatarContainer.innerHTML = `<img src="${optimizedPhoto}" class="w-20 h-20 rounded-full object-cover border-2 border-indigo-500 shadow-md">`;
            }

            alert("Profil fotoğrafınız başarıyla güncellendi!");
            updateProfilePhotoInput.value = '';
        } catch (err) {
            alert("Fotoğraf güncellenemedi: " + err.message);
        } finally {
            saveProfilePhotoBtn.disabled = false;
            saveProfilePhotoBtn.textContent = "Fotoğrafı Değiştir";
        }
    });
}

onAuthStateChanged(auth, async (user) => {
    if (user) {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
            const userData = userDoc.data();
            if (userData.banned) {
                await signOut(auth);
                return;
            }
            currentUserRole = userData.role ? String(userData.role).trim().toLowerCase() : "user";
            const status = userData.status;

            if (status === 0) {
                showScreen('pending-screen');
            } else if (status === 1) {
                showScreen('main-screen');
                profileName.textContent = `${userData.fullName} (${userData.age})`;
                profileEmail.textContent = userData.email;
                profileBio.textContent = userData.bio || "Biyografi yok.";

                if (profileRoleBadge) {
                    profileRoleBadge.textContent = userData.role ? userData.role.toUpperCase() : "USER";
                }

                if (profileAvatarContainer) {
                    if (userData.photoUrl) {
                        profileAvatarContainer.innerHTML = `<img src="${userData.photoUrl}" class="w-20 h-20 rounded-full object-cover border-2 border-indigo-500 shadow-md">`;
                    } else {
                        profileAvatarContainer.innerHTML = `<div class="w-20 h-20 rounded-full bg-indigo-600/30 border-2 border-indigo-500/50 flex items-center justify-center text-indigo-300 font-bold text-xl">${userData.fullName ? userData.fullName.charAt(0).toUpperCase() : 'U'}</div>`;
                    }
                }

                if (currentUserRole === "admin" || currentUserRole === "moderator") {
                    openModPanelBtn.classList.remove('hidden');
                } else {
                    openModPanelBtn.classList.add('hidden');
                }
                loadGroups();
                loadMyJoinedGroups(user.uid);
            } else {
                alert("Hesabınız reddedildi.");
                await signOut(auth);
            }
        } else {
            showScreen('auth-screen');
        }
    } else {
        showScreen('auth-screen');
    }
});

function loadMyJoinedGroups(userId) {
    if (!myGroupsContainer) return;
    myGroupsContainer.innerHTML = '<p class="text-center text-xs text-slate-500 mt-2">Gruplar yükleniyor...</p>';

    onSnapshot(collection(db, "groups"), (snapshot) => {
        myGroupsContainer.innerHTML = '';
        let joinedCount = 0;

        snapshot.forEach((docSnap) => {
            const gData = docSnap.data();
            const members = gData.members || [];
            
            if (members.includes(userId) || gData.creatorUid === userId) {
                joinedCount++;
                const gId = docSnap.id;
                const item = document.createElement('div');
                item.className = "bg-slate-800/80 border border-slate-700/60 p-2.5 rounded-xl flex justify-between items-center";
                item.innerHTML = `
                    <div class="min-w-0 pr-2">
                        <h5 class="font-bold text-xs text-indigo-300 truncate">${gData.title}</h5>
                        <p class="text-[10px] text-slate-400 truncate">${gData.category} • ${gData.status}</p>
                    </div>
                    <button onclick="openGroupChat('${gId}', '${gData.title}', '${gData.status}')" class="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-semibold rounded-lg shrink-0 transition">Sohbete Git</button>
                `;
                myGroupsContainer.appendChild(item);
            }
        });

        if (joinedCount === 0) {
            myGroupsContainer.innerHTML = '<p class="text-center text-xs text-slate-500 mt-2">Henüz katıldığınız bir grup bulunmuyor.</p>';
        }
    });
}

openCreateGroupModalBtn.addEventListener('click', () => {
    createGroupModal.classList.remove('hidden');
    setTimeout(() => { initMiniMap(); }, 200);
});

cancelCreateGroupBtn.addEventListener('click', () => createGroupModal.classList.add('hidden'));

submitCreateGroupBtn.addEventListener('click', async () => {
    const title = newGroupTitle.value.trim();
    const category = newGroupCategory.value.trim();
    const eventDate = newGroupDate.value;
    const desc = newGroupDesc.value.trim();

    if (!title || !category || !eventDate || !desc) return alert("Lütfen tüm alanları doldurun.");

    let imageUrl = '';
    if (newGroupImageInput && newGroupImageInput.files && newGroupImageInput.files[0]) {
        try {
            imageUrl = await resizeAndConvertImage(newGroupImageInput.files[0], 800, 450, 0.7);
        } catch (e) {
            console.error("Etkinlik görseli yüklenemedi:", e);
        }
    }

    try {
        const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
        const creatorName = userDoc.exists() ? userDoc.data().fullName : "Anonim";
        const creatorPhoto = userDoc.exists() ? (userDoc.data().photoUrl || '') : '';

        await addDoc(collection(db, "groups"), {
            title,
            category,
            eventDate,
            desc,
            imageUrl,
            latitude: selectedLat,
            longitude: selectedLng,
            creatorUid: auth.currentUser.uid,
            creatorName,
            creatorPhoto,
            members: [auth.currentUser.uid],
            memberCount: 1,
            status: "Açık",
            createdAt: serverTimestamp()
        });

        newGroupTitle.value = '';
        newGroupCategory.value = '';
        newGroupDate.value = '';
        newGroupDesc.value = '';
        if (newGroupImageInput) newGroupImageInput.value = '';
        createGroupModal.classList.add('hidden');
        loadGroups();
    } catch (error) {
        alert("Grup oluşturulamadı: " + error.message);
    }
});

sortByDistanceBtn.addEventListener('click', () => {
    if (!navigator.geolocation) return alert("Tarayıcınız konum desteklemiyor.");
    sortByDistanceBtn.textContent = "📍 Konum Alınıyor...";
    navigator.geolocation.getCurrentPosition((position) => {
        userCurrentLat = position.coords.latitude;
        userCurrentLng = position.coords.longitude;
        isSortedByDistance = true;
        sortByDistanceBtn.textContent = "📍 Yakına Göre Sıralı (Sıfırla)";
        renderGroups();
    }, () => {
        alert("Konum alınamadı.");
        sortByDistanceBtn.textContent = "📍 Yakınımdakiler (En Yakın)";
    }, { enableHighAccuracy: true });
});

function loadGroups() {
    groupsContainer.innerHTML = '<p class="text-center text-xs text-slate-500 mt-6">Gruplar yükleniyor...</p>';
    calendarContainer.innerHTML = '<p class="text-center text-xs text-slate-500 mt-6">Takvim yükleniyor...</p>';
    
    onSnapshot(collection(db, "groups"), (snapshot) => {
        globalGroupsCache = [];
        markerList.forEach(m => { if (mapInstance) mapInstance.removeLayer(m); });
        markerList = [];

        if (snapshot.empty) {
            groupsContainer.innerHTML = '<p class="text-center text-xs text-slate-500 mt-6">Henüz etkinlik grubu açılmamış.</p>';
            calendarContainer.innerHTML = '<p class="text-center text-xs text-slate-500 mt-6">Gelecek zamanlı etkinlik bulunmuyor.</p>';
            return;
        }

        snapshot.forEach((docSnap) => {
            globalGroupsCache.push({ id: docSnap.id, ...docSnap.data() });
        });

        renderGroups();
    });
}

function renderGroups() {
    groupsContainer.innerHTML = '';
    calendarContainer.innerHTML = '';

    let groupsToRender = [...globalGroupsCache];

    if (isSortedByDistance && userCurrentLat !== null && userCurrentLng !== null) {
        groupsToRender.sort((a, b) => {
            const distA = calculateDistance(userCurrentLat, userCurrentLng, a.latitude || 0, a.longitude || 0);
            const distB = calculateDistance(userCurrentLat, userCurrentLng, b.latitude || 0, b.longitude || 0);
            return distA - distB; 
        });
    }

    let futureEventsCount = 0;
    const now = new Date();

    groupsToRender.forEach((gData) => {
        const gId = gData.id;
        const isOpen = gData.status !== "Kapalı";
        const formattedDate = gData.eventDate ? new Date(gData.eventDate).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }) : 'Belirtilmedi';

        let distanceText = "";
        if (userCurrentLat !== null && userCurrentLng !== null && gData.latitude && gData.longitude) {
            const distKm = calculateDistance(userCurrentLat, userCurrentLng, gData.latitude, gData.longitude);
            distanceText = `• 📍 ${distKm < 1 ? Math.round(distKm * 1000) + ' m' : distKm.toFixed(1) + ' km'}`;
        }

        const bannerHtml = gData.imageUrl 
            ? `<div class="w-full h-32 overflow-hidden rounded-t-xl mb-1"><img src="${gData.imageUrl}" class="w-full h-full object-cover"></div>`
            : '';

        const card = document.createElement('div');
        card.className = "bg-slate-800/50 border border-slate-800 rounded-xl flex flex-col overflow-hidden shadow-sm";
        card.innerHTML = `
            ${bannerHtml}
            <div class="p-3.5 flex flex-col space-y-2">
                <div class="flex justify-between items-start">
                    <div>
                        <h4 class="font-bold text-indigo-300 text-xs">${gData.title}</h4>
                        <p class="text-[10px] text-slate-400 mt-0.5">${gData.category} ${distanceText} • Kurucu: ${gData.creatorName}</p>
                    </div>
                    <span class="text-[9px] ${isOpen ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border-rose-500/30'} px-2 py-0.5 rounded-full border">${gData.status}</span>
                </div>
                <p class="text-[11px] text-slate-300 leading-relaxed">${gData.desc}</p>
                <div class="flex justify-between items-center text-[10px] text-slate-400 pt-1 border-t border-slate-700/40">
                    <span>📅 ${formattedDate}</span>
                    <span>👤 ${gData.memberCount || 1} Katılımcı</span>
                </div>
                <div class="flex justify-end pt-1">
                    <button onclick="joinAndOpenChat('${gId}', '${gData.title}', '${gData.status}')" class="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-semibold rounded-lg transition shadow-sm">Sohbete Katıl</button>
                </div>
            </div>
        `;
        groupsContainer.appendChild(card);

        if (gData.eventDate && new Date(gData.eventDate) > now) {
            futureEventsCount++;
            const eventDateObj = new Date(gData.eventDate);
            const dayNum = eventDateObj.getDate();
            const monthName = eventDateObj.toLocaleString('tr-TR', { month: 'short' }).toUpperCase();
            const timeStr = eventDateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            const calCard = document.createElement('div');
            calCard.className = "bg-slate-800/60 border border-slate-700/60 p-3.5 rounded-2xl flex items-center space-x-3 shadow-md backdrop-blur-md";
            calCard.innerHTML = `
                <div class="w-12 h-14 bg-indigo-600/20 border border-indigo-500/30 rounded-xl flex flex-col items-center justify-center shrink-0 overflow-hidden shadow-inner">
                    <span class="w-full bg-indigo-600 text-white text-[9px] font-bold text-center py-0.5 uppercase tracking-wider">${monthName}</span>
                    <span class="text-indigo-300 font-black text-base my-auto">${dayNum}</span>
                </div>
                <div class="flex-grow min-w-0">
                    <div class="flex justify-between items-start">
                        <h4 class="font-bold text-slate-100 text-xs truncate">${gData.title}</h4>
                        <span class="text-[9px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/30 shrink-0 ml-2">${timeStr}</span>
                    </div>
                    <p class="text-[10px] text-slate-400 mt-0.5 truncate">${gData.category} ${distanceText}</p>
                    <p class="text-[11px] text-slate-300 mt-1 line-clamp-1">${gData.desc}</p>
                    <div class="flex justify-between items-center mt-2 pt-2 border-t border-slate-700/40">
                        <span class="text-[10px] text-slate-400">👤 ${gData.memberCount || 1} Katılımcı</span>
                        <button onclick="joinAndOpenChat('${gId}', '${gData.title}', '${gData.status}')" class="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-semibold rounded-lg transition shadow-sm">Git</button>
                    </div>
                </div>
            `;
            calendarContainer.appendChild(calCard);
        }

        if (mapInstance && gData.latitude && gData.longitude) {
            const marker = L.marker([gData.latitude, gData.longitude]).addTo(mapInstance);
            marker.bindPopup(`
                <div style="font-family:sans-serif; color:#0f172a; min-width:160px;">
                    <h4 style="font-weight:bold; font-size:13px; margin-bottom:2px; color:#4f46e5;">${gData.title}</h4>
                    <p style="font-size:10px; color:#475569; margin-bottom:4px;">📅 ${formattedDate}</p>
                    <button onclick="joinAndOpenChat('${gId}', '${gData.title}', '${gData.status}')" style="background:#4f46e5; color:#fff; border:none; padding:4px 8px; font-size:10px; border-radius:6px; cursor:pointer; width:100%;">Sohbete Git</button>
                </div>
            `);
            markerList.push(marker);
        }
    });

    if (futureEventsCount === 0) {
        calendarContainer.innerHTML = '<p class="text-center text-xs text-slate-500 mt-6">Şu an planlanmış gelecek zamanlı etkinlik bulunmuyor.</p>';
    }
}

window.joinAndOpenChat = async function(groupId, groupTitle, groupStatus) {
    currentActiveGroupId = groupId;
    chatGroupTitle.textContent = groupTitle;
    
    const isOpen = groupStatus !== "Kapalı";
    if (isOpen) {
        chatStatusBadge.textContent = "Açık";
        chatStatusBadge.className = "text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/30";
        chatInputArea.classList.remove('hidden');
    } else {
        chatStatusBadge.textContent = "Kapalı (Arşiv)";
        chatStatusBadge.className = "text-[10px] bg-rose-500/20 text-rose-400 px-2 py-0.5 rounded-full border border-rose-500/30";
        chatInputArea.classList.add('hidden');
    }

    try {
        const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
        if (userDoc.exists()) {
            const userData = userDoc.data();
            const groupRef = doc(db, "groups", groupId);
            const groupSnap = await getDoc(groupRef);
            
            if (groupSnap.exists()) {
                const groupData = groupSnap.data();
                const members = groupData.members || [];

                if (!members.includes(auth.currentUser.uid)) {
                    await updateDoc(groupRef, {
                        members: arrayUnion(auth.currentUser.uid),
                        memberCount: (groupData.memberCount || 1) + 1
                    });

                    await addDoc(collection(db, "groups", groupId, "messages"), {
                        text: `${userData.fullName} gruba katıldı. 👋`,
                        senderUid: "system",
                        senderName: "Sistem",
                        senderPhoto: "",
                        createdAt: serverTimestamp()
                    });
                }
            }
        }
    } catch (err) {
        console.error("Gruba katılım kaydedilemedi:", err);
    }

    document.querySelectorAll('.tab-view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-chat').classList.add('active');

    loadChatMessages(groupId);
};

backToGroupsBtn.addEventListener('click', () => {
    if (currentChatUnsubscribe) currentChatUnsubscribe();
    document.querySelectorAll('.tab-view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-groups').classList.add('active');
});

// --- SOHBET MESAJLARI VE TIKLANABİLİR PROFİL KARTI ENTEGRASYONU ---
function loadChatMessages(groupId) {
    chatMessagesContainer.innerHTML = '';
    if (currentChatUnsubscribe) currentChatUnsubscribe();

    const q = query(collection(db, "groups", groupId, "messages"), orderBy("createdAt", "asc"));
    
    currentChatUnsubscribe = onSnapshot(q, (snapshot) => {
        chatMessagesContainer.innerHTML = '';
        if (snapshot.empty) {
            chatMessagesContainer.innerHTML = '<p class="text-center text-[11px] text-slate-500 mt-4">Henüz mesaj yok. İlk mesajı sen yaz!</p>';
            return;
        }

        snapshot.forEach((docSnap) => {
            const msgData = docSnap.data();
            const msgId = docSnap.id;
            const isSystem = msgData.senderUid === "system";

            if (isSystem) {
                const sysDiv = document.createElement('div');
                sysDiv.className = "flex justify-center my-1.5";
                sysDiv.innerHTML = `<span class="bg-slate-800/80 text-slate-400 text-[10px] px-3 py-1 rounded-full border border-slate-700/50">${msgData.text}</span>`;
                chatMessagesContainer.appendChild(sysDiv);
                return;
            }

            const isMe = msgData.senderUid === auth.currentUser.uid;

            // Avatar ve İsme Tıklanabilirlik Eklendi (cursor-pointer ve hover efektleri)
            const senderPhotoHtml = msgData.senderPhoto 
                ? `<img src="${msgData.senderPhoto}" class="w-6 h-6 rounded-full object-cover mr-1.5 shrink-0 border border-indigo-500/40 cursor-pointer profile-trigger" data-uid="${msgData.senderUid}">`
                : `<div class="w-6 h-6 rounded-full bg-indigo-600/40 text-indigo-300 font-bold text-[9px] flex items-center justify-center mr-1.5 shrink-0 cursor-pointer profile-trigger" data-uid="${msgData.senderUid}">${msgData.senderName ? msgData.senderName.charAt(0).toUpperCase() : 'U'}</div>`;

            const msgDiv = document.createElement('div');
            msgDiv.className = `flex flex-col ${isMe ? 'items-end' : 'items-start'} mb-2.5`;
            msgDiv.innerHTML = `
                <div class="flex items-center ${isMe ? 'flex-row-reverse' : 'flex-row'} mb-0.5">
                    ${!isMe ? senderPhotoHtml : ''}
                    <span class="text-[10px] font-bold text-indigo-400 mx-1 cursor-pointer hover:underline profile-trigger" data-uid="${msgData.senderUid}">${msgData.senderName}</span>
                </div>
                <div class="max-w-[75%] bg-slate-800 border border-slate-700/60 rounded-2xl px-3 py-2 text-xs text-slate-200 shadow-sm relative group">
                    <p class="leading-relaxed">${msgData.text}</p>
                    <div class="flex justify-end items-center space-x-2 mt-1">
                        <span class="text-[9px] text-slate-500">${msgData.createdAt ? new Date(msgData.createdAt.toDate()).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '...'}</span>
                        <button class="open-report-modal text-[9px] text-rose-400 hover:underline opacity-60 hover:opacity-100 transition" data-id="${msgId}" data-text="${msgData.text}" data-sender="${msgData.senderName}" data-uid="${msgData.senderUid}">Şikayet Et</button>
                    </div>
                </div>
            `;
            chatMessagesContainer.appendChild(msgDiv);
        });

        chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;

        // Profil Kartı Tetikleyicilerini Dinle
        document.querySelectorAll('.profile-trigger').forEach(el => {
            el.addEventListener('click', async (e) => {
                const targetUid = e.target.getAttribute('data-uid');
                if (targetUid) {
                    await fetchAndOpenUserCard(targetUid);
                }
            });
        });

        document.querySelectorAll('.open-report-modal').forEach(btn => {
            btn.addEventListener('click', (e) => {
                reportedMessageData = {
                    messageId: e.target.getAttribute('data-id'),
                    messageText: e.target.getAttribute('data-text'),
                    senderName: e.target.getAttribute('data-sender'),
                    senderUid: e.target.getAttribute('data-uid'),
                    groupId: currentActiveGroupId
                };
                reportModal.classList.remove('hidden');
            });
        });
    });
}

chatSendBtn.addEventListener('click', async () => {
    const text = chatInput.value.trim();
    if (!text || !currentActiveGroupId) return;

    chatSendBtn.disabled = true;
    chatSendBtn.classList.add('opacity-50', 'cursor-not-allowed');

    const filteredText = filterBadWords(text);
    try {
        const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
        const senderName = userDoc.exists() ? userDoc.data().fullName : "Kullanıcı";
        const senderPhoto = userDoc.exists() ? (userDoc.data().photoUrl || '') : '';

        await addDoc(collection(db, "groups", currentActiveGroupId, "messages"), {
            text: filteredText,
            senderUid: auth.currentUser.uid,
            senderName,
            senderPhoto,
            createdAt: serverTimestamp()
        });
        chatInput.value = '';
    } catch (error) {
        alert("Mesaj gönderilemedi: " + error.message);
    } finally {
        chatSendBtn.disabled = false;
        chatSendBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    }
});

cancelReportBtn.addEventListener('click', () => {
    reportModal.classList.add('hidden');
    reportedMessageData = null;
});

submitReportBtn.addEventListener('click', async () => {
    if (!reportedMessageData) return;
    try {
        await addDoc(collection(db, "reports"), {
            messageId: reportedMessageData.messageId,
            messageText: reportedMessageData.messageText,
            senderName: reportedMessageData.senderName,
            senderUid: reportedMessageData.senderUid,
            groupId: reportedMessageData.groupId,
            reason: reportReasonSelect.value,
            reportedBy: auth.currentUser.uid,
            createdAt: serverTimestamp()
        });
        alert("Bildirim moderatöre iletildi.");
        reportModal.classList.add('hidden');
        reportedMessageData = null;
    } catch (error) {
        alert("Hata: " + error.message);
    }
});

// Moderatör Paneli
openModPanelBtn.addEventListener('click', () => {
    modModal.classList.remove('hidden');
    modModal.classList.add('flex');
    loadPendingUsers();
});

closeModPanelBtn.addEventListener('click', () => {
    modModal.classList.remove('flex');
    modModal.classList.add('hidden');
});

modTabApprovals.addEventListener('click', () => {
    modTabApprovals.className = "flex-1 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold transition";
    modTabReports.className = "flex-1 py-1.5 bg-slate-800 text-slate-400 rounded-lg text-xs font-semibold transition";
    modTabGroups.className = "flex-1 py-1.5 bg-slate-800 text-slate-400 rounded-lg text-xs font-semibold transition";
    pendingUsersContainer.classList.remove('hidden');
    reportsContainer.classList.add('hidden');
    modGroupsContainer.classList.add('hidden');
    loadPendingUsers();
});

modTabReports.addEventListener('click', () => {
    modTabReports.className = "flex-1 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold transition";
    modTabApprovals.className = "flex-1 py-1.5 bg-slate-800 text-slate-400 rounded-lg text-xs font-semibold transition";
    modTabGroups.className = "flex-1 py-1.5 bg-slate-800 text-slate-400 rounded-lg text-xs font-semibold transition";
    reportsContainer.classList.remove('hidden');
    pendingUsersContainer.classList.add('hidden');
    modGroupsContainer.classList.add('hidden');
    loadReports();
});

modTabGroups.addEventListener('click', () => {
    modTabGroups.className = "flex-1 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold transition";
    modTabApprovals.className = "flex-1 py-1.5 bg-slate-800 text-slate-400 rounded-lg text-xs font-semibold transition";
    modTabReports.className = "flex-1 py-1.5 bg-slate-800 text-slate-400 rounded-lg text-xs font-semibold transition";
    modGroupsContainer.classList.remove('hidden');
    pendingUsersContainer.classList.add('hidden');
    reportsContainer.classList.add('hidden');
    loadModGroups();
});

async function loadPendingUsers() {
    pendingUsersContainer.innerHTML = '<p class="text-center text-xs text-slate-500 mt-6">Yükleniyor...</p>';
    const querySnapshot = await getDocs(query(collection(db, "users"), where("status", "==", 0)));
    if (querySnapshot.empty) {
        pendingUsersContainer.innerHTML = '<p class="text-center text-xs text-slate-500 mt-6">Onay bekleyen kimse yok.</p>';
        return;
    }
    pendingUsersContainer.innerHTML = '';
    querySnapshot.forEach((docSnap) => {
        const uData = docSnap.data();
        const userPhotoHtml = uData.photoUrl 
            ? `<img src="${uData.photoUrl}" class="w-10 h-10 rounded-full object-cover shrink-0 mr-3">`
            : '';

        const card = document.createElement('div');
        card.className = "bg-slate-800 border border-slate-700/60 p-3.5 rounded-xl flex flex-col space-y-2";
        card.innerHTML = `
            <div class="flex items-center">
                ${userPhotoHtml}
                <div>
                    <h4 class="font-bold text-slate-200 text-xs">${uData.fullName} (${uData.age})</h4>
                    <p class="text-[10px] text-slate-400">${uData.email}</p>
                </div>
            </div>
            <p class="text-[11px] text-slate-300 italic">"${uData.bio}"</p>
            <div class="flex space-x-2 pt-1">
                <button data-id="${uData.uid}" class="approve-btn flex-1 bg-emerald-600 text-white text-[11px] py-1.5 rounded-lg">Onayla</button>
                <button data-id="${uData.uid}" class="reject-btn px-3 bg-rose-600/20 text-rose-400 text-[11px] py-1.5 rounded-lg border border-rose-500/30">Reddet</button>
            </div>
        `;
        pendingUsersContainer.appendChild(card);
    });

    document.querySelectorAll('.approve-btn').forEach(b => b.addEventListener('click', async (e) => {
        await updateDoc(doc(db, "users", e.target.getAttribute('data-id')), { status: 1 });
        loadPendingUsers();
    }));
    document.querySelectorAll('.reject-btn').forEach(b => b.addEventListener('click', async (e) => {
        await updateDoc(doc(db, "users", e.target.getAttribute('data-id')), { status: -1 });
        loadPendingUsers();
    }));
}

async function loadReports() {
    reportsContainer.innerHTML = '<p class="text-center text-xs text-slate-500 mt-6">Yükleniyor...</p>';
    const querySnapshot = await getDocs(collection(db, "reports"));
    if (querySnapshot.empty) {
        reportsContainer.innerHTML = '<p class="text-center text-xs text-slate-500 mt-6">Şikayet edilen içerik yok.</p>';
        return;
    }
    reportsContainer.innerHTML = '';
    querySnapshot.forEach((docSnap) => {
        const rData = docSnap.data();
        const rId = docSnap.id;
        const card = document.createElement('div');
        card.className = "bg-slate-800 border border-slate-700/60 p-3.5 rounded-xl flex flex-col space-y-2";
        card.innerHTML = `
            <h4 class="font-bold text-rose-400 text-xs">Sebep: ${rData.reason} - Şikayet Edilen: ${rData.senderName}</h4>
            <p class="text-[11px] text-slate-300 italic">"${rData.messageText}"</p>
            <div class="flex space-x-2 pt-1">
                <button data-uid="${rData.senderUid || ''}" data-report-id="${rId}" class="ban-user-from-report flex-1 bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-semibold py-1.5 rounded-lg transition">Kullanıcıyı Banla</button>
                <button data-report-id="${rId}" class="delete-report-btn flex-1 bg-slate-700 hover:bg-slate-600 text-slate-200 text-[11px] font-semibold py-1.5 rounded-lg transition">Raporu Kaldır</button>
            </div>
        `;
        reportsContainer.appendChild(card);
    });

    document.querySelectorAll('.delete-report-btn').forEach(b => b.addEventListener('click', async (e) => {
        await deleteDoc(doc(db, "reports", e.target.getAttribute('data-report-id')));
        loadReports();
    }));

    document.querySelectorAll('.ban-user-from-report').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const targetUid = e.target.getAttribute('data-uid');
            const reportId = e.target.getAttribute('data-report-id');

            if (!targetUid) return alert("Kullanıcı ID'sine ulaşılamadı.");

            if (confirm("Bu kullanıcıyı kalıcı olarak banlamak istediğinize emin misiniz?")) {
                try {
                    await updateDoc(doc(db, "users", targetUid), { banned: true });
                    await deleteDoc(doc(db, "reports", reportId));
                    alert("Kullanıcı banlandı ve rapor temizlendi.");
                    loadReports();
                } catch (err) {
                    alert("Banlama hatası: " + err.message);
                }
            }
        });
    });
}

async function loadModGroups() {
    modGroupsContainer.innerHTML = '<p class="text-center text-xs text-slate-500 mt-6">Yükleniyor...</p>';
    const querySnapshot = await getDocs(collection(db, "groups"));
    if (querySnapshot.empty) {
        modGroupsContainer.innerHTML = '<p class="text-center text-xs text-slate-500 mt-6">Grup bulunamadı.</p>';
        return;
    }
    modGroupsContainer.innerHTML = '';
    querySnapshot.forEach((docSnap) => {
        const gData = docSnap.data();
        const isOpen = gData.status !== "Kapalı";
        const card = document.createElement('div');
        card.className = "bg-slate-800 border border-slate-700/60 p-3.5 rounded-xl flex flex-col space-y-2";
        card.innerHTML = `
            <h4 class="font-bold text-indigo-300 text-xs">${gData.title} (${gData.status})</h4>
            <button data-id="${docSnap.id}" data-status="${isOpen ? 'Kapalı' : 'Açık'}" class="toggle-group-status py-1.5 text-white text-[11px] rounded-lg ${isOpen ? 'bg-rose-600' : 'bg-emerald-600'}">
                ${isOpen ? 'Grubu / Chati Kapat' : 'Grubu Aç'}
            </button>
        `;
        modGroupsContainer.appendChild(card);
    });

    document.querySelectorAll('.toggle-group-status').forEach(b => {
        b.addEventListener('click', async (e) => {
            const gid = e.target.getAttribute('data-id');
            const newStatus = e.target.getAttribute('data-status');
            await updateDoc(doc(db, "groups", gid), { status: newStatus });
            loadModGroups();
        });
    });
}

logoutBtnPending.addEventListener('click', () => signOut(auth));
logoutBtnMain.addEventListener('click', () => signOut(auth));

function initMap() {
    if (mapInstance) {
        mapInstance.invalidateSize();
        return;
    }
    mapInstance = L.map('map').setView([40.9923, 29.0294], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(mapInstance);
    setTimeout(() => { mapInstance.invalidateSize(); loadGroups(); }, 200);
}

function initMiniMap() {
    if (miniMapInstance) {
        miniMapInstance.invalidateSize();
        return;
    }
    miniMapInstance = L.map('mini-map').setView([40.9923, 29.0294], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(miniMapInstance);

    let tempMarker = L.marker([40.9923, 29.0294]).addTo(miniMapInstance);

    miniMapInstance.on('click', (e) => {
        selectedLat = e.latlng.lat;
        selectedLng = e.latlng.lng;
        tempMarker.setLatLng([selectedLat, selectedLng]);
        selectedCoordsText.textContent = `Seçilen Konum: ${selectedLat.toFixed(4)}, ${selectedLng.toFixed(4)}`;
    });
    setTimeout(() => { miniMapInstance.invalidateSize(); }, 200);
}

// --- TROL ÜNVAN VE KİŞİ KARTI MANTIĞI ---

function getUserTitle(messageCount, groupCount) {
    const totalActivity = (messageCount || 0) + (groupCount || 0) * 3;
    
    if (totalActivity > 30) {
        return "Evliya 🐪";
    } else if (totalActivity > 15) {
        return "Hızınız 300 Yavaş 💨";
    } else if (totalActivity > 5) {
        return "Meraklı Vatandaş 🧭";
    } else {
        return "Yeni Gezgin 🎒";
    }
}

// Kullanıcının verilerini veritabanından çekip Kişi Kartını dolduran fonksiyon
async function fetchAndOpenUserCard(uid) {
    try {
        const userDocRef = doc(db, "users", uid);
        const userDocSnap = await getDoc(userDocRef);
        
        if (!userDocSnap.exists()) return alert("Kullanıcı bilgisi bulunamadı.");
        const userData = userDocSnap.data();

        // Kullanıcının katıldığı grup sayısını hesapla
        let joinedGroupsCount = 0;
        const groupsSnap = await getDocs(collection(db, "groups"));
        groupsSnap.forEach(gDoc => {
            const gData = gDoc.data();
            const members = gData.members || [];
            if (members.includes(uid) || gData.creatorUid === uid) {
                joinedGroupsCount++;
            }
        });

        // Toplam mesaj sayısını hesaplamak için tüm gruplardaki mesajlarını sayıyoruz
        let messageCount = 0;
        for (let gDoc of groupsSnap.docs) {
            const messagesSnap = await getDocs(collection(db, "groups", gDoc.id, "messages"));
            messagesSnap.forEach(mDoc => {
                if (mDoc.data().senderUid === uid) {
                    messageCount++;
                }
            });
        }

        openUserCardModal({
            fullName: userData.fullName,
            email: userData.email,
            bio: userData.bio,
            photoUrl: userData.photoUrl,
            messageCount: messageCount,
            joinedGroupsCount: joinedGroupsCount
        });

    } catch (err) {
        console.error("Kişi kartı açılırken hata:", err);
    }
}

function openUserCardModal(userData) {
    const modal = document.getElementById('user-card-modal');
    if (!modal) return;

    document.getElementById('card-username').textContent = userData.fullName || userData.email || "Kullanıcı";
    document.getElementById('card-email').textContent = userData.email || "";
    document.getElementById('card-bio').textContent = userData.bio ? `"${userData.bio}"` : "Biyografi eklenmemiş.";
    
    const msgCount = userData.messageCount || 0;
    const groupCount = userData.joinedGroupsCount || 0;
    document.getElementById('card-message-count').textContent = msgCount;
    document.getElementById('card-group-count').textContent = groupCount;

    // Trol Ünvanı Ata
    const title = getUserTitle(msgCount, groupCount);
    document.getElementById('card-title-badge').textContent = title;

    // Avatar
    const avatarContainer = document.getElementById('card-avatar-container');
    avatarContainer.innerHTML = '';
    if (userData.photoUrl) {
        avatarContainer.innerHTML = `<img src="${userData.photoUrl}" class="w-16 h-16 rounded-full object-cover border-2 border-indigo-500 shadow-md">`;
    } else {
        const initial = (userData.fullName || userData.email || 'U').charAt(0).toUpperCase();
        avatarContainer.innerHTML = `<div class="w-16 h-16 rounded-full bg-indigo-600/30 border-2 border-indigo-500 flex items-center justify-center text-indigo-300 font-bold text-xl shadow-md">${initial}</div>`;
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

// Kişi Kartını Kapatma Olayları
document.addEventListener('DOMContentLoaded', () => {
    const closeBtn = document.getElementById('close-user-card');
    const modal = document.getElementById('user-card-modal');
    
    if (closeBtn && modal) {
        closeBtn.addEventListener('click', () => {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
            }
        });
    }
});