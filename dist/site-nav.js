(() => {
  const header = document.querySelector('.site-header');
  const nav = header?.querySelector('.primary-nav');
  if (!header || !nav) return;

  const pages = {
    'index.html': { name: 'home', module: './neutron-star.js?v=10' },
    'discography.html': { name: 'discography', module: './app.js?v=17' },
    'rock-band.html': { name: 'rock', module: './rock-band.js?v=4' },
    'products.html': { name: 'products', module: './products.js?v=5' },
    'photography.html': { name: 'photography', module: './photography.js?v=12' }
  };
  const filename = url => url.pathname.split('/').pop() || 'index.html';
  const pageKey = url => pages[filename(url)] ? filename(url) : null;
  const sharedStyles = new Set(['styles.css', 'player.css', 'site-nav.css']);
  const styles = new Map();
  const cache = new Map();
  let navigation = 0;
  let current;
  let rockScroll;

  function cancelRockScroll() {
    if (!rockScroll) return;
    rockScroll.cancelled = true;
    cancelAnimationFrame(rockScroll.frame);
    rockScroll = null;
  }
  for (const event of ['wheel', 'touchstart', 'pointerdown', 'resize']) {
    window.addEventListener(event, cancelRockScroll, { passive: true });
  }
  window.addEventListener('keydown', event => {
    if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ', 'Escape'].includes(event.key)) cancelRockScroll();
  });

  for (const link of document.querySelectorAll('link[rel="stylesheet"]')) {
    styles.set(new URL(link.href).pathname, { link, ready: Promise.resolve() });
  }

  async function prepareStyles(doc) {
    const paths = [];
    const ready = [];
    for (const source of doc.querySelectorAll('link[rel="stylesheet"]')) {
      const url = new URL(source.getAttribute('href'), location.href);
      paths.push(url.pathname);
      if (!styles.has(url.pathname)) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = url.href;
        link.media = 'not all';
        const loaded = new Promise((resolve, reject) => {
          link.addEventListener('load', resolve, { once: true });
          link.addEventListener('error', () => {
            styles.delete(url.pathname);
            link.remove();
            reject(new Error(`Could not load ${url.pathname}`));
          }, { once: true });
        });
        styles.set(url.pathname, { link, ready: loaded });
        document.head.append(link);
      }
      ready.push(styles.get(url.pathname).ready);
    }
    await Promise.all(ready);
    return paths;
  }

  async function mountFunction(key) {
    if (key === 'discography.html') {
      await Promise.all([
        import('./releases.js?v=3'), import('./release-notes.js?v=10'), import('./waveforms.js')
      ]);
    }
    return pages[key].module ? (await import(pages[key].module)).mount : null;
  }

  function entryFrom(doc, key, initial = false) {
    const root = document.createElement('div');
    root.className = 'site-page';
    root.dataset.page = pages[key].name;
    root.hidden = !initial;
    root.inert = !initial;
    // Keep visited pages connected so their audio and controls survive navigation.
    for (const child of [...doc.body.childNodes]) {
      if (child === header || child.nodeType === Node.ELEMENT_NODE &&
          child.matches('.site-header, .music-dock, .site-audio-store, script')) continue;
      root.append(child);
    }
    document.body.insertBefore(root, document.querySelector('.music-dock'));
    return {
      root, key, bodyClass: doc.body.className.replace(/\bsite-player-enabled\b/g, '').trim(),
      bodyID: doc.body.id, title: doc.title,
      description: doc.querySelector('meta[name="description"]')?.content || '',
      theme: doc.querySelector('meta[name="theme-color"]')?.content || '',
      styles: [...doc.querySelectorAll('link[rel="stylesheet"]')].map(link =>
        new URL(link.getAttribute('href'), location.href).pathname),
      mounted: false, lifecycle: null, scroll: { x: 0, y: 0 }
    };
  }

  function markCurrent() {
    const section = pages[current.key].name;
    for (const link of nav.querySelectorAll('a')) {
      if (link.dataset.section === section) {
        link.setAttribute('aria-current', section === 'photography' ? 'location' : 'page');
      } else link.removeAttribute('aria-current');
    }
  }

  async function loadPage(key) {
    if (cache.has(key)) return cache.get(key);
    const response = await fetch(new URL(key, location.href));
    if (!response.ok) throw new Error(`Could not load ${key}`);
    const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
    if (!doc.querySelector('main') || !doc.querySelector('.site-header')) throw new Error(`Invalid page: ${key}`);
    const [paths, mount] = await Promise.all([prepareStyles(doc), mountFunction(key)]);
    if (cache.has(key)) return cache.get(key);
    const entry = entryFrom(doc, key);
    entry.styles = paths;
    entry.mount = mount;
    cache.set(key, entry);
    return entry;
  }

  function positionPage(url, point) {
    if (point) {
      window.scrollTo({ left: point.x, top: point.y, behavior: 'instant' });
      return;
    }
    let target;
    try { target = current.root.querySelector(`#${CSS.escape(decodeURIComponent(url.hash.slice(1)))}`); }
    catch { /* Empty or malformed hashes use the page top. */ }
    if (target) target.scrollIntoView({ behavior: 'instant' });
    else window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }

  async function scrollToRockCaption(entry, motion) {
    const caption = entry.root.querySelector('.rock-banner figcaption');
    const photo = entry.root.querySelector('.rock-banner-image img');
    if (!caption) { cancelRockScroll(); return; }
    // The banner must have its final height before choosing a scroll destination.
    await Promise.all([document.fonts.ready, photo?.decode().catch(() => {})]);
    if (motion.cancelled || current !== entry || motion.id !== navigation) return;
    const range = document.createRange();
    range.selectNodeContents(caption);
    const start = scrollY;
    const destination = Math.max(0, start + range.getBoundingClientRect().top - header.getBoundingClientRect().bottom - 12);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      window.scrollTo({ top: destination, behavior: 'instant' });
      rockScroll = null;
      return;
    }
    const began = performance.now();
    function advance(now) {
      if (motion.cancelled || motion.id !== navigation || current !== entry) return;
      const progress = Math.min(1, (now - began) / 1400);
      const eased = progress < .5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
      window.scrollTo({ top: start + (destination - start) * eased, behavior: 'instant' });
      if (progress < 1) motion.frame = requestAnimationFrame(advance);
      else rockScroll = null;
    }
    motion.frame = requestAnimationFrame(advance);
  }

  async function navigate(url, { pop = false, point = null, rockIntro = false } = {}) {
    cancelRockScroll();
    const id = ++navigation;
    const motion = rockIntro ? { id, cancelled: false, frame: 0 } : null;
    if (motion) rockScroll = motion;
    try {
      const next = await loadPage(pageKey(url));
      if (id !== navigation) return;
      const changedPage = next !== current;
      current.scroll = { x: scrollX, y: scrollY };
      if (!pop) {
        history.replaceState({ ...history.state, scroll: current.scroll }, '', location.href);
        if (url.href !== location.href) history.pushState({ sitePage: true }, '', url.href);
      }
      if (next !== current) {
        current.lifecycle?.deactivate?.();
        current.root.hidden = true;
        current.root.inert = true;
        current = next;
        document.body.className = `${current.bodyClass} site-player-enabled`;
        document.body.id = current.bodyID;
        document.body.dataset.page = pages[current.key].name;
        for (const [path, { link }] of styles) {
          link.media = sharedStyles.has(path.split('/').pop()) || current.styles.includes(path) ? 'all' : 'not all';
        }
        current.root.hidden = false;
        current.root.inert = false;
      }
      document.title = current.title;
      document.querySelector('meta[name="description"]')?.setAttribute('content', current.description);
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', current.theme);
      if (!current.mounted) {
        current.lifecycle = current.mount?.(current.root);
        current.mounted = true;
      }
      markCurrent();
      window.dispatchEvent(new CustomEvent('sitepagechange', { detail: { root: current.root } }));
      if (motion && !motion.cancelled) {
        if (changedPage) window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        scrollToRockCaption(current, motion);
      } else positionPage(url, point || (pop && !url.hash ? current.scroll : null));
      current.lifecycle?.activate?.();
      const main = current.root.querySelector('main');
      if (main && !pop) {
        main.setAttribute('tabindex', '-1');
        main.focus({ preventScroll: true });
      }
      // Copy refreshes asynchronously; never reset the viewport after a user starts interacting.
      window.siteCopy?.refresh();
    } catch (error) {
      if (id !== navigation) return;
      console.warn('Section navigation failed; opening the page normally.', error);
      location.assign(url.href);
    }
  }

  const initialKey = pageKey(new URL(location.href));
  if (!initialKey) return;
  current = entryFrom(document, initialKey, true);
  cache.set(initialKey, current);
  document.body.dataset.page = pages[initialKey].name;
  history.scrollRestoration = 'manual';
  history.replaceState({ ...history.state, sitePage: true }, '', location.href);
  markCurrent();
  const initialMount = mountFunction(initialKey).then(mount => {
    current.mount = mount;
    current.lifecycle = mount?.(current.root);
    current.mounted = true;
    window.dispatchEvent(new CustomEvent('sitepagechange', { detail: { root: current.root } }));
  });

  document.addEventListener('click', event => {
    const link = event.target instanceof Element && event.target.closest('a[href]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey ||
        event.shiftKey || event.altKey || link.hasAttribute('download') ||
        link.target && link.target !== '_self') return;
    const url = new URL(link.href);
    if (url.origin !== location.origin || !pageKey(url) || url.search) return;
    event.preventDefault();
    initialMount.then(() => navigate(url, { rockIntro: pageKey(url) === 'rock-band.html' && !url.hash }));
  });
  window.addEventListener('popstate', event => {
    const url = new URL(location.href);
    if (pageKey(url)) initialMount.then(() => navigate(url, { pop: true, point: event.state?.scroll }));
  });
  window.addEventListener('hashchange', markCurrent);
})();
