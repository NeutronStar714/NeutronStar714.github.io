import { storyStages, sourceURL } from './photography-model.mjs';
import { createImageZoom } from './photography-image-zoom.js';

export function createPhotographViewer(root) {
  const $ = selector => root.querySelector(selector);
  const dialog = $('.photograph-viewer');
  const imageZoom = createImageZoom(root);
  const copy = value => window.siteCopy?.get(value) || value;
  const message = name => copy($('#photography-messages').content.querySelector(`[data-message="${name}"]`).textContent);
  let photographs = [], place, position = 0, stage = 'photograph', returnFocus, touch;
  let documentary;
  function text(selector, value = '') {
    $(selector).textContent = copy(value);
    $(selector).hidden = !value;
  }
  function pauseDocumentary() { documentary?.pause(); }
  function setStage(next) {
    pauseDocumentary();
    stage = next;
    dialog.classList.toggle('is-photograph', stage === 'photograph');
    const stages = storyStages(photographs[position]);
    for (const panel of root.querySelectorAll('.viewer-panel')) panel.hidden = panel.id !== 'viewer-' + stage;
    for (const button of root.querySelectorAll('[data-stage]')) {
      button.hidden = !stages.includes(button.dataset.stage);
      button.setAttribute('aria-pressed', String(button.dataset.stage === stage));
    }
    const index = stages.indexOf(stage);
    $('.viewer-back').disabled = index === 0;
    $('.viewer-next').textContent = message(stages[index + 1] || 'return');
    $('.viewer-content').scrollTop = 0;
    if (stage === 'photograph') requestAnimationFrame(imageZoom.reset);
  }
  function paragraph(container, writing) {
    container.replaceChildren();
    for (const line of copy(writing || '').split(/\n\s*\n/).filter(Boolean)) {
      const p = document.createElement('p');
      p.textContent = line;
      container.append(p);
    }
  }
  function render() {
    pauseDocumentary();
    documentary = null;
    const photo = photographs[position];
    const image = document.createElement('img');
    image.src = photo.preview || photo.src;
    image.alt = copy(photo.caption);
    image.width = photo.width;
    image.height = photo.height;
    image.decoding = 'async';
    image.draggable = false;
    $('.viewer-image').replaceChildren(image);
    imageZoom.setImage(photo, image);
    text('#viewer-title', photo.title || place.name);
    text('.viewer-place', photo.title ? place.name : '');
    text('.viewer-caption', photo.caption);
    text('.viewer-quote', photo.quote);
    text('.viewer-quote-credit', photo.quoteCredit);
    text('.viewer-credit', photo.credit);
    paragraph($('.viewer-context'), photo.context);
    text('.viewer-extract', photo.extract);
    text('.viewer-extract-credit', photo.extractCredit);
    const figure = $('.viewer-documentary');
    figure.replaceChildren();
    const src = photo.documentary?.src && sourceURL(photo.documentary.src, document.baseURI);
    figure.hidden = !src;
    if (src) {
      const media = document.createElement(photo.documentary.kind === 'audio' ? 'audio' : 'video');
      media.src = src;
      media.controls = true;
      media.preload = 'metadata';
      media.playsInline = true;
      media.setAttribute('aria-label', copy(photo.documentary.title || message('documentary')));
      if (photo.documentary.poster) media.poster = photo.documentary.poster;
      media.addEventListener('play', () => {
        if (window.siteAudio) window.siteAudio.playTrack(media, photo.documentary.title || photo.title || place.name, { excerpt: true, cover: photo.src });
      });
      documentary = media;
      figure.append(media);
      if (photo.documentary.caption) {
        const caption = document.createElement('figcaption');
        caption.textContent = copy(photo.documentary.caption);
        figure.append(caption);
      }
    }
    const sources = $('.viewer-source-list');
    sources.replaceChildren();
    for (const source of photo.sources || []) {
      const url = sourceURL(source.url, document.baseURI);
      if (!url) continue;
      const li = document.createElement('li');
      const link = document.createElement('a');
      link.href = url;
      link.textContent = copy(source.title);
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      li.append(link);
      sources.append(li);
    }
    $('.viewer-photo-switch').hidden = photographs.length < 2;
    $('.photo-position').textContent = `${position + 1} / ${photographs.length}`;
    $('.photo-previous').disabled = position === 0;
    $('.photo-next').disabled = position === photographs.length - 1;
    const stages = storyStages(photo);
    $('.viewer-open-story').hidden = stages.length === 1;
    $('.viewer-open-story').textContent = message(stages[1] || 'story');
    setStage('photograph');
  }
  function close() { if (dialog.open) dialog.close(); }
  function turn(direction) {
    const stages = storyStages(photographs[position]);
    const next = stages.indexOf(stage) + direction;
    if (next >= stages.length) close();
    else if (next >= 0) setStage(stages[next]);
  }
  function changePhoto(direction) {
    const next = position + direction;
    if (next >= 0 && next < photographs.length) { position = next; render(); }
  }
  $('.viewer-close').addEventListener('click', close);
  $('.viewer-next').addEventListener('click', () => turn(1));
  $('.viewer-back').addEventListener('click', () => turn(-1));
  $('.viewer-open-story').addEventListener('click', () => turn(1));
  $('.photo-previous').addEventListener('click', () => changePhoto(-1));
  $('.photo-next').addEventListener('click', () => changePhoto(1));
  for (const button of root.querySelectorAll('[data-stage]')) button.addEventListener('click', () => setStage(button.dataset.stage));
  dialog.addEventListener('keydown', event => {
    if (event.target.closest('video,audio,input,textarea,select')) return;
    if (stage === 'photograph') {
      if (imageZoom.keyboard(event)) return;
      if (event.key === 'ArrowRight') { event.preventDefault(); changePhoto(1); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); changePhoto(-1); }
      return;
    }
    if (event.key === 'ArrowRight') { event.preventDefault(); turn(1); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); turn(-1); }
  });
  dialog.addEventListener('pointerdown', event => {
    touch = stage !== 'photograph' && event.pointerType === 'touch' && !event.target.closest('video,audio,button,a') ? [event.clientX, event.clientY] : null;
  });
  dialog.addEventListener('pointerup', event => {
    if (!touch) return;
    const dx = event.clientX - touch[0], dy = event.clientY - touch[1];
    touch = null;
    if (Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy) * 1.5) turn(dx < 0 ? 1 : -1);
  });
  dialog.addEventListener('close', () => {
    pauseDocumentary();
    imageZoom.release();
    document.body.classList.remove('photo-viewer-open');
    if (returnFocus?.isConnected && !returnFocus.closest('[hidden]')) returnFocus.focus({ preventScroll: true });
  });
  return {
    open(nextPlace, photos, index = 0) {
      if (!photos.length) return;
      returnFocus = document.activeElement;
      place = nextPlace;
      photographs = photos;
      position = index;
      render();
      dialog.showModal();
      document.body.classList.add('photo-viewer-open');
      imageZoom.reset();
      $('.viewer-close').focus({ preventScroll: true });
    },
    close
  };
}
