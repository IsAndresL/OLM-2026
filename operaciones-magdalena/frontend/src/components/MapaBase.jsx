import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({ iconUrl: markerIcon, shadowUrl: markerShadow });

const TILE_PROVIDERS = [
  {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors',
    subdomains: ['a', 'b', 'c'],
  },
  {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors',
    subdomains: [],
  },
  {
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '© OpenStreetMap contributors © CARTO',
    subdomains: ['a', 'b', 'c', 'd'],
  },
];

function RecenterOnChange({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (!Array.isArray(center) || center.length !== 2) return;
    map.setView(center, map.getZoom() || zoom, { animate: true });
  }, [map, center, zoom]);
  return null;
}

export default function MapaBase({
  center = [11.2408, -74.1990],
  zoom = 13,
  height = '400px',
  children,
  scrollWheelZoom = false,
}) {
  const [providerIdx, setProviderIdx] = useState(0);

  const safeCenter = useMemo(() => {
    if (!Array.isArray(center) || center.length !== 2) return [11.2408, -74.1990];
    return center;
  }, [center]);

  const provider = TILE_PROVIDERS[providerIdx] || TILE_PROVIDERS[0];

  function handleTileError() {
    setProviderIdx((current) => {
      if (current >= TILE_PROVIDERS.length - 1) return current;
      return current + 1;
    });
  }

  return (
    <div style={{ height, borderRadius: '12px', overflow: 'hidden' }}>
      <MapContainer center={safeCenter} zoom={zoom} style={{ height: '100%', width: '100%' }} scrollWheelZoom={scrollWheelZoom}>
        <RecenterOnChange center={safeCenter} zoom={zoom} />
        <TileLayer
          key={provider.url}
          attribution={provider.attribution}
          url={provider.url}
          subdomains={provider.subdomains}
          eventHandlers={{
            tileerror: handleTileError,
          }}
        />
        {children}
      </MapContainer>
    </div>
  );
}
