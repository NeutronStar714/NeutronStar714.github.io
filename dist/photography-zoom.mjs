export function fittedSize(viewport, image) {
  const fit = Math.min(viewport.width / image.width, viewport.height / image.height);
  return { width: image.width * fit, height: image.height * fit };
}

export function constrainView(state, viewport, image) {
  const zoom = Math.max(1, Math.min(8, state.zoom));
  const fit = fittedSize(viewport, image);
  const xLimit = Math.max(0, (fit.width * zoom - viewport.width) / 2);
  const yLimit = Math.max(0, (fit.height * zoom - viewport.height) / 2);
  return { zoom, x: Math.max(-xLimit, Math.min(xLimit, state.x)), y: Math.max(-yLimit, Math.min(yLimit, state.y)) };
}

export function zoomAt(state, zoom, point, viewport, image) {
  const next = Math.max(1, Math.min(8, zoom));
  const ratio = next / state.zoom;
  return constrainView({ zoom: next, x: point.x - (point.x - state.x) * ratio,
    y: point.y - (point.y - state.y) * ratio }, viewport, image);
}
