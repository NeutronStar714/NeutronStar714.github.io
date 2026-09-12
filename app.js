const timeline = document.querySelector('#timeline');
const mediaPlayers = [];
const escapeHTML = (value) => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const mediaURL = name => 'musicsources/' + encodeURIComponent(name);
const formatTime = seconds => Math.floor(seconds / 60) + ':' + String(Math.floor(seconds % 60)).padStart(2, '0');
window.releases.forEach((release, index) => {
 const section = document.createElement('article');
 section.className = 'release'; section.id = 'release-' + (index + 1);
 const titleID = section.id + '-title'; section.setAttribute('aria-labelledby', titleID);
 section.innerHTML = `<span class="release-number">${String(index+1).padStart(2,'0')}</span>
 <div class="title-block"><div class="meta">${release.date.slice(0,4)} / ${escapeHTML(release.type.toUpperCase())}</div><h2 id="${titleID}">${escapeHTML(release.title)}</h2><time datetime="${release.date}">${release.date.replaceAll('-','.')}</time></div>
 <div class="art-and-audio"><img class="cover" src="${mediaURL(release.cover)}" alt="${escapeHTML(release.title)} cover artwork" width="600" height="600" loading="${index===0?'eager':'lazy'}"><div class="excerpt-label">LISTEN / SELECTED EXCERPTS</div><div class="players"></div></div>
 <div class="notes"><p class="notes-label">About this release</p><p>${escapeHTML(release.description || 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.')}</p><div class="links"></div></div>`;
 for (const link of release.links) {
  if (!/^https:\/\//i.test(link.url)) continue;
  const a = document.createElement('a'); a.href = link.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = link.label + ' ↗';section.querySelector('.links').append(a);
 }
 for (const file of release.clips) {
  const title = file.replace(/^exc\d+_/, '').replace(/\.mp3$/, '').replaceAll('_',' ');
  const row = document.createElement('div'); row.className='player';
  row.innerHTML = `<button class="play" type="button" aria-label="Play ${escapeHTML(title)}" aria-pressed="false">▶</button><div><span class="track-title">${escapeHTML(title)}</span><input class="seek" type="range" min="0" max="60" step="0.1" value="0" aria-label="Seek ${escapeHTML(title)}" aria-valuetext="0:00"></div><span class="clock">0:00</span>`;
  const audio = document.createElement('audio'); audio.preload = 'none'; audio.src = mediaURL(file); row.append(audio);mediaPlayers.push(audio);
  const button = row.querySelector('button'), seek = row.querySelector('input'), clock = row.querySelector('.clock');
  const limit = () => Math.min(60, Number.isFinite(audio.duration) ? audio.duration : 60);
  const sync = () => { const playing = !audio.paused; button.textContent = playing ? 'Ⅱ' : '▶';button.setAttribute('aria-label',(playing?'Pause ':'Play ')+title);button.setAttribute('aria-pressed',String(playing));row.classList.toggle('is-playing',playing); };
  button.addEventListener('click', async () => {
   if (!audio.paused) {audio.pause();return;}
   mediaPlayers.forEach(other => {if(other!==audio)other.pause();});
   if(audio.currentTime >= limit()-.15)audio.currentTime=0;
   try { await audio.play();row.querySelector('.audio-error')?.remove(); }
   catch { if(!row.querySelector('.audio-error')){ const error = document.createElement('p');error.className='audio-error';error.setAttribute('role','status');error.textContent='Could not play this excerpt. Please try again.';row.append(error); }sync(); }
  });
  audio.addEventListener('play',sync);audio.addEventListener('pause',sync);audio.addEventListener('ended',sync);
  audio.addEventListener('loadedmetadata',()=>{seek.max=limit();});
  audio.addEventListener('timeupdate',()=>{if(audio.currentTime>=60){audio.pause();audio.currentTime=60;}seek.value=Math.min(audio.currentTime,limit());clock.textContent=formatTime(Number(seek.value));seek.setAttribute('aria-valuetext',clock.textContent+' of '+formatTime(limit()));});
  seek.addEventListener('input',()=>{audio.currentTime=Math.min(Number(seek.value),limit());clock.textContent=formatTime(Number(seek.value));});
  section.querySelector('.players').append(row);
 }
 timeline.append(section);
});