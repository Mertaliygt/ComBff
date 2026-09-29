"use client";
import { useState, useEffect } from "react";
import { fetchEventWeather, estimateWeatherFallback } from "@/utils/weatherHelper";

export default function EventWeatherBadge({
  latitude,
  longitude,
  eventDate,
  className = "",
  compact = false,
}) {
  const [weather, setWeather] = useState(() =>
    estimateWeatherFallback({ latitude, eventDate })
  );

  useEffect(() => {
    let cancelled = false;
    fetchEventWeather({ latitude, longitude, eventDate }).then((result) => {
      if (!cancelled && result) setWeather(result);
    });
    return () => {
      cancelled = true;
    };
  }, [latitude, longitude, eventDate]);

  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-lg border ${weather.bg} ${className}`}
      title="Etkinlik konumuna göre hava durumu"
    >
      {compact ? (
        <>
          <span>{weather.temp}</span>
          <span className="opacity-90">{weather.text.split(" ")[0]}</span>
        </>
      ) : (
        <>
          <span>{weather.text}</span>
          <span>{weather.temp}</span>
        </>
      )}
    </span>
  );
}
