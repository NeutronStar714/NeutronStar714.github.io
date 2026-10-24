import { createPhotographyMap } from '/photography-map.js?v=4';
import { regionForPlace, photosForPlace, photoPoint } from '/photography-model.mjs?v=2';

const $ = selector => document.querySelector(selector);
const copy = value => window.siteCopy?.get(value) || value;
const messages = $('#editor-messages').content;
const message = key => copy(messages.querySelector(`[data-message="${key}"]`).textContent);
const report = key => { $('#editor-status').textContent = message(key); };
const fail = error => report(messages.querySelector(`[data-message="${error.code}"]`) ? error.code : 'error');
let token, cartography, active;
let data = { places: [], photos: [] }, queue = [], inspections = Promise.resolve();
const regions = () => data.places.filter(place => place.level !== 'location');
const locations = id => data.places.filter(place => place.parentId === id);

async function request(path, options = {}, retry = true) {
  const response = await fetch('/__photo-editor/' + path, { ...options, headers: { 'X-Photo-Editor-Token': token, ...options.headers } });
  if (response.status === 403 && retry && path !== 'config') {
    token = (await request('config')).token;
    return request(path, options, false);
  }
  if (!response.ok) {
    const details = await response.json().catch(() => ({}));
    throw Object.assign(new Error('Editor request failed'), { code: details.code, format: details.format });
  }
  return response.json();
}
const post = (path, value) => request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
function uploadStatus(text = '') { $('#upload-status').textContent = text; }
function uploadError(error, item) {
  const key = error.code === 'format-error' ? 'upload-format-error' : error instanceof TypeError ? 'network-error' :
    messages.querySelector(`[data-message="${error.code}"]`) ? error.code : 'upload-error';
  const container = $('#upload-errors'); container.replaceChildren(); container.hidden = false;
  const text = document.createElement('p');
  text.textContent = (item ? item.file.name + ': ' : '') + message(key);
  if (error.format) text.textContent += ' ' + message('detected-format') + ' ' + error.format;
  container.append(text);
  uploadStatus(''); report(key);
  item?.row.classList.add('has-upload-error');
  container.scrollIntoView({ block: 'nearest' }); container.focus({ preventScroll: true });
}
function fill(select, values, label = place => copy(place.name)) {
  const current = select.value;
  select.querySelectorAll('option[data-place]').forEach(option => option.remove());
  for (const place of values) {
    const option = document.createElement('option'); option.value = place.id; option.dataset.place = place.id; option.textContent = label(place); select.append(option);
  }
  select.value = values.some(place => place.id === current) ? current : '';
}
function point(lat, lng) {
  if (String(lat).trim() === '' || String(lng).trim() === '') return null;
  lat = Number(lat); lng = Number(lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}
function endPick(returnToDetails = false) {
  const previous = active; active = null;
  previous?.row.classList.remove('is-locating');
  $('#map-pick-status').textContent = ''; $('#finish-map-pick').hidden = true;
  cartography?.setDraft(null);
  if (returnToDetails && previous) { previous.row.scrollIntoView({ block: 'center' }); previous.pick.focus({ preventScroll: true }); }
}
function beginPick(control, key) {
  endPick(); active = control; control.row.classList.add('is-locating');
  $('#map-pick-status').textContent = message(key); $('#finish-map-pick').hidden = false;
  cartography?.setDraft(control.point(), true);
  $('#editor-map').scrollIntoView({ block: 'center' }); $('#editor-map').focus({ preventScroll: true });
}
function mapPoint(value) {
  if (!active) return;
  active.setPoint(value);
  cartography?.setDraft(value);
  $('#map-pick-status').textContent = message('map-picked-details');
}
$('#finish-map-pick').addEventListener('click', () => endPick(true));
$('#use-map-center').addEventListener('click', () => { if (cartography) mapPoint(cartography.map.getCenter()); });

function coordinateFields(parent, initial, row) {
  const fragment = $('#photo-location-fields').content.cloneNode(true);
  const fields = fragment.querySelector('fieldset');
  const get = name => fields.querySelector(`[name="${name}"]`);
  const region = get('region'), location = get('location'), lat = get('lat'), lng = get('lng');
  const pick = fields.querySelector('[data-action="pick"]'), gpsButton = fields.querySelector('[data-action="gps"]');
  const status = fields.querySelector('.location-status');
  let gps = initial.coordinates?.source === 'gps' ? initial.coordinates : null;
  let source = initial.coordinates?.source || 'manual', changed = false;
  function children() { fill(location, locations(region.value)); location.disabled = !region.value; }
  function showStatus() { status.textContent = message(point(lat.value, lng.value) ? source === 'gps' ? 'gps-ready' : 'location-manual' : 'no-location'); }
  const control = {
    fields, row, pick,
    point: () => point(lat.value, lng.value),
    setPoint(value, origin = 'manual') {
      changed = true; source = origin;
      lat.value = value ? value.lat.toFixed(6) : ''; lng.value = value ? value.lng.toFixed(6) : '';
      showStatus();
    },
    assign(id) {
      const place = data.places.find(entry => entry.id === id);
      const parent = place && regionForPlace(data, id);
      region.value = parent?.id || ''; children(); location.value = place?.level === 'location' ? id : '';
    },
    refresh() { fill(region, regions()); children(); },
    read() {
      if (!regions().some(entry => entry.id === region.value)) throw Object.assign(new Error('Region required'), { code: 'region-required' });
      const value = point(lat.value, lng.value);
      if ((lat.value || lng.value) && !value) throw Object.assign(new Error('Coordinates incomplete'), { code: 'coordinate-error' });
      return { placeId: location.value || region.value, coordinates: value ? { ...value, source } : null };
    },
    async inspect(item) {
      status.textContent = message('gps-reading');
      try {
        if (item.file.size > 30 * 1024 * 1024) throw Object.assign(new Error('Photo too large'), { code: 'size-error' });
        const result = await request('metadata', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: item.file });
        if (!queue.includes(item)) return;
        gps = result.location; gpsButton.disabled = !gps;
        if (!changed) { if (gps) control.setPoint(gps, 'gps'); else showStatus(); }
      } catch (error) {
        if (queue.includes(item) && !changed) status.textContent = message(messages.querySelector(`[data-message="${error.code}"]`) ? error.code : 'gps-error');
      }
    }
  };
  fill(region, regions());
  control.assign(initial.placeId || $('#photo-location').value || $('#photo-region').value);
  if (initial.coordinates) control.setPoint(initial.coordinates, source);
  showStatus(); gpsButton.disabled = !gps;
  region.addEventListener('change', children);
  for (const input of [lat, lng]) input.addEventListener('input', () => {
    changed = true; source = 'manual'; showStatus();
    if (active === control) cartography?.setDraft(control.point());
  });
  pick.addEventListener('click', () => { changed = true; beginPick(control, 'map-picking-photo'); });
  gpsButton.addEventListener('click', () => { if (gps) { control.setPoint(gps, 'gps'); if (active === control) cartography?.setDraft(gps, true); } });
  fields.querySelector('[data-action="clear"]').addEventListener('click', () => { control.setPoint(null); if (active === control) cartography?.setDraft(null); });
  parent.append(fragment);
  return control;
}

function storyFields(parent, initial = {}) {
  const fragment = $('#photo-story-fields').content.cloneNode(true), fields = fragment.querySelector('fieldset');
  const get = name => fields.querySelector(`[name="${name}"]`);
  const names = ['title', 'credit', 'quote', 'quoteCredit', 'context', 'extract', 'extractCredit'];
  names.forEach(name => { get(name).value = copy(initial[name] || ''); });
  get('sources').value = (initial.sources || []).map(source => `${copy(source.title)} | ${source.url}`).join('\n');
  get('documentarySrc').value = initial.documentary?.src || '';
  get('documentaryTitle').value = copy(initial.documentary?.title || '');
  parent.append(fragment);
  return { fields, read() {
    const result = Object.fromEntries(names.map(name => [name, get(name).value.trim()]));
    result.sources = get('sources').value.split('\n').filter(line => line.trim()).map(line => {
      const divider = line.lastIndexOf('|');
      if (divider < 1) throw Object.assign(new Error('Invalid source'), { code: 'story-error' });
      return { title: line.slice(0, divider).trim(), url: line.slice(divider + 1).trim() };
    });
    const src = get('documentarySrc').value.trim();
    if (src) result.documentary = { src, title: get('documentaryTitle').value.trim(), kind: /\.(mp3|wav|ogg|m4a)(\?|$)/i.test(src) ? 'audio' : 'video' };
    return result;
  } };
}
function captionField(parent, value = '') {
  const label = document.createElement('label'); label.append(document.createTextNode(message('caption')));
  const input = document.createElement('textarea'); input.required = true; input.maxLength = 5000; input.value = copy(value); label.append(input); parent.append(label); return input;
}
function savedPhotos() {
  const container = $('#saved-photos'); container.replaceChildren();
  const id = $('#photo-location').value || $('#photo-region').value;
  const photos = id ? photosForPlace(data, id) : data.photos;
  if (!photos.length) { container.textContent = message('empty'); return; }
  for (const photo of photos) {
    const row = document.createElement('div'); row.className = 'saved-photo'; row.dataset.photo = photo.id;
    const image = document.createElement('img'); image.src = '/' + (photo.thumbnail || photo.preview || photo.src); image.alt = copy(photo.caption); image.loading = 'lazy';
    const writing = document.createElement('div'), form = document.createElement('form');
    const caption = captionField(form, photo.caption), coordinate = coordinateFields(form, photo, row);
    const save = document.createElement('button'); save.type = 'submit'; save.textContent = message('save-photo'); form.append(save);
    form.addEventListener('submit', async event => {
      event.preventDefault(); save.disabled = true;
      try { await post('photo-details', { id: photo.id, caption: caption.value, ...coordinate.read() }); endPick(); await refresh(); report('photo-saved'); }
      catch (error) { fail(error); } finally { save.disabled = false; }
    });
    const storyForm = document.createElement('form'), story = storyFields(storyForm, photo);
    const storySave = document.createElement('button'); storySave.type = 'submit'; storySave.textContent = message('save-story'); storyForm.append(storySave);
    storyForm.addEventListener('submit', async event => {
      event.preventDefault(); storySave.disabled = true;
      try { await post('stories', { photoId: photo.id, story: story.read() }); endPick(); await refresh(); report('story-saved'); }
      catch (error) { fail(error); } finally { storySave.disabled = false; }
    });
    writing.append(form, storyForm); row.append(image, writing); container.append(row);
  }
}
function photoLocations() { fill($('#photo-location'), locations($('#photo-region').value)); $('#photo-location').disabled = !$('#photo-region').value; }
async function refresh() {
  const response = await fetch('/photography.json', { cache: 'no-store' });
  if (!response.ok) throw new Error('Photographs unavailable');
  data = await response.json();
  fill($('#place-choice'), data.places, place => place.level === 'location' ? copy(regionForPlace(data, place.id).name) + ' / ' + copy(place.name) : copy(place.name));
  fill($('#place-parent'), regions());
  fill($('#delete-target'), regions().filter(place => place.id !== $('#place-choice').value));
  fill($('#photo-region'), regions()); photoLocations();
  queue.forEach(item => item.coordinate.refresh());
  cartography?.setData(data);
  await window.siteCopy?.refresh(); savedPhotos();
}
function levelFields() {
  const child = $('#place-level').value === 'location';
  $('#place-parent-field').hidden = !child; $('#place-parent').required = child;
}
function choose(place) {
  if (active && active !== namedTarget) { active.assign(place.id); return; }
  endPick();
  $('#place-choice').value = place?.id || '';
  $('#place-name').value = place ? copy(place.name) : '';
  $('#place-level').value = place?.level || 'region'; $('#place-level').disabled = Boolean(place);
  $('#place-parent').value = place?.parentId || '';
  $('#latitude').value = place?.lat ?? ''; $('#longitude').value = place?.lng ?? '';
  $('#delete-place-panel').hidden = !place;
  fill($('#delete-target'), regions().filter(item => item.id !== place?.id)); levelFields();
  if (place) {
    const region = regionForPlace(data, place.id); $('#photo-region').value = region.id; photoLocations();
    $('#photo-location').value = place.level === 'location' ? place.id : '';
    cartography?.select(place.id, true);
  }
  savedPhotos();
}
const namedTarget = {
  row: $('#place-form'), pick: $('#pick-place-point'),
  point: () => point($('#latitude').value, $('#longitude').value),
  setPoint(value) { $('#latitude').value = value.lat.toFixed(6); $('#longitude').value = value.lng.toFixed(6); }
};
$('#place-level').addEventListener('change', levelFields);
$('#place-choice').addEventListener('change', () => { endPick(); choose(data.places.find(place => place.id === $('#place-choice').value)); });
$('#new-place').addEventListener('click', () => { endPick(); choose(); });
$('#pick-place-point').addEventListener('click', () => beginPick(namedTarget, 'map-picking-place'));
$('#photo-region').addEventListener('change', () => { endPick(); photoLocations(); savedPhotos(); });
$('#photo-location').addEventListener('change', () => { endPick(); savedPhotos(); });
$('#place-form').addEventListener('submit', async event => {
  event.preventDefault(); const button = event.submitter; button.disabled = true; report('saving');
  try {
    const value = namedTarget.point();
    if (!value) throw Object.assign(new Error('Coordinates required'), { code: 'coordinate-error' });
    const result = await post('places', { id: $('#place-choice').value || undefined, name: $('#place-name').value,
      level: $('#place-level').value, parentId: $('#place-parent').value || undefined, ...value });
    endPick(); await refresh(); choose(result.place); report('place-saved');
  } catch (error) { fail(error); } finally { button.disabled = false; }
});
$('#delete-place').addEventListener('click', async () => {
  const id = $('#place-choice').value; if (!id) return;
  $('#delete-place').disabled = true;
  try { await post('delete-place', { id, targetId: $('#delete-target').value || undefined }); endPick(); await refresh(); choose(); report('place-deleted'); }
  catch (error) { fail(error); } finally { $('#delete-place').disabled = false; }
});

function clearQueue() { endPick(); queue.forEach(item => URL.revokeObjectURL(item.url)); queue = []; $('#upload-previews').replaceChildren(); }
$('#photo-files').addEventListener('change', () => {
  clearQueue();
  $('#upload-errors').hidden = true; uploadStatus();
  for (const file of $('#photo-files').files) {
    const url = URL.createObjectURL(file), row = document.createElement('div'); row.className = 'upload-preview';
    const image = document.createElement('img'); image.src = url; image.alt = file.name;
    const fields = document.createElement('div'), filename = document.createElement('p'); filename.textContent = file.name; fields.append(filename);
    const item = { file, url, row, uploaded: false }; item.caption = captionField(fields);
    item.coordinate = coordinateFields(fields, {}, row); item.story = storyFields(fields);
    row.append(image, fields); $('#upload-previews').append(row); queue.push(item);
  }
  const selected = [...queue];
  inspections = inspections.then(async () => { for (const item of selected) if (queue.includes(item)) await item.coordinate.inspect(item); });
});
function lockItem(item, disabled) { item.caption.disabled = disabled; item.coordinate.fields.disabled = disabled; item.story.fields.disabled = disabled; }
$('#photo-form').addEventListener('submit', async event => {
  event.preventDefault();
  $('#upload-errors').hidden = true; queue.forEach(item => item.row.classList.remove('has-upload-error'));
  if (!queue.length) { uploadError({ code: 'choose-files' }); return; }
  $('#save-photos').disabled = true; $('#photo-files').disabled = true; report('saving'); uploadStatus(message('saving'));
  let current;
  try {
    await inspections;
    const invalid = [...$('#photo-form').elements].find(field => !field.disabled && field.validity && !field.validity.valid);
    if (invalid) {
      current = queue.find(item => item.row.contains(invalid));
      const code = invalid.name === 'region' ? 'region-required' : invalid.matches('textarea') ? 'text-error' : 'coordinate-error';
      uploadError({ code }, current); invalid.reportValidity(); return;
    }
    endPick();
    const pending = queue.filter(item => !item.uploaded);
    const submissions = pending.map(item => {
      current = item;
      return { item, caption: item.caption.value, ...item.coordinate.read(), story: item.story.read() };
    });
    pending.forEach(item => lockItem(item, true));
    for (const entry of submissions) {
      current = entry.item;
      uploadStatus(message('upload-progress') + ' ' + current.file.name);
      const form = new FormData();
      form.append('placeId', entry.placeId); form.append('caption', entry.caption); form.append('file', entry.item.file);
      form.append('coordinates', JSON.stringify(entry.coordinates)); form.append('story', JSON.stringify(entry.story));
      const result = await request('photos', { method: 'POST', body: form });
      if (!result.photo?.id) throw Object.assign(new Error('Upload not confirmed'), { code: 'upload-error' });
      entry.item.uploaded = true; entry.item.photoId = result.photo.id;
    }
    const savedIds = queue.filter(item => item.uploaded).map(item => item.photoId);
    $('#photo-region').value = ''; $('#photo-location').value = '';
    await refresh();
    if (!savedIds.every(id => data.photos.some(photo => photo.id === id))) throw Object.assign(new Error('Archive not refreshed'), { code: 'refresh-error' });
    clearQueue(); $('#photo-files').value = ''; report('photos-saved');
    uploadStatus(message('upload-complete') + ' ' + message('upload-count') + ' ' + savedIds.length);
  } catch (error) { uploadError(error, current); }
  finally { queue.filter(item => !item.uploaded).forEach(item => lockItem(item, false)); $('#save-photos').disabled = false; $('#photo-files').disabled = false; }
});
$('#archive-editor').addEventListener('click', async () => {
  $('#archive-editor').disabled = true;
  try { await post('archive', {}); $('#editor-workspace').hidden = true; $('#editor-archived').hidden = false; $('#editor-status').textContent = ''; clearQueue(); }
  catch (error) { fail(error); $('#archive-editor').disabled = false; }
});
try {
  token = (await request('config')).token;
  try {
    cartography = await createPhotographyMap($('#editor-map'), choose, mapPoint, { editor: true, onPhoto(photo) {
      endPick(); $('#photo-region').value = regionForPlace(data, photo.placeId).id; photoLocations();
      const place = data.places.find(item => item.id === photo.placeId); $('#photo-location').value = place.level === 'location' ? place.id : '';
      savedPhotos(); document.querySelector(`[data-photo="${photo.id}"]`)?.scrollIntoView({ block: 'center' });
    } });
  } catch { report('map-error'); }
  await refresh(); cartography?.overview(); if (!$('#editor-status').textContent) report('ready');
} catch (error) { fail(error); }
