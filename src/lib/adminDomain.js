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

export function instagramBeyan(user) {
  const raw = String(user?.instagram || "").trim();
  if (!raw) return { handle: "", href: "" };
  const handle = raw
    .replace(/^@/, "")
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/\/+$/, "")
    .split("?")[0];
  return {
    handle: handle || raw,
    href: handle ? `https://instagram.com/${handle}` : "",
  };
}

export function parseEventSchedule(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") {
    const d = value.toDate();
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === "object" && typeof value.seconds === "number") {
    return new Date(value.seconds * 1000);
  }
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(raw)) {
    const withSeconds = raw.length === 16 ? `${raw}:00` : raw;
    const istanbul = new Date(`${withSeconds}+03:00`);
    return Number.isNaN(istanbul.getTime()) ? null : istanbul;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function eventScheduleMs(item) {
  return parseEventSchedule(item?.eventDate)?.getTime() ?? null;
}

export function isEventPast(item, now = Date.now()) {
  const ms = eventScheduleMs(item);
  return ms != null && ms < now;
}

export function sortEventsBySchedule(items, now = Date.now()) {
  return [...items].sort((a, b) => {
    const aMs = eventScheduleMs(a);
    const bMs = eventScheduleMs(b);
    if (aMs == null && bMs == null) {
      return (parseEventSchedule(b?.createdAt)?.getTime() || 0) - (parseEventSchedule(a?.createdAt)?.getTime() || 0);
    }
    if (aMs == null) return 1;
    if (bMs == null) return -1;

    const aUpcoming = aMs >= now;
    const bUpcoming = bMs >= now;
    if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1;
    if (aMs !== bMs) return aUpcoming ? aMs - bMs : bMs - aMs;

    const aCreated = parseEventSchedule(a?.createdAt)?.getTime() || 0;
    const bCreated = parseEventSchedule(b?.createdAt)?.getTime() || 0;
    return aCreated - bCreated;
  });
}
