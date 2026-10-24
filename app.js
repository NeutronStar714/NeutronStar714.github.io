export function mount(root) {
const timeline = root.querySelector('#timeline');
const mediaPlayers = [];
const escapeHTML = (value) => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const mediaURL = name => 'musicsources/' + encodeURIComponent(name);
const formatTime = seconds => Math.floor(seconds / 60) + ':' + String(Math.floor(seconds % 60)).padStart(2, '0');
window.releases.forEach((release, index) => {
 const notes = window.releaseNotes.find(item => item.title === release.title);
 if (notes) Object.assign(release, notes);
 const section = document.createElement('article');
 section.style.setProperty('--album-accent', window.waveformData.colors[release.cover] || '#b9d8ed');
 section.className = 'release'; section.id = 'release-' + (index + 1);
 const titleID = section.id + '-title'; section.setAttribute('aria-labelledby', titleID);
 section.innerHTML = `<span class="release-number">${String(index+1).padStart(2,'0')}</span>
 <div class="title-block"><div class="meta">${escapeHTML(release.type.toUpperCase())}</div><h2 id="${titleID}">${escapeHTML(release.title)}</h2><time datetime="${release.date}">${release.date.replaceAll('-','.')}</time></div>
 <div class="art-and-audio"><img class="cover" src="${mediaURL(release.cover)}" alt="${escapeHTML(release.title)} cover artwork" width="600" height="600" loading="${index===0?'eager':'lazy'}"><div class="excerpt-label">Listen to selected excerpts</div><div class="players"></div></div>
 <div class="notes"><p class="notes-label">About this release</p><p>${escapeHTML(release.description || 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.')}</p><div class="links"></div></div>`;
 const notesPanel = section.querySelector('.notes');
 notesPanel.tabIndex = 0;
 notesPanel.setAttribute('role', 'region');
 notesPanel.setAttribute('aria-label', release.title + ' description and tracklist');
 if (release.tracklist?.length) {
  const details = document.createElement('details');
  details.className = 'release-tracklist';
  const count = release.tracklist.reduce((sum, disc) => sum + disc.tracks.length, 0);
  details.innerHTML = `<summary>Tracklist <span>${count} ${count === 1 ? 'track' : 'tracks'}</span></summary>` + release.tracklist.map(disc =>
   `${disc.label ? `<h3>${escapeHTML(disc.label)}</h3>` : ''}<ol start="${disc.tracks[0].number}">${disc.tracks.map(track => `<li value="${track.number}">${escapeHTML(track.title)}</li>`).join('')}</ol>`
  ).join('');
  notesPanel.insertBefore(details, notesPanel.querySelector('.links'));
 }
 for (const link of release.links) {
  if (!/^https:\/\//i.test(link.url)) continue;
  const a = document.createElement('a'); a.href = link.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = link.label + ' ↗';section.querySelector('.links').append(a);
 }
 for (const file of release.clips) {
  const title = file.replace(/^exc\d+_/, '').replace(/\.mp3$/, '').replaceAll('_',' ');
  const row = document.createElement('div'); row.className='player';
  const clip = window.waveformData.clips[file];
  const bars = clip.peaks.map((peak,i) => {
   const height = Math.max(2,peak*38);
   return `<rect x="${i*4}" y="${(44-height)/2}" width="2.4" height="${height}" rx="1.2"/>`;
  }).join('');
  const wave = `<svg viewBox="0 0 384 44" preserveAspectRatio="none" aria-hidden="true">${bars}</svg>`;
  row.innerHTML = `<button class="play" type="button" aria-label="Play ${escapeHTML(title)}" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path class="play-icon" d="M9 5.5 19 12 9 18.5Z"/><path class="pause-icon" d="M8 6h3v12H8zM14 6h3v12h-3z"/></svg></button><div class="track-content"><div class="track-heading"><span class="track-title">${escapeHTML(title)}</span></div><div class="wave-seek"><div class="wave-base">${wave}</div><div class="wave-played">${wave}</div><div class="wave-cursor" aria-hidden="true"></div><input class="seek" type="range" min="0" max="${clip.duration}" step="0.1" value="0" aria-label="Seek ${escapeHTML(title)}" aria-valuetext="0:00 of ${formatTime(clip.duration)}"></div><div class="track-times"><span class="clock">0:00</span><span class="duration">${formatTime(clip.duration)}</span></div></div>`;
  const audio = document.createElement('audio'); audio.preload = 'none'; audio.src = mediaURL(file); row.append(audio);mediaPlayers.push(audio);
  const button = row.querySelector('button'), seek = row.querySelector('input'), clock = row.querySelector('.clock');
  let pendingSeek = null;
  const limit = () => Number.isFinite(audio.duration) ? audio.duration : clip.duration;
  const paint = time => {
   seek.value=Math.min(time,limit());
   row.style.setProperty('--played', `${Math.min(100,time/limit()*100)}%`);
   clock.textContent=formatTime(time);
   seek.setAttribute('aria-valuetext',clock.textContent+' of '+formatTime(limit()));
  };
  const sync = () => {const playing = !audio.paused;button.setAttribute('aria-label',(playing?'Pause ':'Play ')+title);button.setAttribute('aria-pressed',String(playing));row.classList.toggle('is-playing',playing);};
  const showError = () => {
   if(!row.querySelector('.audio-error')){const error=document.createElement('p');error.className='audio-error';error.setAttribute('role','status');error.textContent='Could not load this excerpt. Please try again.';row.append(error);}
   sync();
  };
  button.addEventListener('click', async () => {
   if (!audio.paused) {audio.pause();return;}
   if(audio.ended)audio.currentTime=0;
   try {
    if(audio.error)audio.load();
    if(window.siteAudio) await window.siteAudio.playTrack(audio,title,{cover:mediaURL(release.cover),excerpt:true});
    else {mediaPlayers.forEach(other => {if(other!==audio)other.pause();});await audio.play();}
    row.querySelector('.audio-error')?.remove();
   }
   catch {showError();}
  });
  audio.addEventListener('play',sync);audio.addEventListener('pause',sync);audio.addEventListener('ended',sync);audio.addEventListener('error',showError);
  const applyPendingSeek = () => {
   if(pendingSeek===null || audio.readyState<1 || audio.seeking)return;
   const target=Math.min(pendingSeek,limit());
   for(let i=0;i<audio.seekable.length;i++){
    if(audio.seekable.start(i)<=target && audio.seekable.end(i)>=target){audio.currentTime=target;return;}
   }
  };
  audio.addEventListener('seeked',()=>{
   if(pendingSeek!==null && Math.abs(audio.currentTime-Math.min(pendingSeek,limit()))<0.25){pendingSeek=null;paint(audio.currentTime);}
   else applyPendingSeek();
  });
  ['loadeddata','canplay','progress'].forEach(event=>audio.addEventListener(event,applyPendingSeek));
  const updateDuration = () => {
   seek.max=limit();row.querySelector('.duration').textContent=formatTime(limit());
   applyPendingSeek();
  };
  audio.addEventListener('loadedmetadata',updateDuration);audio.addEventListener('durationchange',updateDuration);
  audio.addEventListener('timeupdate',()=>{if(pendingSeek===null)paint(audio.currentTime);});
  seek.addEventListener('input',()=>{
   const time=Math.min(Number(seek.value),limit());paint(time);
   pendingSeek=time;audio.preload="auto";if(audio.readyState===0 && audio.networkState!==2)audio.load();applyPendingSeek();
  });
  section.querySelector('.players').append(row);
 }
 const stage=document.createElement('div');stage.className='release-stage';
 while(section.firstChild)stage.append(section.firstChild);
 section.append(stage);timeline.append(section);
 const next=window.releases[index+1];
 if(next && next.date.slice(0,4)!==release.date.slice(0,4)){
  // Include every intervening calendar year, even years without releases.
  for(let value=Number(release.date.slice(0,4));value>Number(next.date.slice(0,4));value--){
   const year=document.createElement('div');year.className='year-divider';year.dataset.year=String(value);
   year.textContent=String(value);year.setAttribute('aria-label',String(value));timeline.append(year);
  }
 }
});
// Free scrolling with a narrow, viewport-relative magnetic zone.
const slides=[...root.querySelectorAll('.release')];
const backdrops=[...root.querySelectorAll('.artwork-backdrop > div')];
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
const yearItems=[...root.querySelectorAll('.year-divider')];
let selected=-1,layer=0,frame=0,snapTimer=0,pointerDown=false,snapping=false;
function nearestSlide(){
 let nearest=0,offset=Infinity;
 slides.forEach((slide,i)=>{const rect=slide.getBoundingClientRect();const delta=rect.top+rect.height/2-innerHeight/2;
  if(Math.abs(delta)<Math.abs(offset)){nearest=i;offset=delta;}
 });return {nearest,offset};
}
function focusCarousel(){
 frame=0;if(root.hidden)return;const center=innerHeight/2;
 // Read the untransformed album page, and transform its complete inner stage.
 const midpoints=slides.map(slide=>{const rect=slide.getBoundingClientRect();return (rect.top+rect.height/2)/innerHeight;});
 slides.forEach((slide,i)=>{
  const midpoint=midpoints[i];
  const focus=Math.max(0,Math.min(1,midpoint/.2,(1-midpoint)/.2));
  const stage=slide.querySelector('.release-stage');
  stage.style.setProperty('--album-scale',(0.75+0.5*focus).toFixed(4));
  stage.style.setProperty('--album-blur',((1-focus)*3).toFixed(3)+'px');
 });
 // Year markers remain independent, freely scrolling elements.
 yearItems.forEach(item=>{
  const rect=item.getBoundingClientRect();const distance=Math.abs(rect.top+rect.height/2-center);
  const focus=Math.max(0,1-distance/center);
  item.style.setProperty('--item-scale',(0.75+0.5*focus).toFixed(4));
  item.style.setProperty('--item-blur',((1-focus)*3).toFixed(3)+'px');
 });
 const {nearest}=nearestSlide();
 if(nearest!==selected){selected=nearest;slides.forEach((slide,i)=>slide.classList.toggle('is-selected',i===selected));
  layer=1-layer;backdrops[layer].style.backgroundImage=`url("${mediaURL(window.releases[selected].cover)}")`;
  backdrops[layer].classList.add('visible');backdrops[1-layer].classList.remove('visible');
 }
}
function scheduleFocus(){if(!root.hidden&&!frame)frame=requestAnimationFrame(focusCarousel);}
function snapIfClose(){
 if(root.hidden||pointerDown||snapping)return;
 const {offset}=nearestSlide();
 // Never snap year dividers, and never pull in an album outside ±10% height.
 if(Math.abs(offset)>innerHeight*.1||Math.abs(offset)<1)return;
 snapping=true;
 scrollBy({top:offset,behavior:reducedMotion.matches?'instant':'smooth'});
 setTimeout(()=>{snapping=false;},500);
}
addEventListener('scroll',()=>{if(root.hidden)return;scheduleFocus();clearTimeout(snapTimer);snapTimer=setTimeout(snapIfClose,200);},{passive:true});
addEventListener('pointerdown',()=>{if(root.hidden)return;pointerDown=true;clearTimeout(snapTimer);},{passive:true});
addEventListener('pointerup',()=>{pointerDown=false;},{passive:true});
addEventListener('pointercancel',()=>{pointerDown=false;},{passive:true});
addEventListener('resize',scheduleFocus);reducedMotion.addEventListener('change',scheduleFocus);focusCarousel();

return { activate: scheduleFocus, deactivate() { cancelAnimationFrame(frame); frame=0; clearTimeout(snapTimer); pointerDown=false; snapping=false; } };

}
