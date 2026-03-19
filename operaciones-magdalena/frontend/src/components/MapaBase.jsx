import { useMemo } from 'react';
import { MapContainer, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({ iconUrl: markerIcon, shadowUrl: markerShadow });

export default function MapaBase({
  center = [11.2408, -74.1990],
  zoom = 13,
  height = '400px',
  children,
  scrollWheelZoom = false,
}) {
  const safeCenter = useMemo(() => {
    if (!Array.isArray(center) || center.length !== 2) return [11.2408, -74.1990];
    return center;
  }, [center]);

  return (
    <div style={{ height, borderRadius: '12px', overflow: 'hidden' }}>
      <MapContainer center={safeCenter} zoom={zoom} style={{ height: '100%', width: '100%' }} scrollWheelZoom={scrollWheelZoom}>
        <TileLayer
          attribution='© OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {children}
      </MapContainer>
    </div>
  );
}
