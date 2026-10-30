export function uniqueIds(list) {
  return [...new Set((Array.isArray(list) ? list : []).filter(Boolean))];
}

export function getEmailVerification(user) {
  if (user?.emailVerified === true) {
    return { status: "Doğrulandı", known: true, badge: "is-ok" };
  }
  if (user?.emailVerified === false) {
    return { status: "Doğrulanmadı", known: true, badge: "is-danger" };
  }
  if (user?.emailVerificationStatus === "Beklemede") {
    return { status: "Beklemede", known: true, badge: "is-warn" };
  }
  if (user?.email) {
    return {
      status: "Bilinmiyor",
      known: false,
      badge: "is-warn",
      note: "Auth doğrulama alanı henüz senkronize edilmedi",
    };
  }
  return { status: "Doğrulanmadı", known: true, badge: "is-danger", note: "E-posta yok" };
}

export function getPhoneVerification(user) {
  if (user?.phoneVerified === true) {
    return { status: "Doğrulandı", known: true, badge: "is-ok" };
  }
  if (user?.phoneVerified === false) {
    return { status: "Doğrulanmadı", known: true, badge: "is-danger" };
  }
  if (user?.phoneNumber || user?.phone) {
    return { status: "Beklemede", known: true, badge: "is-warn", note: "Numara var, doğrulama kaydı yok" };
  }
  return {
    status: "Yok",
    known: false,
    badge: "is-warn",
    note: "Uygulamada telefon doğrulaması bulunmuyor",
  };
}

export function eventCapacity(item) {
  const value = Number(item?.capacity);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function participantLists(item) {
  const members = uniqueIds(item?.members);
  const waitlist = uniqueIds(item?.waitlist);
  const leftMembers = uniqueIds(item?.leftMembers);
  const joinRequests = uniqueIds(item?.joinRequests);
  const rejectedMembers = uniqueIds(item?.rejectedMembers);
  return { members, waitlist, leftMembers, joinRequests, rejectedMembers };
}

export function reportPriority(report) {
  const value = String(report?.priority || "Normal");
  if (["Düşük", "Normal", "Yüksek", "Acil"].includes(value)) return value;
  return "Normal";
}

export function priorityBadge(priority) {
  if (priority === "Acil" || priority === "Yüksek") return "is-danger";
  if (priority === "Düşük") return "is-ok";
  return "is-warn";
}

export function userLabel(user, fallback = "Bilinmeyen kullanıcı") {
  if (!user) return fallback;
  return user.fullName || user.email || user.id || fallback;
}
