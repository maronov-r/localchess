const EARTH_RADIUS_KM = 6371;

function haversineDistance(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Returns a bounding box for fast pre-filter before exact haversine
function boundingBox(lat, lng, radiusKm) {
  const latDelta = radiusKm / EARTH_RADIUS_KM * (180 / Math.PI);
  const lngDelta = latDelta / Math.cos((lat * Math.PI) / 180);
  return {
    minLat: lat - latDelta,
    maxLat: lat + latDelta,
    minLng: lng - lngDelta,
    maxLng: lng + lngDelta,
  };
}

// SQL fragment for nearby users/posts using bounding box + haversine
function nearbyWhere(lat, lng, radiusKm, latCol = 'location_lat', lngCol = 'location_lng') {
  const box = boundingBox(lat, lng, radiusKm);
  return {
    sql: `
      ${latCol} BETWEEN $1 AND $2
      AND ${lngCol} BETWEEN $3 AND $4
      AND (
        6371 * 2 * ASIN(SQRT(
          POW(SIN(RADIANS(${latCol} - $5) / 2), 2) +
          COS(RADIANS($6)) * COS(RADIANS(${latCol})) *
          POW(SIN(RADIANS(${lngCol} - $7) / 2), 2)
        ))
      ) <= $8
    `,
    params: [box.minLat, box.maxLat, box.minLng, box.maxLng, lat, lat, lng, radiusKm],
  };
}

function distanceKm(lat1, lng1, lat2, lng2) {
  return haversineDistance(lat1, lng1, lat2, lng2);
}

module.exports = { nearbyWhere, distanceKm, boundingBox };
