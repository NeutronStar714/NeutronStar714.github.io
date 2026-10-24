import { createPhotographyMap } from './photography-map.js?v=4';
import { createPhotographViewer } from './photography-viewer.js?v=2';
import { photosForPlace, regionForPlace } from './photography-model.mjs?v=2';

export function mount(root) {
  const $ = selector => root.querySelector(selector);
  const mapElement = $('#photography-map');
  const gallery = $('.photograph-list');
  const preview = $('.map-place-preview');
  const fallback = $('.map-place-fallback');
  const status = $('.map-status');
  const viewer = createPhotographViewer(root);
  const copy = value => window.siteCopy?.get(value) || value;
  let data = { places: [], photos: [] }, fingerprint, cartography;
  const regionSelect = $('#archive-region'), locationSelect = $('#archive-location');
  const regions = () => data.places.filter(place => place.level !== 'location');
  function fillSelect(select, places) {
    const current = select.value;
    select.querySelectorAll('option[data-place]').forEach(option => option.remove());
    for (const place of places) {
      const option = document.createElement('option'); option.value = place.id; option.dataset.place = place.id; option.textContent = copy(place.name); select.append(option);
    }
    select.value = places.some(place => place.id === current) ? current : '';
  }
  function fillLocations() {
    fillSelect(locationSelect, data.places.filter(place => place.parentId === regionSelect.value));
    locationSelect.disabled = !regionSelect.value;
  }
  function openPhoto(photo, photos) {
    const place = data.places.find(item => item.id === photo.placeId);
    if (!place) return;
    const sequence = photos || photosForPlace(data, place.id);
    viewer.open(place, sequence, Math.max(0, sequence.findIndex(item => item.id === photo.id)));
  }
  function spreadPhotos(photos) {
    const rails = [$('.map-photo-rail-left'), $('.map-photo-rail-right')];
    rails.forEach(rail => { rail.replaceChildren(); rail.hidden = !photos.length; });
    $('.photography-opening').classList.toggle('is-exploring', photos.length > 0);
    photos.slice(0, 12).forEach((photo, index) => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'map-photo-card';
      button.setAttribute('aria-label', copy('Open photograph') + ': ' + copy(photo.caption));
      const image = document.createElement('img'); image.src = photo.preview || photo.src; image.alt = copy(photo.caption); image.loading = 'lazy';
      image.width = photo.width; image.height = photo.height;
      button.append(image);
      button.addEventListener('click', () => openPhoto(photo, photos));
      rails[index % 2].append(button);
    });
  }

  function choose(place) {
    const region = regionForPlace(data, place.id);
    regionSelect.value = region.id;
    fillLocations();
    locationSelect.value = place.level === 'location' ? place.id : '';
    const photos = photosForPlace(data, place.id);
    showPhotos();
    if (photos.length) preview.hidden = true;
    else {
      preview.querySelector('h2').textContent = copy(place.name);
      preview.hidden = false;
    }
  }
  regionSelect.addEventListener('change', () => {
    locationSelect.value = ''; fillLocations(); preview.hidden = true;
    if (regionSelect.value) cartography?.focus(regionSelect.value); else cartography?.overview();
    showPhotos();
  });
  locationSelect.addEventListener('change', () => { cartography?.focus(locationSelect.value || regionSelect.value); preview.hidden = true; showPhotos(); });
  $('.place-preview-close').addEventListener('click', () => { preview.hidden = true; });
  $('.map-overview').addEventListener('click', () => { preview.hidden = true; regionSelect.value = ''; fillLocations(); showPhotos(); cartography?.overview(); });
  mapElement.addEventListener('photomapstatus', event => {
    status.hidden = event.detail.detailed;
    fallback.hidden = event.detail.detailed;
  });
  $('.map-retry').addEventListener('click', () => {
    if (cartography) cartography.retry();
    else startMap();
  });

  function showPhotos() {
    gallery.replaceChildren();
    const selected = locationSelect.value || regionSelect.value;
    const photos = selected ? photosForPlace(data, selected) : data.photos;
    $('.photography-empty').hidden = photos.length > 0;
    $('.photographs').hidden = false;
    for (const photo of photos) {
      const place = data.places.find(item => item.id === photo.placeId);
      if (!place) continue;
      const figure = document.createElement('figure');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'gallery-open';
      button.setAttribute('aria-label', copy('Open photograph') + ': ' + copy(photo.caption));
      const image = document.createElement('img');
      image.src = photo.preview || photo.src;
      image.alt = copy(photo.caption);
      image.width = photo.width;
      image.height = photo.height;
      image.loading = 'lazy';
      image.decoding = 'async';
      button.append(image);
      button.addEventListener('click', () => {
        openPhoto(photo);
      });
      const caption = document.createElement('figcaption');
      const location = document.createElement('span');
      location.className = 'photograph-place';
      location.textContent = copy(place.name);
      const writing = document.createElement('p');
      writing.textContent = copy(photo.caption);
      caption.append(location, writing);
      figure.append(button, caption);
      gallery.append(figure);
    }
  }
  async function refresh() {
    const response = await fetch('photography.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Photographs unavailable');
    const next = await response.json();
    const serialized = JSON.stringify(next);
    if (fingerprint === serialized) return;
    fingerprint = serialized;
    data = next;
    fallback.replaceChildren();
    fillSelect(regionSelect, regions()); fillLocations();
    for (const place of regions()) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = copy(place.name);
      button.addEventListener('click', () => { choose(place); cartography?.focus(place.id); });
      fallback.append(button);
    }
    cartography?.setData(data);
    showPhotos();
    window.siteCopy?.refresh();
  }
  let startingMap;
  function startMap() {
    if (startingMap) return startingMap;
    startingMap = createPhotographyMap(mapElement, choose, null, { onPhoto: openPhoto, onVisiblePhotos: spreadPhotos }).then(result => {
      cartography = result;
      cartography.setData(data);
    }).catch(() => { status.hidden = false; fallback.hidden = false; }).finally(() => { startingMap = null; });
    return startingMap;
  }
  const ready = Promise.all([refresh(), startMap()]).catch(() => { status.hidden = false; fallback.hidden = false; });
  window.addEventListener('focus', () => { if (!root.hidden) ready.then(refresh).catch(() => {}); });
  return {
    activate() { ready.then(() => { cartography?.map.invalidateSize(); return refresh(); }).catch(() => {}); },
    deactivate() { viewer.close(); cartography?.map.stop(); }
  };
}
