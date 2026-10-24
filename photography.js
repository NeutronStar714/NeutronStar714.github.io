export function mount(root) {
  const $ = selector => root.querySelector(selector);
  const grid = $('.album-grid'), dialog = $('.album-viewer'), image = $('.album-slide'), stage = $('.album-stage');
  const play = $('.slideshow-play'), caption = $('.slide-caption'), related = $('.slide-related'), status = $('.slide-load-status');
  const text = value => window.siteCopy?.get(value) || value;
  let data, photos = new Map(), album, index = 0, timer, active = true, lastFocus;
  let scale = 1, x = 0, y = 0, drag, pinch;
  const pointers = new Map();
  const button = (label, className, handler) => {
    const node = document.createElement('button'); node.type = 'button'; node.className = className;
    node.textContent = label; node.addEventListener('click', handler); return node;
  };
  function drawAlbums() {
    grid.replaceChildren();
    for (const entry of data.albums) {
      const cover = photos.get(entry.coverId) || photos.get(entry.photoIds[0]);
      const card = button('', 'album-card', () => open(entry, 0));
      card.dataset.albumId = entry.id;
      const frame = document.createElement('span'); frame.className = 'album-cover';
      if (cover) {
        const img = document.createElement('img'); img.src = cover.thumbnail || cover.screen || cover.src;
        img.width = cover.width; img.height = cover.height; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async'; frame.append(img);
        if (cover.thumbnail && cover.screen) {
          const thumbWidth = Math.round(cover.width * Math.min(1, 720 / Math.max(cover.width, cover.height)));
          const screenWidth = Math.round(cover.width * Math.min(1, 2200 / Math.max(cover.width, cover.height)));
          img.srcset = `${cover.thumbnail} ${thumbWidth}w, ${cover.screen} ${screenWidth}w`;
          img.sizes = '(max-width:700px) calc(100vw - 44px), (max-width:1540px) calc(45vw - 15px), 675px';
        }
      }
      const heading = document.createElement('h2'); heading.textContent = text(entry.title);
      card.setAttribute('aria-label', `${text('Open album')}: ${text(entry.title)}`);
      card.append(frame, heading); grid.append(card);
    }
  }
  function transform() {
    const maxX = stage.clientWidth * (scale - 1) / 2, maxY = stage.clientHeight * (scale - 1) / 2;
    x = Math.max(-maxX, Math.min(maxX, x)); y = Math.max(-maxY, Math.min(maxY, y));
    image.style.transform = `translate(${x}px,${y}px) scale(${scale})`;
    stage.classList.toggle('is-zoomed', scale > 1);
  }
  function zoom(value) {
    pause(); scale = Math.max(1, Math.min(5, value));
    if (scale > 1 && image.dataset.full && image.src !== new URL(image.dataset.full, location.href).href) image.src = image.dataset.full;
    if (scale === 1) { x = 0; y = 0; } transform();
  }
  function paintWriting() {
    if (!album) return;
    const photo = photos.get(album.photoIds[index]);
    $('#album-viewer-title').textContent = text(album.title);
    caption.textContent = photo?.caption ? text(photo.caption) : ''; caption.hidden = !photo?.caption;
    related.replaceChildren();
    if (photo) for (const other of data.albums.filter(a => a.id !== album.id && a.photoIds.includes(photo.id))) {
      const link = document.createElement('a'); link.href = `#album=${encodeURIComponent(other.id)}`;
      const label = document.createElement('span'); label.textContent = text('See also');
      const title = document.createElement('span'); title.textContent = text(other.title);
      link.append(label, ' ', title);
      link.addEventListener('click', event => { event.preventDefault(); pause(); open(other, other.photoIds.indexOf(photo.id)); });
      related.append(link);
    }
    related.hidden = !related.children.length;
    $('.slide-position').textContent = album.photoIds.length ? `${index + 1} / ${album.photoIds.length}` : '0 / 0';
    image.alt = photo?.caption ? text(photo.caption) : `${text(album.title)} — ${text('Photograph')} ${index + 1}`;
  }
  function show(next) {
    index = (next + album.photoIds.length) % Math.max(1, album.photoIds.length);
    const photo = photos.get(album.photoIds[index]);
    scale = 1; x = 0; y = 0; transform(); paintWriting();
    $('.slide-previous').disabled = $('.slide-next').disabled = album.photoIds.length < 2;
    play.disabled = album.photoIds.length < 2;
    status.textContent = text(photo ? 'Loading photograph' : 'Album is empty'); status.hidden = false;
    image.hidden = !photo;
    if (!photo) { image.removeAttribute('src'); return; }
    image.dataset.full = photo.src; image.src = photo.screen || photo.src;
    if (image.complete && image.naturalWidth) status.hidden = true;
    for (const offset of [-1, 1]) {
      const neighbor = photos.get(album.photoIds[(index + offset + album.photoIds.length) % album.photoIds.length]);
      if (neighbor) { const warm = new Image(); warm.src = neighbor.screen || neighbor.src; }
    }
  }
  function open(entry, position) {
    if (!dialog.open) { lastFocus = document.activeElement; dialog.showModal(); document.body.classList.add('album-viewing'); }
    album = entry; show(position); stage.focus({ preventScroll: true });
  }
  function pause() { clearInterval(timer); timer = null; play.textContent = text('Play slideshow'); play.setAttribute('aria-pressed', 'false'); }
  function close() { pause(); dialog.close(); }
  function step(direction) { pause(); show(index + direction); }
  image.addEventListener('load', () => { status.hidden = true; });
  image.addEventListener('error', () => { status.textContent = text('Could not load this photograph.'); status.hidden = false; });
  $('.album-viewer-close').addEventListener('click', close);
  dialog.addEventListener('close', () => { pause(); document.body.classList.remove('album-viewing');
    const target = lastFocus?.isConnected ? lastFocus : grid.querySelector(`[data-album-id="${CSS.escape(album?.id || '')}"]`);
    target?.focus({ preventScroll: true });
  });
  $('.slide-previous').addEventListener('click', () => step(-1)); $('.slide-next').addEventListener('click', () => step(1));
  play.addEventListener('click', () => {
    if (timer) return pause();
    scale = 1; x = 0; y = 0; transform(); play.textContent = text('Pause slideshow'); play.setAttribute('aria-pressed', 'true');
    timer = setInterval(() => { if (dialog.open && !document.hidden) show(index + 1); }, 6000);
  });
  dialog.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); step(event.key === 'ArrowRight' ? 1 : -1); }
    if (event.key === '+' || event.key === '=') { event.preventDefault(); zoom(scale + .4); }
    if (event.key === '-') { event.preventDefault(); zoom(scale - .4); }
  });
  $('.slide-zoom-in').addEventListener('click', () => zoom(scale + .5));
  $('.slide-zoom-out').addEventListener('click', () => zoom(scale - .5));
  $('.slide-zoom-fit').addEventListener('click', () => zoom(1));
  stage.addEventListener('wheel', event => { event.preventDefault(); zoom(scale * Math.exp(-event.deltaY * .002)); }, { passive: false });
  stage.addEventListener('dblclick', event => { if (!event.target.closest('button')) zoom(scale > 1 ? 1 : 2); });
  stage.addEventListener('pointerdown', event => {
    if (event.target.closest('button') || event.button !== 0) return;
    stage.setPointerCapture(event.pointerId); pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    drag = { startX: event.clientX, startY: event.clientY, x, y, scale };
    if (pointers.size === 2) { const [a,b] = [...pointers.values()]; pinch = { distance: Math.hypot(a.x-b.x,a.y-b.y), scale }; }
    stage.classList.add('is-dragging');
  });
  stage.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinch && pointers.size === 2) { const [a,b] = [...pointers.values()]; zoom(pinch.scale * Math.hypot(a.x-b.x,a.y-b.y) / Math.max(1,pinch.distance)); }
    else if (drag && scale > 1) { x = drag.x + event.clientX - drag.startX; y = drag.y + event.clientY - drag.startY; transform(); }
  });
  const endPointer = event => {
    if (!pointers.has(event.pointerId)) return;
    const wasPinch = Boolean(pinch);
    pointers.delete(event.pointerId);
    if (event.type === 'pointerup' && drag && !wasPinch && drag.scale === 1 && scale === 1 &&
        Math.abs(event.clientX-drag.startX) > 60 && Math.abs(event.clientY-drag.startY) < 90) step(event.clientX < drag.startX ? 1 : -1);
    if (!pointers.size) { drag = null; pinch = null; stage.classList.remove('is-dragging'); }
  };
  stage.addEventListener('pointerup', endPointer); stage.addEventListener('pointercancel', endPointer);
  window.addEventListener('sitecopychange', () => { if (active && data) { drawAlbums(); if (dialog.open) paintWriting(); } });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  async function load() {
    $('.album-retry').hidden = true; $('.album-load-status').hidden = true;
    try {
      const response = await fetch('photo-albums.json', { cache: 'no-store' });
      if (!response.ok) throw new Error('Albums unavailable');
      const oldAlbumId = album?.id, oldPhotoId = album?.photoIds[index];
      data = await response.json(); photos = new Map(data.photos.map(p => [p.id, p])); drawAlbums();
      if (dialog.open) {
        album = data.albums.find(a => a.id === oldAlbumId);
        if (!album) close();
        else { index = Math.max(0, album.photoIds.indexOf(oldPhotoId)); show(index); }
      }
    } catch { $('.album-retry').hidden = false; $('.album-load-status').hidden = false; }
  }
  $('.album-retry').addEventListener('click', load); load();
  window.addEventListener('focus', () => { if (active) load(); });
  return { activate() { active = true; load(); }, deactivate() { active = false; close(); } };
}
