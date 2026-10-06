(()=>{
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const world = $('#world'), ctx = world.getContext('2d');
  const graph = $('#graph'), gctx = graph.getContext('2d');
  const css = getComputedStyle(document.documentElement);
  const COL = {a:css.getPropertyValue('--a').trim(), b:css.getPropertyValue('--b').trim(), c:css.getPropertyValue('--c').trim(), c2:css.getPropertyValue('--c2').trim(), text:css.getPropertyValue('--text').trim(), muted:css.getPropertyValue('--muted').trim(), good:css.getPropertyValue('--good').trim(), warn:css.getPropertyValue('--warn').trim()};

  let DPR = Math.min(devicePixelRatio || 1, 2);
  let last = performance.now(), modelT = 0, graphClock = 0, eqScore = 0;
  let paused = false, view = 'reactor', simMode = 'continuous';
  let history = [], flashes = [], transitions = [];
  let lastRates = {f:0,r:0}, lastStep = {f:0,r:0};

  const init = {A:12,B:12,C:4,kf:.06,kr:.48,V:1,speed:1};
  const state = {kf:init.kf, kr:init.kr, V:init.V, speed:init.speed};
  let particles = [];

  const rnd = (a,b) => a + Math.random() * (b-a);
  const clamp = (x,a,b) => Math.max(a, Math.min(b, x));
  const fmt = (x,d=2) => Number(x).toLocaleString('de-DE',{minimumFractionDigits:d, maximumFractionDigits:d});
  const shuffle = arr => { for(let i=arr.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]];} return arr; };

  function resizeCanvas(c, cctx){
    const r = c.getBoundingClientRect();
    const w = Math.max(10, Math.round(r.width*DPR)), h = Math.max(10, Math.round(r.height*DPR));
    if(c.width!==w || c.height!==h){ c.width=w; c.height=h; cctx.setTransform(DPR,0,0,DPR,0,0); }
  }
  function worldSize(){ const r = world.getBoundingClientRect(); return {w:r.width, h:r.height}; }
  function reactorBox(){ const {w,h} = worldSize(); const s = Math.sqrt(state.V); const cw = clamp(w*(.56+.36*s),w*.58,w*.92), ch = clamp(h*(.57+.34*s),h*.60,h*.91); return {x:(w-cw)/2,y:(h-ch)/2,w:cw,h:ch}; }
  function splitBoxes(){ const b = reactorBox(); const gap = 24; const half = (b.w-gap)/2; return {left:{x:b.x,y:b.y,w:half,h:b.h}, right:{x:b.x+half+gap,y:b.y,w:half,h:b.h}, dividerX:b.x+half+gap/2, all:b}; }
  function zoneForType(type){
    if(view==='reactor') return reactorBox();
    const s = splitBoxes();
    return type==='C' ? s.right : s.left;
  }
  function makeParticle(type, x, y){
    const z = zoneForType(type);
    return {id:(crypto.randomUUID?crypto.randomUUID():String(Math.random())), type, x:x ?? rnd(z.x+18,z.x+z.w-18), y:y ?? rnd(z.y+18,z.y+z.h-18), vx:rnd(-34,34), vy:rnd(-34,34), angle:rnd(0,Math.PI*2), spin:rnd(-1.5,1.5)};
  }
  function insideZone(p){
    const z = zoneForType(p.type), m=14; p.x = clamp(p.x,z.x+m,z.x+z.w-m); p.y = clamp(p.y,z.y+m,z.y+z.h-m);
  }
  function setCounts(A,B,C){ particles=[]; for(let i=0;i<A;i++) particles.push(makeParticle('A')); for(let i=0;i<B;i++) particles.push(makeParticle('B')); for(let i=0;i<C;i++) particles.push(makeParticle('C')); }
  function counts(){ let A=0,B=0,C=0; for(const p of particles){ if(p.type==='A') A++; else if(p.type==='B') B++; else C++; } return {A,B,C}; }

  function propensity(){ const n = counts(); const scale=.40; return {f:scale*state.kf*n.A*n.B/state.V, r:scale*state.kr*n.C, n}; }
  function poisson(lambda){
    if(lambda<=0) return 0;
    if(lambda>16){ const u=Math.max(1e-9,Math.random()), v=Math.random(); const z=Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v); return Math.max(0, Math.round(lambda+Math.sqrt(lambda)*z)); }
    let L=Math.exp(-lambda), k=0, p=1; do{ k++; p*=Math.random(); } while(p>L); return k-1;
  }
  function flash(x,y,col){ flashes.push({x,y,col,t:0,life:.55}); }
  function toast(txt){ const el=$('#toast'); el.textContent=txt; el.classList.add('show'); clearTimeout(toast.t); toast.t=setTimeout(()=>el.classList.remove('show'),1500); }

  function addTransition(dir, x0,y0,x1,y1){ transitions.push({dir,x0,y0,x1,y1,t:0,life:.65}); }

  function forwardEvent(){
    const As = particles.filter(p=>p.type==='A'); const Bs = particles.filter(p=>p.type==='B');
    if(!As.length || !Bs.length) return false;
    const a = As[Math.floor(Math.random()*As.length)], b = Bs[Math.floor(Math.random()*Bs.length)];
    const x=(a.x+b.x)/2, y=(a.y+b.y)/2;
    particles = particles.filter(p=>p!==a && p!==b);
    const target = view==='split' ? splitBoxes().right : reactorBox();
    const c = makeParticle('C', view==='split' ? target.x+22 : x, view==='split' ? clamp(y,target.y+20,target.y+target.h-20) : y);
    c.vx = (a.vx+b.vx)/2; c.vy=(a.vy+b.vy)/2; particles.push(c);
    flash(x,y,COL.c);
    if(view==='split'){ const s=splitBoxes(); addTransition('f', s.left.x+s.left.w-18, y, s.right.x+18, y); }
    return true;
  }
  function reverseEvent(){
    const Cs = particles.filter(p=>p.type==='C'); if(!Cs.length) return false;
    const c = Cs[Math.floor(Math.random()*Cs.length)]; particles = particles.filter(p=>p!==c);
    const phi=rnd(0,Math.PI*2), sep=12;
    const z = zoneForType('A');
    const a = makeParticle('A', view==='split' ? z.x+22 : c.x+Math.cos(phi)*sep, view==='split' ? c.y-8 : c.y+Math.sin(phi)*sep);
    const b = makeParticle('B', view==='split' ? z.x+48 : c.x-Math.cos(phi)*sep, view==='split' ? c.y+8 : c.y-Math.sin(phi)*sep);
    a.vx = c.vx + Math.cos(phi)*18; a.vy = c.vy + Math.sin(phi)*18; b.vx = c.vx - Math.cos(phi)*18; b.vy = c.vy - Math.sin(phi)*18;
    insideZone(a); insideZone(b); particles.push(a,b); flash(c.x,c.y,COL.a);
    if(view==='split'){ const s=splitBoxes(); addTransition('r', s.right.x+18, c.y, s.left.x+s.left.w-18, c.y); }
    return true;
  }

  function runRound(dtModel, recordHistory=true){
    modelT += dtModel;
    const pr = propensity();
    let nf = poisson(pr.f*dtModel), nr = poisson(pr.r*dtModel);
    nf = Math.min(nf, pr.n.A, pr.n.B); nr = Math.min(nr, pr.n.C);
    let ef=0, er=0; for(let i=0;i<nf;i++) if(forwardEvent()) ef++; for(let i=0;i<nr;i++) if(reverseEvent()) er++;
    const after = propensity(); const smooth = 1 - Math.exp(-dtModel*2.2);
    lastRates.f += (after.f-lastRates.f)*smooth; lastRates.r += (after.r-lastRates.r)*smooth;
    lastStep = {f:ef, r:er};
    if(recordHistory){ graphClock += dtModel; if(graphClock>=.22){ graphClock=0; const n=counts(); history.push({t:modelT,...n}); history=history.filter(x=>modelT-x.t<=45); } }
  }

  function simulateContinuous(dt){ const simdt = dt*state.speed; runRound(simdt, true); }

  function move(dt){
    for(const p of particles){ const z=zoneForType(p.type), m=15; p.x+=p.vx*dt; p.y+=p.vy*dt; p.angle += p.spin*dt; if(p.x<z.x+m){p.x=z.x+m; p.vx=Math.abs(p.vx)} if(p.x>z.x+z.w-m){p.x=z.x+z.w-m; p.vx=-Math.abs(p.vx)} if(p.y<z.y+m){p.y=z.y+m; p.vy=Math.abs(p.vy)} if(p.y>z.y+z.h-m){p.y=z.y+z.h-m; p.vy=-Math.abs(p.vy)} }
    for(const f of flashes) f.t += dt; flashes = flashes.filter(f=>f.t<f.life);
    for(const tr of transitions) tr.t += dt; transitions = transitions.filter(tr=>tr.t<tr.life);
  }

  function roundRect(c,x,y,w,h,r){ const rr=Math.min(r,w/2,h/2); c.beginPath(); c.moveTo(x+rr,y); c.arcTo(x+w,y,x+w,y+h,rr); c.arcTo(x+w,y+h,x,y+h,rr); c.arcTo(x,y+h,x,y,rr); c.arcTo(x,y,x+w,y,rr); c.closePath(); }
  function circle(x,y,r,col,glow=0){ ctx.save(); if(glow){ctx.shadowColor=col; ctx.shadowBlur=glow;} const g=ctx.createRadialGradient(x-r*.35,y-r*.4,1,x,y,r); g.addColorStop(0,'#fff'); g.addColorStop(.18,col); g.addColorStop(1,col+'dd'); ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill(); ctx.restore(); }
  function drawParticle(p){ if(p.type==='A') circle(p.x,p.y,8.2,COL.a,6); else if(p.type==='B') circle(p.x,p.y,8.2,COL.b,6); else { circle(p.x,p.y,9.2,COL.c,7); ctx.save(); ctx.font='700 10px system-ui'; ctx.fillStyle='#5c4700'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('C',p.x,p.y+.5); ctx.restore(); } }

  function drawTransitions(){
    for(const tr of transitions){ const u = tr.t/tr.life; const x = tr.x0 + (tr.x1-tr.x0)*u; const y = tr.y0 + (tr.y1-tr.y0)*u; ctx.save(); ctx.globalAlpha = 1-u*.25;
      if(tr.dir==='f'){ circle(x,y,9.5,COL.c,8); }
      else { circle(x-8,y-3,7.4,COL.a,6); circle(x+8,y+3,7.4,COL.b,6); }
      ctx.restore();
    }
  }

  function drawWorld(){
    resizeCanvas(world,ctx); const {w,h}=worldSize(); ctx.clearRect(0,0,w,h); ctx.fillStyle='rgba(4,8,18,.45)'; ctx.fillRect(0,0,w,h);
    if(view==='reactor'){
      const b=reactorBox(); const grad=ctx.createLinearGradient(b.x,b.y,b.x+b.w,b.y+b.h); grad.addColorStop(0,'rgba(21,35,61,.78)'); grad.addColorStop(1,'rgba(9,17,32,.92)'); ctx.fillStyle=grad; ctx.strokeStyle='rgba(112,143,190,.38)'; ctx.lineWidth=1.2; roundRect(ctx,b.x,b.y,b.w,b.h,18); ctx.fill(); ctx.stroke(); ctx.strokeStyle='rgba(129,166,218,.13)'; ctx.lineWidth=6; roundRect(ctx,b.x+4,b.y+4,b.w-8,b.h-8,15); ctx.stroke();
    } else {
      const s=splitBoxes(); const bg=(box,title,subtitle,left)=>{ const grad=ctx.createLinearGradient(box.x,box.y,box.x+box.w,box.y+box.h); grad.addColorStop(0,left?'rgba(16,42,71,.86)':'rgba(72,53,8,.74)'); grad.addColorStop(1,left?'rgba(8,19,36,.95)':'rgba(38,29,8,.94)'); ctx.fillStyle=grad; ctx.strokeStyle='rgba(112,143,190,.38)'; ctx.lineWidth=1.2; roundRect(ctx,box.x,box.y,box.w,box.h,18); ctx.fill(); ctx.stroke(); ctx.save(); ctx.fillStyle='rgba(238,243,255,.9)'; ctx.font='800 13px system-ui'; ctx.fillText(title,box.x+14,box.y+22); ctx.fillStyle='rgba(152,168,197,.95)'; ctx.font='600 11px system-ui'; ctx.fillText(subtitle,box.x+14,box.y+39); ctx.restore();};
      bg(s.left,'Edukte','A und B links',true); bg(s.right,'Produkte','C rechts',false);
      ctx.save(); ctx.strokeStyle='rgba(141,158,186,.3)'; ctx.setLineDash([7,7]); ctx.beginPath(); ctx.moveTo(s.dividerX,s.all.y+12); ctx.lineTo(s.dividerX,s.all.y+s.all.h-12); ctx.stroke(); ctx.restore();
      ctx.save(); ctx.font='700 12px system-ui'; ctx.fillStyle='rgba(227,233,247,.95)'; ctx.textAlign='center'; ctx.fillText('⇄', s.dividerX, s.all.y+s.all.h/2+4); ctx.restore();
    }
    for(const p of particles) drawParticle(p);
    drawTransitions();
    for(const f of flashes){ const u=f.t/f.life, r=10+u*36; ctx.save(); ctx.strokeStyle=f.col; ctx.globalAlpha=(1-u)*.68; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(f.x,f.y,r,0,Math.PI*2); ctx.stroke(); ctx.restore(); }
  }

  function drawGraph(){
    resizeCanvas(graph,gctx); const r=graph.getBoundingClientRect(), w=r.width, h=r.height; gctx.clearRect(0,0,w,h); const pad={l:34,r:12,t:14,b:26}, iw=w-pad.l-pad.r, ih=h-pad.t-pad.b;
    let maxN=10; for(const p of history) maxN=Math.max(maxN,p.A,p.B,p.C); maxN=Math.ceil(maxN/5)*5;
    gctx.save(); gctx.strokeStyle='rgba(93,117,156,.18)'; gctx.lineWidth=1; gctx.fillStyle='rgba(151,169,199,.75)'; gctx.font='10px system-ui';
    for(let i=0;i<=4;i++){ const y=pad.t+ih*i/4; gctx.beginPath(); gctx.moveTo(pad.l,y); gctx.lineTo(w-pad.r,y); gctx.stroke(); const val=Math.round(maxN*(1-i/4)); gctx.fillText(val,6,y+3); }
    const t0=Math.max(0,modelT-45), t1=Math.max(t0+1,modelT); gctx.fillText('−45 s',pad.l,h-8); gctx.fillText('jetzt',w-38,h-8);
    const drawLine=(key,col)=>{ if(history.length<2) return; gctx.beginPath(); history.forEach((p,i)=>{ const x=pad.l+iw*(p.t-t0)/(t1-t0); const y=pad.t+ih*(1-p[key]/maxN); if(i===0) gctx.moveTo(x,y); else gctx.lineTo(x,y); }); gctx.strokeStyle=col; gctx.lineWidth=2.2; gctx.lineJoin='round'; gctx.lineCap='round'; gctx.shadowColor=col; gctx.shadowBlur=6; gctx.stroke(); gctx.shadowBlur=0; };
    drawLine('A',COL.a); drawLine('B',COL.b); drawLine('C',COL.c); gctx.restore();
  }

  function syncControls(){ $('#kf').value=state.kf; $('#kr').value=state.kr; $('#vol').value=state.V; $('#speed').value=state.speed; $('#kfOut').textContent=fmt(state.kf,2); $('#krOut').textContent=fmt(state.kr,2); $('#volOut').textContent=fmt(state.V,2); $('#speedOut').textContent=fmt(state.speed,2)+'×'; }
  function disturb(msg){ eqScore=0; toast(msg); }
  function add(type,n){ for(let i=0;i<n;i++) particles.push(makeParticle(type)); }
  function removeType(type,n){ const candidates=shuffle(particles.filter(p=>p.type===type)).slice(0,n); const s=new Set(candidates); particles=particles.filter(p=>!s.has(p)); }
  function setView(v){ view=v; $$('#viewButtons button').forEach(b=>b.classList.toggle('active', b.dataset.view===v)); particles.forEach(insideZone); $('#viewTitle').textContent = v==='reactor' ? 'Teilchenraum' : 'Zwei-Seiten-Ansicht'; $('#viewSub').textContent = v==='reactor' ? 'alle Teilchen in einem gemeinsamen Reaktionsraum' : 'Edukte links, Produkte rechts'; }
  function setMode(m){ simMode=m; $$('#modeButtons button').forEach(b=>b.classList.toggle('active', b.dataset.mode===m)); if(m==='step'){ paused=true; $('#playBtn').textContent='▶ Weiter'; $('#modeText').textContent='Schrittweise'; $('#roundInfo').textContent='"1 Runde" löst eine einzelne Modellrunde aus'; } else { $('#modeText').textContent='Fließend'; $('#roundInfo').textContent='Reaktion läuft kontinuierlich und kann pausiert werden'; }
  }

  function updateUI(){
    const n=counts(), q=(n.A&&n.B)?(n.C*state.V/(n.A*n.B)):Infinity, K=state.kf/state.kr; $('#nA').textContent=n.A; $('#nB').textContent=n.B; $('#nC').textContent=n.C; $('#volStat').textContent=fmt(state.V,2); $('#qStat').textContent=Number.isFinite(q)?fmt(q,2):'∞'; $('#kStat').textContent=fmt(K,2);
    $('#rfTxt').textContent=fmt(lastRates.f,2); $('#rrTxt').textContent=fmt(lastRates.r,2); $('#stepTxt').textContent = `${lastStep.f} / ${lastStep.r}`;
    const mx=Math.max(.2,lastRates.f,lastRates.r); $('#fbar').style.width=(100*lastRates.f/mx)+'%'; $('#rbar').style.width=(100*lastRates.r/mx)+'%';
    const sum=lastRates.f+lastRates.r, diff=Math.abs(lastRates.f-lastRates.r), close=sum>.35 && diff/Math.max(.25,sum/2)<.22 && modelT>5; eqScore=clamp(eqScore+(close ? .04 : -.025),0,1);
    const light=$('#eqLight'), txt=$('#eqText'); if(paused && simMode!=='step'){ light.className='eq-light off'; txt.textContent='Simulation pausiert'; } else if(eqScore>.72){ light.className='eq-light good'; txt.textContent='Dynamisches Gleichgewicht'; } else { light.className='eq-light'; txt.textContent='Gleichgewicht stellt sich ein'; }
  }

  $('#playBtn').onclick=()=>{ if(simMode==='step') setMode('continuous'); paused=!paused; $('#playBtn').textContent=paused?'▶ Weiter':'⏸ Pause'; if(!paused) $('#modeText').textContent='Fließend'; };
  $('#stepBtn').onclick=()=>{ if(simMode!=='step') setMode('step'); const stepDt=.9; runRound(stepDt,true); toast(`Runde: ${lastStep.f} hin, ${lastStep.r} zurück`); updateUI(); drawWorld(); drawGraph(); };
  $('#resetBtn').onclick=()=>{ state.kf=init.kf; state.kr=init.kr; state.V=init.V; state.speed=init.speed; modelT=0; graphClock=0; history=[]; lastRates={f:0,r:0}; lastStep={f:0,r:0}; eqScore=0; flashes=[]; transitions=[]; setCounts(init.A,init.B,init.C); syncControls(); particles.forEach(insideZone); toast('Ausgangszustand wiederhergestellt'); };
  $('#fullBtn').onclick=async()=>{ try{ if(!document.fullscreenElement) await document.documentElement.requestFullscreen(); else await document.exitFullscreen(); } catch(e){ toast('Vollbild wird hier nicht unterstützt'); } };
  $('#clearGraph').onclick=()=>{ history=[]; toast('Graph gelöscht'); };

  $('#kf').addEventListener('input',e=>{ state.kf=+e.target.value; syncControls(); disturb('k_hin verändert'); });
  $('#kr').addEventListener('input',e=>{ state.kr=+e.target.value; syncControls(); disturb('k_rück verändert'); });
  $('#vol').addEventListener('input',e=>{ state.V=+e.target.value; particles.forEach(insideZone); syncControls(); disturb('Volumen verändert'); });
  $('#speed').addEventListener('input',e=>{ state.speed=+e.target.value; syncControls(); });

  $('#addA').onclick=()=>{ add('A',4); disturb('4 A-Teilchen zugegeben'); };
  $('#addB').onclick=()=>{ add('B',4); disturb('4 B-Teilchen zugegeben'); };
  $('#removeC').onclick=()=>{ removeType('C',3); disturb('Bis zu 3 C-Teilchen entzogen'); };
  $('#compress').onclick=()=>{ state.V=clamp(state.V*.5,.6,1.6); particles.forEach(insideZone); syncControls(); disturb('System komprimiert'); };

  $$('#viewButtons button').forEach(b=>b.onclick=()=>setView(b.dataset.view));
  $$('#modeButtons button').forEach(b=>b.onclick=()=>{ setMode(b.dataset.mode); if(b.dataset.mode==='step'){ paused=true; $('#playBtn').textContent='▶ Weiter'; } else { paused=false; $('#playBtn').textContent='⏸ Pause'; } });
  $$('[data-preset]').forEach(b=>b.onclick=()=>{ const p=b.dataset.preset; if(p==='balanced'){ state.kf=.06; state.kr=.48; state.V=1; setCounts(12,12,4); } if(p==='product'){ state.kf=.22; state.kr=.10; state.V=1; setCounts(14,14,2); } if(p==='reactant'){ state.kf=.03; state.kr=.52; state.V=1; setCounts(9,9,7); } modelT=0; graphClock=0; history=[]; lastRates={f:0,r:0}; lastStep={f:0,r:0}; eqScore=0; syncControls(); particles.forEach(insideZone); toast('Preset geladen'); });

  function loop(now){ const dt=Math.min(.05,(now-last)/1000); last=now; if(!paused && simMode==='continuous') simulateContinuous(dt); move(dt); drawWorld(); drawGraph(); updateUI(); requestAnimationFrame(loop); }
  window.addEventListener('resize',()=>{ DPR=Math.min(devicePixelRatio||1,2); particles.forEach(insideZone); });

  setCounts(init.A,init.B,init.C); syncControls(); setView('reactor'); setMode('continuous'); history.push({t:0,...counts()}); requestAnimationFrame(loop);
})();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}