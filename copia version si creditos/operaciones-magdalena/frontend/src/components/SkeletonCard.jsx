import React from 'react';

export default function SkeletonCard({ height = 'h-24', className = '' }) {
  return (
    <div className={`animate-pulse bg-gray-200 rounded-2xl ${height} ${className}`}></div>
  );
}
