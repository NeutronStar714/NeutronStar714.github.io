(() => {
  const $ = selector => document.querySelector(selector), text = value => window.siteCopy?.get(value) || value;
  let data, token, currentId, busy = false, dragPayload, pendingUploads = [];
  const selected = new Set();
  const current = () => data.albums.find(a => a.id === currentId);
  const photoById = id => data.photos.find(p => p.id === id);
  function message(value, error = false) { $('#editor-status').textContent = text(value); $('#editor-status').classList.toggle('error', error); }
  const make = (tag, cls, value) => { const e = document.createElement(tag); if (cls) e.className = cls; if (value) e.textContent = value; return e; };
  function action(label, handler) { const e = make('button', '', text(label)); e.type = 'button'; e.addEventListener('click', handler); return e; }
  async function request(route, body) {
    const multipart = body instanceof FormData;
    const response = await fetch(`/__album-editor/${route}`, { method: 'POST',
      headers: { 'X-Photo-Editor-Token': token, ...(!multipart && { 'Content-Type': 'application/json' }) },
      body: multipart ? body : JSON.stringify(body) });
    const result = await response.json().catch(() => ({ error: 'Could not save. Your changes are still here; try again.' }));
    if (!response.ok) throw new Error(result.error);
    return result;
  }
  async function mutate(task, success = 'Saved.') {
    if (busy) return;
    busy = true; document.querySelectorAll('button,input[type=file]').forEach(e => e.disabled = true); message('Saving…');
    try { await task(); message(success); }
    catch (error) { message(error.message || 'Could not save. Your changes are still here; try again.', true); }
    finally { busy = false; document.querySelectorAll('button,input[type=file]').forEach(e => e.disabled = false); }
  }
  function draggable(element, payload) {
    element.draggable = true;
    element.addEventListener('dragstart', event => {
      dragPayload = payload; event.dataTransfer.setData('application/json', JSON.stringify(payload));
      event.dataTransfer.effectAllowed = 'copyMove';
    });
    element.addEventListener('dragend', () => { dragPayload = null; document.querySelectorAll('.drop-active').forEach(e => e.classList.remove('drop-active')); });
  }
  function dropzone(element, handler) {
    element.addEventListener('dragover', event => { if (dragPayload) { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'copy'; element.classList.add('drop-active'); } });
    element.addEventListener('dragleave', event => { if (!element.contains(event.relatedTarget)) element.classList.remove('drop-active'); });
    element.addEventListener('drop', event => {
      event.preventDefault(); event.stopPropagation(); element.classList.remove('drop-active');
      try { const payload = dragPayload || JSON.parse(event.dataTransfer.getData('application/json')); if (photoById(payload.photoId)) handler(payload); }
      catch { message('Could not save. Your changes are still here; try again.', true); }
    });
  }
  function selectionCount() { $('#selected-count').textContent = String(selected.size); }
  function renderPool() {
    const grid = $('#photo-pool-grid'); grid.replaceChildren();
    for (const photo of data.photos) {
      const card = make('article', `pool-photo${selected.has(photo.id) ? ' selected' : ''}`); card.dataset.photoId = photo.id;
      const img = make('img'); img.src = '/' + (photo.thumbnail || photo.src); img.alt = photo.filename; img.loading = 'lazy'; draggable(img, { photoId: photo.id });
      const label = make('label'); const check = make('input'); check.type = 'checkbox'; check.checked = selected.has(photo.id);
      check.addEventListener('change', () => { if (check.checked) selected.add(photo.id); else selected.delete(photo.id); card.classList.toggle('selected', check.checked); selectionCount(); });
      label.append(check, photo.filename);
      const details = make('details'), summary = make('summary', '', text('Caption (optional)'));
      const field = make('textarea'); field.rows = 3; field.value = photo.caption ? text(photo.caption) : ''; field.setAttribute('aria-label', `${text('Caption (optional)')}: ${photo.filename}`);
      const save = action('Save caption', () => mutate(async () => {
        const result = await request('caption', { id: photo.id, caption: field.value });
        Object.assign(photo, result.photo); await window.siteCopy?.refresh();
      }, 'Caption saved.'));
      details.append(summary, field, save); card.append(img, label, details); grid.append(card);
    }
    selectionCount();
  }
  async function saveMembers(entry, ids, coverId) {
    const result = await request('album', { id: entry.id, photoIds: ids, ...(coverId && { coverId }) });
    Object.assign(entry, result.album); renderAlbums();
  }
  function addPhotos(albumId, ids) {
    const entry = data.albums.find(a => a.id === albumId); if (!entry) return;
    mutate(() => saveMembers(entry, [...new Set([...entry.photoIds, ...ids])]));
  }
  function removeFromAlbum(albumId, photoId) {
    const entry = data.albums.find(a => a.id === albumId); if (entry) mutate(() => saveMembers(entry, entry.photoIds.filter(id => id !== photoId)));
  }
  function renderAlbums() {
    const list = $('#album-list'), target = $('#album-target'); list.replaceChildren(); target.replaceChildren();
    for (const entry of data.albums) {
      const option = make('option', '', text(entry.title)); option.value = entry.id; target.append(option);
      const tab = action('', () => { currentId = entry.id; renderAlbums(); });
      tab.append(make('span', '', text(entry.title)), make('span', '', String(entry.photoIds.length)));
      tab.setAttribute('aria-current', String(entry.id === currentId)); tab.dataset.albumId = entry.id;
      dropzone(tab, payload => addPhotos(entry.id, [payload.photoId])); list.append(tab);
    }
    target.value = currentId || data.albums[0]?.id || '';
    const entry = current(); $('#album-workspace').hidden = !entry;
    if (!entry) return;
    $('#album-title').value = text(entry.title);
    const members = $('#album-photos'); members.replaceChildren();
    if (!entry.photoIds.length) members.append(make('p', '', text('Drop photographs here')));
    entry.photoIds.forEach((id, index) => {
      const photo = photoById(id); if (!photo) return;
      const item = make('article', 'album-member'); item.dataset.photoId = id;
      draggable(item, { photoId: id, fromAlbum: entry.id });
      const img = make('img'); img.src = '/' + (photo.thumbnail || photo.src); img.alt = ''; img.draggable = false;
      const info = make('div'), name = make('span', 'member-name', photo.filename), tools = make('div', 'member-tools');
      info.append(name);
      if (entry.coverId === id) info.append(make('span', 'cover-indicator', text('Album cover')));
      tools.append(action('Remove from album', () => removeFromAlbum(entry.id, id)), action('Set as cover', () => mutate(() => saveMembers(entry, entry.photoIds, id))));
      for (const [label, delta] of [['Move earlier', -1], ['Move later', 1]]) {
        if (index + delta < 0 || index + delta >= entry.photoIds.length) continue;
        tools.append(action(label, () => mutate(() => {
          const ids = [...entry.photoIds]; [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]]; return saveMembers(entry, ids);
        })));
      }
      info.append(tools); item.append(img, info);
      dropzone(item, payload => mutate(() => {
        const ids = entry.photoIds.filter(p => p !== payload.photoId); ids.splice(ids.indexOf(id), 0, payload.photoId);
        return saveMembers(entry, payload.photoId === id ? entry.photoIds : ids);
      })); members.append(item);
    });
  }
  async function uploadQueued() {
    $('#retry-upload').hidden = true;
    await mutate(async () => {
      while (pendingUploads.length) {
        const file = pendingUploads[0];
        message(file.name); const body = new FormData(); body.append('file', file); body.append('caption', '');
        const result = await request('upload', body); data.photos.push(result.photo); pendingUploads.shift(); renderPool();
      }
      $('#photo-upload').value = '';
    }, 'Photographs added to the pool.');
    $('#retry-upload').hidden = !pendingUploads.length;
  }
  $('#photo-upload').addEventListener('change', () => { pendingUploads = [...$('#photo-upload').files]; uploadQueued(); });
  $('#retry-upload').addEventListener('click', uploadQueued);
  $('#add-selected').addEventListener('click', () => {
    if (!selected.size) return message('Select photographs first.', true);
    addPhotos($('#album-target').value, [...selected]);
  });
  $('#new-album').addEventListener('submit', event => {
    event.preventDefault(); mutate(async () => {
      const result = await request('album', { title: $('#new-album-title').value });
      data.albums.push(result.album); currentId = result.album.id; $('#new-album-title').value = ''; renderAlbums(); await window.siteCopy?.refresh();
    });
  });
  $('#rename-album').addEventListener('submit', event => {
    event.preventDefault(); mutate(async () => {
      const result = await request('album', { id: currentId, title: $('#album-title').value });
      Object.assign(current(), result.album); renderAlbums(); await window.siteCopy?.refresh();
    });
  });
  $('#delete-album').addEventListener('click', () => {
    if (!confirm(text('Delete this album? Its photographs will stay in the pool.'))) return;
    mutate(async () => { await request('delete-album', { id: currentId }); data.albums = data.albums.filter(a => a.id !== currentId); currentId = data.albums[0]?.id; renderAlbums(); });
  });
  $('#archive-editor').addEventListener('click', () => {
    if (!confirm(text('Archive this editor? You can reactivate it with photography-tool.py.'))) return;
    mutate(async () => { await request('archive', {}); $('.editor-layout').hidden = true; }, 'Editor archived. Run python photography-tool.py enable to reactivate it.');
  });
  dropzone($('#album-photos'), payload => addPhotos(currentId, [payload.photoId]));
  dropzone($('#photo-pool-grid'), payload => { if (payload.fromAlbum) removeFromAlbum(payload.fromAlbum, payload.photoId); });
  async function init() {
    try {
      const [config, response] = await Promise.all([fetch('/__album-editor/config').then(r => r.json()), fetch('/__album-editor/data')]);
      if (!response.ok) throw new Error('Refresh the editor and try again.');
      token = config.token; data = await response.json(); currentId = data.albums[0]?.id;
      await window.siteCopy?.refresh(); renderPool(); renderAlbums(); message('Saved.');
    } catch (error) { message(error.message, true); }
  }
  init();
})();
