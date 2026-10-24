// Exterior Schwarzschild optical geometry in isotropic coordinates.
// Distances passed to traceRay use the same arbitrary unit (CSS pixels in the view).
const G = 6.67430e-11;
const SOLAR_MASS = 1.98847e30;
const C = 299792458;

export function starScale(massInSolarMasses = 1.4, arealRadiusKm = 12) {
  const schwarzschildRadiusKm = 2 * G * SOLAR_MASS * massInSolarMasses / (C * C * 1000);
  if (arealRadiusKm <= schwarzschildRadiusKm) throw new RangeError('The modeled surface must lie outside the Schwarzschild radius.');
  const m = schwarzschildRadiusKm / 2;
  const isotropicRadiusKm = (arealRadiusKm - m + Math.sqrt(arealRadiusKm * (arealRadiusKm - schwarzschildRadiusKm))) / 2;
  return { schwarzschildRadiusKm, isotropicRadiusKm, ratio: schwarzschildRadiusKm / isotropicRadiusKm };
}

function acceleration(position, velocity, schwarzschildRadius) {
  const r = Math.hypot(...position);
  const a = schwarzschildRadius / 4;
  // n(r) = (1 + a/r)^3 / (1 - a/r). Its logarithmic gradient bends
  // the unit tangent; the tangential component is removed to retain |v|=1.
  const dLogN = -3 * a / (r * (r + a)) - a / (r * (r - a));
  const gradient = position.map(component => dLogN * component / r);
  const along = gradient.reduce((sum, component, axis) => sum + component * velocity[axis], 0);
  return gradient.map((component, axis) => component - along * velocity[axis]);
}

export function traceRay3D({ start, direction, surfaceRadius, schwarzschildRadius, step = 1.7, maxLength = 4000 }) {
  let position = [...start];
  const norm = Math.hypot(...direction);
  let velocity = direction.map(component => component / norm);
  const points = [[...position]];
  let hitSurface = false;
  let traveled = 0;

  while (traveled < maxLength) {
    const radius = Math.hypot(...position);
    if (radius <= surfaceRadius) { hitSurface = true; break; }
    const h = Math.min(step, Math.max(0.25, (radius - surfaceRadius) * 0.16));
    const accel = acceleration(position, velocity, schwarzschildRadius);
    let midpointVelocity = velocity.map((component, axis) => component + accel[axis] * h / 2);
    const midNorm = Math.hypot(...midpointVelocity);
    midpointVelocity = midpointVelocity.map(component => component / midNorm);
    const midpointPosition = position.map((component, axis) => component + velocity[axis] * h / 2);
    const midpointAccel = acceleration(midpointPosition, midpointVelocity, schwarzschildRadius);
    const nextPosition = position.map((component, axis) => component + midpointVelocity[axis] * h);
    if (Math.hypot(...nextPosition) <= surfaceRadius) {
      hitSurface = true;
      break;
    }
    position = nextPosition;
    velocity = velocity.map((component, axis) => component + midpointAccel[axis] * h);
    const nextNorm = Math.hypot(...velocity);
    velocity = velocity.map(component => component / nextNorm);
    points.push([...position]);
    traveled += h;
  }

  return { points, direction: velocity, hitSurface };
}

// Keep a planar entry point for validating the familiar two-dimensional limit.
export function traceRay(options) {
  const ray = traceRay3D({ ...options, start: [...options.start, 0], direction: [...options.direction, 0] });
  return { ...ray, points: ray.points.map(([x, y]) => [x, y]), direction: ray.direction.slice(0, 2) };
}
