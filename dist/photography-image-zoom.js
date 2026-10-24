import { constrainView, fittedSize, zoomAt } from './photography-zoom.mjs';

export function createImageZoom(root) {
  const viewport = root.querySelector('.viewer-image-viewport');
  const zoomIn = root.querySelector('.viewer-zoom-in');
  const zoomOut = root.querySelector('.viewer-zoom-out');
  const fit = root.querySelector('.viewer-zoom-fit');
  const pointers = new Map();
  let state = { zoom: 1, x: 0, y: 0 };
  let photo, image, detailRequested = false;
  const bounds = () => {
    const rect = viewport.getBoundingClientRect();
    return { width: Math.max(1, rect.width), height: Math.max(1, rect.height), left: rect.left, top: rect.top };
  };
  const relative = (point, box) => ({ x: point.x - box.left - box.width / 2, y: point.y - box.top - box.height / 2 });
  function loadDetail() {
    if (!image || detailRequested || !photo.preview || state.zoom <= 1.1) return;
    detailRequested = true;
    const target = image;
    const source = photo.src;
    const full = new Image();
    full.decoding = 'async';
    full.src = source;
    full.decode().then(() => { if (image === target) target.src = source; }).catch(() => {});
  }
  function apply() {
    if (!image) return;
    const box = bounds();
    state = constrainView(state, box, photo);
    image.style.transform = `translate3d(${state.x}px,${state.y}px,0) scale(${state.zoom})`;
    const size = fittedSize(box, photo);
    viewport.parentElement.style.setProperty('--photo-inset-x', `${Math.max(0, (box.width - size.width * state.zoom) / 2)}px`);
    viewport.parentElement.style.setProperty('--photo-inset-y', `${Math.max(0, (box.height - size.height * state.zoom) / 2)}px`);
    viewport.classList.toggle('is-zoomed', state.zoom > 1.001);
    zoomOut.disabled = state.zoom <= 1.001;
    zoomIn.disabled = state.zoom >= 7.999;
    loadDetail();
  }
  function zoom(factor, point = { x: 0, y: 0 }) {
    if (!image) return;
    state = zoomAt(state, state.zoom * factor, point, bounds(), photo);
    apply();
  }
  function reset() { state = { zoom: 1, x: 0, y: 0 }; apply(); }
  zoomIn.addEventListener('click', () => zoom(1.5));
  zoomOut.addEventListener('click', () => zoom(1 / 1.5));
  fit.addEventListener('click', reset);
  viewport.addEventListener('wheel', event => {
    if (!image) return;
    event.preventDefault();
    const box = bounds();
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? box.height : 1);
    zoom(Math.exp(-Math.max(-500, Math.min(500, delta)) * .002), relative({ x: event.clientX, y: event.clientY }, box));
  }, { passive: false });
  viewport.addEventListener('dblclick', event => {
    event.preventDefault();
    if (state.zoom > 1.001) reset();
    else zoom(2.5, relative({ x: event.clientX, y: event.clientY }, bounds()));
  });
  viewport.addEventListener('pointerdown', event => {
    if (!image || event.pointerType === 'mouse' && event.button !== 0) return;
    viewport.focus({ preventScroll: true });
    viewport.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    viewport.classList.add('is-dragging');
  });
  viewport.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId) || !image) return;
    const previous = [...pointers.values()];
    const old = pointers.get(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const current = [...pointers.values()];
    if (current.length === 2) {
      const distance = points => Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      const center = points => ({ x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 });
      const before = center(previous), after = center(current);
      const ratio = distance(current) / Math.max(1, distance(previous));
      state = zoomAt(state, state.zoom * ratio, relative(before, bounds()), bounds(), photo);
      state.x += after.x - before.x;
      state.y += after.y - before.y;
    } else if (current.length === 1) {
      state.x += event.clientX - old.x;
      state.y += event.clientY - old.y;
    }
    apply();
  });
  function releasePointer(event) {
    pointers.delete(event.pointerId);
    if (!pointers.size) viewport.classList.remove('is-dragging');
  }
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) viewport.addEventListener(event, releasePointer);
  new ResizeObserver(apply).observe(viewport);
  return {
    setImage(next, element) { photo = next; image = element; detailRequested = false; pointers.clear(); reset(); },
    reset,
    release() { pointers.clear(); image = null; viewport.classList.remove('is-dragging'); },
    keyboard(event) {
      if (!image) return false;
      if (['+', '='].includes(event.key)) zoom(1.5);
      else if (['-', '_'].includes(event.key)) zoom(1 / 1.5);
      else if (['0', 'Home'].includes(event.key)) reset();
      else if (state.zoom > 1.001 && event.key.startsWith('Arrow')) {
        state.x += event.key === 'ArrowLeft' ? 80 : event.key === 'ArrowRight' ? -80 : 0;
        state.y += event.key === 'ArrowUp' ? 80 : event.key === 'ArrowDown' ? -80 : 0;
        apply();
      } else return false;
      event.preventDefault();
      return true;
    }
  };
}
