import { addDoc, collection } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

export async function writeAdminLog({
  action,
  targetType = "",
  targetId = "",
  targetLabel = "",
  reason = "",
  before = null,
  after = null,
}) {
  const user = auth.currentUser;
  await addDoc(collection(db, "admin_logs"), {
    adminUid: user?.uid || "unknown",
    adminEmail: user?.email || "",
    action,
    targetType,
    targetId,
    targetLabel,
    reason,
    before,
    after,
    createdAt: new Date(),
  });
}
