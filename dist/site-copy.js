(() => {
  const pageNames = {
    'index.html': 'home',
    'discography.html': 'discography',
    'rock-band.html': 'rock',
    'products.html': 'products',
    'about.html': 'about',
    'photography.html': 'photography'
  };
  const activePage = () => document.body.dataset.page || pageNames[location.pathname.split('/').pop() || 'index.html'];
  if (!activePage()) return;

  const attributes = ['alt', 'aria-label', 'aria-valuetext', 'title', 'placeholder', 'content'];
  const normalize = value => String(value).replace(/\s+/g, ' ').trim();
  const textBindings = new WeakMap();
  const attributeBindings = new WeakMap();
  let sources = new Map();
  let copy = new Map();
  let observer;
  let revision = 0;
  let canonical = new Map();

  window.siteCopy = {
    refresh,
    get(source) {
      const key = sources.get(normalize(source));
      return key && copy.has(key) ? copy.get(key) : source;
    }
  };

  function readMarkdown(markdown) {
    const values = new Map();
    let key = null;
    let lines = [];
    let inside = false;
    for (const line of markdown.split(/\r?\n/)) {
      if (inside) {
        if (line === '```') {
          values.set(key, lines.join('\n').trim());
          inside = false;
        } else lines.push(line);
        continue;
      }
      const heading = /^### `([^`]+)`$/.exec(line);
      if (heading) { key = heading[1]; lines = []; continue; }
      if (line === '```text' && key) { inside = true; lines = []; continue; }
    }
    return values;
  }

  function entryFor(value, binding) {
    const normalized = normalize(value);
    if (binding && normalized === normalize(binding.last)) return sources.get(binding.source) || null;
    return sources.get(normalized) || null;
  }

  function applyText(node) {
    if (node.parentElement?.closest('script, style, noscript, textarea, [data-site-copy-ignore], .site-page[hidden]')) return;
    const raw = node.nodeValue;
    if (!normalize(raw) && !textBindings.has(node)) return;
    const key = entryFor(raw, textBindings.get(node));
    if (!key || !copy.has(key)) { textBindings.delete(node); return; }
    const edited = copy.get(key);
    const match = /^(\s*)([\s\S]*?)(\s*)$/.exec(raw);
    const next = match[1] + edited + match[3];
    textBindings.set(node, { key, last: edited, source: canonical.get(key) });
    if (next !== raw) node.nodeValue = next;
  }

  function applyAttributes(element) {
    if (element.closest('.site-page[hidden]')) return;
    let bindings = attributeBindings.get(element);
    if (!bindings) { bindings = new Map(); attributeBindings.set(element, bindings); }
    for (const name of attributes) {
      if (!element.hasAttribute(name)) continue;
      if (name === 'content' && !(element.matches('meta[name="description"]'))) continue;
      const raw = element.getAttribute(name);
      const key = entryFor(raw, bindings.get(name));
      if (!key || !copy.has(key)) { bindings.delete(name); continue; }
      const edited = copy.get(key);
      bindings.set(name, { key, last: edited, source: canonical.get(key) });
      if (raw !== edited) element.setAttribute(name, edited);
    }
  }

  function applyTree(root) {
    if (root.nodeType === Node.TEXT_NODE) { applyText(root); return; }
    if (root.nodeType !== Node.ELEMENT_NODE) return;
    applyAttributes(root);
    root.querySelectorAll('*').forEach(applyAttributes);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) applyText(walker.currentNode);
  }



  async function refresh() {
    const request = ++revision;
    const pageName = activePage();
    try {
      const [manifest, response] = await Promise.all([
        fetch('website-text-map.json', { cache: 'no-store' }).then(response => {
          if (!response.ok) throw new Error('Website text map unavailable');
          return response.json();
        }),
        fetch(`website-text.md?updated=${Date.now()}`, { cache: 'no-store' })
      ]);
      if (!response.ok) return;
      const values = readMarkdown(await response.text());
      if (request !== revision || pageName !== activePage()) return;
      const active = [...manifest.filter(item => item.page === pageName || pageName === 'editor' && item.page === 'photography'), ...manifest.filter(item => item.page === 'shared')];
      const nextSources = new Map();
      const nextCopy = new Map();
      for (const item of active) {
        if (!values.has(item.key)) continue;
        const source = normalize(item.source);
        if (!nextSources.has(source)) nextSources.set(source, item.key);
        nextCopy.set(item.key, values.get(item.key));
      }
      sources = nextSources;
      copy = nextCopy;
      canonical = new Map(active.map(item => [item.key, normalize(item.source)]));
      const root = document.querySelector('.site-page:not([hidden])');
      if (root) {
        for (const element of [document.head, document.querySelector('.site-header'), root, document.querySelector('.music-dock')]) {
          if (element) applyTree(element);
        }
      } else applyTree(document.documentElement);
      window.dispatchEvent(new Event('sitecopychange'));
      if (!observer) {
        observer = new MutationObserver(changes => {
          for (const change of changes) {
            if (change.type === 'characterData') applyText(change.target);
            else if (change.type === 'attributes') applyAttributes(change.target);
            else change.addedNodes.forEach(applyTree);
          }
        });
        observer.observe(document.documentElement, {
          subtree: true, childList: true, characterData: true,
          attributes: true, attributeFilter: attributes
        });
      }
    } catch {
      // The authored HTML remains readable if the editable copy file is unavailable.
    }
  }

  refresh();
  window.addEventListener('focus', refresh);
})();
