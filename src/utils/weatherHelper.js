const WEATHER_CACHE = new Map();

const WMO_MAP = {
  0: { text: "Açık ☀️", bg: "bg-amber-500/10 text-amber-300 border-amber-500/30" },
  1: { text: "Az bulutlu 🌤️", bg: "bg-amber-500/10 text-amber-300 border-amber-500/30" },
  2: { text: "Parçalı bulutlu ⛅", bg: "bg-blue-500/10 text-brand border-blue-500/30" },
  3: { text: "Bulutlu ☁️", bg: "bg-slate-500/10 text-slate-300 border-slate-500/30" },
  45: { text: "Sisli 🌫️", bg: "bg-slate-500/10 text-slate-300 border-slate-500/30" },
  48: { text: "Sisli 🌫️", bg: "bg-slate-500/10 text-slate-300 border-slate-500/30" },
  51: { text: "Çiseleyen 🌦️", bg: "bg-cyan-500/10 text-cyan-300 border-cyan-500/30" },
  53: { text: "Çiseleyen 🌦️", bg: "bg-cyan-500/10 text-cyan-300 border-cyan-500/30" },
  55: { text: "Sağanak 🌧️", bg: "bg-blue-500/10 text-brand border-blue-500/30" },
  61: { text: "Yağmurlu 🌧️", bg: "bg-blue-500/10 text-brand border-blue-500/30" },
  63: { text: "Yağmurlu 🌧️", bg: "bg-blue-500/10 text-brand border-blue-500/30" },
  65: { text: "Şiddetli yağmur 🌧️", bg: "bg-indigo-500/10 text-indigo-300 border-indigo-500/30" },
  71: { text: "Karlı ❄️", bg: "bg-sky-500/10 text-sky-300 border-sky-500/30" },
  73: { text: "Karlı ❄️", bg: "bg-sky-500/10 text-sky-300 border-sky-500/30" },
  75: { text: "Yoğun kar ❄️", bg: "bg-sky-500/10 text-sky-300 border-sky-500/30" },
  80: { text: "Sağanak 🌦️", bg: "bg-cyan-500/10 text-cyan-300 border-cyan-500/30" },
  81: { text: "Sağanak 🌦️", bg: "bg-cyan-500/10 text-cyan-300 border-cyan-500/30" },
  82: { text: "Kuvvetli sağanak ⛈️", bg: "bg-indigo-500/10 text-indigo-300 border-indigo-500/30" },
  95: { text: "Fırtınalı ⛈️", bg: "bg-violet-500/10 text-violet-300 border-violet-500/30" },
  96: { text: "Dolu ⛈️", bg: "bg-violet-500/10 text-violet-300 border-violet-500/30" },
  99: { text: "Şiddetli fırtına ⛈️", bg: "bg-violet-500/10 text-violet-300 border-violet-500/30" },
};

function formatDateISO(dateInput) {
  const d = dateInput ? new Date(dateInput) : new Date();
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function mapWeatherCode(code, tempC) {
  const mapped = WMO_MAP[code] || WMO_MAP[2];
  const rounded = Math.round(Number.isFinite(tempC) ? tempC : 20);
  return {
    temp: `${rounded}°C`,
    text: mapped.text,
    bg: mapped.bg,
    code,
  };
}

/** Konum + ay bazlı gerçekçi yedek (API yoksa / uzak tarih). */
export function estimateWeatherFallback({ latitude = 36.9, eventDate } = {}) {
  const d = eventDate ? new Date(eventDate) : new Date();
  const month = Number.isNaN(d.getTime()) ? new Date().getMonth() : d.getMonth();
  const absLat = Math.abs(latitude || 36.9);

  // Akdeniz / Türkiye ortalama mevsimsel sıcaklık kabası
  const coastalBase = [9, 10, 13, 17, 21, 26, 29, 29, 25, 20, 15, 11];
  let temp = coastalBase[month];
  if (absLat > 42) temp -= 4;
  if (absLat < 35) temp += 2;

  let text = "Açık ☀️";
  let bg = "bg-amber-500/10 text-amber-300 border-amber-500/30";
  if (month >= 11 || month <= 1) {
    text = "Bulutlu ☁️";
    bg = "bg-slate-500/10 text-slate-300 border-slate-500/30";
    temp -= 1;
  } else if (month >= 5 && month <= 8) {
    text = "Güneşli 🌤️";
    bg = "bg-emerald-500/10 text-emerald-300 border-emerald-500/30";
  } else {
    text = "Parçalı bulutlu ⛅";
    bg = "bg-blue-500/10 text-brand border-blue-500/30";
  }

  return { temp: `${Math.round(temp)}°C`, text, bg, code: -1 };
}

/**
 * Open-Meteo ile etkinlik konum/tarihine göre gerçek hava.
 * Firebase yapısına dokunmaz; yalnızca istemci tarafı okuma.
 */
export async function fetchEventWeather({ latitude, longitude, eventDate } = {}) {
  const lat = Number(latitude);
  const lon = Number(longitude);
  const safeLat = Number.isFinite(lat) ? lat : 36.8969;
  const safeLon = Number.isFinite(lon) ? lon : 30.7133;
  const dateStr = formatDateISO(eventDate);
  const cacheKey = `${safeLat.toFixed(3)},${safeLon.toFixed(3)},${dateStr}`;

  if (WEATHER_CACHE.has(cacheKey)) {
    return WEATHER_CACHE.get(cacheKey);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${dateStr}T12:00:00`);
  const diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  // Forecast ~16 gün; geçmiş için archive; çok uzak gelecek için tahmin
  if (diffDays > 16) {
    const fallback = estimateWeatherFallback({ latitude: safeLat, eventDate: target });
    WEATHER_CACHE.set(cacheKey, fallback);
    return fallback;
  }

  try {
    const base =
      diffDays < 0
        ? "https://archive-api.open-meteo.com/v1/archive"
        : "https://api.open-meteo.com/v1/forecast";

    const url =
      `${base}?latitude=${safeLat}&longitude=${safeLon}` +
      `&start_date=${dateStr}&end_date=${dateStr}` +
      `&daily=weather_code,temperature_2m_max&timezone=auto`;

    const res = await fetch(url);
    if (!res.ok) throw new Error("weather http " + res.status);
    const data = await res.json();
    const code = data?.daily?.weather_code?.[0];
    const temp = data?.daily?.temperature_2m_max?.[0];
    if (code == null || temp == null) throw new Error("weather empty");

    const weather = mapWeatherCode(code, temp);
    WEATHER_CACHE.set(cacheKey, weather);
    return weather;
  } catch {
    const fallback = estimateWeatherFallback({ latitude: safeLat, eventDate: target });
    WEATHER_CACHE.set(cacheKey, fallback);
    return fallback;
  }
}

export function getAtmosphereFromWeather(weather) {
  const raw = weather?.text || "Açık";
  const temp = weather?.temp || "20°C";
  const text = raw.replace(/[^\p{L}\p{N}\s]/gu, "").trim() || "Açık";

  if (/yağmur|sağanak|çisele/i.test(raw)) {
    return { text: "Yağmurlu", temp, bgAtmosphere: "border-cyan-500/40 shadow-cyan-600/20", glowColor: "from-cyan-600/15" };
  }
  if (/kar/i.test(raw)) {
    return { text: "Karlı", temp, bgAtmosphere: "border-sky-500/40 shadow-sky-600/20", glowColor: "from-sky-600/10" };
  }
  if (/bulut|sis/i.test(raw)) {
    return { text: "Bulutlu", temp, bgAtmosphere: "border-amber-500/40 shadow-amber-600/20", glowColor: "from-amber-600/10" };
  }
  return { text: text.split(/\s+/)[0] || "Açık", temp, bgAtmosphere: "border-blue-500/40 shadow-blue-600/20", glowColor: "from-blue-600/10" };
}
