"use strict";

const $ = (id) => document.getElementById(id);
const canvas = $("canvas");
const ctx = canvas.getContext("2d");
const sprites = ["pipo", "lumi", "bumbo", "tiki", "mimi"].map(name => loadImage(`assets/images/mibi_${name}.png`));
const animationSheets = ["pipo", "lumi", "bumbo", "tiki", "mimi"].map(name => loadImage(`assets/images/animation/${name}-flight-sheet.png`));
const frameBounds = [
  [[71,71,500,451],[66,46,481,465],[17,127,426,425],[74,33,500,412],[58,27,500,412],[34,43,433,424]],
  [[66,52,500,471],[32,55,500,489],[18,92,446,427],[102,25,444,396],[61,31,500,412],[28,18,428,438]],
  [[30,132,512,430],[0,38,512,430],[0,147,478,384],[10,64,509,395],[22,35,512,331],[0,23,478,338]],
  [[68,44,486,469],[55,42,429,500],[29,91,435,398],[96,25,462,360],[46,12,474,383],[42,27,423,383]],
  [[37,90,512,468],[0,56,497,462],[17,144,446,461],[58,57,488,355],[32,9,479,371],[19,5,449,379]]
];
const backgrounds = Array.from({length: 10}, (_, i) => loadImage(`assets/images/phase_${String(i + 1).padStart(2, "0")}_v2.png`));
const introSpacecraft=loadImage("assets/images/intro_spacecraft_v2.png");
const music = new Audio();
const introSound = new Audio("assets/audio/intro_arrival.wav");
const hitSound = new Audio("assets/audio/touch.mp3");
const gameOverSound = new Audio("assets/audio/game_over.mp3");
music.loop = true;
music.preload = "auto";
music.volume = .55;
hitSound.volume = .75;
gameOverSound.volume = .75;

const state = {
  running: false, score: 0, lives: 7, misses: 0, phase: 1, phaseStarted: 0,
  mibis: [], particles: [], ambience: [], dangerZones: [], pointer: {x: -9999, y: -9999, vx: 0, vy: 0, movedAt: 0, active: false},
  last: 0, width: innerWidth, height: innerHeight, evolutionTimer: 0, muted: false,
  introActive:false,introStarted:0,introMibis:[]
};

function loadImage(src) { const img = new Image(); img.src = src; return img; }
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const scoreText = n => String(n).padStart(8, "0");

function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  state.width = innerWidth; state.height = innerHeight;
  canvas.width = Math.round(innerWidth * dpr); canvas.height = Math.round(innerHeight * dpr);
  canvas.style.width = `${innerWidth}px`; canvas.style.height = `${innerHeight}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function makeMibi(index = Math.floor(Math.random() * 5)) {
  const size = clamp(Math.min(state.width, state.height) * rand(.09, .13), 68, 112);
  return {
    sprite: index, x: rand(size, state.width - size), y: rand(size+75,state.height-size), size,
    vx: 0, vy: 0, phase: rand(0, 10), facing: Math.random()<.5?-1:1,
    blinkAt: performance.now() + rand(800, 3500), blink: 0, look: rand(-1, 1), gazeY: rand(-.3,.3),
    scaredUntil: 0, dodgingUntil: 0, alertedUntil: 0, observeUntil: 0, fleeUntil: 0, dangerX: 0, dangerY: 0,
    noticedAt: 0, happyUntil: 0, reaction: 0, travel: rand(0,200),
    wings: true,
    shield: state.phase >= 2 && Math.random() < Math.min(.68,.24+state.phase*.035),
    shieldExpires: state.phase>=2?performance.now()+10000:0,
    protector: state.phase >= 3 && Math.random() < .45,
    canTeleport: state.phase >= 4 && Math.random() < Math.min(.72,.22+state.phase*.035),
    teleportReadyAt: 0, protectedBy: null,
    tail: state.phase >= 2 && Math.random() < .65, antenna: state.phase >= 3, alive: true
  };
}

function resetAmbience() {
  state.ambience = Array.from({length: 9}, () => ({
    x: rand(0, state.width), y: rand(65, Math.max(90,state.height*.36)), z: rand(.45, 1), phase: rand(0, 7), speed:rand(.12,.32)
  }));
}

function depthScale(){return 1;}
function visualCenterY(m){return m.y;}

function startGame() {
  $("launcher").classList.add("hidden"); $("game").classList.remove("hidden");
  if($("scoreDialog").open)$("scoreDialog").close();$("saveScore").disabled=false;
  resize();Object.assign(state,{running:false,introActive:true,introStarted:performance.now(),score:0,lives:7,misses:0,phase:1});
  state.introMibis=Array.from({length:5},(_,i)=>({...makeMibi(i),x:state.width*.5,y:state.height*.59,size:clamp(Math.min(state.width,state.height)*.075,52,82),shield:false,protector:false,canTeleport:false}));
  $("game").classList.add("intro-playing");introSound.muted=state.muted;introSound.currentTime=0;introSound.play().catch(()=>{});requestAnimationFrame(introLoop);
}

function beginActualGame(){
  state.introActive=false;$("game").classList.remove("intro-playing");
  Object.assign(state,{running:true,phaseStarted:performance.now(),last:performance.now()});
  state.mibis=Array.from({length:6},(_,i)=>makeMibi(i%5));state.particles=[];state.dangerZones=[];resetAmbience();
  updateHud();playPhaseMusic();requestAnimationFrame(loop);
}

function introLoop(now){if(!state.introActive)return;drawIntro(now);if(now-state.introStarted>=9000)beginActualGame();else requestAnimationFrame(introLoop);}

function drawIntro(now){
  const t=now-state.introStarted,p=clamp(t/9000,0,1),bg=backgrounds[0];ctx.fillStyle="#071326";ctx.fillRect(0,0,state.width,state.height);
  if(bg.complete){const scale=Math.max(state.width/bg.width,state.height/bg.height),w=bg.width*scale,h=bg.height*scale;ctx.drawImage(bg,(state.width-w)/2,(state.height-h)/2,w,h);ctx.fillStyle="rgba(4,11,23,.18)";ctx.fillRect(0,0,state.width,state.height);}
  const shipW=clamp(state.width*.43,320,650),shipRatio=introSpacecraft.naturalWidth?introSpacecraft.naturalHeight/introSpacecraft.naturalWidth:1.324,shipH=shipW*shipRatio;
  const landing=1-Math.pow(1-clamp(t/3300,0,1),3),shipX=state.width*.5,landY=state.height*.63,shipY=-shipH*.42+(landY+shipH*.42)*landing;
  const thrust=1-clamp((t-2500)/900,0,1);ctx.save();ctx.globalCompositeOperation="screen";const beam=ctx.createLinearGradient(0,shipY+shipH*.29,0,shipY+shipH*.78);beam.addColorStop(0,`rgba(105,239,255,${.5*thrust})`);beam.addColorStop(1,"rgba(90,210,255,0)");ctx.fillStyle=beam;ctx.beginPath();ctx.moveTo(shipX-shipW*.18,shipY+shipH*.22);ctx.lineTo(shipX+shipW*.18,shipY+shipH*.22);ctx.lineTo(shipX+shipW*.3,shipY+shipH*.78);ctx.lineTo(shipX-shipW*.3,shipY+shipH*.78);ctx.fill();ctx.restore();
  if(t>2400&&t<3900){ctx.save();ctx.globalAlpha=(1-Math.abs(t-3150)/750)*.3;ctx.fillStyle="#d9edf0";for(let i=0;i<18;i++){const a=i*.9+t*.0004,r=shipW*(.12+(i%6)*.045);ctx.beginPath();ctx.ellipse(shipX+Math.cos(a)*r,landY+shipH*.34+Math.sin(a)*16,22+i%4*7,6+i%3*3,0,0,Math.PI*2);ctx.fill();}ctx.restore();}
  if(introSpacecraft.complete)ctx.drawImage(introSpacecraft,shipX-shipW/2,shipY-shipH/2,shipW,shipH);
  if(t>3800){
    const open=clamp((t-3800)/1200,0,1),hx=shipX,hy=shipY-shipH*.055,hw=shipW*.16,hh=shipH*.18;
    ctx.save();ctx.beginPath();ctx.rect(hx-hw*1.1,hy+hh*.7-hh*1.5*open,hw*2.2,hh*1.5*open);ctx.clip();ctx.beginPath();ctx.moveTo(hx-hw,hy-hh*.22);ctx.quadraticCurveTo(hx,hy-hh*.74,hx+hw,hy-hh*.22);ctx.lineTo(hx+hw*.72,hy+hh*.64);ctx.quadraticCurveTo(hx,hy+hh*.86,hx-hw*.72,hy+hh*.64);ctx.closePath();const inside=ctx.createRadialGradient(hx,hy,2,hx,hy,hw);inside.addColorStop(0,"#8bf5ff");inside.addColorStop(.32,"#183b4b");inside.addColorStop(1,"#071217");ctx.fillStyle=inside;ctx.fill();ctx.strokeStyle="rgba(137,236,255,.72)";ctx.lineWidth=2;ctx.stroke();ctx.restore();
    const doorY=hy-hh*.9*open;ctx.fillStyle="#9ba4a8";ctx.beginPath();ctx.moveTo(hx-hw,doorY-hh*.22);ctx.quadraticCurveTo(hx,doorY-hh*.74,hx+hw,doorY-hh*.22);ctx.lineTo(hx+hw*.72,doorY+hh*.64);ctx.quadraticCurveTo(hx,doorY+hh*.86,hx-hw*.72,doorY+hh*.64);ctx.closePath();ctx.fill();ctx.strokeStyle="#d9e2e4";ctx.lineWidth=1.5;ctx.stroke();
    const ramp=clamp((t-4550)/900,0,1),rampTop=hy+hh*.5;ctx.fillStyle="#67747b";ctx.beginPath();ctx.moveTo(hx-hw*.58,rampTop);ctx.lineTo(hx+hw*.58,rampTop);ctx.lineTo(hx+hw*(.62+1.2*ramp),rampTop+hh*(.2+1.52*ramp));ctx.lineTo(hx-hw*(.62+1.2*ramp),rampTop+hh*(.2+1.52*ramp));ctx.closePath();ctx.fill();ctx.strokeStyle="#b9d5db";ctx.stroke();
    const glowAlpha=.34*open*ramp,glow=ctx.createLinearGradient(hx,rampTop,hx,rampTop+hh*2.2);glow.addColorStop(0,`rgba(116,239,255,${glowAlpha})`);glow.addColorStop(1,"rgba(116,239,255,0)");ctx.fillStyle=glow;ctx.beginPath();ctx.moveTo(hx-hw*.62,rampTop);ctx.lineTo(hx+hw*.62,rampTop);ctx.lineTo(hx+hw*2.3,rampTop+hh*2.4);ctx.lineTo(hx-hw*2.3,rampTop+hh*2.4);ctx.fill();ctx.restore();
    state.introMibis.forEach((m,i)=>{const depart=clamp((t-(5350+i*430))/1350,0,1);if(depart<=0)return;const angle=-1.18+i*(2.36/4),distance=depart*shipW*(.28+(i%2)*.08);m.x=hx+Math.cos(angle)*distance;m.y=rampTop+hh*.35+Math.sin(angle)*distance+Math.sin(now*.005+i)*7;m.vx=Math.cos(angle);m.vy=Math.sin(angle);m.facing=m.vx<0?-1:1;m.fleeUntil=now+500;drawMibi(ctx,m,now);});
  }
  ctx.fillStyle=`rgba(228,251,255,${clamp(1-t/1800,0,.9)})`;ctx.font="800 13px system-ui";ctx.textAlign="center";ctx.fillText("UMA NOVA ESPÉCIE CHEGOU",state.width*.5,state.height*.1);
}

function playPhaseMusic() {
  music.pause(); music.currentTime = 0;
  const slot = ((state.phase - 1) % 10) + 1;
  music.src = `assets/audio/phase_${String(slot).padStart(2, "0")}.mp3`;
  music.muted=state.muted;music.load();
  music.play().then(()=>{$("audioButton").textContent=state.muted?"SOM OFF":"SOM ♫";}).catch(()=>{$("audioButton").textContent="LIGAR SOM";});
}

function updateHud() {
  $("score").textContent = scoreText(state.score);
  $("lives").textContent = "♥".repeat(state.lives) + "♡".repeat(7 - state.lives);
}

function evolve(now) {
  state.phase++; state.phaseStarted = now; state.lives = 7; state.misses = 0;
  state.mibis.forEach((m, i) => Object.assign(m, {
    wings: m.wings || (state.phase >= 4 && i % 2 === 0), antenna: state.phase >= 3,
    tail: m.tail || state.phase >= 2,
    shield: state.phase>=2&&(m.shield||i%3===0),shieldExpires:state.phase>=2?now+10000:0,
    protector:state.phase>=3&&(m.protector||i%3===0),canTeleport:state.phase>=4&&(m.canTeleport||i%2===0)
  }));
  state.mibis.push(makeMibi()); resetAmbience(); updateHud(); playPhaseMusic(); showEvolution();
}

function showEvolution() {
  const dialog = $("evolutionDialog");
  $("evolutionTitle").textContent = `EVOLUÇÃO ${state.phase - 1}`;
  const features = ["escudos de energia", "proteção coletiva", "teletransporte defensivo", "asas evasivas", "memória de perigo"];
  $("evolutionText").textContent = `Os Mibis desenvolveram ${features[(state.phase - 2) % features.length]}.`;
  const ec = $("evolutionCanvas"), ex = ec.getContext("2d"); ex.clearRect(0, 0, ec.width, ec.height);
  drawMibi(ex, {...makeMibi((state.phase - 1) % 5), x: 160, y: 130, size: 105, wings: true, tail: true, antenna: true, shield: state.phase >= 2}, performance.now(), true);
  if (!dialog.open) dialog.showModal(); clearTimeout(state.evolutionTimer);
  state.evolutionTimer = setTimeout(() => dialog.close(), 2800);
}

function update(dt, now) {
  if (now - state.phaseStarted >= 120000) evolve(now);
  state.dangerZones=state.dangerZones.filter(z=>(z.life-=dt)>0);
  const living=state.mibis.filter(m=>m.alive);
  living.forEach(m=>{if(m.shield&&now>m.shieldExpires)m.shield=false;m.protectedBy=null;});
  living.filter(m=>m.protector&&m.shield).forEach(guardian=>{
    const ally=living.filter(m=>m!==guardian&&!m.shield&&!m.protectedBy&&Math.hypot(m.x-guardian.x,m.y-guardian.y)<210).sort((a,b)=>Math.hypot(a.x-guardian.x,a.y-guardian.y)-Math.hypot(b.x-guardian.x,b.y-guardian.y))[0];
    if(ally)ally.protectedBy=guardian;
  });
  for (const m of state.mibis) {
    if (!m.alive) continue;
    m.phase += dt * .006;
    if (now > m.blinkAt) { m.blink = 1; m.blinkAt = now + rand(1600, 4200); }
    m.blink = Math.max(0, m.blink - dt / 150);
    const centerY=visualCenterY(m);
    if(now<m.observeUntil){
      m.vx*=.72;m.vy*=.72;
      const gazeBase=[-1,-1,1,1,1][m.sprite],toward=m.dangerX<m.x?-1:1;
      m.facing=toward===gazeBase?1:-1;
      m.scaredUntil=Math.max(m.scaredUntil,m.observeUntil);
    }else if(now<m.fleeUntil){
      let awayX=m.x-m.dangerX,awayY=centerY-m.dangerY;
      const d=Math.max(1,Math.hypot(awayX,awayY));
      const desiredSpeed=Math.min(2.55,1.72+state.phase*.045);
      const desiredX=awayX/d*desiredSpeed,desiredY=awayY/d*desiredSpeed;
      m.vx+=(desiredX-m.vx)*.09;m.vy+=(desiredY-m.vy)*.09;
      m.facing=m.vx<0?-1:1;m.dodgingUntil=m.fleeUntil;
    }else{
      m.vx*=.82;m.vy*=.82;
      if(Math.hypot(m.vx,m.vy)<.035){m.vx=0;m.vy=0;}
    }
    const maxSpeed=Math.min(2.55,1.72+state.phase*.045),speed=Math.hypot(m.vx,m.vy);
    if (speed > maxSpeed) { m.vx = m.vx / speed * maxSpeed; m.vy = m.vy / speed * maxSpeed; }
    m.travel+=Math.hypot(m.vx,m.vy)*dt/16.67;
    m.x+=m.vx*dt/16.67;m.y+=m.vy*dt/16.67;
    if(now<m.fleeUntil){m.vx*=.997;m.vy*=.997;}
    const r=m.size*.58,minY=r+68,maxY=state.height-r;
    if(m.x<r||m.x>state.width-r){m.vx*=-.82;m.x=clamp(m.x,r,state.width-r);}
    if(m.y<minY||m.y>maxY){m.vy*=-.82;m.y=clamp(m.y,minY,maxY);}
  }
  state.particles = state.particles.filter(p => (p.life -= dt) > 0);
  state.particles.forEach(p => { p.x += p.vx * dt / 16.67; p.y += p.vy * dt / 16.67; p.vy += .025; });
}

function drawBackground(now) {
  const index = (state.phase - 1) % 10, bg = backgrounds[index];
  ctx.fillStyle = "#10253a"; ctx.fillRect(0, 0, state.width, state.height);
  if (bg.complete) {
    const scale = Math.max(state.width / bg.width, state.height / bg.height), w = bg.width * scale, h = bg.height * scale;
    const pan = Math.sin(now * .000035 + state.phase) * Math.max(0, (w - state.width) * .45);
    const bx=(state.width-w)/2+pan,by=(state.height-h)/2;state.bgDraw={image:bg,x:bx,y:by,w,h};
    ctx.drawImage(bg,bx,by,w,h);
    if (state.phase > 10) { const next = backgrounds[(index + Math.floor(state.phase / 10)) % 10]; ctx.globalAlpha = .16; if (next.complete) ctx.drawImage(next, 0, 0, state.width, state.height); ctx.globalAlpha = 1; }
  }
  for (const a of state.ambience) {
    a.x += (.11 + a.z * .24); if (a.x > state.width + 45) a.x = -45;
    const y = a.y + Math.sin(now * .0015 + a.phase) * 12;
    const birdSize=9+a.z*14,flap=Math.sin(now*.009+a.phase),tilt=Math.sin(now*.0018+a.phase)*.08;
    ctx.save();ctx.translate(a.x,y);ctx.rotate(tilt);ctx.globalAlpha=.44+a.z*.34;
    ctx.fillStyle="rgba(31,37,43,.88)";
    ctx.beginPath();ctx.ellipse(0,0,birdSize*.42,birdSize*.15,0,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.moveTo(-birdSize*.1,0);ctx.quadraticCurveTo(-birdSize*.58,-birdSize*(.2+.35*flap),-birdSize, birdSize*.02);ctx.quadraticCurveTo(-birdSize*.48,birdSize*.08,0,birdSize*.08);ctx.fill();
    ctx.beginPath();ctx.moveTo(birdSize*.08,0);ctx.quadraticCurveTo(birdSize*.52,-birdSize*(.2+.35*flap),birdSize*.94,birdSize*.04);ctx.quadraticCurveTo(birdSize*.48,birdSize*.08,0,birdSize*.08);ctx.fill();
    ctx.beginPath();ctx.moveTo(birdSize*.35,-birdSize*.04);ctx.lineTo(birdSize*.66,-birdSize*.12);ctx.lineTo(birdSize*.4,birdSize*.07);ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function drawShieldBubble(target,x,y,r,now,seed=0){
  const pulse=1+Math.sin(now*.006+seed)*.025,rr=r*pulse;
  target.save();
  const glow=target.createRadialGradient(x-rr*.28,y-rr*.34,rr*.08,x,y,rr);
  glow.addColorStop(0,"rgba(255,255,255,.2)");glow.addColorStop(.55,"rgba(84,223,255,.08)");glow.addColorStop(1,"rgba(63,174,255,.16)");
  target.fillStyle=glow;target.shadowColor="rgba(86,231,255,.65)";target.shadowBlur=12;target.beginPath();target.arc(x,y,rr,0,Math.PI*2);target.fill();
  target.strokeStyle="rgba(193,249,255,.82)";target.lineWidth=2.5;target.stroke();target.shadowBlur=0;
  target.strokeStyle="rgba(255,255,255,.72)";target.lineWidth=2;target.beginPath();target.arc(x-rr*.08,y-rr*.08,rr*.73,3.72,4.72);target.stroke();
  target.fillStyle="rgba(255,255,255,.8)";target.beginPath();target.ellipse(x-rr*.38,y-rr*.38,rr*.09,rr*.16,-.65,0,Math.PI*2);target.fill();
  target.restore();
}

function drawMibi(target, m, now, portrait = false) {
  const s=m.size,speed=Math.hypot(m.vx,m.vy),gait=m.phase*3.25;
  const perspective=1;
  const sheet=animationSheets[m.sprite],observing=now<m.observeUntil,fleeing=now>=m.observeUntil&&now<m.fleeUntil;
  let frame;
  if(observing) frame=m.blink>.32?5:0;
  else if(fleeing) frame=[2,3,2,1][Math.floor(m.travel/(s*.12))%4];
  else frame=m.blink>.32?5:(Math.floor((now+m.phase*90)/170)%2);

  const turn=m.facing,cellW=512,cellH=512,col=frame%3,row=Math.floor(frame/3),b=frameBounds[m.sprite][frame];
  const sourceW=b[2]-b[0],sourceH=b[3]-b[1],bodyH=s*(m.sprite===3?1.8:1.68)*perspective,bodyW=bodyH*sourceW/sourceH;
  const hover=portrait?0:Math.sin(now*.0042+m.phase)*s*.045;
  const bank=portrait||!fleeing?0:clamp(m.vy*.045,-.14,.14);
  target.save();target.translate(m.x,m.y+hover);target.rotate(bank*turn);
  target.scale(turn,1);
  if(sheet.complete&&sheet.naturalWidth){
    target.drawImage(sheet,col*cellW+b[0],row*cellH+b[1],sourceW,sourceH,-bodyW/2,-bodyH/2,bodyW,bodyH);
  }else{
    const fallback=sprites[m.sprite];
    if(fallback.complete)target.drawImage(fallback,-s*.65,-s*.78,s*1.3,s*1.55);
  }
  target.restore();

  // Campo de força é um efeito externo, não uma peça anatômica sobreposta.
  if(m.shield)drawShieldBubble(target,m.x,m.y,s*.86,now,m.phase);
}

function render(now) {
  drawBackground(now);
  state.mibis.filter(m=>m.alive&&m.protectedBy?.alive&&m.protectedBy.shield).forEach(m=>{
    const g=m.protectedBy,pulse=.35+.18*Math.sin(now*.01+m.phase);ctx.save();ctx.strokeStyle=`rgba(100,235,255,${pulse})`;ctx.lineWidth=2;ctx.setLineDash([5,9]);ctx.beginPath();ctx.moveTo(g.x,visualCenterY(g));ctx.quadraticCurveTo((g.x+m.x)/2,(g.y+m.y)/2-55,m.x,visualCenterY(m));ctx.stroke();ctx.restore();
  });
  const ordered=state.mibis.filter(m=>m.alive).sort((a,b)=>a.y-b.y);
  ordered.forEach(m=>drawMibi(ctx,m,now));
  ordered.filter(m=>m.protectedBy?.alive&&m.protectedBy.shield).forEach(m=>drawShieldBubble(ctx,m.x,visualCenterY(m),m.size*.72*depthScale(m.y),now,m.phase+2));
  for (const p of state.particles) { ctx.globalAlpha = p.life / 700; ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, p.size, p.size); }
  ctx.globalAlpha = 1;
}

function loop(now) {
  if (!state.running) return;
  const dt = Math.min(34, now - state.last || 16.67); state.last = now; update(dt, now); render(now); requestAnimationFrame(loop);
}

function reactToClick(x,y){
  const now=performance.now(),reactionDelay=Math.max(90,300-state.phase*12),escapeTime=Math.min(2100,1350+state.phase*45);
  state.mibis.forEach(m=>{
    if(!m.alive)return;
    m.dangerX=x;m.dangerY=y;m.observeUntil=now+reactionDelay;m.fleeUntil=now+reactionDelay+escapeTime;
    const gazeBase=[-1,-1,1,1,1][m.sprite],toward=x<m.x?-1:1;
    m.scaredUntil=m.observeUntil;m.dodgingUntil=m.fleeUntil;m.facing=toward===gazeBase?1:-1;
    m.vx*=.2;m.vy*=.2;
  });
}

function teleportMibi(m,clickX,clickY){
  const oldX=m.x,oldY=visualCenterY(m),dx=m.x-clickX,dy=oldY-clickY,d=Math.max(1,Math.hypot(dx,dy));
  m.x=clamp(m.x+dx/d*rand(190,280)+rand(-55,55),m.size,state.width-m.size);
  m.y=clamp(m.y+dy/d*rand(140,220)+rand(-45,45),m.size+75,state.height-m.size);
  m.teleportReadyAt=performance.now()+Math.max(3200,6800-state.phase*180);m.observeUntil=0;m.fleeUntil=performance.now()+700;
  for(let i=0;i<30;i++)state.particles.push({x:i%2?oldX:m.x,y:i%2?oldY:visualCenterY(m),vx:rand(-3,3),vy:rand(-3,3),life:rand(260,620),size:rand(2,6),color:i%3?"#72efff":"#d88cff"});
}

function hitAt(x, y) {
  if (!state.running) return;
  reactToClick(x,y);
  state.dangerZones.push({x,y,radius:150+Math.min(state.phase,10)*7,life:12000});
  if(state.dangerZones.length>18)state.dangerZones.shift();
  const candidates=state.mibis.filter(m=>m.alive&&Math.hypot(x-m.x,y-visualCenterY(m))<m.size*.68*depthScale(m.y));
  if (!candidates.length) { state.mibis.forEach(m=>{if(m.alive&&Math.hypot(x-m.x,y-visualCenterY(m))<280){m.scaredUntil=performance.now()+520;m.alertedUntil=performance.now()+900;}}); if (++state.misses >= 10) { state.misses = 0; state.lives--; updateHud(); if (state.lives <= 0) finishGame(); } return; }
  const m = candidates[0]; state.misses = 0;
  if(m.protectedBy?.alive&&m.protectedBy.shield){m.protectedBy.shield=false;m.protectedBy.scaredUntil=performance.now()+700;m.protectedBy=null;state.score+=20;}
  else if (m.shield) { m.shield = false; state.score += 35; }
  else if(m.canTeleport&&performance.now()>=m.teleportReadyAt){teleportMibi(m,x,y);state.score+=25;}
  else {
    m.alive = false; state.score += 100 + state.phase * 15;
    for (let i=0;i<42;i++) state.particles.push({x:m.x,y:visualCenterY(m),vx:rand(-4,4),vy:rand(-4,3),life:rand(350,850),size:rand(2,7),color:["#fff2a8","#74f4f0","#df75ff"][i%3]});
    setTimeout(() => { if (state.running) state.mibis.push(makeMibi(m.sprite)); }, 650);
  }
  hitSound.currentTime = 0; hitSound.play().catch(()=>{}); updateHud();
  state.mibis.forEach(other=>{if(other!==m&&other.alive){other.scaredUntil=Math.max(other.scaredUntil,performance.now()+500);}});
}

function finishGame(manual=false) {
  state.running = false; music.pause();
  $("scoreDialogTitle").textContent=manual?"PARTIDA ENCERRADA":"GAME OVER";
  if(!manual&&!state.muted){gameOverSound.currentTime=0;gameOverSound.play().catch(()=>{});}
  $("finalScore").textContent = scoreText(state.score); renderTopFive(); $("scoreDialog").showModal();
}

function topFive() { try { return JSON.parse(localStorage.getItem("mibisTopFive") || "[]"); } catch { return []; } }
function renderTopFive() { const list=topFive(); $("topFive").innerHTML=list.length ? list.map((x,i)=>`<li><span>${i+1}. ${escapeHtml(x.name)}</span><strong>${scoreText(x.score)}</strong></li>`).join("") : "<li>Nenhum score salvo</li>"; }
function escapeHtml(s) { return s.replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }

function eventPoint(e) { const r=canvas.getBoundingClientRect(); return {x:e.clientX-r.left,y:e.clientY-r.top}; }
canvas.addEventListener("pointermove", e => {const p=eventPoint(e),now=performance.now(),hadPrevious=state.pointer.movedAt>0,elapsed=Math.max(8,now-(state.pointer.movedAt||now));state.pointer.vx=hadPrevious?(p.x-state.pointer.x)/elapsed:0;state.pointer.vy=hadPrevious?(p.y-state.pointer.y)/elapsed:0;Object.assign(state.pointer,p,{movedAt:now,active:true});});
canvas.addEventListener("pointerleave", () => state.pointer.active=false);
canvas.addEventListener("pointerdown", e => { e.preventDefault(); const p=eventPoint(e); Object.assign(state.pointer,p,{movedAt:performance.now(),active:true}); hitAt(p.x,p.y); });
window.addEventListener("resize", () => { resize(); resetAmbience(); });
$("launchButton").addEventListener("click", startGame);
$("audioButton").addEventListener("click",e=>{e.stopPropagation();state.muted=!state.muted;music.muted=state.muted;introSound.muted=state.muted;hitSound.muted=state.muted;gameOverSound.muted=state.muted;$("audioButton").textContent=state.muted?"SOM OFF":"SOM ♫";if(!state.muted&&state.running&&music.paused)music.play().catch(()=>{$("audioButton").textContent="LIGAR SOM";});});
$("exitButton").addEventListener("click",e=>{e.stopPropagation();if(state.running)finishGame(true);});
$("playAgain").addEventListener("click",()=>startGame());
$("returnMenu").addEventListener("click",()=>{$("scoreDialog").close();$("game").classList.add("hidden");$("launcher").classList.remove("hidden");});
document.querySelector(".game-controls").addEventListener("pointerdown",e=>e.stopPropagation());
$("saveScore").addEventListener("click", () => { const name=($("playerName").value.trim()||"MIBI").toUpperCase(); const list=[...topFive(),{name,score:state.score}].sort((a,b)=>b.score-a.score).slice(0,5); localStorage.setItem("mibisTopFive",JSON.stringify(list)); renderTopFive(); $("saveScore").disabled=true; });

async function refreshDownloadCount(){
  let count=0;
  try{const response=await fetch("https://api.github.com/repos/Leal2026/Mibis/releases/tags/v1.1.2",{headers:{Accept:"application/vnd.github+json"}});if(response.ok){const data=await response.json(),asset=data.assets.find(item=>item.name==="Mibis.apk");count=Number(asset?.download_count)||0;}}
  catch{}$("downloadCount").textContent=count.toLocaleString("pt-BR");return count;
}
async function registerDownload(){
  const shown=Number($("downloadCount").textContent.replace(/\D/g,""))||0;$("downloadCount").textContent=(shown+1).toLocaleString("pt-BR");
}
async function downloadGame(withDonation=false){
  if(withDonation){try{await navigator.clipboard.writeText($("pixKey").textContent);}catch{}}
  await registerDownload();const link=document.createElement("a");link.href="https://github.com/Leal2026/Mibis/releases/download/v1.1.2/Mibis.apk";link.rel="noopener";document.body.appendChild(link);link.click();link.remove();
  $("paymentStatus").textContent="Agradeço por divulgar meu trabalho.";
}
$("buyButton").addEventListener("click", () => { $("paymentStatus").textContent=""; refreshDownloadCount(); $("purchaseDialog").showModal(); });
$("closePurchase").addEventListener("click", () => $("purchaseDialog").close());
$("copyPix").addEventListener("click", async () => { try { await navigator.clipboard.writeText($("pixKey").textContent); $("paymentStatus").textContent="Chave Pix copiada."; } catch { $("paymentStatus").textContent="Selecione e copie a chave 17909502877."; } });
$("freeDownload").addEventListener("click",()=>downloadGame(false));
$("donateDownload").addEventListener("click",()=>downloadGame(true));
$("shareButton").addEventListener("click",async()=>{const data={title:"Mibis",text:"Jogue Mibis — eles estão aprendendo!",url:location.href};try{if(navigator.share)await navigator.share(data);else{await navigator.clipboard.writeText(location.href);alert("Link do jogo copiado para compartilhar.");}}catch{}});

resize(); renderTopFive();
