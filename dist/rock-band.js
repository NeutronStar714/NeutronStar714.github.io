export function mount(root) {
const audioLifecycle = (() => {
  const audio = root.querySelector('#anyone-audio');
  const player = root.querySelector('.single-player');
  const button = root.querySelector('.single-play');
  const seek = root.querySelector('#single-seek');
  const clock = root.querySelector('.single-time');
  const error = root.querySelector('.single-error');
  if (!audio || !player || !button || !seek || !clock) return;
  const visitKey = 'nts-rock-intro-played';
  let consumed = false, attempted = false;
  try { consumed = sessionStorage.getItem(visitKey) === 'yes'; } catch {}

  async function playAnyone() {
    if (audio.ended) audio.currentTime = 0;
    if (audio.error) audio.load();
    if (window.siteAudio) await window.siteAudio.playTrack(audio, 'G10 - Anyone', {
      cover: 'assets/g10-anyone-cover.webp', excerpt: false
    });
    else await audio.play();
  }
  function autoplay() {
    if (root.hidden || consumed || attempted) return;
    attempted = true;
    playAnyone().then(() => {
      consumed = true;
      try { sessionStorage.setItem(visitKey, 'yes'); } catch {}
    }).catch(sync);
  }

  function formatTime(seconds) {
    if (!Number.isFinite(seconds)) return '0:00';
    return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  }

  function sync() {
    const playing = !audio.paused;
    const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    player.classList.toggle('is-playing', playing);
    button.setAttribute('aria-pressed', String(playing));
    const action = playing ? 'Pause Anyone' : 'Play Anyone';
    button.setAttribute('aria-label', window.siteCopy?.get(action) || action);
    seek.value = duration ? String(audio.currentTime / duration * 100) : '0';
    clock.textContent = `${formatTime(audio.currentTime)} / ${formatTime(duration)}`;
  }

  button.addEventListener('click', async () => {
    error.hidden = true;
    if (!audio.paused) { audio.pause(); return; }
    try {
      await playAnyone();
    } catch { error.hidden = false; }
    sync();
  });

  seek.addEventListener('input', () => {
    if (Number.isFinite(audio.duration)) audio.currentTime = Number(seek.value) / 100 * audio.duration;
    sync();
  });
  for (const event of ['loadedmetadata', 'timeupdate', 'play', 'pause', 'ended']) {
    audio.addEventListener(event, sync);
  }
  audio.addEventListener('error', () => { error.hidden = false; sync(); });
  window.addEventListener('sitecopychange', () => { if (!root.hidden) sync(); });
  sync();
  autoplay();
  return { activate: autoplay, deactivate() { attempted = false; } };
})();

(() => {
  const source = root.querySelector('.rock-story-source');
  const body = root.querySelector('.rock-story-body');
  const credits = root.querySelector('.rock-story-credits');
  if (!source || !body || !credits) return;

  function layoutStory() {
    if (root.hidden) return;
    // Keep the author's single Markdown entry intact while arranging its parts.
    const text = source.textContent.trim();
    const creditHeading = /^Credits\s*:/im.exec(text);
    const bodyText = creditHeading ? text.slice(0, creditHeading.index).trim() : text;
    const creditText = creditHeading ? text.slice(creditHeading.index).trim() : '';
    if (body.textContent !== bodyText) body.textContent = bodyText;
    if (credits.textContent !== creditText) credits.textContent = creditText;
    credits.hidden = !creditText;
  }

  window.addEventListener('sitecopychange', layoutStory);
  layoutStory();
})();

return {
  activate() { audioLifecycle?.activate(); },
  deactivate() { audioLifecycle?.deactivate(); }
};
}
