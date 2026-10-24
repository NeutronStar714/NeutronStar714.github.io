export function storyStages(photo) {
  return ['photograph', ...(photo.context?.trim() ? ['story'] : []),
    ...(photo.extract?.trim() || photo.documentary?.src || photo.sources?.length ? ['sources'] : [])];
}

export function sourceURL(value, base) {
  try {
    const url = new URL(value, base);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

export function photosForPlace(data, placeId) {
  const children = new Set((data.places || []).filter(place => place.parentId === placeId).map(place => place.id));
  return data.photos.filter(photo => photo.placeId === placeId || children.has(photo.placeId));
}

export function regionForPlace(data, id) {
  const place = data.places.find(item => item.id === id);
  return place?.level === 'location' ? data.places.find(item => item.id === place.parentId) : place;
}

export function photoPoint(photo) {
  const point = photo.coordinates;
  return point && Number.isFinite(point.lat) && Number.isFinite(point.lng) && Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180 ? point : null;
}

const mercator = point => [point.lng / 360, Math.log(Math.tan(Math.PI / 4 + Math.max(-85, Math.min(85, point.lat)) * Math.PI / 360)) / (2 * Math.PI)];

export function expansionZoom(place, data, width, height) {
  // Expand when a group's footprint occupies 45% of the map's shorter dimension.
  // A small fallback footprint lets single-photo groups open without inventing GPS.
  const points = [place, ...data.places.filter(item => item.parentId === place.id),
    ...photosForPlace(data, place.id).map(photoPoint).filter(Boolean)].map(mercator);
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  const fallbackKm = place.level === 'location' ? 5 : 50;
  const footprint = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), fallbackKm / 40075);
  const zoom = Math.log2(Math.max(100, Math.min(width, height)) * .45 / (512 * footprint));
  return place.level === 'location' ? Math.max(10, Math.min(14, zoom)) : Math.max(6.5, Math.min(10, zoom));
}

export function hierarchyFeatures(data, zoom, width, height) {
  const nodes = [], photos = [];
  for (const region of data.places.filter(place => place.level !== 'location')) {
    const children = data.places.filter(place => place.parentId === region.id);
    const direct = data.photos.filter(photo => photo.placeId === region.id && photoPoint(photo));
    if (zoom < expansionZoom(region, data, width, height) || (!children.length && !direct.length)) {
      nodes.push(region); continue;
    }
    photos.push(...direct);
    for (const location of children) {
      const exact = data.photos.filter(photo => photo.placeId === location.id && photoPoint(photo));
      if (zoom < expansionZoom(location, data, width, height) || !exact.length) nodes.push(location);
      else photos.push(...exact);
    }
  }
  return { nodes, photos };
}

export function clusterPhotos(photos, project, radius = 56) {
  const groups = [];
  for (const photo of photos) {
    const coordinate = photoPoint(photo);
    if (!coordinate) continue;
    const point = project(coordinate);
    const group = groups.find(item => Math.hypot(item.point.x - point.x, item.point.y - point.y) < radius);
    if (group) group.photos.push(photo);
    else groups.push({ point, coordinate, photos: [photo] });
  }
  return groups;
}
