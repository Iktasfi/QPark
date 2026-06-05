"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import maplibregl from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"

export interface MapLocation {
  id: number
  name: string
  address: string
  spots: number
  prefix: string
  lat: number
  lng: number
}

interface Props {
  locations: MapLocation[]
  selectedLocationId: number
  onSelectLocation: (id: number) => void
  locationStats: Record<number, { free: number; total: number }>
}

const MAP_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    "carto-voyager": {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png",
        "https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png",
        "https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png",
      ],
      tileSize: 256,
      attribution: "© OpenStreetMap © CARTO",
    },
  },
  layers: [{ id: "carto", type: "raster", source: "carto-voyager" }],
}

function pinColor(free: number, total: number): string {
  if (total === 0) return "#6b7280"
  const ratio = free / total
  if (ratio > 0.5) return "#22c55e"
  if (ratio > 0.2) return "#f59e0b"
  return "#ef4444"
}

function createPinElement(free: number, total: number, selected: boolean): HTMLElement {
  const color = pinColor(free, total)
  const bg = selected ? "#354469" : "#ffffff"
  const textColor = selected ? "#ffffff" : "#111827"
  const border = selected ? "#354469" : color
  const scale = selected ? "scale(1.15)" : "scale(1)"

  const el = document.createElement("div")
  el.style.cssText = "cursor:pointer;user-select:none;transform-origin:bottom center;"
  el.innerHTML = `
    <div style="
      background:${bg};border:2.5px solid ${border};
      border-radius:14px;padding:5px 10px;
      display:flex;align-items:center;gap:5px;
      box-shadow:0 4px 14px rgba(0,0,0,${selected ? "0.28" : "0.14"});
      transform:${scale};transition:transform 0.2s;
      white-space:nowrap;
    ">
      <span style="width:7px;height:7px;border-radius:50%;background:${color};flex-shrink:0;display:block"></span>
      <span style="font-size:12px;font-weight:700;color:${textColor};font-family:system-ui,sans-serif">${free} св.</span>
    </div>
    <div style="
      width:0;height:0;
      border-left:5px solid transparent;border-right:5px solid transparent;
      border-top:7px solid ${border};
      margin:0 auto;margin-top:-1px;
    "></div>
  `
  return el
}

export default function ParkingMapGL({ locations, selectedLocationId, onSelectLocation, locationStats }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markersRef = useRef<Map<number, maplibregl.Marker>>(new Map())
  const userMarkerRef = useRef<maplibregl.Marker | null>(null)
  const [locating, setLocating] = useState(false)
  const [mapReady, setMapReady] = useState(false)

  // Init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const m = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: [71.449, 51.169],
      zoom: 12,
      minZoom: 10,
      maxZoom: 18,
      attributionControl: false,
    })
    m.on("load", () => setMapReady(true))
    mapRef.current = m
    return () => { m.remove(); mapRef.current = null; setMapReady(false) }
  }, [])

  // Update markers whenever map ready / stats / selection changes
  useEffect(() => {
    const m = mapRef.current
    if (!m || !mapReady) return

    locations.forEach(loc => {
      const stats = locationStats[loc.id] ?? { free: 0, total: loc.spots }
      const selected = loc.id === selectedLocationId
      const el = createPinElement(stats.free, stats.total, selected)
      el.addEventListener("click", () => onSelectLocation(loc.id))

      const existing = markersRef.current.get(loc.id)
      if (existing) existing.remove()

      const marker = new maplibregl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([loc.lng, loc.lat])
        .addTo(m)
      markersRef.current.set(loc.id, marker)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, locationStats, selectedLocationId])

  // Fly to selected location
  useEffect(() => {
    const m = mapRef.current
    if (!m || !mapReady) return
    const loc = locations.find(l => l.id === selectedLocationId)
    if (loc) m.flyTo({ center: [loc.lng, loc.lat], zoom: 15, duration: 750, essential: true })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLocationId, mapReady])

  const handleGPS = useCallback(() => {
    if (!navigator.geolocation || !mapRef.current) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude: lat, longitude: lng } = pos.coords
        setLocating(false)

        userMarkerRef.current?.remove()
        const el = document.createElement("div")
        el.innerHTML = `
          <div style="position:relative;width:22px;height:22px">
            <div style="position:absolute;inset:0;background:#3b82f6;border-radius:50%;
              border:3px solid white;box-shadow:0 2px 8px rgba(59,130,246,0.7);z-index:2"></div>
            <div style="position:absolute;inset:-7px;background:rgba(59,130,246,0.22);
              border-radius:50%;animation:qp-pulse 1.8s ease-out infinite"></div>
          </div>
        `
        userMarkerRef.current = new maplibregl.Marker({ element: el })
          .setLngLat([lng, lat])
          .addTo(mapRef.current!)

        mapRef.current!.flyTo({ center: [lng, lat], zoom: 14, duration: 900, essential: true })

        // nearest parking
        let nearest = locations[0]
        let minDist = Infinity
        for (const loc of locations) {
          const d = Math.hypot(loc.lat - lat, loc.lng - lng)
          if (d < minDist) { minDist = d; nearest = loc }
        }
        onSelectLocation(nearest.id)
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 8000 }
    )
  }, [locations, onSelectLocation])

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />

      {/* GPS button */}
      <button
        onClick={handleGPS}
        className="absolute bottom-4 right-4 z-10 w-11 h-11 rounded-full bg-white shadow-lg flex items-center justify-center border border-gray-200 active:scale-95 transition-all hover:bg-gray-50"
        title="Моё местоположение"
      >
        {locating ? (
          <div className="w-5 h-5 border-2 border-[#354469] border-t-transparent rounded-full animate-spin" />
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#354469" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" fill="#354469" fillOpacity="0.15" />
            <line x1="12" y1="2" x2="12" y2="6" />
            <line x1="12" y1="18" x2="12" y2="22" />
            <line x1="2" y1="12" x2="6" y2="12" />
            <line x1="18" y1="12" x2="22" y2="12" />
          </svg>
        )}
      </button>

      {/* Map attribution */}
      <div className="absolute bottom-2 left-2 z-10 text-[9px] text-gray-400 bg-white/70 px-1.5 py-0.5 rounded">
        © OpenStreetMap © CARTO
      </div>

      <style>{`
        @keyframes qp-pulse {
          0%   { transform:scale(1);   opacity:0.7 }
          100% { transform:scale(2.6); opacity:0   }
        }
        .maplibregl-ctrl-bottom-right,
        .maplibregl-ctrl-bottom-left,
        .maplibregl-ctrl-top-right { display:none !important }
      `}</style>
    </div>
  )
}
