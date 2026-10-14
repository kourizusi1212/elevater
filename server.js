// REGRET LIFT - single file, zero dependencies. Run: node server.js
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto'),EventEmitter=require('events');
const PORT=process.env.PORT||3000;
const server=http.createServer((q,r)=>{
  let u;try{u=decodeURIComponent(q.url.split('?')[0])}catch{r.writeHead(400);return r.end()}
  if(u==='/healthz')return r.end('ok');
  if(u==='/api/leaderboard'){r.writeHead(200,{'Content-Type':'application/json'});return r.end(JSON.stringify(LB.slice(0,10).map(e=>({n:e.n,score:e.score,floor:e.floor}))))}
  if(u==='/'||u==='/index.html'){r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return r.end(HTML)}
  r.writeHead(404);r.end('not found');
});
const EVT={lobby:16,red:24,chase:16},P=new Map();let nid=1;
const G={ph:'',floor:0,ev:'lobby',t:0,red:false,redT:2,coins:[],mon:null,chk:false,cid:1,freeze:0};
const ITEMS={boost:30,magnet:40,freeze:60,shield:50};
const DATA=process.env.DATA_DIR||path.join(__dirname,'data'),LBF=path.join(DATA,'leaderboard.json');
let LB=[],lbDirty=false;try{LB=JSON.parse(fs.readFileSync(LBF,'utf8'))}catch{}
function lbSubmit(p){if(!p.score)return;const k=p.n.toLowerCase();let e=LB.find(x=>x.k===k);
  if(!e){e={k,n:p.n,score:0,floor:0};LB.push(e);lbDirty=true}
  if(p.score>e.score){e.score=p.score;e.n=p.n;lbDirty=true}
  if(G.floor>e.floor){e.floor=G.floor;lbDirty=true}
  LB.sort((a,b)=>b.score-a.score);if(LB.length>50)LB.length=50}
function lbSave(){if(!lbDirty)return;lbDirty=false;try{fs.mkdirSync(DATA,{recursive:true});fs.writeFileSync(LBF,JSON.stringify(LB))}catch(e){console.error(e)}}
setInterval(()=>{P.forEach(lbSubmit);lbSave()},15000);
process.on('SIGTERM',()=>{P.forEach(lbSubmit);lbSave();process.exit(0)});
function sendInv(p){const n=Date.now();send(p.ws,{t:'inv',inv:p.inv,cash:p.cash,fx:{boost:Math.max(0,p.fx.boost-n),magnet:Math.max(0,p.fx.magnet-n)}})}

const send=(ws,o)=>ws.readyState===1&&ws.send(JSON.stringify(o));
const all=o=>{const s=JSON.stringify(o);P.forEach(p=>p.ws.readyState===1&&p.ws.send(s))};
const rnd=(a,b)=>a+Math.random()*(b-a);
const phaseMsg=()=>({t:'phase',ph:G.ph,floor:G.floor,ev:G.ev,tl:G.t,coins:G.coins.map(c=>[c.id,c.x,c.z])});
function kill(p,why){if(!p.alive||Date.now()<p.imm)return;
  if(p.inv.shield>0){p.inv.shield--;p.imm=Date.now()+2000;sendInv(p);send(p.ws,{t:'shield'});return}
  p.alive=false;send(p.ws,{t:'dead',why})}
function startFloor(){
  G.floor++;G.ev=G.floor===1?'lobby':G.floor%4===0?'chase':Math.random()<.5?'red':'lobby';
  G.coins=[];const n=G.ev==='chase'?5:9;
  for(let i=0;i<n;i++)G.coins.push({id:G.cid++,x:rnd(-10,10),z:rnd(6,29)});
  G.mon=G.ev==='chase'?{x:0,z:30}:null;G.red=false;G.redT=2;G.chk=false;G.freeze=0;G.ph='ride';G.t=2.5;
  P.forEach(p=>{p.alive=true;p.x=0;p.z=0});all(phaseMsg());
}
setInterval(()=>{
  const dt=.05;
  if(!P.size){G.ph='';G.floor=0;return}
  if(!G.ph)startFloor();
  G.t-=dt;
  if(G.ph==='ride'&&G.t<=0){G.ph='event';G.t=EVT[G.ev];all(phaseMsg())}
  else if(G.ph==='event'||G.ph==='closing'){
    if(G.ph==='event'&&G.ev==='red'){G.redT-=dt;if(G.redT<=0){G.red=!G.red;G.redT=G.red?rnd(1.5,3):rnd(2,5)}}
    if(G.freeze>0)G.freeze-=dt;
    if(G.mon&&G.freeze<=0){let b=null,bd=1e9;
      P.forEach(p=>{if(!p.alive)return;const d=Math.hypot(p.x-G.mon.x,p.z-G.mon.z);if(d<bd){bd=d;b=p}});
      if(b){const sp=Math.min(6,2.6+G.floor*.12)*dt;G.mon.x+=(b.x-G.mon.x)/bd*sp;G.mon.z+=(b.z-G.mon.z)/bd*sp;if(bd<1.4)kill(b,'追跡者に捕まった…')}}
    if(G.ph==='event'&&G.t<=0){G.ph='closing';G.t=1.7;all(phaseMsg())}
    else if(G.ph==='closing'){
      if(!G.chk&&G.t<.85){G.chk=true;P.forEach(p=>{if(p.alive&&p.z>2)kill(p,'置き去りにされた…')})}
      if(G.t<=0){P.forEach(p=>{if(p.alive){p.score+=50;p.cash+=50;sendInv(p)}});startFloor()}}
  }
  const r=n=>Math.round(n*100)/100;
  all({t:'tick',tl:r(G.t),red:G.red,fz:G.freeze>0?1:0,mon:G.mon&&[r(G.mon.x),r(G.mon.z)],coins:G.coins.map(c=>c.id),
    pl:[...P].map(([id,p])=>[id,p.n,r(p.x),r(p.z),r(p.yaw),p.alive?1:0,p.score])});
},50);
function onConnection(ws){
  if(P.size>=20){ws.close();return}
  const id=nid++,p={ws,n:'Guest'+id,x:0,z:0,yaw:0,alive:true,score:0,cash:0,inv:{boost:0,magnet:0,freeze:0,shield:0},fx:{boost:0,magnet:0},imm:0};P.set(id,p);
  send(ws,{t:'init',id});sendInv(p);if(G.ph)send(ws,phaseMsg());
  ws.on('message',d=>{let m;try{m=JSON.parse(d)}catch{return}
    if(m.t==='join')p.n=String(m.name||p.n).slice(0,12);
    else if(m.t==='pos'&&p.alive&&isFinite(m.x)&&isFinite(m.z)){p.x=+m.x;p.z=+m.z;p.yaw=+m.yaw||0}
    else if(m.t==='coin'){const i=G.coins.findIndex(c=>c.id===m.id);
      if(i>=0&&p.alive&&Math.hypot(G.coins[i].x-p.x,G.coins[i].z-p.z)<(p.fx.magnet>Date.now()?7:3)){G.coins.splice(i,1);p.score+=10;p.cash+=10;sendInv(p)}}
    else if(m.t==='die'&&G.ph==='event'&&G.ev==='red'&&G.red)kill(p,'赤信号で動いた…')
    else if(m.t==='buy'&&Object.hasOwn(ITEMS,m.item)&&p.alive&&p.z<2&&p.cash>=ITEMS[m.item]&&p.inv[m.item]<9){p.cash-=ITEMS[m.item];p.inv[m.item]++;sendInv(p)}
    else if(m.t==='use'&&Object.hasOwn(ITEMS,m.item)&&m.item!=='shield'&&p.alive&&p.inv[m.item]>0){
      if(m.item==='freeze'){if(!G.mon)return;G.freeze=6}else p.fx[m.item]=Date.now()+(m.item==='boost'?15000:20000);
      p.inv[m.item]--;sendInv(p)}});
  ws.on('close',()=>{lbSubmit(p);P.delete(id)});ws.on('error',()=>{});
}

// ---- minimal WebSocket server (RFC 6455, text frames only) ----
class WS extends EventEmitter{
  constructor(sock){super();this.s=sock;this.readyState=1;this.buf=Buffer.alloc(0);sock.setNoDelay(true);
    sock.on('data',d=>{this.buf=Buffer.concat([this.buf,d]);try{this.parse()}catch{this.close()}});
    sock.on('close',()=>this.fin());sock.on('error',()=>this.fin())}
  fin(){if(this.readyState===3)return;this.readyState=3;this.emit('close')}
  frame(op,pl){const n=pl.length;let h;
    if(n<126)h=Buffer.from([0x80|op,n]);
    else if(n<65536){h=Buffer.alloc(4);h[0]=0x80|op;h[1]=126;h.writeUInt16BE(n,2)}
    else{h=Buffer.alloc(10);h[0]=0x80|op;h[1]=127;h.writeBigUInt64BE(BigInt(n),2)}
    return Buffer.concat([h,pl])}
  send(str){if(this.readyState===1)this.s.write(this.frame(1,Buffer.from(str)))}
  close(){if(this.readyState!==1)return;this.readyState=2;try{this.s.end(this.frame(8,Buffer.alloc(0)))}catch{}setTimeout(()=>this.s.destroy(),1000).unref()}
  parse(){for(;;){const b=this.buf;if(b.length<2)return;
    const fin=b[0]&128,op=b[0]&15,masked=b[1]&128;let len=b[1]&127,off=2;
    if(len===126){if(b.length<4)return;len=b.readUInt16BE(2);off=4}else if(len===127)return this.close();
    if(!masked||!fin||len>1024)return this.close();
    if(b.length<off+4+len)return;
    const mk=b.subarray(off,off+4),d=Buffer.alloc(len);for(let i=0;i<len;i++)d[i]=b[off+4+i]^mk[i&3];
    this.buf=b.subarray(off+4+len);
    if(op===1)this.emit('message',d.toString());
    else if(op===8)return this.close();
    else if(op===9)this.s.write(this.frame(10,d))}}
}
server.on('upgrade',(req,sock)=>{
  const key=req.headers['sec-websocket-key'];
  if(!key||String(req.headers.upgrade).toLowerCase()!=='websocket'){sock.destroy();return}
  const acc=crypto.createHash('sha1').update(key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+acc+'\r\n\r\n');
  onConnection(new WS(sock));
});

// ---- client page ----
const HTML=String.raw`<!DOCTYPE html>
<html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>REGRET LIFT Online</title>
<style>
html,body{margin:0;height:100%;background:#000;color:#eee;font-family:system-ui,sans-serif;overflow:hidden}
canvas{display:block}
#hud{position:fixed;top:12px;left:14px;font-size:18px;text-shadow:0 0 4px #000;pointer-events:none}
#lb{position:fixed;top:12px;right:14px;font-size:14px;text-align:right;text-shadow:0 0 4px #000;pointer-events:none;line-height:1.5}
#msg{position:fixed;top:38%;width:100%;text-align:center;font-size:34px;font-weight:bold;text-shadow:0 0 8px #000;pointer-events:none}
#ov{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#000d;text-align:center;padding:20px;box-sizing:border-box}
#ov h1{font-size:40px;margin:0 0 10px;color:#f55;letter-spacing:4px}
#ov p{margin:4px 0;line-height:1.6}
#nm{font-size:18px;padding:8px;border-radius:6px;border:1px solid #666;background:#222;color:#eee;text-align:center;margin:8px}
#go{font-size:20px;padding:10px 32px;border:0;border-radius:8px;background:#e33;color:#fff;cursor:pointer}
#shop,#alb{position:fixed;display:none;background:#000b;border:1px solid #555;border-radius:8px;padding:12px 16px;line-height:1.7;font-size:15px;pointer-events:none}
#shop{left:50%;bottom:70px;transform:translateX(-50%)}#alb{top:60px;left:50%;transform:translateX(-50%);min-width:240px}
</style></head><body>
<div id="hud"></div><div id="shop"></div><div id="alb"></div><div id="lb"></div><div id="msg"></div>
<div id="ov"><h1>REGRET LIFT</h1>
<p id="ovt">みんなで同じエレベーターに乗って上へ。<br>ドアが開いたら生き延びてコインを集め、閉まる前に戻ろう。</p>
<p>WASD:移動 / Shift:ダッシュ / マウス:視点<br>B:ショップ(エレベーター内) / 1〜3:アイテム使用 / L:ランキング</p>
<input id="nm" maxlength="12" placeholder="なまえ"><button id="go">参加する</button><div id="olb" style="margin-top:14px;font-size:14px;line-height:1.6"></div></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script>
const R=new THREE.WebGLRenderer({antialias:true});R.setSize(innerWidth,innerHeight);document.body.appendChild(R.domElement);
const S=new THREE.Scene();S.background=new THREE.Color(0x111111);S.fog=new THREE.Fog(0x111111,4,32);
const C=new THREE.PerspectiveCamera(75,innerWidth/innerHeight,.1,100);C.rotation.order='YXZ';
addEventListener('resize',()=>{R.setSize(innerWidth,innerHeight);C.aspect=innerWidth/innerHeight;C.updateProjectionMatrix()});
const box=(w,h,d,c,x,y,z,e)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color:c,emissive:e||0}));m.position.set(x,y,z);S.add(m);return m};
box(4,.1,4,0x555555,0,-.05,0);box(4,.1,4,0xbbbbbb,0,3.05,0,0x555555);
box(.1,3,4,0x6b4a2b,-2.05,1.5,0);box(.1,3,4,0x6b4a2b,2.05,1.5,0);box(4.2,3,.1,0x6b4a2b,0,1.5,-2.05);
const dl=box(2,3,.1,0x9a9a9a,-1,1.5,2.05),dr=box(2,3,.1,0x9a9a9a,1,1.5,2.05);box(4.2,.1,.1,0x333333,0,3.05,2.05);
const fl=box(24,.1,30,0x333333,0,-.05,17),wb=box(24,6,.2,0x333333,0,3,32),wl=box(.2,6,30,0x333333,-12,3,17),wr=box(.2,6,30,0x333333,12,3,17);
S.add(new THREE.AmbientLight(0x555555));
const li=new THREE.PointLight(0xffffff,1,9);li.position.set(0,2.7,0);S.add(li);
const lo=new THREE.PointLight(0xffffff,1.2,45);lo.position.set(0,5,14);S.add(lo);
const EV={lobby:{n:'ロビー',c:0x3a5a3a,l:0xaaffaa},red:{n:'赤信号フロア「止まれ!」',c:0x5a2a2a,l:0x33ff33},chase:{n:'追跡者フロア「逃げろ!」',c:0x2a1a40,l:0x9966ff}};
const $=id=>document.getElementById(id),hud=$('hud'),msg=$('msg'),ov=$('ov'),lb=$('lb');
let ws,myId,started=false,alive=true,ph='',floor=0,ev='lobby',tl=0,red=false,grace=0,open=0,yaw=0,pitch=0,mt=0,lastSend=0;
let inv={boost:0,magnet:0,freeze:0,shield:0},cash=0,boostUntil=0,magnetUntil=0,shopOpen=false,lbOpen=false;
const keys={},P=new THREE.Vector3(0,1.6,0),coinM=new Map(),others=new Map();let mon=null,monT=null,pl=[];
const say=(s,sec)=>{msg.textContent=s;mt=sec||2};
function tag(n){const c=document.createElement('canvas');c.width=256;c.height=64;const g=c.getContext('2d');g.font='bold 34px sans-serif';g.fillStyle='#fff';g.textAlign='center';g.fillText(n,128,44);
  const s=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),transparent:true,depthTest:false}));s.scale.set(2,.5,1);s.position.y=2.1;return s}
function avatar(id,n){const g=new THREE.Group(),col=new THREE.Color().setHSL((id*.17)%1,.7,.5);
  const b=new THREE.Mesh(new THREE.BoxGeometry(.6,1.1,.4),new THREE.MeshStandardMaterial({color:col}));b.position.y=.65;
  const h=new THREE.Mesh(new THREE.BoxGeometry(.4,.4,.4),new THREE.MeshStandardMaterial({color:0xffdcb0}));h.position.y=1.45;
  g.add(b,h,tag(n));S.add(g);return g}
function setFloorLook(){const e=EV[ev];[fl,wb,wl,wr].forEach(m=>m.material.color.setHex(e.c));lo.color.setHex(e.l);
  S.background.setHex(e.c&0x0f0f0f);S.fog.color.setHex(e.c&0x0f0f0f)}
function addCoin(id,x,z){if(coinM.has(id))return;const c=new THREE.Mesh(new THREE.CylinderGeometry(.35,.35,.08,16),new THREE.MeshStandardMaterial({color:0xffd700,emissive:0x886600}));
  c.rotation.x=Math.PI/2;c.position.set(x,1,z);S.add(c);coinM.set(id,c)}
const H={
  init:m=>{myId=m.id},
  phase:m=>{ph=m.ph;floor=m.floor;ev=m.ev;tl=m.tl;setFloorLook();
    const ids=new Set(m.coins.map(c=>c[0]));coinM.forEach((c,id)=>{if(!ids.has(id)){S.remove(c);coinM.delete(id)}});
    m.coins.forEach(c=>addCoin(...c));
    if(ev==='chase'&&!mon){mon=box(1.2,2.4,1.2,0x050505,0,1.2,30,0xaa0000)}
    if(ev!=='chase'&&mon){S.remove(mon);mon=null}
    if(ph==='ride'){P.set(0,1.6,0);yaw=0;pitch=0;alive=true;red=false;fl.material.emissive.setHex(0);say(floor+'F 上昇中…',2.4)}
    else if(ph==='event')say(floor+'F '+EV[ev].n,3);else if(ph==='closing')say('ドアが閉まる!戻れ!',3)},
  tick:m=>{tl=m.tl;
    if(m.red!==red){red=m.red;grace=.3;lo.color.setHex(red?0xff0000:EV[ev].l);fl.material.emissive.setHex(red?0x550000:0);if(red)say('止まれ!',1.2)}
    const ids=new Set(m.coins);coinM.forEach((c,id)=>{if(!ids.has(id)){S.remove(c);coinM.delete(id)}});
    monT=m.mon;pl=m.pl;if(mon)mon.material.color.setHex(m.fz?0x66aaff:0x050505);const seen=new Set();
    m.pl.forEach(([id,n,x,z,yw,a])=>{if(id===myId)return;seen.add(id);let o=others.get(id);
      if(!o){o={g:avatar(id,n),t:[x,z,yw]};o.g.position.set(x,0,z);others.set(id,o)}o.t=[x,z,yw];o.g.visible=!!a});
    others.forEach((o,id)=>{if(!seen.has(id)){S.remove(o.g);others.delete(id)}})},
  dead:m=>{alive=false;say(m.why+' 次のフロアで復活',3)},
  inv:m=>{inv=m.inv;cash=m.cash;boostUntil=performance.now()+m.fx.boost;magnetUntil=performance.now()+m.fx.magnet;renderShop()},
  shield:()=>{alive=true;say('🛡シールド発動!',2)}
};
const esc=s=>String(s).replace(/[&<>"']/g,c=>'&#'+c.charCodeAt(0)+';');
function fetchLB(el){fetch('/api/leaderboard').then(r=>r.json()).then(a=>{el.innerHTML='<b>🏆 歴代ランキング</b><br>'+(a.length?a.map((e,i)=>(i+1)+'. '+esc(e.n)+' '+e.score+'点 ('+e.floor+'F)').join('<br>'):'まだ記録がありません')}).catch(()=>{})}
const IT=[['boost','⚡スピード(15秒)',30],['magnet','🧲マグネット(20秒)',40],['freeze','❄フリーズ(追跡者6秒停止)',60],['shield','🛡シールド(死亡を1回防ぐ)',50]];
function renderShop(){const s=$('shop');s.style.display=shopOpen?'block':'none';if(!shopOpen)return;
  s.innerHTML='<b>🛒 ショップ</b> 💰'+cash+'<br>'+IT.map((t,i)=>(i+1)+'. '+t[1]+' — '+t[2]+'💰 (所持'+inv[t[0]]+')').join('<br>')+'<br><small>エレベーター内で数字キーで購入 / Bで閉じる</small>'}
function connect(name){
  ws=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host);
  ws.onopen=()=>ws.send(JSON.stringify({t:'join',name}));
  ws.onmessage=e=>{const m=JSON.parse(e.data);H[m.t]&&H[m.t](m)};
  ws.onclose=()=>{started=false;fetchLB($('olb'));$('ovt').textContent='切断されました。もう一度参加してください。';$('go').textContent='再接続';ov.style.display='flex';
    coinM.forEach(c=>S.remove(c));coinM.clear();others.forEach(o=>S.remove(o.g));others.clear()};
}
$('nm').onkeydown=e=>e.stopPropagation();
$('go').onclick=()=>{R.domElement.requestPointerLock&&R.domElement.requestPointerLock();ov.style.display='none';started=true;connect($('nm').value.trim())};
addEventListener('mousemove',e=>{if(document.pointerLockElement){yaw-=e.movementX*.0025;pitch=Math.max(-1.4,Math.min(1.4,pitch-e.movementY*.0025))}});
addEventListener('keydown',e=>{keys[e.code]=true;if(!started||e.repeat)return;
  if(e.code==='KeyB'){shopOpen=!shopOpen;renderShop()}
  else if(e.code==='KeyL'){lbOpen=!lbOpen;$('alb').style.display=lbOpen?'block':'none';if(lbOpen)fetchLB($('alb'))}
  else{const i=+e.code.replace('Digit','')-1;if(i>=0&&i<4&&ws.readyState===1){if(shopOpen)ws.send(JSON.stringify({t:'buy',item:IT[i][0]}));else if(i<3)ws.send(JSON.stringify({t:'use',item:IT[i][0]}))}}});addEventListener('keyup',e=>keys[e.code]=false);
R.domElement.addEventListener('click',()=>started&&R.domElement.requestPointerLock&&R.domElement.requestPointerLock());
const bad=(x,z)=>Math.abs(x)>11||z>31||z<-1.8||(Math.abs(x)>1.8&&z<2.15)||(open<.6&&z>1.8&&z<2.3);
let last=performance.now();
function loop(now){
  requestAnimationFrame(loop);const dt=Math.min(.05,(now-last)/1000);last=now;
  if(mt>0){mt-=dt;if(mt<=0)msg.textContent=''}
  if(started&&ph){
    let f=(keys.KeyW||keys.ArrowUp?1:0)-(keys.KeyS||keys.ArrowDown?1:0),s=(keys.KeyD||keys.ArrowRight?1:0)-(keys.KeyA||keys.ArrowLeft?1:0);
    const moving=!!(f||s);grace-=dt;
    if(alive&&moving&&ph!=='ride'||alive&&moving&&ph==='ride'){
      const sp=(keys.ShiftLeft?8:5)*(now<boostUntil?1.6:1)*dt,l=Math.hypot(f,s);f/=l;s/=l;
      const vx=(-Math.sin(yaw)*f+Math.cos(yaw)*s)*sp,vz=(-Math.cos(yaw)*f-Math.sin(yaw)*s)*sp;
      if(!bad(P.x+vx,P.z))P.x+=vx;if(!bad(P.x,P.z+vz))P.z+=vz}
    if(alive&&ev==='red'&&ph==='event'&&red&&grace<=0&&moving&&ws.readyState===1){ws.send('{"t":"die"}');alive=false}
    open=Math.max(0,Math.min(1,open+(ph==='event'?1:-1)*dt*.6));
    dl.position.x=-1-open*1.9;dr.position.x=1+open*1.9;
    coinM.forEach((c,id)=>{c.rotation.z+=dt*3;if(alive&&c.position.distanceTo(P)<(now<magnetUntil?6:1.3)&&ws.readyState===1){ws.send(JSON.stringify({t:'coin',id}));S.remove(c);coinM.delete(id)}});
    if(now-lastSend>66&&ws.readyState===1&&alive){lastSend=now;ws.send(JSON.stringify({t:'pos',x:P.x,z:P.z,yaw}))}
    others.forEach(o=>{o.g.position.x+=(o.t[0]-o.g.position.x)*.3;o.g.position.z+=(o.t[1]-o.g.position.z)*.3;o.g.rotation.y=o.t[2]});
    if(mon&&monT){mon.position.x+=(monT[0]-mon.position.x)*.3;mon.position.z+=(monT[1]-mon.position.z)*.3;mon.position.y=1.2+Math.sin(now/120)*.1}
    const sh=ph==='ride'?Math.sin(now/40)*.02:0;
    C.position.set(P.x,P.y+sh,P.z);C.rotation.set(pitch,yaw,0);
    const me=pl.find(p=>p[0]===myId);
    hud.innerHTML='<b>'+floor+'F</b> ／ スコア '+(me?me[6]:0)+(ph==='event'?' ／ 残り '+Math.ceil(tl)+'秒':'')+(alive?'':' ／ 💀観戦中')+'<br>💰'+cash+' ⚡'+inv.boost+(now<boostUntil?'(発動中)':'')+' 🧲'+inv.magnet+(now<magnetUntil?'(発動中)':'')+' ❄'+inv.freeze+' 🛡'+inv.shield;
    lb.innerHTML='オンライン '+pl.length+'人<br>'+[...pl].sort((a,b)=>b[6]-a[6]).slice(0,5).map(p=>(p[0]===myId?'<b>':'')+esc(p[1])+' '+p[6]+(p[0]===myId?'</b>':'')).join('<br>');
  }
  R.render(S,C);
}
fetchLB($('olb'));C.position.copy(P);requestAnimationFrame(loop);
</script></body></html>
`;

server.listen(PORT,()=>console.log('listening on '+PORT));
