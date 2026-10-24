import test from 'node:test';
import assert from 'node:assert/strict';
import { fittedSize, constrainView, zoomAt } from '../dist/photography-zoom.mjs';

const viewport = { width:1280, height:720 };
const image = { width:7728, height:5152 };
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9);

test('fit shows the entire photograph without changing its aspect ratio', () => {
  const fit = fittedSize(viewport,image);
  near(fit.width,1080);
  near(fit.height,720);
  near(fit.width/fit.height,image.width/image.height);
});
test('wheel and pinch zoom keep the pointed image position anchored', () => {
  const state = {zoom:1,x:0,y:0};
  const point = {x:100,y:50};
  const next = zoomAt(state,2,point,viewport,image);
  assert.equal(next.zoom,2);
  assert.equal((point.x-next.x)/next.zoom,(point.x-state.x)/state.zoom);
  assert.equal((point.y-next.y)/next.zoom,(point.y-state.y)/state.zoom);
});
test('panning stays within the image and zooming out returns to a centered fit', () => {
  const pan = constrainView({zoom:2,x:10000,y:-10000},viewport,image);
  assert.equal(pan.zoom,2);
  near(pan.x,440);
  near(pan.y,-360);
  const fit = zoomAt(pan,.5,{x:0,y:0},viewport,image);
  assert.equal(fit.zoom,1);
  assert.equal(Math.abs(fit.x),0);
  assert.equal(Math.abs(fit.y),0);
  assert.equal(constrainView({zoom:100,x:0,y:0},viewport,image).zoom,8);
});
