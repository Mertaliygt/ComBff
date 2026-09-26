"use client";
import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

export default function MapComponent({ groups }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);

  useEffect(() => {
    // Tarayıcı ortamında olduğumuzu garantiye alıyoruz
    if (typeof window === "undefined") return;

    import("leaflet").then((L) => {
      if (!mapInstanceRef.current && mapRef.current) {
        mapInstanceRef.current = L.map(mapRef.current).setView([40.9923, 29.0294], 14);

        L.tileLayer('https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}', {
          maxZoom: 20,
          subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
          attribution: '&copy; Google Maps'
        }).addTo(mapInstanceRef.current);
      }

      const map = mapInstanceRef.current;

      // Eski pinleri temizle
      markersRef.current.forEach(m => map.removeLayer(m));
      markersRef.current = [];

      // Yeni pinleri ekle
      groups.forEach((gData) => {
        if (gData.latitude && gData.longitude && gData.status !== "Onay Bekliyor") {
          const imgSrc = gData.imageUrl || '';
          const initial = gData.title ? gData.title.charAt(0).toUpperCase() : 'G';

          const pinHtml = imgSrc 
            ? `<div style="width:40px;height:40px;border-radius:50%;border:2.5px solid #6366f1;background:#0f172a;overflow:hidden;display:flex;align-items:center;justify-content:center;"><img src="${imgSrc}" style="width:100%;height:100%;object-fit:cover;"></div>`
            : `<div style="width:40px;height:40px;border-radius:50%;border:2.5px solid #6366f1;background:#0f172a;color:#818cf8;font-weight:bold;display:flex;align-items:center;justify-content:center;">${initial}</div>`;

          const customIcon = L.divIcon({
            className: 'custom-map-pin',
            html: pinHtml,
            iconSize: [40, 40],
            iconAnchor: [20, 20]
          });

          const marker = L.marker([gData.latitude, gData.longitude], { icon: customIcon }).addTo(map);
          
          const formattedDate = gData.eventDate ? new Date(gData.eventDate).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }) : 'Belirtilmedi';

          marker.bindPopup(`
            <div style="font-family:sans-serif; color:#0f172a; min-width:180px; text-align:center; padding:2px;">
              ${imgSrc ? `<img src="${imgSrc}" style="width:100%; height:90px; object-fit:cover; border-radius:8px; margin-bottom:6px;">` : ''}
              <h4 style="font-weight:bold; font-size:13px; margin-bottom:2px; color:#4f46e5;">${gData.title}</h4>
              <p style="font-size:10px; color:#475569; margin-bottom:2px;">Kategori: ${gData.category}</p>
              <p style="font-size:10px; color:#475569; margin-bottom:8px;">📅 ${formattedDate}</p>
            </div>
          `);

          markersRef.current.push(marker);
        }
      });

      setTimeout(() => {
        map.invalidateSize();
      }, 200);
    });

  }, [groups]);

  return <div ref={mapRef} className="w-full h-full z-10" style={{ minHeight: "400px" }} />;
}