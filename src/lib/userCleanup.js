import {
  arrayRemove,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  where,
  writeBatch,
} from "firebase/firestore";

const BATCH_LIMIT = 400;

async function deleteRefs(db, refs) {
  for (let i = 0; i < refs.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    refs.slice(i, i + BATCH_LIMIT).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}

async function refsOf(...queries) {
  const snaps = await Promise.all(queries.map((q) => getDocs(q)));
  return snaps.flatMap((snap) => snap.docs.map((d) => d.ref));
}

/**
 * Kullanıcıyı ve izlerini istemciden (Firestore SDK) temizler; Cloud Functions gerekmez.
 * Sıra: ilişkili veriler -> en son `users/{uid}` belgesi (yarıda kalırsa işlem tekrar çalıştırılabilir).
 * Firebase Auth hesabı istemciden silinemez; gerekirse Firebase Console > Authentication'dan silinmelidir.
 * Yetki firestore.rules tarafından denetlenir (silme: admin/superadmin).
 */
export async function deleteUserWithCleanup(db, uid) {
  if (!uid) throw new Error("Kullanıcı kimliği yok.");

  // 1) Üyelik, başvuru, fotoğraf ve anlık durum kayıtları.
  await deleteRefs(
    db,
    await refsOf(
      query(collection(db, "group_members"), where("uid", "==", uid)),
      query(collection(db, "event_requests"), where("uid", "==", uid)),
      query(collection(db, "event_photos"), where("uploaderUid", "==", uid))
    )
  );
  await deleteDoc(doc(db, "spontaneous_statuses", uid)).catch(() => null);

  // 2) Etkinlikler: mesajlarını sil, üyelikten çıkar (transaction ile üye sayısı tutarlı kalır),
  //    kurduğu etkinliği silmeden yayından al.
  const groupDocs = new Map();
  const groupQueries = [
    query(collection(db, "groups"), where("createdBy", "==", uid)),
    query(collection(db, "groups"), where("members", "array-contains", uid)),
    query(collection(db, "groups"), where("leftMembers", "array-contains", uid)),
  ];
  for (const snap of await Promise.all(groupQueries.map((q) => getDocs(q)))) {
    snap.docs.forEach((d) => groupDocs.set(d.id, d.ref));
  }
  for (const ref of groupDocs.values()) {
    await deleteRefs(db, await refsOf(query(collection(ref, "messages"), where("senderId", "==", uid))));
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return;
      const data = snap.data();
      const members = (Array.isArray(data.members) ? data.members : []).filter((id) => id !== uid);
      const patch = {
        members,
        memberCount: members.length,
        leftMembers: arrayRemove(uid),
        waitlist: arrayRemove(uid),
        joinRequests: arrayRemove(uid),
      };
      if (data.createdBy === uid) {
        Object.assign(patch, {
          status: "Yayından Alındı",
          isApproved: false,
          chatStatus: "Kapalı",
          ownerDeleted: true,
          ownerDeletedAt: serverTimestamp(),
        });
      }
      tx.update(ref, patch);
    });
  }

  // 3) Karşı tarafların takip listelerindeki yansıma kayıtları.
  const [followers, following] = await Promise.all([
    getDocs(collection(db, "users", uid, "followers")),
    getDocs(collection(db, "users", uid, "following")),
  ]);
  await deleteRefs(db, [
    ...followers.docs.map((d) => doc(db, "users", d.id, "following", uid)),
    ...following.docs.map((d) => doc(db, "users", d.id, "followers", uid)),
  ]);

  // 4) Özel sohbetler (mesajlarıyla) ve kullanıcının alt koleksiyonları.
  const chats = await getDocs(query(collection(db, "chats"), where("members", "array-contains", uid)));
  for (const chat of chats.docs) {
    await deleteRefs(db, (await getDocs(collection(chat.ref, "messages"))).docs.map((d) => d.ref));
    await deleteDoc(chat.ref);
  }
  for (const name of ["notifications", "followers", "following", "verifiedEvents"]) {
    await deleteRefs(db, (await getDocs(collection(db, "users", uid, name))).docs.map((d) => d.ref));
  }

  // 5) Son adım: kullanıcı belgesi.
  await deleteDoc(doc(db, "users", uid));
}
