"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import styles from "./GeoView.module.css";

export interface GeoMarkerData {
  id: string;
  lat: number;
  lon: number;
  label: string;
  subtype?: string;
  approximate: boolean;
}

const DARK_TILES = {
  url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
};

function markerIcon(approximate: boolean): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div class="${approximate ? "geo-dot geo-dot--approx" : "geo-dot"}"><span class="geo-dot__core"></span></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

export default function GeoView({ markers }: { markers: GeoMarkerData[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: true,
    });
    map.attributionControl.setPrefix(false);
    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.tileLayer(DARK_TILES.url, {
      attribution: DARK_TILES.attribution,
      maxZoom: 19,
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    map.setView([25, 10], 2);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const layer = layerRef.current;
    const map = mapRef.current;
    if (!layer || !map) return;
    layer.clearLayers();
    const bounds = L.latLngBounds([]);
    for (const marker of markers) {
      const icon = markerIcon(marker.approximate);
      const popup = L.popup({
        closeButton: false,
        offset: [0, -8],
        className: "geo-popup",
      });
      const subtitle = marker.approximate
        ? "approximate · country centroid"
        : (marker.subtype ?? "entity");
      popup.setContent(
        `<div class="geo-popup__label">${escapeHtml(marker.label)}</div><div class="geo-popup__sub">${escapeHtml(subtitle)}</div>`,
      );
      L.marker([marker.lat, marker.lon], { icon }).bindPopup(popup).addTo(layer);
      bounds.extend([marker.lat, marker.lon]);
    }
    if (markers.length > 0) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 6 });
    else map.setView([25, 10], 2);
  }, [markers]);

  return <div ref={containerRef} className={styles.map} />;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
