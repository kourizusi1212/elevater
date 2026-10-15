// REGRET LIFT - zero dependencies. Run: npm start
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
const HTML=fs.readFileSync(path.join(__dirname,'public','index.html'),'utf8');

server.listen(PORT,()=>console.log('listening on '+PORT));
