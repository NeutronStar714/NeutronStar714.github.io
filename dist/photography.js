export function mount(root) {
  const $ = selector => root.querySelector(selector);
  const grid = $('.album-grid'), dialog = $('.album-viewer'), image = $('.album-slide'), stage = $('.album-stage');
  const caption = $('.slide-caption'), related = $('.slide-related'), status = $('.slide-load-status');
  const carousel = $('.album-carousel');
  let wheelIdle, wheelStepped = false, wheelDelta = 0, carouselDrag, suppressCarouselClickUntil = 0;
  const belt = $('.photo-belt'), beltViewport = $('.photo-belt-viewport'), info = $('.belt-info');
  let infoPhotoId, hoverPoint, hoverFrame = 0, hoverTime = 0, hoveredItem;
  let loadRevision = 0;
  const text = value => window.siteCopy?.get(value) || value;
  let data, photos = new Map(), album, index = 0, active = true, lastFocus;
  let scale = 1, x = 0, y = 0, drag, pinch;
  const pointers = new Map();
  const beltAlbum = photoId => data.albums.find(a => a.photoIds.includes(photoId)) || data.stripAlbum;
  const button = (label, className, handler) => {
    const node = document.createElement('button'); node.type = 'button'; node.className = className;
    node.textContent = label; node.addEventListener('click', handler); return node;
  };
  function clearHoveredItem() {
    hoveredItem?.classList.remove('is-hovered'); hoveredItem = null;
  }
  function trackHoveredPhoto(time) {
    hoverFrame = 0;
    if (!active || document.hidden || dialog.open || !hoverPoint) { clearHoveredItem(); return; }
    const bounds = beltViewport.getBoundingClientRect();
    if (hoverPoint.x < bounds.left || hoverPoint.x >= bounds.right || hoverPoint.y < bounds.top || hoverPoint.y >= bounds.bottom) { clearHoveredItem(); return; }
    if (time - hoverTime >= 64) {
      hoverTime = time;
      const item = document.elementFromPoint(hoverPoint.x, hoverPoint.y)?.closest('.photo-belt-item');
      if (item && beltViewport.contains(item)) {
        if (item !== hoveredItem) { clearHoveredItem(); hoveredItem = item; item.classList.add('is-hovered'); }
        if (item.dataset.photoId !== infoPhotoId) showBeltInfo(item.dataset.photoId);
      } else clearHoveredItem();
    }
    hoverFrame = requestAnimationFrame(trackHoveredPhoto);
  }
  function startHoverTracking(event) {
    if (event?.pointerType === 'touch') return;
    if (event) hoverPoint = { x: event.clientX, y: event.clientY };
    if (!hoverFrame && hoverPoint && active && !dialog.open) hoverFrame = requestAnimationFrame(trackHoveredPhoto);
  }
  beltViewport.addEventListener('pointerenter', startHoverTracking);
  beltViewport.addEventListener('pointermove', startHoverTracking);
  beltViewport.addEventListener('pointerleave', () => { hoverPoint = null; cancelAnimationFrame(hoverFrame); hoverFrame = 0; clearHoveredItem(); });
  function showBeltInfo(photoId) {
    const photo = photos.get(photoId), entry = beltAlbum(photoId);
    if (!photo || !entry) { info.classList.remove('has-photo'); return; }
    infoPhotoId = photoId;
    $('.belt-info-album').textContent = `'${text(entry.title)}'`;
    info.dataset.photoId = photoId;
    $('.belt-info-caption').textContent = photo.caption ? text(photo.caption) : '';
    $('.belt-info-caption').hidden = !photo.caption;
    info.classList.add('has-photo');
  }
  function drawBelt() {
    const published = [...new Set(data.stripAlbum.photoIds)].filter(id => photos.has(id));
    const signature = JSON.stringify(published.map(id => [id, photos.get(id).thumbnail || photos.get(id).src]));
    if (beltViewport.dataset.signature === signature) return;
    beltViewport.dataset.signature = signature; beltViewport.replaceChildren(); belt.hidden = !published.length;
    if (!published.length) { infoPhotoId = null; info.classList.remove('has-photo'); return; }
    const split = Math.ceil(published.length / 2);
    const rows = [published.slice(0, split), published.slice(split)].filter(ids => ids.length);
    for (const ids of rows) {
      const row = document.createElement('div'); row.className = 'photo-belt-row';
      const track = document.createElement('div'); track.className = 'photo-belt-track';
      const rowPhotos = ids.map(id => photos.get(id));
      track.style.setProperty('--belt-duration', `${rowPhotos.reduce((sum, photo) => sum + photo.width / photo.height, 0) * 6}s`);
      for (let copy = 0; copy < 2; copy++) {
        const group = document.createElement('div'); group.className = 'photo-belt-group';
        if (copy) group.setAttribute('aria-hidden', 'true');
        for (const photo of rowPhotos) {
          const item = button('', 'photo-belt-item', () => {
            showBeltInfo(photo.id);
            const entry = beltAlbum(photo.id); open(entry, entry.photoIds.indexOf(photo.id));
          });
          item.dataset.photoId = photo.id; item.style.setProperty('--photo-ratio', photo.width / photo.height);
          if (copy) item.tabIndex = -1;
          item.addEventListener('pointerenter', () => showBeltInfo(photo.id));
          item.addEventListener('focus', () => showBeltInfo(photo.id));
          const img = document.createElement('img'); img.src = photo.thumbnail || photo.screen || photo.src;
          img.alt = ''; img.width = photo.width; img.height = photo.height; img.decoding = 'async';
          item.append(img); group.append(item);
        }
        track.append(group);
      }
      row.append(track); beltViewport.append(row);
    }
    updateBeltLabels();
    showBeltInfo(published.includes(infoPhotoId) ? infoPhotoId : published[0]);
  }
  function updateBeltLabels() {
    for (const item of beltViewport.querySelectorAll('.photo-belt-item')) {
      const photo = photos.get(item.dataset.photoId), entry = beltAlbum(photo.id);
      item.setAttribute('aria-label', photo.caption ? text(photo.caption) : `${text(entry.title)} \u2014 ${text('Photograph')} ${entry.photoIds.indexOf(photo.id) + 1}`);
    }
    if (infoPhotoId) showBeltInfo(infoPhotoId);
  }
  function drawAlbums() {
    grid.replaceChildren();
    for (const entry of data.albums) {
      const cover = photos.get(entry.coverId) || photos.get(entry.photoIds[0]);
      const card = button('', 'album-card', () => open(entry, Math.max(0, entry.photoIds.indexOf(cover?.id))));
      card.dataset.albumId = entry.id; card.dataset.coverId = cover?.id || '';
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
      const heading = document.createElement('h3'); heading.textContent = text(entry.title);
      card.setAttribute('aria-label', `${text('Open album')}: ${text(entry.title)}`);
      card.append(frame, heading); grid.append(card);
    }
  }
  function drawThumbnails() {
    const list = $('.album-thumbnails');
    const signature = JSON.stringify([album.id, album.photoIds.map(id => [id, photos.get(id)?.thumbnail])]);
    if (list.dataset.signature !== signature) {
      list.dataset.signature = signature; list.replaceChildren();
      album.photoIds.forEach((id, position) => {
        const photo = photos.get(id); if (!photo) return;
        const item = button('', 'album-thumbnail', () => show(position)); item.dataset.photoId = id;
        const img = document.createElement('img'); img.src = photo.thumbnail || photo.screen || photo.src;
        img.alt = ''; img.width = photo.width; img.height = photo.height; img.loading = 'lazy'; img.decoding = 'async';
        const number = document.createElement('span'); number.className = 'thumbnail-position'; number.textContent = String(position + 1); number.setAttribute('data-site-copy-ignore', '');
        item.append(img, number); list.append(item);
      });
    }
    for (const [position, item] of [...list.children].entries()) {
      const photo = photos.get(item.dataset.photoId);
      item.setAttribute('aria-label', photo.caption ? text(photo.caption) : `${text('Photograph')} ${position + 1}`);
      item.setAttribute('aria-current', String(position === index));
    }
    layoutCarousel();
  }
  function layoutCarousel() {
    if (!album || !dialog.open) return;
    const list = $('.album-thumbnails'), count = list.children.length;
    const width = Math.max(36, Math.min(carousel.clientWidth * .92, carousel.clientHeight * .58));
    const height = width * 2 / 3;
    carousel.style.setProperty('--carousel-card-width', `${width.toFixed(2)}px`);
    for (const [position, item] of [...list.children].entries()) {
      const distance = ((position - index + count + Math.floor(count / 2)) % count) - Math.floor(count / 2);
      const depth = Math.abs(distance), visible = depth <= 3;
      const offset = [0, .48, .83, 1.08][Math.min(depth, 3)];
      const size = [1, .78, .59, .44][Math.min(depth, 3)];
      item.style.setProperty('--card-offset', `${(Math.sign(distance) * offset * height).toFixed(2)}px`);
      item.style.setProperty('--card-scale', visible ? size : .32);
      item.style.setProperty('--card-opacity', visible ? 1 : 0);
      item.style.setProperty('--card-brightness', Math.max(.52, 1 - depth * .14));
      item.style.zIndex = String(10 - Math.min(depth, 9));
      item.style.pointerEvents = visible ? 'auto' : 'none';
      item.dataset.distance = String(distance);
      item.setAttribute('aria-hidden', String(!visible));
      item.tabIndex = position === index ? 0 : -1;
      item.inert = !visible;
    }
    $('.carousel-previous').disabled = $('.carousel-next').disabled = count < 2;
  }
  function resetWheelGesture() {
    clearTimeout(wheelIdle); wheelStepped = false; wheelDelta = 0;
  }
  carousel.addEventListener('wheel', event => {
    event.preventDefault(); event.stopPropagation();
    if (!album || album.photoIds.length < 2 || Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;
    clearTimeout(wheelIdle); wheelIdle = setTimeout(resetWheelGesture, 180);
    if (wheelStepped) return;
    wheelDelta += event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? carousel.clientHeight : 1);
    if (Math.abs(wheelDelta) >= 14) { wheelStepped = true; step(Math.sign(wheelDelta)); }
  }, { passive: false });
  $('.carousel-previous').addEventListener('click', () => step(-1));
  $('.carousel-next').addEventListener('click', () => step(1));
  carousel.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.target.closest('.carousel-previous,.carousel-next')) return;
    carouselDrag = { id: event.pointerId, y: event.clientY, moved: false };
  });
  carousel.addEventListener('pointermove', event => {
    if (!carouselDrag || event.pointerId !== carouselDrag.id) return;
    if (Math.abs(event.clientY - carouselDrag.y) > 10) {
      carouselDrag.moved = true; carousel.setPointerCapture(event.pointerId);
    }
  });
  function endCarouselDrag(event) {
    if (!carouselDrag || event.pointerId !== carouselDrag.id) return;
    const distance = event.clientY - carouselDrag.y;
    if (carouselDrag.moved) {
      suppressCarouselClickUntil = performance.now() + 300;
      if (event.type === 'pointerup' && Math.abs(distance) > 30) step(distance < 0 ? 1 : -1);
    }
    carouselDrag = null;
  }
  carousel.addEventListener('pointerup', endCarouselDrag);
  carousel.addEventListener('pointercancel', endCarouselDrag);
  carousel.addEventListener('click', event => {
    if (performance.now() < suppressCarouselClickUntil) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  const carouselObserver = new ResizeObserver(layoutCarousel);
  carouselObserver.observe(carousel);
  function transform() {
    const maxX = stage.clientWidth * (scale - 1) / 2, maxY = stage.clientHeight * (scale - 1) / 2;
    x = Math.max(-maxX, Math.min(maxX, x)); y = Math.max(-maxY, Math.min(maxY, y));
    image.style.transform = `translate(${x}px,${y}px) scale(${scale})`;
    stage.classList.toggle('is-zoomed', scale > 1);
  }
  function zoom(value) {
    scale = Math.max(1, Math.min(5, value));
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
      link.addEventListener('click', event => { event.preventDefault(); open(other, other.photoIds.indexOf(photo.id)); });
      related.append(link);
    }
    related.hidden = !related.children.length;
    $('.slide-position').textContent = album.photoIds.length ? `${index + 1} / ${album.photoIds.length}` : '0 / 0';
    image.alt = photo?.caption ? text(photo.caption) : `${text(album.title)} — ${text('Photograph')} ${index + 1}`;
  }
  function show(next) {
    index = (next + album.photoIds.length) % Math.max(1, album.photoIds.length);
    const photo = photos.get(album.photoIds[index]);
    scale = 1; x = 0; y = 0; transform(); paintWriting(); drawThumbnails();
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
    resetWheelGesture();
    if (!dialog.open) { lastFocus = document.activeElement; dialog.showModal(); document.body.classList.add('album-viewing'); }
    album = entry; show(position); stage.focus({ preventScroll: true });
  }
  function close() { resetWheelGesture(); carouselDrag = null; dialog.close(); }
  function step(direction) { show(index + direction); }
  image.addEventListener('load', () => { status.hidden = true; });
  image.addEventListener('error', () => { status.textContent = text('Could not load this photograph.'); status.hidden = false; });
  $('.album-viewer-close').addEventListener('click', close);
  dialog.addEventListener('close', () => { resetWheelGesture(); document.body.classList.remove('album-viewing'); startHoverTracking();
    const target = lastFocus?.isConnected ? lastFocus : grid.querySelector(`[data-album-id="${CSS.escape(album?.id || '')}"]`);
    target?.focus({ preventScroll: true });
  });
  dialog.addEventListener('keydown', event => {
    if (event.target.closest('.album-carousel') && ['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      if (event.key === 'Home') show(0);
      else if (event.key === 'End') show(album.photoIds.length - 1);
      else step(event.key === 'ArrowDown' ? 1 : -1);
      $('.album-thumbnails').children[index]?.focus({ preventScroll: true });
    }
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); step(event.key === 'ArrowRight' ? 1 : -1); }
    if (event.key === '+' || event.key === '=') { event.preventDefault(); zoom(scale + .4); }
    if (event.key === '-') { event.preventDefault(); zoom(scale - .4); }
  });
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
  window.addEventListener('sitecopychange', () => { if (active && data) { drawAlbums(); updateBeltLabels(); if (dialog.open) { paintWriting(); drawThumbnails(); } } });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelAnimationFrame(hoverFrame); hoverFrame = 0; clearHoveredItem(); }
    else if (active) { load(); startHoverTracking(); }
  });
  async function load() {
    const revision = ++loadRevision;
    $('.album-retry').hidden = true; $('.album-load-status').hidden = true;
    try {
      const response = await fetch(`photo-albums.json?updated=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Albums unavailable');
      const incoming = await response.json();
      if (revision !== loadRevision) return;
      const oldAlbumId = album?.id, oldPhotoId = album?.photoIds[index];
      data = incoming; photos = new Map(data.photos.map(p => [p.id, p])); drawAlbums(); drawBelt(); updateBeltLabels();
      if (dialog.open) {
        album = [data.stripAlbum, ...data.albums].find(a => a.id === oldAlbumId);
        if (!album) close();
        else { index = Math.max(0, album.photoIds.indexOf(oldPhotoId)); show(index); }
      }
    } catch { if (revision === loadRevision) { $('.album-retry').hidden = false; $('.album-load-status').hidden = false; } }
  }
  $('.album-retry').addEventListener('click', load); load();
  window.addEventListener('focus', () => { if (active) load(); });
  const edits = typeof BroadcastChannel === 'function' ? new BroadcastChannel('nts-photography-updates') : null;
  const refreshAfterEdit = () => { if (active) { load(); window.siteCopy?.refresh(); } };
  if (edits) edits.onmessage = refreshAfterEdit;
  window.addEventListener('storage', event => { if (event.key === 'nts-photography-updated') refreshAfterEdit(); });
  return { activate() { active = true; carouselObserver.observe(carousel); load(); startHoverTracking(); }, deactivate() { active = false; carouselObserver.disconnect(); ++loadRevision; cancelAnimationFrame(hoverFrame); hoverFrame = 0; clearHoveredItem(); close(); } };
}
