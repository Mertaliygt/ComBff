const { onDocumentCreated, onDocumentDeleted } = require("firebase-functions/v2/firestore");
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

  await step("bildirim kutusu", () => db.recursiveDelete(db.collection("users").doc(uid).collection("notifications")));

  await step("auth kaydı", async () => {
    try {
      await admin.auth().deleteUser(uid);
    } catch (error) {
      if (!error || error.code !== "auth/user-not-found") throw error;
    }
  });

  logger.info("Silinen kullanıcı temizlendi", { uid, groups: groupDocs.size });
});
