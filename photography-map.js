import { photosForPlace, photoPoint, expansionZoom, hierarchyFeatures, clusterPhotos } from './photography-model.mjs?v=2';

let library;
const bounds = [[73, 17], [136, 54]];
export function loadMapLibrary() {
  if (window.maplibregl) return Promise.resolve(window.maplibregl);
  if (!library) library = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = new URL('./vendor/maplibre/maplibre-gl.js', import.meta.url).href;
    script.onload = () => resolve(window.maplibregl);
    script.onerror = () => { library = null; reject(new Error('Map library unavailable')); };
    document.head.append(script);
  });
  return library;
}

export async function createPhotographyMap(element, onSelect, onPoint, options = {}) {
  const GL = await loadMapLibrary();
  GL.setWorkerCount(1);
  const view = new GL.Map({
    container: element, style: new URL('./photography-map-style.json', import.meta.url).href,
    bounds, fitBoundsOptions: { padding: 30, duration: 0 }, maxBounds: bounds, maxZoom: 19,
    renderWorldCopies: false, dragRotate: false, pitchWithRotate: false, touchPitch: false,
    attributionControl: false, canvasContextAttributes: { antialias: false }, fadeDuration: 0
  });
  view.touchZoomRotate.disableRotation();
  view.addControl(new GL.NavigationControl({ showCompass: false }), 'top-left');
  view.addControl(new GL.AttributionControl({ compact: false }), 'bottom-right');
  view.getCanvas().setAttribute('aria-label', element.getAttribute('aria-label') || '');
  const copy = text => window.siteCopy?.get(text) || text;
  let data = { places: [], photos: [] }, selected, draft, started = false, tileLoaded = false;
  let markers = [], visiblePhotos = '';
  const emitStatus = detailed => element.dispatchEvent(new CustomEvent('photomapstatus', { detail: { detailed } }));
  view.on('sourcedata', event => {
    if (event.sourceId === 'archive-tiles' && event.tile) { tileLoaded = true; emitStatus(true); }
  });
  view.on('error', event => { if (!tileLoaded || event.sourceId === 'archive-tiles') emitStatus(false); });
  const timer = setTimeout(() => { if (!tileLoaded) emitStatus(false); }, 12000);
  view.on('load', () => { clearTimeout(timer); if (!tileLoaded) emitStatus(false); });
  function limitOverview() {
    const camera = view.cameraForBounds(bounds, { padding: 30 });
    if (camera) view.setMinZoom(camera.zoom);
  }
  view.once('style.load', () => { started = true; limitOverview(); render(); });
  const resize = new ResizeObserver(() => { view.resize(); if (started) limitOverview(); render(); });
  resize.observe(element);
  if (onPoint) view.on('click', event => onPoint({ lat: event.lngLat.lat, lng: event.lngLat.lng }));
  const dimensions = () => ({ width: element.clientWidth || 480, height: element.clientHeight || 360 });
  function inside(point) {
    const p = view.project([point.lng, point.lat]), size = dimensions();
    return p.x >= -20 && p.y >= -20 && p.x <= size.width + 20 && p.y <= size.height + 20;
  }
  function marker(button, point) {
    markers.push(new GL.Marker({ element: button, anchor: 'center' }).setLngLat([point.lng, point.lat]).addTo(view));
  }
  function focus(id) {
    const place = data.places.find(item => item.id === id);
    if (!place) return;
    selected = id;
    const size = dimensions();
    const zoom = expansionZoom(place, data, size.width, size.height) + .65;
    const points = [place, ...data.places.filter(item => item.parentId === id), ...photosForPlace(data, id).map(photoPoint).filter(Boolean)];
    const extent = new GL.LngLatBounds();
    points.forEach(point => extent.extend([point.lng, point.lat]));
    if (points.length > 1) view.fitBounds(extent, { padding: 50, maxZoom: zoom, duration: 0 });
    else view.jumpTo({ center: [place.lng, place.lat], zoom });
    render();
  }
  function render() {
    markers.forEach(item => item.remove()); markers = [];
    const { width, height } = dimensions();
    const features = hierarchyFeatures(data, view.getZoom(), width, height);
    const nodes = options.editor ? data.places : features.nodes;
    const namedGroups = [];
    for (const place of nodes.filter(inside)) {
      const point = view.project([place.lng, place.lat]);
      const group = !options.editor && namedGroups.find(item => Math.hypot(item.point.x - point.x, item.point.y - point.y) < 64);
      if (group) group.places.push(place); else namedGroups.push({ point, places: [place] });
    }
    for (const group of namedGroups) {
      const place = group.places[0];
      if (group.places.length > 1) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'archive-pin archive-cluster';
        button.textContent = group.places.length; button.setAttribute('aria-label', group.places.map(item => copy(item.name)).join(', '));
        button.addEventListener('click', event => {
          event.stopPropagation(); const extent = new GL.LngLatBounds(); group.places.forEach(item => extent.extend([item.lng, item.lat]));
          view.fitBounds(extent, { padding: 65, maxZoom: Math.min(18, view.getZoom() + 4), duration: 0 });
        });
        marker(button, place); continue;
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'archive-pin archive-named-pin ' + (place.level === 'location' ? 'is-location' : 'is-region');
      button.dataset.place = place.id;
      button.classList.toggle('is-selected', selected === place.id);
      button.setAttribute('aria-label', copy(place.name));
      const dot = document.createElement('span'); dot.className = 'archive-pin-dot';
      const label = document.createElement('span'); label.className = 'archive-pin-name'; label.textContent = copy(place.name);
      button.append(dot, label);
      button.addEventListener('click', event => { event.stopPropagation(); if (!options.editor) focus(place.id); onSelect?.(place); });
      marker(button, place);
    }
    const photos = (options.editor ? data.photos.filter(photoPoint) : features.photos).filter(photo => inside(photoPoint(photo)));
    for (const group of clusterPhotos(photos, point => view.project([point.lng, point.lat]))) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'archive-pin archive-photo-pin';
      button.setAttribute('aria-label', copy(group.photos[0].caption));
      const image = document.createElement('img');
      image.src = new URL(group.photos[0].thumbnail || group.photos[0].preview || group.photos[0].src, document.baseURI).href;
      image.alt = ''; image.loading = 'lazy'; button.append(image);
      if (group.photos.length > 1) {
        const count = document.createElement('span'); count.className = 'archive-photo-count'; count.textContent = group.photos.length; button.append(count);
      }
      button.addEventListener('click', event => {
        event.stopPropagation();
        const spread = Math.max(...group.photos.map(photo => Math.abs(photoPoint(photo).lng - group.coordinate.lng) + Math.abs(photoPoint(photo).lat - group.coordinate.lat)));
        if (!options.editor && group.photos.length > 1 && spread > .00001 && view.getZoom() < 18) {
          const extent = new GL.LngLatBounds(); group.photos.forEach(photo => { const p = photoPoint(photo); extent.extend([p.lng, p.lat]); });
          view.fitBounds(extent, { padding: 65, maxZoom: Math.min(19, view.getZoom() + 2.5), duration: 0 });
        } else options.onPhoto?.(group.photos[0], group.photos);
      });
      marker(button, group.coordinate);
    }
    const fingerprint = photos.map(photo => photo.id).join(',');
    if (fingerprint !== visiblePhotos) { visiblePhotos = fingerprint; options.onVisiblePhotos?.(photos); }
  }
  view.on('moveend', render);
  return {
    map: { getCenter: () => view.getCenter(), invalidateSize: () => view.resize(), stop: () => view.stop() },
    setDraft(point, focusPoint = false) {
      draft?.remove(); draft = null;
      if (!point) return;
      const dot = document.createElement('span'); dot.className = 'editor-draft-pin'; dot.setAttribute('aria-hidden', 'true');
      draft = new GL.Marker({ element: dot, anchor: 'center' }).setLngLat([point.lng, point.lat]).addTo(view);
      if (focusPoint) view.jumpTo({ center: [point.lng, point.lat], zoom: Math.max(view.getZoom(), 12) });
    },
    setData(next) { data = next; visiblePhotos = ''; render(); },
    setPlaces(places, photos = []) { data = { places, photos }; render(); },
    focus,
    overview() { selected = null; view.fitBounds(bounds, { padding: 30, duration: 0 }); render(); },
    select(id, zoom = false) { selected = id; if (zoom) focus(id); else render(); },
    retry() { tileLoaded = false; view.setStyle(new URL('./photography-map-style.json', import.meta.url).href, { diff: false }); },
    destroy() { clearTimeout(timer); resize.disconnect(); view.remove(); }
  };
}
