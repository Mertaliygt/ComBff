import { db } from "@/lib/firebase";
import { 
  doc, 
  setDoc, 
  getDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc,
  collection, 
  query,
  where,
  getDocs,
  serverTimestamp 
} from "firebase/firestore";

/**
 * 1. Kullanıcıya Takip İsteği Gönderir (Mükerrer İstek Engelli)
 */
export async function sendFollowRequest(currentUser, targetUid) {
  if (!currentUser) throw new Error("Giriş yapmalısınız.");
  if (currentUser.uid === targetUid) throw new Error("Kendinizi takip edemezsiniz.");

  // A) Zaten takip ediyor mu kontrol et
  const followingSnap = await getDoc(doc(db, "users", currentUser.uid, "following", targetUid));
  if (followingSnap.exists()) {
    throw new Error("Bu kullanıcıyı zaten takip ediyorsunuz.");
  }

  // B) Zaten bekleyen istek var mı kontrol et
  const notifRef = collection(db, "users", targetUid, "notifications");
  const q = query(
    notifRef, 
    where("type", "==", "follow_request"), 
    where("senderUid", "==", currentUser.uid),
    where("isRead", "==", false)
  );
  const existingReqs = await getDocs(q);

  if (!existingReqs.empty) {
    throw new Error("Zaten bekleyen bir takip isteğiniz bulunuyor.");
  }

  const userDoc = await getDoc(doc(db, "users", currentUser.uid));
  const senderName = userDoc.exists() ? userDoc.data().fullName : "Bir kullanıcı";

  // C) Hedef kullanıcının notifications koleksiyonuna istek ekle
  await addDoc(notifRef, {
    title: "Yeni Takip İsteği 👤",
    message: `${senderName} size takip isteği gönderdi.`,
    type: "follow_request",
    senderUid: currentUser.uid,
    senderName: senderName,
    isRead: false,
    createdAt: serverTimestamp()
  });
}

/**
 /**
 * 2. Gelen Takip İsteğini Kabul Et
 */
export async function acceptFollowRequest(currentUserUid, notifId, senderUid, senderName) {
  // A) Benim takipçilerime isteği atan kişiyi ekle
  await setDoc(doc(db, "users", currentUserUid, "followers", senderUid), {
    uid: senderUid,
    createdAt: serverTimestamp()
  });

  // B) İstegi atan kişinin takip ettiklerine beni ekle (DÜZELTİLEN KISIM: Fazla doc() kaldırıldı)
  await setDoc(doc(db, "users", senderUid, "following", currentUserUid), {
    uid: currentUserUid,
    createdAt: serverTimestamp()
  });

  // C) Bildirimi okundu ve "follow_accepted" yap
  await updateDoc(doc(db, "users", currentUserUid, "notifications", notifId), {
    isRead: true,
    type: "follow_accepted"
  });

  // D) İstek atan kişiye kabul edildi bildirimi gönder
  const myDoc = await getDoc(doc(db, "users", currentUserUid));
  const myName = myDoc.exists() ? myDoc.data().fullName : "Kullanıcı";

  await addDoc(collection(db, "users", senderUid, "notifications"), {
    title: "Takip İsteği Kabul Edildi 🎉",
    message: `${myName} takip isteğinizi kabul etti.`,
    type: "general",
    isRead: false,
    createdAt: serverTimestamp()
  });
}

/**
 * 3. Gelen Takip İsteğini Reddet
 */
export async function rejectFollowRequest(currentUserUid, notifId) {
  await updateDoc(doc(db, "users", currentUserUid, "notifications", notifId), {
    isRead: true,
    type: "follow_rejected"
  });
}

/**
 * 4. Tek Bir Bildirimi Sil
 */
export async function deleteNotification(currentUserUid, notifId) {
  await deleteDoc(doc(db, "users", currentUserUid, "notifications", notifId));
}

/**
 * 5. Tüm Bildirimleri Temizle
 */
export async function clearAllNotifications(currentUserUid) {
  const notifRef = collection(db, "users", currentUserUid, "notifications");
  const snapshot = await getDocs(notifRef);
  
  const deletePromises = snapshot.docs.map((docSnap) => deleteDoc(docSnap.ref));
  await Promise.all(deletePromises);
}

/**
 * 6. Kullanıcının Takipçilerini Getir
 */
export async function getFollowersList(uid) {
  const followersSnap = await getDocs(collection(db, "users", uid, "followers"));
  const userIds = followersSnap.docs.map(d => d.id);
  
  if (userIds.length === 0) return [];

  const usersList = [];
  for (const id of userIds) {
    const uDoc = await getDoc(doc(db, "users", id));
    if (uDoc.exists()) {
      usersList.push({ id: uDoc.id, ...uDoc.data() });
    }
  }
  return usersList;
}

/**
 * 7. Kullanıcının Takip Ettiklerini Getir
 */
export async function getFollowingList(uid) {
  const followingSnap = await getDocs(collection(db, "users", uid, "following"));
  const userIds = followingSnap.docs.map(d => d.id);

  if (userIds.length === 0) return [];

  const usersList = [];
  for (const id of userIds) {
    const uDoc = await getDoc(doc(db, "users", id));
    if (uDoc.exists()) {
      usersList.push({ id: uDoc.id, ...uDoc.data() });
    }
  }
  return usersList;
}