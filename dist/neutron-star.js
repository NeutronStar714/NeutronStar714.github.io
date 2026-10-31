import { starScale, traceRay3D } from './neutron-physics.mjs';

export function mount(root) {

const canvas = root.querySelector('#neutron-scene');
const scene = root.querySelector('.top-scene');
const opening = root.querySelector('.opening');
const orbit = root.querySelector('.orbit-system');
const core = root.querySelector('.orbit-core');
const pause = root.querySelector('.orbit-pause');
const header = document.querySelector('.site-header');
const ctx = canvas.getContext('2d');
const scale = starScale(1.4, 12);
const starImage = new Image();
starImage.src = 'assets/neutron-star-714.png';
starImage.addEventListener('load', requestRender);

// The bundles enter from different cube faces. Their spacing and depths are
// deliberately varied but fixed; resizing never shuffles the scene.
const bundles = [
  { angle: .10, rays: [[-3.18, -1.1, .013], [-1.83, .35, -.009], [2.57, 1.30, -.019]] },
  { angle: .84, rays: [[-2.48, 1.65, -.016], [1.35, -.1, .006], [3.17, -1.3, .022]] },
  { angle: 1.68, rays: [[-3.42, -1.65, .015], [-1.96, .7, -.012], [2.24, 1.15, .016]] },
  { angle: 2.51, rays: [[-2.21, .55, .011], [1.54, -.3, -.004], [3.22, 1.8, -.022]] },
  { angle: 3.49, rays: [[-3.05, 1.5, -.018], [-1.72, -.55, .006], [2.45, -1.12, .013]] },
  { angle: 4.35, rays: [[-2.73, -1.3, .016], [1.41, .25, -.006], [2.02, 1.03, -.012]] }
];

function strokePath(points, width, color) {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i][0], points[i][1]);
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function rayGradient(cx, cy, radius, strength, glow) {
  const gradient = ctx.createRadialGradient(cx, cy, radius * .65, cx, cy, radius * 12);
  const color = glow ? '145, 211, 255' : '248, 252, 255';
  const factor = glow ? .24 : .82;
  gradient.addColorStop(0, `rgba(${color}, ${factor * strength})`);
  gradient.addColorStop(.19, `rgba(${color}, ${factor * strength * .85})`);
  gradient.addColorStop(.47, `rgba(${color}, ${factor * strength * .48})`);
  gradient.addColorStop(.78, `rgba(${color}, ${factor * strength * .17})`);
  gradient.addColorStop(1, `rgba(${color}, ${factor * strength * .035})`);
  return gradient;
}

function drawRay(points, strength, depth, cx, cy, radius) {
  if (points.length < 2) return;
  const distanceFromPlane = Math.abs(depth);
  const depthBlur = Math.min(5.5, distanceFromPlane * 2.1);
  const depthFade = 1 / (1 + distanceFromPlane * .19);
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.filter = `blur(${(3.1 + depthBlur * 1.4).toFixed(2)}px)`;
  strokePath(points, 6.2 + depthBlur, rayGradient(cx, cy, radius, strength * depthFade, true));
  ctx.filter = depthBlur ? `blur(${depthBlur.toFixed(2)}px)` : 'none';
  strokePath(points, 1.05 + depthBlur * .24, rayGradient(cx, cy, radius, strength * depthFade, false));
  ctx.restore();
}

function fadeAwayFromText(width, height) {
  ctx.save();
  ctx.globalCompositeOperation = 'destination-in';
  let mask;
  if (orbit) {
    mask = ctx.createLinearGradient(0, 0, 0, height);
    mask.addColorStop(0, 'rgba(0,0,0,.14)');
    mask.addColorStop(.25, 'rgba(0,0,0,.3)');
    mask.addColorStop(.48, 'rgba(0,0,0,.8)');
    mask.addColorStop(.83, 'rgba(0,0,0,.62)');
    mask.addColorStop(1, 'rgba(0,0,0,.15)');
  } else if (width < 900) {
    mask = ctx.createLinearGradient(0, 0, 0, height);
    mask.addColorStop(0, 'rgba(0,0,0,.34)');
    mask.addColorStop(.36, 'rgba(0,0,0,.1)');
    mask.addColorStop(.6, 'rgba(0,0,0,.3)');
    mask.addColorStop(.76, 'rgba(0,0,0,1)');
  } else {
    mask = ctx.createLinearGradient(0, 0, width, 0);
    mask.addColorStop(0, 'rgba(0,0,0,.04)');
    mask.addColorStop(.28, 'rgba(0,0,0,.15)');
    mask.addColorStop(.44, 'rgba(0,0,0,.34)');
    mask.addColorStop(.57, 'rgba(0,0,0,.7)');
    mask.addColorStop(.69, 'rgba(0,0,0,1)');
  }
  ctx.fillStyle = mask;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

function drawStar(cx, cy, radius) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const halo = ctx.createRadialGradient(cx, cy, radius * .75, cx, cy, radius * 2.75);
  halo.addColorStop(0, 'rgba(204, 238, 255, .38)');
  halo.addColorStop(.23, 'rgba(137, 207, 250, .24)');
  halo.addColorStop(.54, 'rgba(69, 145, 207, .075)');
  halo.addColorStop(1, 'rgba(57, 129, 194, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(cx - radius * 2.8, cy - radius * 2.8, radius * 5.6, radius * 5.6);
  ctx.restore();

  if (orbit || !starImage.complete || !starImage.naturalWidth) return;
  ctx.save();
  ctx.shadowColor = 'rgba(150, 219, 255, .55)';
  ctx.shadowBlur = radius * .35;
  ctx.drawImage(starImage, cx - radius, cy - radius, radius * 2, radius * 2);
  ctx.restore();
}

function render() {
  const bounds = canvas.getBoundingClientRect();
  const width = bounds.width;
  const height = bounds.height;
  if (!width || !height) return;
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.25);
  const targetWidth = Math.round(width * pixelRatio);
  const targetHeight = Math.round(height * pixelRatio);
  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
  }
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const narrow = width < 900;
  const heroTop = header.getBoundingClientRect().height;
  const coreBounds = core?.getBoundingClientRect();
  const cx = coreBounds ? coreBounds.left + coreBounds.width / 2 - bounds.left : width * (narrow ? .78 : .765);
  const cy = coreBounds ? coreBounds.top + coreBounds.height / 2 - bounds.top : heroTop + (height - heroTop) * (narrow ? .77 : .54);
  const radius = coreBounds ? coreBounds.width / 2 : Math.max(48, Math.min(92, width * .077, (height - heroTop) * .14));
  const schwarzschildRadius = radius * scale.ratio;
  const reach = Math.hypot(width, height) * .78 + radius * 5;

  const field = ctx.createRadialGradient(cx, cy, radius * .8, cx, cy, radius * 4.5);
  field.addColorStop(0, 'rgba(29, 72, 105, .26)');
  field.addColorStop(.4, 'rgba(19, 46, 69, .12)');
  field.addColorStop(1, 'rgba(11, 12, 14, 0)');
  ctx.fillStyle = field;
  ctx.fillRect(0, 0, width, height);

  const rays = [];
  bundles.forEach((bundle, family) => {
    const dx = Math.cos(bundle.angle);
    const dy = Math.sin(bundle.angle);
    const px = -dy;
    const py = dx;
    bundle.rays.forEach(([offset, depth, zSlope], index) => {
      const start = [-dx * reach + px * offset * radius, -dy * reach + py * offset * radius, depth * radius - zSlope * reach];
      const ray = traceRay3D({ start, direction: [dx, dy, zSlope], surfaceRadius: radius, schwarzschildRadius, step: 5.5, maxLength: reach * 2.5 });
      rays.push({
        points: ray.points.filter((_, pointIndex) => pointIndex % 2 === 0 || pointIndex === ray.points.length - 1).map(([x, y]) => [x + cx, y + cy]),
        depth,
        strength: .76 + .1 * Math.sin(family * 1.7 + index * 2.1)
      });
    });
  });
  rays.sort((a, b) => Math.abs(b.depth) - Math.abs(a.depth));
  rays.forEach(ray => drawRay(ray.points, ray.strength * (orbit ? .62 : 1), ray.depth, cx, cy, radius));
  fadeAwayFromText(width, height);
  drawStar(cx, cy, radius);
}

let frame = 0;
let visible = true;

function requestRender() {
  if (frame || root.hidden) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    if (root.hidden || !visible || document.hidden) return;
    render();
  });
}

function sizeScene() {
  if (root.hidden) return;
  const headerHeight = header.getBoundingClientRect().height;
  root.style.setProperty('--home-header-height', `${headerHeight}px`);
  if (orbit) {
    const { width, height } = orbit.getBoundingClientRect();
    const links = [...orbit.querySelectorAll('.orbit-link')];
    const preferredFlatten = width / Math.max(1, height) > 2.5 ? .58 : width < 600 ? .96 : .84;
    let radius, flatten, nearest;
    // Fit the largest preview through the whole orbit, including diagonal passes.
    // Keep the full enlargement wherever the viewport has room for it.
    for (let scale = 1.5; scale >= .6; scale -= .05) {
      orbit.style.setProperty('--preview-scale', scale.toFixed(2));
      const cardWidth = Math.max(...links.map(link => link.offsetWidth));
      const cardHeight = Math.max(...links.map(link => link.offsetHeight));
      radius = Math.max(20, Math.min((width - cardWidth - 22) / 2, (height - cardHeight - 22) / (preferredFlatten * 2), 400));
      flatten = Math.max(.1, Math.min(preferredFlatten, (height - cardHeight - 22) / (radius * 2)));
      nearest = Infinity;
      for (let step = 0; step < 90; step++) {
        const angle = step * Math.PI / 180;
        nearest = Math.min(nearest, Math.hypot(Math.max(0, radius * Math.cos(angle) - cardWidth / 2), Math.max(0, radius * flatten * Math.sin(angle) - cardHeight / 2)));
      }
      const neighborFit = (cardWidth / (Math.SQRT2 * radius)) ** 2 + (cardHeight / (Math.SQRT2 * radius * flatten)) ** 2;
      if (neighborFit <= .98 && nearest >= 20) break;
    }
    orbit.style.setProperty('--orbit-radius', `${radius.toFixed(2)}px`);
    orbit.style.setProperty('--orbit-flatten', flatten);
    orbit.style.setProperty('--orbit-unflatten', 1 / flatten);
    const clearance = (nearest - 8) * 2;
    orbit.style.setProperty('--star-size', `${Math.max(24, Math.min(174, radius * .72, height * .34, clearance)).toFixed(2)}px`);
  }
  const height = orbit ? window.innerHeight : Math.ceil(headerHeight + opening.getBoundingClientRect().height);
  if (scene.style.height !== `${height}px`) scene.style.height = `${height}px`;
  requestRender();
}

const observer = new ResizeObserver(sizeScene);
observer.observe(header);
observer.observe(opening);
if (orbit) observer.observe(orbit);
document.fonts.ready.then(sizeScene);
pause?.addEventListener('click', () => {
  const paused = orbit.classList.toggle('is-paused');
  pause.setAttribute('aria-pressed', String(paused));
  const source = root.querySelector('#home-messages').content.querySelector(`[data-message="${paused ? 'resume' : 'pause'}"]`).textContent;
  pause.querySelector('span').textContent = window.siteCopy?.get(source) || source;
});
const visibility = new IntersectionObserver(entries => {
  visible = entries[0].isIntersecting;
  if (visible) requestRender();
});
visibility.observe(scene);
root.querySelector('.portrait-trigger')?.addEventListener('keydown', event => {
  if (event.key === 'Escape') { event.preventDefault(); event.currentTarget.blur(); }
});
document.addEventListener('visibilitychange', requestRender);
sizeScene();

return {
  activate() { visible = true; observer.observe(header); observer.observe(opening); if (orbit) observer.observe(orbit); visibility.observe(scene); sizeScene(); },
  deactivate() { observer.disconnect(); visibility.disconnect(); cancelAnimationFrame(frame); frame = 0; }
};

}
