const F=require('./engine.js'),cp=require('child_process');
let seed=777;const rnd=n=>{seed=(seed*1103515245+12345)&0x7fffffff;return (seed>>8)%n};const pick=a=>a[rnd(a.length)];
const hexs=['0','0','0','1','2','ff','fe80','2001','db8','abcd','ABCD','ffff','64','ff9b','2002','fc00','fd12','ff02','0000','00ab','12345','g1','','1:'];
const gen=()=>{
  const r=rnd(10);
  if(r<4){let g=[];for(let i=0;i<8;i++)g.push(pick(['0','0','0',(rnd(65536)).toString(16)]));return g.join(':')}
  if(r<7){let n=rnd(9),g=[];for(let i=0;i<n;i++)g.push(pick(hexs));let k=rnd(n+1);g.splice(k,0,'');return g.join(':')}
  if(r<8){let g=[];for(let i=0;i<6;i++)g.push((rnd(3)?'0':rnd(65536).toString(16)));return g.join(':')+':'+pick(['1.2.3.4','192.168.0.1','256.1.1.1','01.2.3.4','1.2.3','8.8.8.8'])}
  if(r<9){return pick(['::','::1',':::','1::','::1:','1::2::3','::ffff:1.2.3.4','2002:c000:204::1','2001:0:4136:e378:8000:63bf:3fff:fdd2','fe80::1','ff02::1:ff00:1','1:2:3:4:5:6:7:8','1:2:3:4:5:6:7::','::2:3:4:5:6:7:8','1:2:3:4:5:6:7:8:9',' ::1','::1 ','2001:db8::1%eth0','0:0:0:0:0:0:0:0','::0.0.0.1','1.2.3.4'])}
  let g=[];for(let i=0;i<8;i++)g.push(rnd(5)?'0':rnd(65536).toString(16));let s=g.join(':');let a=rnd(6),b=a+1+rnd(8-a);return g.slice(0,a).join(':')+'::'+g.slice(b).join(':')};
const cases=[];for(let i=0;i<8000;i++)cases.push(gen());
const o=JSON.parse(cp.execFileSync('python3',['oracle.py'],{input:JSON.stringify(cases),maxBuffer:1e9}));
let acc=0,rej=0,bad=[],okCount=0;
cases.forEach((s,i)=>{const p=F.parse(s),r=o[i];
 const mine=p.ok&&!p.zone&&p.prefix===null&&!p.bracket;
 if(/[%\/\[]/.test(s)||s!==s.trim())return; // wrapper syntax, python 3.10 differs; not part of the comparison
 if(!r){rej++;if(p.ok)bad.push(['accepted but python rejects',s]);return}
 acc++;if(!p.ok){bad.push(['rejected but python accepts',s,p.error]);return}
 const g=p.groups,c=F.classify(g),f=c.flags;const mism=(k,a,b)=>{if(JSON.stringify(a)!==JSON.stringify(b))bad.push([k,s,a,b])};
 mism('compressed',F.canonical(g),r.compressed);mism('exploded',F.expanded(g),r.exploded);mism('reverse',F.reversePtr(g),r.reverse);
 mism('loop',!!f.loopback,r.loop);mism('unspec',!!f.unspecified,r.unspec);mism('multi',!!f.multicast,r.multi);mism('ll',!!f.linklocal,r.ll);
 mism('mapped',f.mapped||null,r.mapped);mism('6to4',f.sixtofour||null,r.sixtofour);mism('teredo',f.teredo||null,r.teredo);okCount++;});
console.log('strings',cases.length,'python accepts',acc,'rejects',rej,'full-field checks',okCount,'discrepancies',bad.length);
if(bad.length)console.log(JSON.stringify(bad.slice(0,8)));
// RFC 5952 examples
const ex=[['2001:db8:0:0:0:0:2:1','2001:db8::2:1'],['2001:db8:0:1:1:1:1:1','2001:db8:0:1:1:1:1:1'],['2001:0:0:1:0:0:0:1','2001:0:0:1::1'],['2001:db8:0:0:1:0:0:1','2001:db8::1:0:0:1'],['2001:DB8::1','2001:db8::1']];
let eb=0;ex.forEach(([i,e])=>{const a=F.analyze(i);if(a.canonical!==e){eb++;console.log('RFC5952 mismatch',i,a.canonical,e)}});console.log('RFC 5952 examples',ex.length-eb,'/',ex.length);
process.exit(bad.length||eb?1:0);
