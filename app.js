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
    deleteDoc
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

// Grup, Takvim & Chat Elementleri
const groupsContainer = document.getElementById('groups-container');
const calendarContainer = document.getElementById('calendar-container');
const openCreateGroupModalBtn = document.getElementById('open-create-group-modal');
const createGroupModal = document.getElementById('create-group-modal');
const submitCreateGroupBtn = document.getElementById('submit-create-group');
const cancelCreateGroupBtn = document.getElementById('cancel-create-group');
const newGroupTitle = document.getElementById('new-group-title');
const newGroupCategory = document.getElementById('new-group-category');
const newGroupDate = document.getElementById('new-group-date');
const newGroupDesc = document.getElementById('new-group-desc');
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

        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            await setDoc(doc(db, "users", userCredential.user.uid), {
                uid: userCredential.user.uid,
                email, fullName, age, gender, bio,
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

                if (currentUserRole === "admin" || currentUserRole === "moderator") {
                    openModPanelBtn.classList.remove('hidden');
                } else {
                    openModPanelBtn.classList.add('hidden');
                }
                loadGroups();
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

// --- DİNAMİK GRUP & TAKVİM SİSTEMİ ---
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

    if (!title || !category || !eventDate || !desc) return alert("Lütfen tüm alanları (tarih dahil) doldurun.");

    try {
        const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
        const creatorName = userDoc.exists() ? userDoc.data().fullName : "Anonim";

        await addDoc(collection(db, "groups"), {
            title,
            category,
            eventDate,
            desc,
            latitude: selectedLat,
            longitude: selectedLng,
            creatorUid: auth.currentUser.uid,
            creatorName,
            memberCount: 1,
            status: "Açık",
            createdAt: serverTimestamp()
        });

        newGroupTitle.value = '';
        newGroupCategory.value = '';
        newGroupDate.value = '';
        newGroupDesc.value = '';
        createGroupModal.classList.add('hidden');
        loadGroups();
    } catch (error) {
        alert("Grup oluşturulamadı: " + error.message);
    }
});

// Grupları, Harita Pinlerini ve Takvimi Yükleme
function loadGroups() {
    groupsContainer.innerHTML = '<p class="text-center text-xs text-slate-500 mt-6">Gruplar yükleniyor...</p>';
    calendarContainer.innerHTML = '<p class="text-center text-xs text-slate-500 mt-6">Takvim yükleniyor...</p>';
    
    onSnapshot(collection(db, "groups"), (snapshot) => {
        groupsContainer.innerHTML = '';
        calendarContainer.innerHTML = '';
        
        markerList.forEach(m => {
            if (mapInstance) mapInstance.removeLayer(m);
        });
        markerList = [];

        if (snapshot.empty) {
            groupsContainer.innerHTML = '<p class="text-center text-xs text-slate-500 mt-6">Henüz etkinlik grubu açılmamış.</p>';
            calendarContainer.innerHTML = '<p class="text-center text-xs text-slate-500 mt-6">Gelecek zamanlı etkinlik bulunmuyor.</p>';
            return;
        }

        let futureEventsCount = 0;
        const now = new Date();

        snapshot.forEach((docSnap) => {
            const gData = docSnap.data();
            const gId = docSnap.id;
            const isOpen = gData.status !== "Kapalı";
            const formattedDate = gData.eventDate ? new Date(gData.eventDate).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }) : 'Belirtilmedi';

            // 1. Ana Grup Kartı HTML'i
            const cardHTML = `
                <div class="flex justify-between items-start">
                    <div>
                        <h4 class="font-bold text-indigo-300 text-xs">${gData.title}</h4>
                        <p class="text-[10px] text-slate-400 mt-0.5">${gData.category} • Kurucu: ${gData.creatorName}</p>
                    </div>
                    <span class="text-[9px] ${isOpen ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border-rose-500/30'} px-2 py-0.5 rounded-full border">${gData.status}</span>
                </div>
                <p class="text-[11px] text-slate-300 leading-relaxed">${gData.desc}</p>
                <div class="flex justify-between items-center text-[10px] text-slate-400 pt-1 border-t border-slate-700/40">
                    <span>📅 ${formattedDate}</span>
                    <span>👤 ${gData.memberCount || 1} Katılımcı</span>
                </div>
                <div class="flex justify-end pt-1">
                    <button onclick="openGroupChat('${gId}', '${gData.title}', '${gData.status}')" class="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-semibold rounded-lg transition shadow-sm">Sohbete Katıl</button>
                </div>
            `;

            // Listeye Ekle
            const card = document.createElement('div');
            card.className = "bg-slate-800/50 border border-slate-800 p-3.5 rounded-xl flex flex-col space-y-2 shadow-sm";
            card.innerHTML = cardHTML;
            groupsContainer.appendChild(card);

            // Gelecek Zamanlı Etkinlik Kontrolü ve Takvime Ekleme
            if (gData.eventDate && new Date(gData.eventDate) > now) {
                futureEventsCount++;
                const calCard = document.createElement('div');
                calCard.className = "bg-slate-800/50 border border-indigo-500/30 p-3.5 rounded-xl flex flex-col space-y-2 shadow-sm";
                calCard.innerHTML = cardHTML;
                calendarContainer.appendChild(calCard);
            }

            // Harita Pinleri
            if (mapInstance && gData.latitude && gData.longitude) {
                const marker = L.marker([gData.latitude, gData.longitude]).addTo(mapInstance);
                marker.bindPopup(`
                    <div style="font-family:sans-serif; color:#0f172a; min-width:160px;">
                        <h4 style="font-weight:bold; font-size:13px; margin-bottom:2px; color:#4f46e5;">${gData.title}</h4>
                        <p style="font-size:10px; color:#475569; margin-bottom:4px;">📅 ${formattedDate}</p>
                        <p style="font-size:11px; margin-bottom:6px; color:#334155;">${gData.desc}</p>
                        <button onclick="openGroupChat('${gId}', '${gData.title}', '${gData.status}')" style="background:#4f46e5; color:#fff; border:none; padding:4px 8px; font-size:10px; border-radius:6px; cursor:pointer; width:100%;">Sohbete Git</button>
                    </div>
                `);
                markerList.push(marker);
            }
        });

        if (futureEventsCount === 0) {
            calendarContainer.innerHTML = '<p class="text-center text-xs text-slate-500 mt-6">Şu an planlanmış gelecek zamanlı etkinlik bulunmuyor.</p>';
        }
    });
}

// Sohbet Ekranına Geçiş
window.openGroupChat = function(groupId, groupTitle, groupStatus) {
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

    document.querySelectorAll('.tab-view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-chat').classList.add('active');

    loadChatMessages(groupId);
};

backToGroupsBtn.addEventListener('click', () => {
    if (currentChatUnsubscribe) currentChatUnsubscribe();
    document.querySelectorAll('.tab-view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-groups').classList.add('active');
});

// Sohbet Mesajları
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
            const isMe = msgData.senderUid === auth.currentUser.uid;

            const msgDiv = document.createElement('div');
            msgDiv.className = `flex flex-col ${isMe ? 'items-end' : 'items-start'}`;
            msgDiv.innerHTML = `
                <div class="max-w-[75%] bg-slate-800 border border-slate-700/60 rounded-2xl px-3 py-2 text-xs text-slate-200 shadow-sm relative group">
                    <span class="block text-[10px] font-bold text-indigo-400 mb-0.5">${msgData.senderName}</span>
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

    const filteredText = filterBadWords(text);
    try {
        const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
        const senderName = userDoc.exists() ? userDoc.data().fullName : "Kullanıcı";

        await addDoc(collection(db, "groups", currentActiveGroupId, "messages"), {
            text: filteredText,
            senderUid: auth.currentUser.uid,
            senderName,
            createdAt: serverTimestamp()
        });
        chatInput.value = '';
    } catch (error) {
        alert("Mesaj gönderilemedi: " + error.message);
    }
});

// Raporlama
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
        const card = document.createElement('div');
        card.className = "bg-slate-800 border border-slate-700/60 p-3.5 rounded-xl flex flex-col space-y-2";
        card.innerHTML = `
            <h4 class="font-bold text-slate-200 text-xs">${uData.fullName} (${uData.age})</h4>
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

// Şikayetler ve Banlama Paneli
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

            if (!targetUid) {
                alert("Kullanıcı ID'sine ulaşılamadı.");
                return;
            }

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