(()=>{
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const body = document.body;
  let savedScrollY = 0;

  function updatePresentationButtons(){
    const active = body.classList.contains('presentation-mode');
    ['#fullBtn','#exchangeFullBtn'].forEach(sel=>{
      const btn=$(sel); if(!btn) return;
      btn.textContent = active ? '✕ Präsentation' : '▣ Präsentation';
      btn.setAttribute('aria-pressed', String(active));
    });
  }

  function setPresentation(active){
    if(active === body.classList.contains('presentation-mode')) return;
    if(active){
      savedScrollY = window.scrollY || 0;
      body.classList.add('presentation-mode');
      document.documentElement.classList.add('presentation-mode');
      requestAnimationFrame(()=>{ const app=$('.app'); if(app) app.scrollTop=0; });
    }else{
      body.classList.remove('presentation-mode');
      document.documentElement.classList.remove('presentation-mode');
      requestAnimationFrame(()=>window.scrollTo(0,savedScrollY));
    }
    updatePresentationButtons();
  }

  function togglePresentation(){ setPresentation(!body.classList.contains('presentation-mode')); }
  window.togglePresentationMode = togglePresentation;

  ['#fullBtn','#exchangeFullBtn'].forEach(sel=>{
    const btn=$(sel); if(!btn) return;
    btn.onclick = e => { e.preventDefault(); togglePresentation(); };
    btn.title = 'Stabiler Präsentationsmodus – besonders für iPad/Beamer';
  });

  document.addEventListener('keydown',e=>{
    if(e.key==='Escape' && body.classList.contains('presentation-mode')) setPresentation(false);
  });

  function syncChemModeUI(){
    const step = $('#modeButtons button.active')?.dataset.mode === 'step';
    body.classList.toggle('chem-step-mode', !!step);
  }
  $$('#modeButtons button').forEach(btn=>btn.addEventListener('click',()=>requestAnimationFrame(syncChemModeUI)));
  syncChemModeUI();

  document.addEventListener('fullscreenchange',()=>{
    if(document.fullscreenElement && body.classList.contains('presentation-mode')){
      const result=document.exitFullscreen?.();
      result?.catch?.(()=>{});
    }
  });

  updatePresentationButtons();
})();
