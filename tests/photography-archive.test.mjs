import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { storyStages, sourceURL, photosForPlace, photoPoint, expansionZoom, hierarchyFeatures, clusterPhotos } from '../dist/photography-model.mjs';

test('a photograph can stand alone without empty research sections', () => {
  assert.deepEqual(storyStages({caption:'Architecture in Nanjing'}), ['photograph']);
  assert.deepEqual(storyStages({context:'   '}), ['photograph']);
});
test('a complete encounter progresses through photograph, story, and sources', () => {
  assert.deepEqual(storyStages({quote:'A quotation', context:'My account.', extract:'Original notes.'}), ['photograph','story','sources']);
  assert.deepEqual(storyStages({sources:[{title:'A source',url:'https://example.org'}]}), ['photograph','sources']);
  assert.deepEqual(storyStages({documentary:{src:'assets/film.mp4'}}), ['photograph','sources']);
});
test('source links reject executable schemes and allow ordinary web and local media URLs', () => {
  assert.equal(sourceURL('javascript:alert(1)', 'https://portfolio.example/'), null);
  assert.equal(sourceURL('data:text/html,bad', 'https://portfolio.example/'), null);
  assert.equal(sourceURL('assets/film.mp4', 'https://portfolio.example/'), 'https://portfolio.example/assets/film.mp4');
});
test('place selection includes its photographs in order', () => {
  const data = {photos:[{id:1,placeId:'village'},{id:2,placeId:'city'},{id:3,placeId:'village'}]};
  assert.deepEqual(photosForPlace(data,'village').map(p=>p.id), [1,3]);
});
test('map uses full vector street layers, no country labels or uppercase labels', () => {
  const style = JSON.parse(readFileSync(new URL('../dist/photography-map-style.json', import.meta.url)));
  assert.equal(style.sources['archive-tiles'].type,'vector');
  assert.equal(style.sources['archive-tiles'].maxzoom,14);
  assert.ok(style.layers.some(l=>l.id==='street-service'));
  assert.ok(style.layers.some(l=>l.id==='way-path'));
  assert.ok(style.layers.some(l=>l.id==='boundary-state'));
  assert.ok(!style.layers.some(l=>/^label-boundary-country/.test(l.id)));
  assert.ok(!style.layers.some(l=>l.layout?.['text-transform']==='uppercase'));
});

const hierarchy = {
  places: [{id:'region',level:'region',name:'Region',lat:32,lng:118},
    {id:'location',level:'location',parentId:'region',name:'Location',lat:32.1,lng:118.1}],
  photos: [{id:'one',placeId:'location',coordinates:{lat:32.11,lng:118.11}},
    {id:'two',placeId:'location',coordinates:{lat:32.111,lng:118.111}},
    {id:'missing',placeId:'region',coordinates:null}]
};
test('regions expand into named locations, then anonymous photograph positions', () => {
  const regionZoom = expansionZoom(hierarchy.places[0],hierarchy,480,360);
  const locationZoom = expansionZoom(hierarchy.places[1],hierarchy,480,360);
  assert.ok(regionZoom < locationZoom);
  assert.deepEqual(hierarchyFeatures(hierarchy,4,480,360).nodes.map(p=>p.id), ['region']);
  assert.deepEqual(hierarchyFeatures(hierarchy,(regionZoom+locationZoom)/2,480,360).nodes.map(p=>p.id), ['location']);
  const expanded = hierarchyFeatures(hierarchy,16,480,360);
  assert.deepEqual(expanded.nodes, []);
  assert.deepEqual(expanded.photos.map(p=>p.id), ['one','two']);
  assert.equal(photoPoint(hierarchy.photos[2]), null);
  assert.equal(photosForPlace(hierarchy,'region').length,3);
});
test('cluster expansion adapts to viewport size and dense photo pins split with zoom', () => {
  assert.ok(expansionZoom(hierarchy.places[0],hierarchy,800,600) > expansionZoom(hierarchy.places[0],hierarchy,320,240));
  const photos = hierarchy.photos.slice(0,2);
  assert.equal(clusterPhotos(photos,p=>({x:p.lng*100,y:p.lat*100})).length,1);
  assert.equal(clusterPhotos(photos,p=>({x:p.lng*100000,y:p.lat*100000})).length,2);
});
