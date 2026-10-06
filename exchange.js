/* ===== Unterrichts-Tauschmodell A ⇌ B ===== */
(()=>{
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const tabs = $$('[data-model-tab]');
  const chemPanel = $('#chemModel');
  const exchangePanel = $('#exchangeModel');
  const chemActions = $('#chemHeaderActions');
  const exchangeActions = $('#exchangeHeaderActions');
  const headerSub = document.querySelector('header .sub');
  if(!tabs.length || !exchangePanel) return;

  const ew = $('#exchangeWorld'), ectx = ew.getContext('2d');
  const eg = $('#exchangeGraph'), egctx = eg.getContext('2d');
  const css = getComputedStyle(document.documentElement);
  const COL = {
    A: css.getPropertyValue('--a').trim(),
    B: css.getPropertyValue('--c').trim(),
    text: css.getPropertyValue('--text').trim(),
    muted: css.getPropertyValue('--muted').trim(),
    good: css.getPropertyValue('--good').trim(),
    warn: css.getPropertyValue('--warn').trim()
  };
  let DPR = Math.min(devicePixelRatio || 1, 2);
  let exchangeVisible = false;
  let initialized = false;
  let lastFrame = performance.now();
  let moves = [];

  const ex = {
    A:12, B:24, startA:12, startB:24,
    rule:'fixed', fFixed:6, rFixed:6, fPct:20, rPct:10,
    interval:1.5, round:0, running:false, acc:0, graphStartRound:0,
    history:[{round:0,A:12,B:24,f:null,r:null,beforeA:12,beforeB:24}]
  };

  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const num=(id,fallback=0)=>{ const v=Number($(id)?.value); return Number.isFinite(v)?v:fallback; };
  const fmt=(x,d=1)=>Number(x).toLocaleString('de-DE',{minimumFractionDigits:d,maximumFractionDigits:d});
  function toast(txt){ const el=$('#toast'); if(!el) return; el.textContent=txt; el.classList.add('show'); clearTimeout(toast.t); toast.t=setTimeout(()=>el.classList.remove('show'),1700); }
  function resizeCanvas(c,ctx){ const r=c.getBoundingClientRect(); const w=Math.max(10,Math.round(r.width*DPR)),h=Math.max(10,Math.round(r.height*DPR)); if(c.width!==w||c.height!==h){c.width=w;c.height=h;ctx.setTransform(DPR,0,0,DPR,0,0);} }
  function roundRect(ctx,x,y,w,h,r){ const rr=Math.min(r,w/2,h/2); ctx.beginPath();ctx.moveTo(x+rr,y);ctx.arcTo(x+w,y,x+w,y+h,rr);ctx.arcTo(x+w,y+h,x,y+h,rr);ctx.arcTo(x,y+h,x,y,rr);ctx.arcTo(x,y,x+w,y,rr);ctx.closePath(); }
  function circle(ctx,x,y,r,col,alpha=1){ ctx.save();ctx.globalAlpha=alpha;ctx.shadowColor=col;ctx.shadowBlur=5;ctx.fillStyle=col;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();ctx.restore(); }

  function boxes(){ const r=ew.getBoundingClientRect(), pad=Math.max(30,r.width*.045), gap=Math.max(50,r.width*.09), top=62, bottom=34; const w=(r.width-pad*2-gap)/2, h=Math.max(190,r.height-top-bottom); return {left:{x:pad,y:top,w,h},right:{x:pad+w+gap,y:top,w,h},mid:pad+w+gap/2}; }
  function dotPositions(box,count){
    if(count<=0) return [];
    const insetX=22, insetTop=66, insetBottom=18;
    const usableW=Math.max(30,box.w-insetX*2), usableH=Math.max(30,box.h-insetTop-insetBottom);
    const cols=Math.max(2,Math.ceil(Math.sqrt(count*usableW/Math.max(1,usableH))));
    const rows=Math.ceil(count/cols), dx=cols===1?0:usableW/(cols-1), dy=rows===1?0:usableH/(rows-1);
    const rad=clamp(Math.min(dx||14,dy||14)*.27,3.4,7.4);
    const out=[];
    for(let i=0;i<count;i++){ const row=Math.floor(i/cols), col=i%cols; out.push({x:box.x+insetX+(cols===1?usableW/2:col*dx),y:box.y+insetTop+(rows===1?usableH/2:row*dy),r:rad}); }
    return out;
  }

  function readRuleInputs(){
    ex.fFixed=clamp(Math.round(num('#exchangeForwardFixed',ex.fFixed)),0,120);
    ex.rFixed=clamp(Math.round(num('#exchangeReverseFixed',ex.rFixed)),0,120);
    ex.fPct=clamp(num('#exchangeForwardPct',ex.fPct),0,100);
    ex.rPct=clamp(num('#exchangeReversePct',ex.rPct),0,100);
    ex.interval=clamp(num('#exchangeInterval',ex.interval),.4,10);
  }
  function computeTransfer(A=ex.A,B=ex.B){
    readRuleInputs();
    const requestedF=ex.rule==='fixed'?ex.fFixed:Math.round(A*ex.fPct/100);
    const requestedR=ex.rule==='fixed'?ex.rFixed:Math.round(B*ex.rPct/100);
    const feasible=ex.rule!=='fixed' || (requestedF<=A && requestedR<=B);
    return {
      requestedF, requestedR, feasible,
      f:Math.min(A,Math.max(0,requestedF)),
      r:Math.min(B,Math.max(0,requestedR))
    };
  }
  function targetText(){
    const N=ex.A+ex.B;
    if(ex.rule==='fixed'){
      if(ex.fFixed===0&&ex.rFixed===0) return {main:'kein Austausch',mini:'Ohne Austausch gibt es keine Dynamik.'};
      if(ex.fFixed===ex.rFixed) return {main:'konstante Bestände bei gleichem Austausch',mini:`Solange A und B jeweils mindestens ${ex.fFixed} Teilchen enthalten, bleibt der Bestand trotz Tausch konstant.`};
      const delta=ex.rFixed-ex.fFixed;
      return {main:'keine innere Gleichgewichtslage',mini:`A verändert sich netto um ${delta>0?'+':''}${delta} Teilchen pro Runde, solange beide Seiten die feste Tauschmenge bereitstellen können.`};
    }
    const p=ex.fPct/100,q=ex.rPct/100;
    if(p===0&&q===0) return {main:'kein Austausch',mini:'Beide Prozentsätze sind 0 %.'};
    if(p===0) return {main:'Grenzfall: A wird angereichert',mini:'Nur B → A findet statt; langfristig liegt alles auf der A-Seite.'};
    if(q===0) return {main:'Grenzfall: B wird angereichert',mini:'Nur A → B findet statt; langfristig liegt alles auf der B-Seite.'};
    const At=N*q/(p+q), Bt=N*p/(p+q);
    return {main:`≈ A ${fmt(At,1)} · B ${fmt(Bt,1)}`,mini:`Gleichgewicht, wenn ${fmt(ex.fPct,0)} % von A ungefähr so viele Teilchen sind wie ${fmt(ex.rPct,0)} % von B (A:B = ${fmt(q/p,2)}:1).`};
  }

  function syncRuleUI(){
    readRuleInputs();
    $('#exchangeFixedMode').classList.toggle('active',ex.rule==='fixed');
    $('#exchangePercentMode').classList.toggle('active',ex.rule==='percent');
    $$('.exchange-fixed-field').forEach(el=>el.hidden=ex.rule!=='fixed');
    $$('.exchange-percent-field').forEach(el=>el.hidden=ex.rule!=='percent');
    const tr=computeTransfer();
    $('#exchangeForwardNow').textContent=ex.rule==='fixed'?tr.requestedF:tr.f;
    $('#exchangeReverseNow').textContent=ex.rule==='fixed'?tr.requestedR:tr.r;
    $('#exchangeForwardLabel').textContent=ex.rule==='fixed'?'A → B pro Runde':`${fmt(ex.fPct,0)} % von A → B (aktuell)`;
    $('#exchangeReverseLabel').textContent=ex.rule==='fixed'?'B → A pro Runde':`${fmt(ex.rPct,0)} % von B → A (aktuell)`;
    $('#exchangeModeBadge').textContent=ex.rule==='fixed'?'Fester Austausch':'Prozentualer Austausch';
    $('#exchangeRuleBadge').textContent=ex.rule==='fixed'?`${ex.fFixed} A → B · ${ex.rFixed} B → A`:`${fmt(ex.fPct,0)} % A → B · ${fmt(ex.rPct,0)} % B → A`;
    const t=targetText(); $('#exchangeTargetStat').textContent=t.main; $('#exchangeTargetMini').textContent=t.mini;
  }

  function updateStats(last=null){
    const N=ex.A+ex.B, pa=N?100*ex.A/N:0,pb=N?100*ex.B/N:0;
    $('#exchangeAStat').textContent=ex.A; $('#exchangeBStat').textContent=ex.B; $('#exchangeTotalStat').textContent=N;
    $('#exchangeAPct').textContent=fmt(pa,1)+' %'; $('#exchangeBPct').textContent=fmt(pb,1)+' %';
    $('#exchangeRound').textContent=ex.round;
    const net=last?last.r-last.f:0; $('#exchangeNetStat').textContent=(net>0?'+':'')+net;
    $('#exchangeBalanceLabel').textContent=last?`${last.f} hin · ${last.r} zurück · netto A ${net>0?'+':''}${net}`:'noch keine Runde';
    const tr=computeTransfer(); const equal=tr.f===tr.r && (tr.f>0||tr.r>0);
    const light=$('#exchangeEqLight'),txt=$('#exchangeEqText');
    if(!tr.feasible){light.className='eq-light off';txt.textContent='Tauschregel nicht ausführbar';}
    else if(equal){light.className='eq-light good';txt.textContent='Bestände konstant trotz Tausch';}
    else if(tr.f===0&&tr.r===0){light.className='eq-light off';txt.textContent='kein Austausch';}
    else{light.className='eq-light';txt.textContent=tr.f>tr.r?'A → B überwiegt':'B → A überwiegt';}
    syncRuleUI();
  }

  function makeMoves(f,r){
    const b=boxes(), span=Math.max(f,r,1);
    for(let i=0;i<f;i++) moves.push({dir:'f',t:0,life:.78,y:b.left.y+78+((i+.5)/span)*(b.left.h-105),phase:i*.12});
    for(let i=0;i<r;i++) moves.push({dir:'r',t:0,life:.78,y:b.right.y+78+((i+.5)/span)*(b.right.h-105),phase:i*.12});
  }

  function doRound(){
    const beforeA=ex.A,beforeB=ex.B,tr=computeTransfer(beforeA,beforeB);
    if(!tr.feasible){
      ex.running=false; ex.acc=0; $('#exchangePlayBtn').textContent='▶ Auto';
      const reasons=[];
      if(tr.requestedF>beforeA) reasons.push(`A müsste ${tr.requestedF} abgeben, vorhanden sind ${beforeA}`);
      if(tr.requestedR>beforeB) reasons.push(`B müsste ${tr.requestedR} abgeben, vorhanden sind ${beforeB}`);
      $('#exchangeRoundSummary').textContent=`Runde nicht ausführbar: ${reasons.join(' · ')}`;
      updateStats(null); toast('Feste Tauschregel kann mit diesem Bestand nicht ausgeführt werden.');
      return false;
    }
    const {f,r}=tr;
    ex.A=beforeA-f+r; ex.B=beforeB-r+f; ex.round++;
    const row={round:ex.round,beforeA,beforeB,f,r,A:ex.A,B:ex.B}; ex.history.push(row);
    makeMoves(f,r); updateStats(row); renderTable();
    $('#exchangeRoundSummary').textContent=`Runde ${ex.round}: A ${beforeA} − ${f} + ${r} = ${ex.A} · B ${beforeB} − ${r} + ${f} = ${ex.B}`;
    return true;
  }

  function renderTable(){
    const rows=ex.history.slice(-10).map((h,i,arr)=>{
      if(h.round===0) return `<tr${i===arr.length-1?' class="latest"':''}><td>0</td><td>${h.A}</td><td>–</td><td>–</td><td>${h.A}</td><td>${h.B}</td></tr>`;
      return `<tr${i===arr.length-1?' class="latest"':''}><td>${h.round}</td><td>${h.beforeA}</td><td>${h.f}</td><td>${h.r}</td><td>${h.A}</td><td>${h.B}</td></tr>`;
    }).join('');
    $('#exchangeTableBody').innerHTML=rows;
  }

  function resetExchange(useInputs=true){
    if(useInputs){ ex.startA=clamp(Math.round(num('#exchangeStartA',12)),0,120); ex.startB=clamp(Math.round(num('#exchangeStartB',24)),0,120); }
    ex.A=ex.startA; ex.B=ex.startB; ex.round=0; ex.running=false; ex.acc=0; ex.graphStartRound=0; moves=[];
    ex.history=[{round:0,A:ex.A,B:ex.B,f:null,r:null,beforeA:ex.A,beforeB:ex.B}];
    $('#exchangePlayBtn').textContent='▶ Auto';
    $('#exchangeRoundSummary').textContent=`Runde 0 · A = ${ex.A} · B = ${ex.B}`;
    updateStats(null); renderTable();
  }

  function drawExchange(){
    if(!exchangeVisible) return;
    resizeCanvas(ew,ectx); const r=ew.getBoundingClientRect(); ectx.clearRect(0,0,r.width,r.height); ectx.fillStyle='rgba(4,8,18,.46)'; ectx.fillRect(0,0,r.width,r.height);
    const b=boxes();
    const drawBox=(box,label,count,left)=>{ const grad=ectx.createLinearGradient(box.x,box.y,box.x+box.w,box.y+box.h); grad.addColorStop(0,left?'rgba(16,42,71,.88)':'rgba(78,59,8,.78)');grad.addColorStop(1,left?'rgba(8,19,36,.96)':'rgba(39,30,7,.96)');ectx.fillStyle=grad;ectx.strokeStyle='rgba(112,143,190,.42)';ectx.lineWidth=1.3;roundRect(ectx,box.x,box.y,box.w,box.h,18);ectx.fill();ectx.stroke();ectx.fillStyle=COL.text;ectx.font='850 18px system-ui';ectx.fillText(`${label} · ${count} Teilchen`,box.x+16,box.y+28);ectx.fillStyle=COL.muted;ectx.font='650 11px system-ui';ectx.fillText(left?'Ausgangsseite A':'Ausgangsseite B',box.x+16,box.y+46); };
    drawBox(b.left,'A',ex.A,true); drawBox(b.right,'B',ex.B,false);
    dotPositions(b.left,ex.A).forEach(p=>circle(ectx,p.x,p.y,p.r,COL.A,.96));
    dotPositions(b.right,ex.B).forEach(p=>circle(ectx,p.x,p.y,p.r,COL.B,.96));
    ectx.save();ectx.textAlign='center';ectx.fillStyle='rgba(238,243,255,.95)';ectx.font='900 28px system-ui';ectx.fillText('⇄',b.mid,b.left.y+b.left.h/2);ectx.font='700 11px system-ui';ectx.fillStyle=COL.muted;ectx.fillText('gleichzeitig',b.mid,b.left.y+b.left.h/2+25);ectx.restore();
    moves.forEach(m=>{ const u=clamp(m.t/m.life,0,1), ease=u<.5?2*u*u:1-Math.pow(-2*u+2,2)/2; const from=m.dir==='f'?b.left.x+b.left.w-16:b.right.x+16, to=m.dir==='f'?b.right.x+16:b.left.x+b.left.w-16; const x=from+(to-from)*ease; const col=m.dir==='f'?(u<.5?COL.A:COL.B):(u<.5?COL.B:COL.A); circle(ectx,x,m.y,5.8,col,1); });
  }

  function drawExchangeGraph(){
    if(!exchangeVisible) return;
    resizeCanvas(eg,egctx);const r=eg.getBoundingClientRect(),w=r.width,h=r.height,p={l:35,r:12,t:14,b:27},iw=w-p.l-p.r,ih=h-p.t-p.b;
    egctx.clearRect(0,0,w,h);
    let hist=ex.history.filter(x=>x.round>=ex.graphStartRound); if(!hist.length) hist=[ex.history[ex.history.length-1]];
    let maxN=Math.max(10,...hist.map(x=>Math.max(x.A??0,x.B??0)));maxN=Math.ceil(maxN/5)*5;
    const minR=hist[0]?.round||0,maxR=hist[hist.length-1]?.round||minR,spanR=Math.max(1,maxR-minR);
    egctx.save();egctx.strokeStyle='rgba(93,117,156,.18)';egctx.fillStyle='rgba(151,169,199,.75)';egctx.font='10px system-ui';
    for(let i=0;i<=4;i++){const y=p.t+ih*i/4;egctx.beginPath();egctx.moveTo(p.l,y);egctx.lineTo(w-p.r,y);egctx.stroke();egctx.fillText(Math.round(maxN*(1-i/4)),6,y+3);}
    egctx.fillText('R '+minR,p.l,h-8);egctx.fillText('R '+maxR,w-34,h-8);
    const line=(key,col)=>{if(hist.length<2)return;egctx.beginPath();hist.forEach((v,i)=>{const x=p.l+iw*((v.round-minR)/spanR),y=p.t+ih*(1-v[key]/maxN);i?egctx.lineTo(x,y):egctx.moveTo(x,y);});egctx.strokeStyle=col;egctx.lineWidth=2.4;egctx.lineJoin='round';egctx.lineCap='round';egctx.shadowColor=col;egctx.shadowBlur=5;egctx.stroke();egctx.shadowBlur=0;};
    line('A',COL.A);line('B',COL.B);egctx.restore();
  }

  function setModel(which){
    const exchange=which==='exchange'; exchangeVisible=exchange;
    chemPanel.hidden=exchange; exchangePanel.hidden=!exchange; chemActions.hidden=exchange; exchangeActions.hidden=!exchange;
    tabs.forEach(b=>b.classList.toggle('active',b.dataset.modelTab===which));
    headerSub.textContent=exchange?'Tauschmodell für den Unterricht: feste Teilchenzahlen oder prozentualer Austausch pro Runde.':'Beobachte, wie sich Hin- und Rückreaktion gleichzeitig einstellen – und störe das System gezielt.';
    if(exchange){ if(!initialized){ initialized=true; resetExchange(false); } requestAnimationFrame(()=>{drawExchange();drawExchangeGraph();}); }
    else { ex.running=false; $('#exchangePlayBtn').textContent='▶ Auto'; }
  }

  tabs.forEach(b=>b.addEventListener('click',()=>setModel(b.dataset.modelTab)));
  $('#exchangeFixedMode').onclick=()=>{ex.rule='fixed';syncRuleUI();updateStats(null);};
  $('#exchangePercentMode').onclick=()=>{ex.rule='percent';syncRuleUI();updateStats(null);};
  ['#exchangeForwardFixed','#exchangeReverseFixed','#exchangeForwardPct','#exchangeReversePct','#exchangeInterval'].forEach(id=>$(id).addEventListener('input',()=>{readRuleInputs();syncRuleUI();updateStats(null);}));
  $('#exchangeApplyStart').onclick=()=>resetExchange(true);
  $('#exchangeResetBtn').onclick=()=>resetExchange(true);
  $('#exchangeStepBtn').onclick=()=>{ex.running=false;$('#exchangePlayBtn').textContent='▶ Auto';doRound();};
  $('#exchangePlayBtn').onclick=()=>{ex.running=!ex.running;ex.acc=0;$('#exchangePlayBtn').textContent=ex.running?'⏸ Pause':'▶ Auto';};
  $('#exchangeClearGraph').onclick=()=>{ex.graphStartRound=ex.round;drawExchangeGraph();toast('Graph ab aktueller Runde neu gestartet.');};
  $('#exchangeFullBtn').onclick=async()=>{try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen();else await document.exitFullscreen();}catch(e){}};
  $('#exchangeSlidePreset').onclick=()=>{ $('#exchangeStartA').value=12;$('#exchangeStartB').value=24;$('#exchangeForwardFixed').value=6;$('#exchangeReverseFixed').value=6;ex.rule='fixed';syncRuleUI();resetExchange(true);};
  $('#exchangePercentPreset').onclick=()=>{ $('#exchangeStartA').value=12;$('#exchangeStartB').value=24;$('#exchangeForwardPct').value=20;$('#exchangeReversePct').value=10;ex.rule='percent';syncRuleUI();resetExchange(true);};

  function frame(now){ const dt=Math.min(.08,(now-lastFrame)/1000);lastFrame=now; if(exchangeVisible){ if(ex.running){ex.acc+=dt;if(ex.acc>=ex.interval){ex.acc%=ex.interval;doRound();}} moves.forEach(m=>m.t+=dt);moves=moves.filter(m=>m.t<m.life);drawExchange();drawExchangeGraph(); } requestAnimationFrame(frame); }
  window.addEventListener('resize',()=>{DPR=Math.min(devicePixelRatio||1,2);});
  setModel('chem');
  requestAnimationFrame(frame);
})();