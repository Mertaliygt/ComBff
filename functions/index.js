const { onDocumentCreated, onDocumentDeleted } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

admin.initializeApp();
setGlobalOptions({ maxInstances: 5 });

const ADMIN_ROLES = new Set(["superadmin", "admin", "moderator"]);
const DEAD_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
]);
const ANDROID_CHANNEL_ID = "high_importance_channel";

function normalizeRole(role) {
  const value = String(role || "").trim().toLowerCase();
  if (value === "mod") return "moderator";
  if (value === "super-admin") return "superadmin";
  return value;
}

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

async function deleteRefs(refs) {
  const db = admin.firestore();
  for (const part of chunk(refs, 400)) {
    const batch = db.batch();
    part.forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}

/** Hedef kullanıcıların cihaz token'larını toplar: Map<token, {uid, primary}>. */
async function collectTokens(data) {
  const db = admin.firestore();
  let userDocs = [];
  if (data.target === "group" && data.groupId) {
    const group = await db.doc(`groups/${data.groupId}`).get();
    const members = Array.isArray(group.get("members")) ? group.get("members").filter(Boolean) : [];
    for (const part of chunk(members, 100)) {
      const docs = await db.getAll(...part.map((uid) => db.doc(`users/${uid}`)));
      userDocs.push(...docs);
    }
  } else {
    const snap = await db.collection("users").select("fcmToken", "fcmTokens", "notificationsEnabled").get();
    userDocs = snap.docs;
  }

  const owners = new Map();
  for (const doc of userDocs) {
    if (!doc.exists) continue;
    const user = doc.data();
    if (user.notificationsEnabled === false) continue;
    const primary = typeof user.fcmToken === "string" ? user.fcmToken.trim() : "";
    const list = [...(Array.isArray(user.fcmTokens) ? user.fcmTokens : []), primary];
    for (const raw of list) {
      const token = typeof raw === "string" ? raw.trim() : "";
      if (token && !owners.has(token)) owners.set(token, { uid: doc.id, primary });
    }
  }
  return owners;
}

async function pruneDeadTokens(dead, owners) {
  const db = admin.firestore();
  await Promise.all(
    dead.map((token) => {
      const owner = owners.get(token);
      if (!owner) return null;
      const patch = { fcmTokens: admin.firestore.FieldValue.arrayRemove(token) };
      if (owner.primary === token) patch.fcmToken = admin.firestore.FieldValue.delete();
      return db.doc(`users/${owner.uid}`).update(patch).catch(() => null);
    })
  );
}

/**
 * Admin panelinden `notifications` koleksiyonuna yazılan duyuruyu, uygulaması
 * kapalı/arka planda olanlar dahil tüm hedef cihazlara FCM ile gönderir.
 */
exports.sendAdminAnnouncementPush = onDocumentCreated("notifications/{notificationId}", async (event) => {
  const snap = event.data;
  if (!snap) return;
  const data = snap.data();
  if (data.type !== "admin_announcement") return;

  const title = String(data.title || "").trim();
  const body = String(data.body || data.message || "").trim();

  if (!title || !body) {
    logger.warn("Boş duyuru için push atlandı", { notificationId: event.params.notificationId });
    return;
  }

  try {
    const sender = data.sentBy ? await admin.firestore().doc(`users/${data.sentBy}`).get() : null;
    if (!sender || !sender.exists || !ADMIN_ROLES.has(normalizeRole(sender.get("role")))) {
      logger.warn("Yetkisiz duyuru reddedildi", { notificationId: event.params.notificationId, sentBy: data.sentBy });
      return;
    }

    const owners = await collectTokens(data);
    const tokens = [...owners.keys()];
    if (tokens.length === 0) {
      logger.info("Duyuru için kayıtlı cihaz yok", { notificationId: event.params.notificationId });
      return;
    }

    const base = {
      notification: { title, body },
      data: {
        click_action: "FLUTTER_NOTIFICATION_CLICK",
        type: "admin_announcement",
        notificationId: event.params.notificationId,
        title,
        body,
      },
      android: { priority: "high", notification: { channelId: ANDROID_CHANNEL_ID, sound: "default" } },
      apns: {
        headers: { "apns-priority": "10", "apns-push-type": "alert" },
        payload: { aps: { sound: "default", contentAvailable: true } },
      },
    };

    let success = 0;
    let failure = 0;
    const dead = [];
    for (const part of chunk(tokens, 500)) {
      const result = await admin.messaging().sendEachForMulticast({ ...base, tokens: part });
      result.responses.forEach((res, i) => {
        if (res.success) {
          success += 1;
          return;
        }
        failure += 1;
        if (DEAD_TOKEN_CODES.has(res.error && res.error.code)) dead.push(part[i]);
      });
    }

    await pruneDeadTokens(dead, owners);
    logger.info("Duyuru push gönderildi", { notificationId: event.params.notificationId, targets: tokens.length, success, failure });
  } catch (error) {
    logger.error("Duyuru push hatası", error);
  }
});

/** `users/{uid}` belgesi silindiğinde (admin panelinden "Kullanıcıyı Sil") kullanıcının izlerini temizler. */
exports.cleanupDeletedUser = onDocumentDeleted("users/{uid}", async (event) => {
  const uid = event.params.uid;
  const db = admin.firestore();
  const FieldValue = admin.firestore.FieldValue;
  const step = async (name, fn) => {
    try {
      await fn();
    } catch (error) {
      logger.error(`Kullanıcı temizliği adımı başarısız: ${name}`, { uid, error: String((error && error.message) || error) });
    }
  };

  const groupDocs = new Map();
  await step("grupları bul", async () => {
    const queries = [
      db.collection("groups").where("createdBy", "==", uid).get(),
      db.collection("groups").where("members", "array-contains", uid).get(),
      db.collection("groups").where("leftMembers", "array-contains", uid).get(),
    ];
    for (const snap of await Promise.all(queries)) snap.docs.forEach((d) => groupDocs.set(d.id, d));
  });

  for (const group of groupDocs.values()) {
    await step(`grup ${group.id}`, async () => {
      // Kullanıcının bu gruptaki mesajlarını sil.
      for (;;) {
        const msgs = await group.ref.collection("messages").where("senderId", "==", uid).limit(400).get();
        if (msgs.empty) break;
        const batch = db.batch();
        msgs.docs.forEach((m) => batch.delete(m.ref));
        await batch.commit();
      }
      const data = group.data();
      const patch = {
        members: FieldValue.arrayRemove(uid),
        leftMembers: FieldValue.arrayRemove(uid),
        waitlist: FieldValue.arrayRemove(uid),
        joinRequests: FieldValue.arrayRemove(uid),
      };
      if (Array.isArray(data.members) && data.members.includes(uid)) patch.memberCount = FieldValue.increment(-1);
      // Kullanıcının kurduğu etkinlik silinmez, yayından alınıp sohbeti kapatılır (pasife alınır).
      if (data.createdBy === uid) {
        Object.assign(patch, {
          status: "Yayından Alındı",
          isApproved: false,
          chatStatus: "Kapalı",
          ownerDeleted: true,
          ownerDeletedAt: FieldValue.serverTimestamp(),
        });
      }
      await group.ref.update(patch);
    });
  }

  await step("üyelik kayıtları", async () => {
    for (const name of ["group_members", "event_requests"]) {
      const snap = await db.collection(name).where("uid", "==", uid).get();
      await deleteRefs(snap.docs.map((d) => d.ref));
    }
    await db.doc(`spontaneous_statuses/${uid}`).delete();
  });

  await step("etkinlik fotoğrafları", async () => {
    const snap = await db.collection("event_photos").where("uploaderUid", "==", uid).get();
    await deleteRefs(snap.docs.map((d) => d.ref));
  });

  // Karşı tarafların takip listelerindeki yansıma kayıtları.
  await step("takip kayıtları", async () => {
    const [followers, following] = await Promise.all([
      db.collection(`users/${uid}/followers`).get(),
      db.collection(`users/${uid}/following`).get(),
    ]);
    await deleteRefs([
      ...followers.docs.map((d) => db.doc(`users/${d.id}/following/${uid}`)),
      ...following.docs.map((d) => db.doc(`users/${d.id}/followers/${uid}`)),
    ]);
  });

  await step("özel sohbetler", async () => {
    const snap = await db.collection("chats").where("members", "array-contains", uid).get();
    for (const chat of snap.docs) await db.recursiveDelete(chat.ref);
  });

  for (const name of ["notifications", "followers", "following", "verifiedEvents"]) {
    await step(`users/${name}`, () => db.recursiveDelete(db.collection("users").doc(uid).collection(name)));
  }

  await step("auth kaydı", async () => {
    try {
      await admin.auth().deleteUser(uid);
    } catch (error) {
      if (!error || error.code !== "auth/user-not-found") throw error;
    }
  });

  logger.info("Silinen kullanıcı temizlendi", { uid, groups: groupDocs.size });
});

// ---------------------------------------------------------------------------
// Check-in ve puan: istemci `points`/rozet alanlarına yazamaz (firestore.rules); tüm puanlama burada.
// ---------------------------------------------------------------------------
const CHECKIN_POINTS = 50;
const CHECKIN_RADIUS_KM = 0.1;
const WINDOW_BEFORE_MS = 60 * 60 * 1000;
const WINDOW_AFTER_MS = 3 * 60 * 60 * 1000;
const TURKEY_OFFSET_MS = 3 * 60 * 60 * 1000;
const CATEGORY_ICONS = {
  "Kahve / Sohbet": "☕",
  "Yemek / İçki": "🍽️",
  "Motor / Sürüş": "🏍️",
  "Kamp / Doğa": "🏕️",
  "Spor / Fitness": "💪",
  "Gezi / Şehir": "🗺️",
};

/** `groups.eventDate` zaman dilimsiz "YYYY-MM-DDTHH:mm" olarak (Türkiye saati) saklanır. */
function parseEventDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  const raw = String(value).trim();
  if (!raw) return null;
  const zoned = /(z|[+-]\d{2}:?\d{2})$/i.test(raw);
  const date = new Date(zoned ? raw : `${raw.replace(" ", "T")}+03:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function distanceKm(lat1, lon1, lat2, lon2) {
  const rad = (deg) => (deg * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function turkeyMonthKey(now = new Date()) {
  const local = new Date(now.getTime() + TURKEY_OFFSET_MS);
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}`;
}

function eventVerifiedBadge(title, category) {
  const icon = CATEGORY_ICONS[category] || "✨";
  const trimmedTitle = String(title || "").trim();
  const trimmedCategory = String(category || "").trim();
  const name = trimmedTitle || trimmedCategory || "Buluşma";
  return `${name} ${icon} - Verified`;
}

function activityBadges(category, eventDate) {
  const earned = [];
  if (category === "Kamp / Doğa") earned.push("Kamp Ustası ⛺");
  if (category === "Kahve / Sohbet") earned.push("Kahve Gurmesi ☕");
  if (category === "Motor / Sürüş" && eventDate) {
    const hour = new Date(eventDate.getTime() + TURKEY_OFFSET_MS).getUTCHours();
    if (hour >= 20 || hour < 6) earned.push("Gece Sürücüsü 🌙");
  }
  return earned;
}

/** Mobil `_readApproved` ile aynı mantık. */
function isApprovedUser(user) {
  if (user.approved === true || user.isApproved === true) return true;
  if (user.approved === false || user.isApproved === false) return false;
  return user.status !== "pending";
}

/** Çağıran oturum açmış, onaylı ve banlı olmayan bir kullanıcı olmalı. */
async function requireActiveCaller(request) {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Giriş yapmalısınız.");
  const snap = await admin.firestore().doc(`users/${uid}`).get();
  const user = snap.exists ? snap.data() : null;
  const staff = user && ADMIN_ROLES.has(normalizeRole(user.role));
  if (!user || user.banned === true || user.isSuspended === true || (!isApprovedUser(user) && !staff)) {
    throw new HttpsError("permission-denied", "Bu işlem için onaylı bir hesap gerekir.");
  }
  return uid;
}

function memberList(group) {
  return Array.isArray(group.members) ? group.members.map(String) : [];
}

/**
 * Check-in: `self` (saha doğrulaması: etkinlik saati + 100 m yarıçap sunucuda denetlenir) veya
 * `peer` (QR bilet okutma: okutan ve okutulan kişi birlikte puan alır).
 */
exports.checkIn = onCall(async (request) => {
  const scannerUid = await requireActiveCaller(request);
  const data = request.data || {};
  const eventId = String(data.eventId || "").trim();
  const mode = data.mode === "peer" ? "peer" : "self";
  if (!eventId) throw new HttpsError("invalid-argument", "Etkinlik bulunamadı.");

  let uids = [scannerUid];
  if (mode === "peer") {
    const participantUid = String(data.participantUid || "").trim();
    if (!participantUid) throw new HttpsError("invalid-argument", "Bilet geçersiz.");
    if (participantUid === scannerUid) throw new HttpsError("failed-precondition", "Kendi biletini okutamazsın.");
    uids = [scannerUid, participantUid];
  }

  const db = admin.firestore();
  const FieldValue = admin.firestore.FieldValue;
  const groupRef = db.doc(`groups/${eventId}`);
  const result = await db.runTransaction(async (tx) => {
    const groupSnap = await tx.get(groupRef);
    if (!groupSnap.exists) throw new HttpsError("not-found", "Etkinlik bulunamadı.");
    const group = groupSnap.data();

    if (mode === "self") {
      const lat = Number(data.latitude);
      const lon = Number(data.longitude);
      const eventLat = Number(group.latitude);
      const eventLon = Number(group.longitude);
      const eventDate = parseEventDate(group.eventDate);
      if (!Number.isFinite(eventLat) || !Number.isFinite(eventLon)) {
        throw new HttpsError("failed-precondition", "Etkinlik konumu yok.");
      }
      const now = Date.now();
      if (!eventDate || now < eventDate.getTime() - WINDOW_BEFORE_MS || now > eventDate.getTime() + WINDOW_AFTER_MS) {
        throw new HttpsError("failed-precondition", "Saha doğrulaması etkinlik saatinde açılır.");
      }
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new HttpsError("invalid-argument", "Konum alınamadı.");
      if (distanceKm(lat, lon, eventLat, eventLon) > CHECKIN_RADIUS_KM) {
        throw new HttpsError("failed-precondition", "Buluşma noktasına 100 metreden uzaksın.");
      }
    }

    const userSnaps = await Promise.all(uids.map((id) => tx.get(db.doc(`users/${id}`))));
    const memberSnaps = await Promise.all(uids.map((id) => tx.get(db.doc(`group_members/${eventId}_${id}`))));
    const members = memberList(group);
    for (let i = 0; i < uids.length; i += 1) {
      const user = userSnaps[i].exists ? userSnaps[i].data() : null;
      if (!user) throw new HttpsError("not-found", "Katılımcı profili bulunamadı.");
      if (user.banned === true || user.isSuspended === true) {
        throw new HttpsError("permission-denied", "Katılımcının hesabı kısıtlı.");
      }
      if (!members.includes(uids[i])) {
        throw new HttpsError("failed-precondition", "Check-in için iki tarafın da onaylı üye olması gerekir.");
      }
    }

    const monthKey = turkeyMonthKey();
    const fresh = [];
    for (let i = 0; i < uids.length; i += 1) {
      if (memberSnaps[i].exists && memberSnaps[i].get("checkedIn") === true) continue;
      const sameMonth = String(userSnaps[i].get("pointsMonth") || "") === monthKey;
      const scannedByPeer = scannerUid !== uids[i];
      tx.set(
        db.doc(`group_members/${eventId}_${uids[i]}`),
        {
          groupId: eventId,
          eventId,
          uid: uids[i],
          checkedIn: true,
          checkedInAt: FieldValue.serverTimestamp(),
          checkedInBy: scannerUid,
          ...(scannedByPeer ? { isScanned: true, status: "verified" } : {}),
        },
        { merge: true }
      );
      tx.update(db.doc(`users/${uids[i]}`), {
        points: FieldValue.increment(CHECKIN_POINTS),
        travelerPoints: FieldValue.increment(CHECKIN_POINTS),
        pointsMonth: monthKey,
        monthPoints: sameMonth ? FieldValue.increment(CHECKIN_POINTS) : CHECKIN_POINTS,
      });
      fresh.push(uids[i]);
    }
    return fresh;
  });

  if (mode === "peer" && result.includes(uids[1])) {
    try {
      await db.collection(`users/${uids[1]}/notifications`).add({
        title: "Biletiniz okutuldu, +50 puan kazandınız!",
        message: "Biletiniz okutuldu, +50 puan kazandınız!",
        type: "ticket_scanned",
        groupId: eventId,
        senderUid: scannerUid,
        isRead: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    } catch (error) {
      logger.warn("Bilet bildirimi yazılamadı", { eventId, error: String((error && error.message) || error) });
    }
  }

  return {
    alreadyCheckedIn: result.length === 0,
    points: result.length === 0 ? 0 : CHECKIN_POINTS,
    awardedUsers: result.length,
    awardedUids: result,
  };
});

/** Kurucunun gösterdiği QR anahtarıyla katılım doğrulaması: rozet ve puan verir. */
exports.verifyAttendance = onCall(async (request) => {
  const uid = await requireActiveCaller(request);
  const data = request.data || {};
  const groupId = String(data.groupId || "").trim();
  const key = String(data.key || "").trim();
  if (!groupId || !key) throw new HttpsError("invalid-argument", "QR kodu geçersiz.");

  const db = admin.firestore();
  const FieldValue = admin.firestore.FieldValue;
  const groupRef = db.doc(`groups/${groupId}`);
  const keyRef = db.doc(`groups/${groupId}/private/checkin`);
  const userRef = db.doc(`users/${uid}`);
  const eventRef = db.doc(`users/${uid}/verifiedEvents/${groupId}`);
  const memberRef = db.doc(`group_members/${groupId}_${uid}`);

  let firstHundred = false;
  try {
    const early = await db.collection("users").orderBy("createdAt").limit(100).get();
    firstHundred = early.docs.some((doc) => doc.id === uid);
  } catch (error) {
    logger.warn("İlk 100 üye sorgusu başarısız", { error: String((error && error.message) || error) });
  }

  return db.runTransaction(async (tx) => {
    const [groupSnap, keySnap, userSnap, existing] = await Promise.all([
      tx.get(groupRef),
      tx.get(keyRef),
      tx.get(userRef),
      tx.get(eventRef),
    ]);
    if (!groupSnap.exists) throw new HttpsError("not-found", "Etkinlik bulunamadı.");
    const group = groupSnap.data();
    const stored = keySnap.exists ? String(keySnap.get("key") || "") : "";
    if (!stored || stored !== key) throw new HttpsError("failed-precondition", "QR kodu geçersiz veya süresi doldu.");
    if (String(group.createdBy || "") === uid) {
      throw new HttpsError("failed-precondition", "Kurucu kendi kodunu doğrulayamaz.");
    }
    if (!memberList(group).includes(uid)) {
      throw new HttpsError("failed-precondition", "Saha doğrulaması için önce etkinliğe katıl.");
    }

    const category = String(group.category || "");
    const badge = eventVerifiedBadge(group.title, category);
    if (existing.exists && existing.get("isVerified") === true) {
      return { badge: String(existing.get("badge") || badge), alreadyVerified: true, points: 0 };
    }

    const monthKey = turkeyMonthKey();
    const sameMonth = String(userSnap.get("pointsMonth") || "") === monthKey;
    const earned = activityBadges(category, parseEventDate(group.eventDate));
    if (firstHundred) earned.push("İlk 100 Üye 🚀");

    tx.set(eventRef, {
      groupId,
      eventId: groupId,
      isVerified: true,
      badge,
      points: CHECKIN_POINTS,
      verifiedAt: FieldValue.serverTimestamp(),
    });
    tx.set(memberRef, {
      groupId,
      eventId: groupId,
      uid,
      isVerified: true,
      verifiedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    const update = {
      earnedBadges: FieldValue.arrayUnion(badge),
      travelerPoints: FieldValue.increment(CHECKIN_POINTS),
      points: FieldValue.increment(CHECKIN_POINTS),
      pointsMonth: monthKey,
      monthPoints: sameMonth ? FieldValue.increment(CHECKIN_POINTS) : CHECKIN_POINTS,
    };
    if (earned.length > 0) update.badges = FieldValue.arrayUnion(...earned);
    tx.update(userRef, update);
    return { badge, alreadyVerified: false, points: CHECKIN_POINTS };
  });
});
