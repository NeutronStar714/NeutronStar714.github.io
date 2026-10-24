export function mount(root) {
  const showcases = [...root.querySelectorAll('.plugin-showcase')];
  const repaint = [];
  const formatTime = seconds => Number.isFinite(seconds)
    ? `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
    : '0:00';

  for (const showcase of showcases) {
    const section = showcase.closest('.plugin-section');
    const video = showcase.querySelector('.plugin-motion');
    const demo = section.querySelector('.product-demo');
    if (!video?.getAttribute('src') || !demo) continue;
    const title = section.querySelector('h2').textContent.trim();
    const button = demo.querySelector('.demo-toggle');
    const buttonText = demo.querySelector('.demo-button-text');
    const seek = demo.querySelector('.demo-seek');
    const time = demo.querySelector('.demo-time');
    const status = demo.querySelector('.demo-status');
    const authored = source => window.siteCopy?.get(source) || source;
    let failed = false;

    // The video's embedded soundtrack and frames share a single media clock.
    // Keep this element alive during section navigation, just like other tracks.
    function paint() {
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      const playing = !video.paused && !video.ended;
      button.disabled = false;
      seek.disabled = duration <= 0;
      button.classList.toggle('is-playing', playing);
      buttonText.textContent = authored(playing ? 'Pause recording' : 'Play recording');
      button.setAttribute('aria-label', authored(`${playing ? 'Pause' : 'Play'} ${title} recording`));
      button.setAttribute('aria-pressed', String(playing));
      seek.value = duration ? String(video.currentTime / duration * 100) : '0';
      time.textContent = `${formatTime(video.currentTime)} / ${formatTime(duration)}`;
      const message = failed ? 'Could not load recording' : playing ? 'Playing'
        : video.currentTime > 0 && !video.ended ? 'Paused' : 'Ready to play';
      status.textContent = authored(message);
    }

    async function play() {
      failed = false;
      if (video.error) video.load();
      if (video.ended) video.currentTime = 0;
      try {
        if (window.siteAudio) {
          await window.siteAudio.playTrack(video, `${title} guitar`, {
            excerpt: true, cover: video.getAttribute('poster')
          });
        } else {
          showcases.forEach(other => { if (other !== showcase) other.querySelector('video')?.pause(); });
          await video.play();
        }
      } catch {
        failed = true;
      }
      paint();
    }

    button.addEventListener('click', () => {
      if (!video.paused) video.pause();
      else play();
    });
    seek.addEventListener('input', () => {
      if (!Number.isFinite(video.duration)) return;
      video.currentTime = Number(seek.value) / 100 * video.duration;
      paint();
    });
    for (const event of ['loadedmetadata', 'loadeddata', 'durationchange', 'timeupdate',
      'seeking', 'seeked', 'play', 'pause', 'ended']) video.addEventListener(event, paint);
    video.addEventListener('error', () => { failed = true; paint(); });
    repaint.push(paint);
    paint();
    // Pages arrive through DOMParser; explicitly start metadata loading after adoption.
    // This enables scrubbing from the initial paused frame before the first play.
    video.load();
  }

  window.addEventListener('sitecopychange', () => {
    if (!root.hidden) repaint.forEach(paint => paint());
  });
  // Hiding the products page must not pause the active video's soundtrack.
  return { activate() { repaint.forEach(paint => paint()); } };
}
