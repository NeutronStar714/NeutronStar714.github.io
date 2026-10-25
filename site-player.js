(() => {
  const songTitle = 'Neutronstar714 - Impromptu in C, 2019-No.2';
  const songSource = 'musicsources/Impromptu%20in%20C.mp3';
  const starCover = 'assets/neutron-star-714.png';
  const storageKey = 'neutronstar714-player-v2';
  let saved = {};
  try { saved = JSON.parse(sessionStorage.getItem(storageKey) || '{}'); } catch { /* Storage is optional. */ }

  const dock = document.createElement('aside');
  dock.className = 'music-dock';
  dock.setAttribute('aria-label', 'Music player');
  dock.innerHTML = `
    <button class="dock-tab" type="button" aria-expanded="false" aria-controls="dock-panel"><span class="dock-label"></span><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 12 5-5 5 5"/></svg></button>
    <div class="dock-panel" id="dock-panel">
      <img class="dock-cover" src="${starCover}" alt="" width="54" height="54">
      <div class="dock-track"><strong></strong><span class="dock-status" role="status"></span></div>
      <button class="dock-play" type="button"><svg class="play-shape" viewBox="0 0 20 20" aria-hidden="true"><path d="m6 3 11 7-11 7z"/></svg><svg class="pause-shape" viewBox="0 0 20 20" aria-hidden="true"><path d="M5 3h4v14H5zm7 0h4v14h-4z"/></svg></button>
      <div class="dock-progress"><label class="sr-only" for="dock-seek">Playback position</label><input id="dock-seek" type="range" min="0" max="100" step="0.1" value="0"><span class="dock-time">0:00</span></div>
    </div>`;
  document.body.append(dock);
  document.body.classList.add('site-player-enabled');

  const tab = dock.querySelector('.dock-tab');
  const label = dock.querySelector('.dock-label');
  const playButton = dock.querySelector('.dock-play');
  const seek = dock.querySelector('#dock-seek');
  const time = dock.querySelector('.dock-time');
  const cover = dock.querySelector('.dock-cover');
  const trackName = dock.querySelector('.dock-track strong');
  const status = dock.querySelector('.dock-status');
  const coarsePointer = matchMedia('(hover: none)');
  const ambient = new Audio(songSource);
  const audioStore = document.createElement('div');
  audioStore.className = 'site-audio-store';
  audioStore.hidden = true;
  ambient.id = 'site-ambient-audio';
  audioStore.append(ambient);
  document.body.append(audioStore);
  ambient.preload = 'auto';
  ambient.loop = true;
  let shouldPlay = saved.shouldPlay === true;
  let inPhotography = false;
  let active = { audio: ambient, title: songTitle, excerpt: false, cover: starCover };
  const registered = new WeakSet();

  function saveState() {
    try { sessionStorage.setItem(storageKey, JSON.stringify({ shouldPlay, time: ambient.currentTime || 0 })); }
    catch { /* The player still works without session storage. */ }
  }
  if (Number.isFinite(saved.time) && saved.time > 0) {
    const restore = () => { try { ambient.currentTime = saved.time; } catch { /* Start from the beginning. */ } };
    ambient.addEventListener('loadedmetadata', restore, { once: true });
  }

  function formatTime(seconds) {
    if (!Number.isFinite(seconds)) return '0:00';
    return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  }
  function setOpen(open) {
    dock.classList.toggle('is-open', open);
    tab.setAttribute('aria-expanded', String(open));
  }
  function sync() {
    const { audio, title, excerpt } = active;
    const playing = !audio.paused;
    const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    const authored = source => window.siteCopy?.get(source) || source;
    const display = authored(`Now playing: ${title}${excerpt ? ' (excerpt)' : ''}`);
    if (label.textContent !== display) label.textContent = display;
    const visibleTitle = authored(title);
    if (trackName.textContent !== visibleTitle) trackName.textContent = visibleTitle;
    const image = active.cover || starCover;
    if (cover.getAttribute('src') !== image) cover.src = image;
    seek.value = duration ? String(audio.currentTime / duration * 100) : '0';
    time.textContent = `${formatTime(audio.currentTime)} / ${formatTime(duration)}`;
    dock.classList.toggle('is-playing', playing);
    const action = authored(`${playing ? 'Pause' : 'Play'} ${title}`);
    if (playButton.getAttribute('aria-label') !== action) playButton.setAttribute('aria-label', action);
    playButton.disabled = audio === ambient && !inPhotography;
    let message = 'Paused';
    if (playing) message = excerpt ? 'Excerpt' : 'On repeat';
    message = authored(message);
    if (status.textContent !== message) status.textContent = message;
  }
  function tryAmbient() {
    if (!inPhotography || !shouldPlay || active.audio !== ambient) return Promise.resolve(false);
    return ambient.play().then(() => { sync(); return true; }).catch(() => { sync(); return false; });
  }
  function updateSection() {
    const wasInPhotography = inPhotography;
    inPhotography = document.body.classList.contains('photography-page');
    if (!inPhotography) {
      ambient.pause();
    } else if (!wasInPhotography) {
      // One shared media element preserves the BGM position between visits.
      // Switch before pausing the previous track so its release cannot restart it.
      const previous = active.audio;
      active = { audio: ambient, title: songTitle, excerpt: false, cover: starCover };
      if (previous !== ambient) previous.pause();
      shouldPlay = true;
      tryAmbient();
    }
    saveState();
    sync();
  }
  function release(audio) {
    if (active.audio !== audio) return;
    active = { audio: ambient, title: songTitle, excerpt: false, cover: starCover };
    sync();
    tryAmbient();
  }
  function playTrack(audio, title, options = {}) {
    if (!registered.has(audio)) {
      registered.add(audio);
      for (const event of ['timeupdate', 'loadedmetadata', 'durationchange', 'seeking', 'seeked', 'play']) {
        audio.addEventListener(event, () => { if (active.audio === audio) sync(); });
      }
      audio.addEventListener('pause', () => release(audio));
      audio.addEventListener('ended', () => release(audio));
      audio.addEventListener('error', () => release(audio));
    }
    const previous = active.audio;
    active = { audio, title, excerpt: options.excerpt === true, cover: options.cover || starCover };
    if (previous !== audio) previous.pause();
    if (previous !== ambient) ambient.pause();
    sync();
    const attempt = audio.play();
    attempt?.catch(() => release(audio));
    return attempt;
  }
  window.siteAudio = { playTrack, get current() { return active.audio; } };

  tab.addEventListener('click', () => setOpen(!dock.classList.contains('is-open')));
  dock.addEventListener('mouseenter', () => { if (!coarsePointer.matches) setOpen(true); });
  dock.addEventListener('mouseleave', () => { if (!coarsePointer.matches && !dock.contains(document.activeElement)) setOpen(false); });
  dock.addEventListener('focusin', event => { if (event.target !== tab) setOpen(true); });
  dock.addEventListener('focusout', () => requestAnimationFrame(() => {
    if (!dock.contains(document.activeElement) && (coarsePointer.matches || !dock.matches(':hover'))) setOpen(false);
  }));
  document.addEventListener('pointerdown', event => { if (!dock.contains(event.target)) setOpen(false); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && dock.classList.contains('is-open')) { setOpen(false); tab.focus(); }
  });
  playButton.addEventListener('click', () => {
    const audio = active.audio;
    if (!audio.paused) {
      if (audio === ambient) { shouldPlay = false; saveState(); }
      audio.pause();
    } else {
      if (audio === ambient) {
        if (!inPhotography) return;
        shouldPlay = true; saveState();
      }
      audio.play().catch(sync);
    }
    sync();
  });
  seek.addEventListener('input', () => {
    const audio = active.audio;
    if (Number.isFinite(audio.duration)) audio.currentTime = Number(seek.value) / 100 * audio.duration;
    sync();
  });
  ['loadedmetadata', 'timeupdate', 'pause', 'ended'].forEach(event => ambient.addEventListener(event, sync));
  ambient.addEventListener('play', () => {
    if (!inPhotography) ambient.pause();
    sync();
  });
  window.addEventListener('sitecopychange', sync);
  window.addEventListener('pagehide', saveState);
  // A direct Photography load may need its first ordinary gesture to start.
  // Manual pause clears shouldPlay, so browsing photos never overrides that choice.
  function retryAfterGesture(event) {
    if (!inPhotography || !shouldPlay || active.audio !== ambient || !ambient.paused) return;
    if (event.target instanceof Element && event.target.closest('.music-dock, .player')) return;
    tryAmbient();
  }
  document.addEventListener('pointerdown', retryAfterGesture);
  document.addEventListener('touchend', retryAfterGesture);
  document.addEventListener('keydown', retryAfterGesture);
  window.addEventListener('sitepagechange', updateSection);
  updateSection();
})();
