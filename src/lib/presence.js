import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

const HEARTBEAT_MS = 30000;
const ONLINE_WINDOW_MS = 2 * 60 * 1000;

function lastSeenDate(user) {
  const value = user?.lastSeen;
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isUserOnlineNow(user, now = Date.now()) {
  const seen = lastSeenDate(user);
  if (!seen) return false;
  return now - seen.getTime() <= ONLINE_WINDOW_MS;
}

export function startPresence(uid) {
  if (!uid) return () => {};

  const ref = doc(db, "users", uid);
  const beat = () => {
    updateDoc(ref, { isOnline: true, lastSeen: serverTimestamp() }).catch(() => {});
  };
  const goOffline = () => {
    updateDoc(ref, { isOnline: false, lastSeen: serverTimestamp() }).catch(() => {});
  };

  beat();
  const timer = setInterval(beat, HEARTBEAT_MS);
  window.addEventListener("pagehide", goOffline);

  return () => {
    clearInterval(timer);
    window.removeEventListener("pagehide", goOffline);
    goOffline();
  };
}
