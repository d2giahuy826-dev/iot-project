const $=id=>document.getElementById(id);
const KEY='parkguard_log_v2';
let audioOn=true,ac=null,blink=null,session=null,sessionCount=0,log=[],zone='out',ev=null,counts={d:0,w:0},minAll=null,hist=[];
let sessions=[],storeOK=true;
try{localStorage.setItem('pg_t','1');localStorage.removeItem('pg_t')}catch(e){storeOK=false}
function apply(s){log=s.log||[];sessionCount=s.sc||0;sessions=s.sessions||[];const c=s.cur;if(c&&c.session){session=c.session;counts=c.counts;minAll=c.minAll}}
try{const s=JSON.parse(localStorage.getItem(KEY));if(s)apply(s)}catch(e){}
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify({log,sc:sessionCount,sessions,cur:session?{session,counts,minAll}:null}))}catch(e){storeOK=false;$('storeWarn').style.display='block'}};
const zoneOf=d=>d>200?'out':d>=100?'safe':d>=50?'warn':'danger';
const fT=t=>new Date(t).toLocaleString('vi-VN'),fD=ms=>(ms/1000).toFixed(1)+' s';
const UI={safe:['An toàn','#1f9d63'],warn:['Cảnh báo','#e39a0b'],danger:['Nguy hiểm!','#d6342c'],out:['Ngoài vùng đo','#8a97a3']};

function beep(){if(!audioOn)return;try{ac=ac||new(window.AudioContext||window.webkitAudioContext)();const o=ac.createOscillator(),g=ac.createGain();o.type='square';o.frequency.value=1600;o.connect(g);g.connect(ac.destination);g.gain.setValueAtTime(.1,ac.currentTime);g.gain.exponentialRampToValueAtTime(.001,ac.currentTime+.05);o.start();o.stop(ac.currentTime+.05)}catch(e){}}

/* Ghi sự kiện: chỉ đếm khi VỪA VÀO vùng, không đếm mỗi lần đọc */
function closeEv(){if(!ev)return;log.unshift({t:ev.start,lv:ev.lv,min:ev.min,dur:Date.now()-ev.start,s:session?session.id:0});ev=null;save();renderLog();cloudPush('events',log[0])}
function track(d,z){
  if(!session)return;
  if(z!==zone){closeEv();if(z==='warn'||z==='danger'){ev={lv:z,start:Date.now(),min:d};z==='danger'?counts.d++:counts.w++;save()}}
  if(ev&&d<ev.min)ev.min=d;
  let ch=false;
  if(d<=250&&(minAll===null||d<minAll)){minAll=d;ch=true}
  renderStats();if(ch)save();
}
function verdict(d=counts.d,w=counts.w){
  if(d===0&&w<=2)return['Tốt','#1f9d63'];
  if(d<=2)return['Cần cẩn thận','#e39a0b'];
  return['Nguy hiểm','#d6342c'];
}
function showRec(){$('rec').classList.add('on');$('sessText').textContent='Đang ghi phiên #'+session.id;$('btnSession').textContent='Kết thúc phiên';$('btnSession').className='btn stop'}
function renderSessions(){
  const b=$('sesBody');b.innerHTML='';$('sesEmpty').style.display=sessions.length?'none':'block';let td=0,tw=0;
  sessions.forEach(x=>{td+=x.d;tw+=x.w;const[v,c]=verdict(x.d,x.w);const tr=document.createElement('tr');
    tr.innerHTML=`<td>#${x.id}</td><td>${fT(x.start)}</td><td>${fD(x.end-x.start)}</td><td>${x.d}</td><td>${x.w}</td><td>${x.min===null?'---':x.min+' cm'}</td><td><span class="tag" style="background:${c}">${v}</span></td>`;b.appendChild(tr)});
  $('sesTotal').textContent=sessions.length?`Tổng cộng ${td} lần nguy hiểm và ${tw} lần cảnh báo trong ${sessions.length} phiên`:'';
}
function renderStats(){
  $('sDanger').textContent=counts.d;$('sWarn').textContent=counts.w;$('sMin').textContent=minAll===null?'---':minAll;
  $('sTotal').textContent=log.length+(ev?1:0);
  const[v,c]=session?verdict():['Chưa có','#2a3a49'];$('verdict').textContent=v;$('verdict').style.background=c;
}
function renderLog(){
  const b=$('logBody');b.innerHTML='';$('emptyMsg').style.display=log.length?'none':'block';
  log.forEach(l=>{const tr=document.createElement('tr');
    tr.innerHTML=`<td>#${l.s}</td><td>${fT(l.t)}</td><td><span class="tag ${l.lv==='danger'?'r':'y'}">${l.lv==='danger'?'Nguy hiểm':'Cảnh báo'}</span></td><td>${l.min} cm</td><td>${fD(l.dur)}</td>`;b.appendChild(tr)});
  renderStats();
}

/* Vẽ sơ đồ + biểu đồ */
const Y0=60,K=1.7;
function drawScene(d){
  const c=Math.min(d,250),y=Y0+c*K;
  $('car').style.transform=`translateY(${y}px)`;
  const top=Y0-y; // điểm tường so với gốc xe (âm)
  $('beam').setAttribute('points',`170,0 190,0 232,${top} 128,${top}`);
  $('beamLine').setAttribute('y1',0);$('beamLine').setAttribute('y2',top);
  $('beamTxt').setAttribute('y',top/2+8);$('beamTxt').textContent=d>200?'':d+' cm';
}
function drawChart(){
  const n=80,pts=hist.map((v,i)=>`${(i/(n-1))*600},${150-Math.min(v,250)/250*150}`).join(' ');
  $('line').setAttribute('points',pts);
}
function update(d){
  const z=zoneOf(d);autoSess(d);track(d,z);cloudReading(d,z);logReading(d);
  hist.push(d);if(hist.length>80)hist.shift();
  $('dist').textContent=d>200?'---':d;drawScene(d);drawChart();
  if(z!==zone||!$('stateTxt').dataset.i){
    const[t,col]=UI[z];$('stateTxt').textContent=t;$('stateTxt').style.color=col;$('stateTxt').dataset.i=1;
    $('heroRead').style.borderLeftColor=col;
    $('lg').classList.toggle('on',z==='safe');$('ly').classList.toggle('on',z==='warn');$('lr').classList.remove('on');
    if(blink){clearInterval(blink);blink=null}
    if(z==='danger'){let s=false;blink=setInterval(()=>{s=!s;$('lr').classList.toggle('on',s);if(s)beep()},80)}
  }
  zone=z;
}

/* Phiên đỗ xe */
function startSession(){
  autoOwned=false;sessionCount++;session={id:sessionCount,start:Date.now()};counts={d:0,w:0};minAll=null;ev=null;zone='out';save();
  $('rec').classList.add('on');$('sessText').textContent='Đang ghi phiên #'+session.id;
  $('btnSession').textContent='Kết thúc phiên';$('btnSession').className='btn stop';
  if(!autoStarting)update(+$('slider').value);
}
function endSession(){
  armed=false;endD=lastD;autoOwned=false;rdFlush();closeEv();sessions.unshift({id:session.id,start:session.start,end:Date.now(),d:counts.d,w:counts.w,min:minAll});cloudPush('sessions',sessions[0]);$('rec').classList.remove('on');
  $('sessText').textContent='Đã kết thúc phiên #'+session.id;
  $('sessTime').textContent=`${counts.d} lần nguy hiểm · ${counts.w} lần cảnh báo`;
  $('btnSession').textContent='Bắt đầu phiên đỗ xe';$('btnSession').className='btn pri';
  renderStats();session=null;save();renderSessions();
}
setInterval(()=>{if(session)$('sessTime').textContent='('+fD(Date.now()-session.start)+')'},500);
$('btnSession').onclick=()=>session?endSession():startSession();

/* Điều khiển */
function setDist(d){$('slider').value=d;$('sliderLabel').textContent=d+' cm';update(d)}
$('slider').addEventListener('input',e=>setDist(+e.target.value));
$('btnAudio').onclick=()=>{audioOn=!audioOn;$('btnAudio').textContent='Còi: '+(audioOn?'bật':'tắt')};
$('btnClear').onclick=()=>{if(!confirm('Xóa toàn bộ nhật ký?'))return;log=[];sessions=[];ev=null;counts={d:0,w:0};minAll=null;save();renderLog();renderSessions()};
$('btnCsv').onclick=()=>{
  const rows=[['Phiên','Thời điểm','Mức độ','Gần nhất (cm)','Kéo dài (s)'],...log.map(l=>[l.s,fT(l.t),l.lv==='danger'?'Nguy hiểm':'Cảnh báo',l.min,(l.dur/1000).toFixed(1)])];
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+rows.map(r=>r.join(',')).join('\n')],{type:'text/csv'}));a.download='nhat-ky-do-xe.csv';a.click();
};
let auto=null;
function stopAuto(){clearInterval(auto);auto=null;$('btnAuto').textContent='Chạy mô phỏng lùi xe'}
$('btnAuto').onclick=()=>{
  if(auto){stopAuto();return}
  if(!session)startSession();
  let d=200,dir=-1;$('btnAuto').textContent='Dừng mô phỏng';
  auto=setInterval(()=>{d+=dir*3;if(d<=25)dir=1;setDist(d);if(dir===1&&d>=120)stopAuto()},60);
};
$('btnConnect').onclick=async()=>{
  if(!('serial' in navigator)){alert('Hãy dùng Google Chrome hoặc Microsoft Edge (Web Serial).');return}
  try{
    const port=await navigator.serial.requestPort();await port.open({baudRate:9600});
    $('btnConnect').textContent='Đã kết nối Arduino';$('btnConnect').className='btn ok';
    const dec=new TextDecoderStream();port.readable.pipeTo(dec.writable);const rd=dec.readable.getReader();let buf='';
    while(true){const{value,done}=await rd.read();if(done)break;buf+=value;const ls=buf.split('\n');buf=ls.pop();
      for(const l of ls){const m=l.match(/Distance:\s*([0-9.]+)/i);if(m)setDist(Math.min(250,Math.round(parseFloat(m[1]))))}}
  }catch(e){console.error(e);alert('Không kết nối được: '+e.message)}
};
$('btnBackup').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify({log,sc:sessionCount,sessions,cur:null})],{type:'application/json'}));a.download='parkguard-backup.json';a.click()};
$('btnRestore').onclick=()=>$('fileRestore').click();
$('fileRestore').onchange=e=>{const f=e.target.files[0];if(!f)return;f.text().then(t=>{try{apply(JSON.parse(t));save();renderLog();renderSessions();if(session)showRec()}catch(x){alert('File không hợp lệ')}})};
/* ===== Đo khoảng cách bằng camera =====
   Nguyên lý: vật càng xa thì càng nhỏ trong ảnh, chiều rộng vật tỉ lệ nghịch với khoảng cách.
   Hiệu chuẩn 1 điểm: k = khoảng cách chuẩn × chiều rộng vật (tính theo tỉ lệ khung hình).
   Sau đó: khoảng cách = k / chiều rộng hiện tại. */
const CW=320,MINPX=50,HSV=[0,0,0];
let CH=240;
const CAM={on:false,mode:'auto',ka:null,tw:null,cls:null,wManual:null,stream:null,timer:null,c:null,k:null,w:null,miss:0,cv:document.createElement('canvas')};
CAM.cv.width=CW;CAM.cv.height=CH;
const cx=CAM.cv.getContext('2d',{willReadFrequently:true});
try{const s=JSON.parse(localStorage.getItem('pg_cam'));if(s){CAM.c=s.c||null;CAM.k=s.k||null;if(s.f)$('fov').value=s.f}}catch(e){}
const camSave=()=>{try{localStorage.setItem('pg_cam',JSON.stringify({c:CAM.c,k:CAM.k,f:$('fov').value}))}catch(e){}};
const camMsg=t=>{$('camMsg').textContent=t};
const setSrc=t=>{$('srcLbl').textContent=t};
const camRead=(d,t)=>{$('camDist').textContent=d;$('camDet').textContent=t};
function rgb2hsv(r,g,b){
  r/=255;g/=255;b/=255;const mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn;let h=0;
  if(d){if(mx===r)h=((g-b)/d)%6;else if(mx===g)h=(b-r)/d+2;else h=(r-g)/d+4;h*=60;if(h<0)h+=360}
  HSV[0]=h;HSV[1]=mx?d/mx:0;HSV[2]=mx;
}
/* Tìm vùng liền nhau lớn nhất có màu giống màu đã chọn */
function findBlob(px,w,h,c,tol){
  const H=c[0],S=c[1],V=c[2],sMin=Math.max(.25,S*.55),vMin=Math.max(.2,V*.5),n=w*h,mask=new Uint8Array(n);
  for(let i=0;i<n;i++){
    rgb2hsv(px[i*4],px[i*4+1],px[i*4+2]);
    let hd=Math.abs(HSV[0]-H);hd=Math.min(hd,360-hd);
    if(hd<=tol&&HSV[1]>=sMin&&HSV[2]>=vMin)mask[i]=1;
  }
  const stack=new Int32Array(n);let best=null;
  for(let i=0;i<n;i++){
    if(mask[i]!==1)continue;
    let sp=0,cnt=0,x0=w,x1=0,y0=h,y1=0;stack[sp++]=i;mask[i]=2;
    while(sp){
      const p=stack[--sp],x=p%w,y=(p-x)/w;cnt++;
      if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;
      if(x>0&&mask[p-1]===1){mask[p-1]=2;stack[sp++]=p-1}
      if(x<w-1&&mask[p+1]===1){mask[p+1]=2;stack[sp++]=p+1}
      if(y>0&&mask[p-w]===1){mask[p-w]=2;stack[sp++]=p-w}
      if(y<h-1&&mask[p+w]===1){mask[p+w]=2;stack[sp++]=p+w}
    }
    if(!best||cnt>best.cnt)best={cnt,x0,x1,y0,y1};
  }
  return best&&best.cnt>=MINPX?best:null;
}
function camFeed(){
  const k=CAM.mode==='auto'?CAM.ka:CAM.k;
  if(!k)return;
  if(CAM.w===null){update(251);return}          /* mất vật: coi như ngoài vùng đo */
  const d=Math.round(k/CAM.w);
  if(d>250){update(251);return}
  setDist(Math.max(0,d));
}
function camTick(){
  const v=$('camVideo');if(!CAM.on||CAM.mode!=='color'||!v.videoWidth)return;
  cx.drawImage(v,0,0,CW,CH);
  const img=cx.getImageData(0,0,CW,CH).data,ov=$('camOv').getContext('2d');ov.clearRect(0,0,CW,CH);
  if(!CAM.c){camMsg('Bấm vào vật cản trên hình để chọn màu.');return}
  const b=findBlob(img,CW,CH,CAM.c,+$('tol').value);
  if(!b){
    CAM.miss++;
    if(CAM.miss>5){CAM.w=null;camRead('---','Không thấy vật cản'+(CAM.k?' · k = '+CAM.k.toFixed(1):''));camMsg(CAM.k?'Không thấy vật cản. Đưa vật vào khung hình hoặc tăng độ nhạy màu.':'Không thấy vật cản. Đưa vật vào khung hình hoặc chọn lại màu.');camFeed()}
    return;
  }
  CAM.miss=0;
  const bw=b.x1-b.x0+1,w=bw/CW;CAM.w=CAM.w===null?w:CAM.w*.6+w*.4;
  const wTxt='Chiều rộng vật: '+(CAM.w*100).toFixed(1)+'% khung hình';
  ov.strokeStyle='#2ee08c';ov.lineWidth=2;ov.strokeRect(b.x0,b.y0,bw,b.y1-b.y0+1);
  if(CAM.k){
    const d=Math.round(CAM.k/CAM.w);
    ov.font='bold 18px sans-serif';ov.fillStyle='#2ee08c';ov.fillText(d>250?'> 250 cm':d+' cm',b.x0,Math.max(16,b.y0-6));
    camRead(d>250?'---':Math.max(0,d),wTxt+' · k = '+CAM.k.toFixed(1));$('camState').textContent='Đã hiệu chuẩn';camMsg('Đang đo bằng camera. Nếu đổi vật khác hoặc đổi zoom camera, hãy hiệu chuẩn lại.');camFeed();
  }else{
    camRead('---',wTxt+' · chưa hiệu chuẩn');$('camState').textContent='Chưa hiệu chuẩn';camMsg('Đã thấy vật. Đặt vật ở khoảng cách đã biết, nhập số đó rồi bấm “Hiệu chuẩn”.');
  }
}
function setCamSwatch(){if(CAM.c)$('camSw').style.background=CAM.c[3]}
function camStop(){
  CAM.on=false;clearInterval(CAM.timer);CAM.timer=null;
  if(CAM.stream)CAM.stream.getTracks().forEach(t=>t.stop());CAM.stream=null;
  $('camVideo').srcObject=null;$('camOv').getContext('2d').clearRect(0,0,CW,CH);$('camPh').style.display='flex';
  CAM.w=null;CAM.miss=0;CAM.cls=null;CAM.ka=null;camRead('---','Chưa có dữ liệu');$('btnCam').textContent='Bật camera';$('camState').textContent='Tắt';
  $('slider').disabled=false;$('btnAuto').disabled=false;setSrc('Khoảng cách từ đuôi xe đến vật cản');camMsg('Camera đã tắt.');
}
/* --- Chế độ tự động: nhận diện vật bằng COCO-SSD (TensorFlow.js), tải khi cần --- */
/* [chiều rộng thật trung bình (cm), tên hiển thị] */
const OBJ={person:[45,'Người'],car:[180,'Ô tô'],motorcycle:[80,'Xe máy'],bicycle:[55,'Xe đạp'],bus:[250,'Xe buýt'],truck:[250,'Xe tải'],
  bottle:[7,'Chai'],cup:[8,'Cốc'],'cell phone':[7,'Điện thoại'],laptop:[33,'Laptop'],book:[15,'Sách'],backpack:[30,'Ba lô'],
  chair:[45,'Ghế'],keyboard:[44,'Bàn phím'],mouse:[6,'Chuột'],remote:[5,'Điều khiển'],tv:[100,'TV'],'stop sign':[75,'Biển STOP']};
let aiModel=null,aiLoading=null,aiBusy=false;
const loadScript=src=>new Promise((res,rej)=>{const e=document.createElement('script');e.src=src;e.onload=res;e.onerror=()=>rej(new Error('Không tải được '+src));document.head.appendChild(e)});
async function loadAI(){
  if(aiModel)return aiModel;
  if(!aiLoading)aiLoading=(async()=>{
    await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js');
    await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js');
    aiModel=await cocoSsd.load({base:'lite_mobilenet_v2'});return aiModel;
  })();
  try{return await aiLoading}catch(e){aiLoading=null;throw e}
}
async function ensureAI(){
  if(aiModel)return true;
  camMsg('Đang tải mô hình nhận diện vật thể (lần đầu mất vài giây, cần Internet)…');
  try{await loadAI();if(CAM.on&&CAM.mode==='auto')camMsg('Mô hình đã sẵn sàng. Đưa vật vào khung hình.');return true}
  catch(e){console.error(e);if(CAM.mode==='auto'){setMode('color');camMsg('Không tải được mô hình nhận diện (cần Internet). Đã chuyển sang chế độ chọn theo màu.')}return false}
}
async function aiTick(){
  if(aiBusy||!aiModel||!CAM.on||CAM.mode!=='auto')return;
  const v=$('camVideo');if(!v.videoWidth)return;
  aiBusy=true;
  try{
    const preds=await aiModel.detect(v,10,.45);
    if(!CAM.on||CAM.mode!=='auto')return;
    const sc=CW/v.videoWidth,ov=$('camOv').getContext('2d');ov.clearRect(0,0,CW,CH);
    const cand=preds.filter(p=>OBJ[p.class]);
    let best=null,bs=0;
    cand.forEach(p=>{const a=p.bbox[2]*p.bbox[3]*(p.class===CAM.cls?1.3:1);if(a>bs){bs=a;best=p}});
    ov.lineWidth=1;ov.strokeStyle='rgba(255,255,255,.55)';
    cand.forEach(p=>{if(p!==best)ov.strokeRect(p.bbox[0]*sc,p.bbox[1]*sc,p.bbox[2]*sc,p.bbox[3]*sc)});
    if(!best){
      CAM.miss++;
      if(CAM.miss>3){CAM.w=null;camRead('---','Không thấy vật thể');$('camState').textContent='Tự động';camMsg('Chưa nhận diện được vật quen thuộc. Đưa vật vào khung hình và đảm bảo đủ sáng.');camFeed()}
      return;
    }
    CAM.miss=0;
    if(best.class!==CAM.cls){CAM.cls=best.class;CAM.wManual=null;CAM.w=null;$('objW').value=OBJ[best.class][0]}
    const W=CAM.wManual||OBJ[best.class][0],F=+$('fov').value||70,name=OBJ[best.class][1];
    CAM.tw=W;CAM.ka=W/(2*Math.tan(F*Math.PI/360));
    const wf=best.bbox[2]/v.videoWidth;CAM.w=CAM.w===null?wf:CAM.w*.6+wf*.4;
    const d=Math.round(CAM.ka/CAM.w),bx=best.bbox[0]*sc,by=best.bbox[1]*sc;
    ov.strokeStyle='#2ee08c';ov.lineWidth=2;ov.strokeRect(bx,by,best.bbox[2]*sc,best.bbox[3]*sc);
    ov.font='bold 18px sans-serif';ov.fillStyle='#2ee08c';ov.fillText(name+' · '+(d>250?'> 250':d)+' cm',bx,Math.max(16,by-6));
    camRead(d>250?'---':Math.max(0,d),name+' · rộng '+W+' cm · '+(CAM.w*100).toFixed(1)+'% khung');
    $('camState').textContent='Tự động: '+name;camMsg('Đang tự nhận diện và đo. Muốn chính xác hơn, hãy hiệu chuẩn bằng thước.');
    camFeed();
  }catch(e){console.error(e)}finally{aiBusy=false}
}
function setMode(m){
  CAM.mode=m;CAM.w=null;CAM.miss=0;CAM.cls=null;
  $('mAuto').className='btn'+(m==='auto'?' pri':'');$('mColor').className='btn'+(m==='color'?' pri':'');
  document.querySelectorAll('.onlyColor').forEach(e=>e.style.display=m==='color'?'':'none');
  document.querySelectorAll('.onlyAuto').forEach(e=>e.style.display=m==='auto'?'':'none');
  $('camWrap').style.cursor=m==='color'?'crosshair':'default';$('camSw').style.display=m==='color'?'':'none';
  $('camOv').getContext('2d').clearRect(0,0,CW,CH);camRead('---','Chưa có dữ liệu');
  if(CAM.on){$('camState').textContent=m==='auto'?'Tự động':(CAM.k?'Đã hiệu chuẩn':'Đang chạy');if(m==='auto')ensureAI();else camMsg(CAM.c?'Chế độ chọn theo màu.':'Bấm vào vật cản trên hình để chọn màu.')}
}
$('mAuto').onclick=()=>setMode('auto');$('mColor').onclick=()=>setMode('color');
$('objW').addEventListener('input',()=>{const x=+$('objW').value;CAM.wManual=x>=1?x:null});
$('btnCam').onclick=async()=>{
  if(CAM.on){camStop();return}
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){alert('Trình duyệt không cho dùng camera. Hãy dùng Chrome hoặc Edge, mở file trực tiếp từ máy hoặc qua http://localhost.');return}
  try{
    const st=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:640},height:{ideal:480}},audio:false});
    const v=$('camVideo');v.srcObject=st;await v.play();CAM.stream=st;
    CH=Math.round(CW*v.videoHeight/v.videoWidth);CAM.cv.width=CW;CAM.cv.height=CH;
    $('camOv').width=CW;$('camOv').height=CH;$('camWrap').style.aspectRatio=v.videoWidth+'/'+v.videoHeight;
    $('camPh').style.display='none';CAM.on=true;
    stopAuto();$('slider').disabled=true;$('btnAuto').disabled=true;setSrc('Khoảng cách từ vật thể đến camera');
    $('btnCam').textContent='Tắt camera';$('camState').textContent=CAM.mode==='auto'?'Tự động':(CAM.k?'Đã hiệu chuẩn':'Đang chạy');
    if(CAM.mode==='auto')ensureAI();else camMsg(CAM.c?'Camera đang chạy.':'Bấm vào vật cản trên hình để chọn màu.');
    CAM.timer=setInterval(()=>{camTick();aiTick()},70);
  }catch(e){
    console.error(e);
    alert(e.name==='NotAllowedError'?'Bạn chưa cho phép truy cập camera. Hãy bấm biểu tượng ổ khóa trên thanh địa chỉ và cho phép.':e.name==='NotFoundError'?'Không tìm thấy camera.':'Không bật được camera: '+e.message);
  }
};
$('camWrap').addEventListener('click',e=>{
  if(!CAM.on||CAM.mode!=='color')return;
  const r=$('camWrap').getBoundingClientRect(),x=Math.round((e.clientX-r.left)/r.width*CW),y=Math.round((e.clientY-r.top)/r.height*CH);
  cx.drawImage($('camVideo'),0,0,CW,CH);
  const x0=Math.max(0,x-3),y0=Math.max(0,y-3),w=Math.min(CW-x0,7),h=Math.min(CH-y0,7),d=cx.getImageData(x0,y0,w,h).data,n=w*h;
  let R=0,G=0,B=0;for(let i=0;i<n;i++){R+=d[i*4];G+=d[i*4+1];B+=d[i*4+2]}
  R=Math.round(R/n);G=Math.round(G/n);B=Math.round(B/n);rgb2hsv(R,G,B);
  if(HSV[1]<.3){camMsg('Màu này quá nhạt hoặc xám nên khó theo dõi. Hãy chọn vật có màu rực hơn.');return}
  CAM.c=[HSV[0],HSV[1],HSV[2],`rgb(${R},${G},${B})`];camSave();setCamSwatch();
  camMsg(CAM.k?'Đã đổi màu theo dõi. Nếu đổi sang vật khác, hãy hiệu chuẩn lại.':'Đã lấy màu. Giờ đặt vật ở khoảng cách đã biết và bấm “Hiệu chuẩn”.');
});
$('btnCal').onclick=()=>{
  const D=+$('calD').value;
  if(!CAM.on||CAM.w===null){camMsg(CAM.mode==='auto'?'Chưa nhận diện được vật. Đưa vật vào khung hình trước.':'Chưa thấy vật cản. Bật camera, chọn màu và đưa vật vào khung hình trước.');return}
  if(!(D>=10&&D<=250)){camMsg('Khoảng cách chuẩn phải từ 10 đến 250 cm.');return}
  if(CAM.mode==='auto'){
    /* hiệu chuẩn góc nhìn camera: tan(F/2) = W / (2·w·D) */
    const F=2*Math.atan(CAM.tw/(2*CAM.w*D))*180/Math.PI;
    if(!(F>=30&&F<=120)){camMsg('Góc nhìn tính ra là '+F.toFixed(0)+'°, bất thường. Kiểm tra lại chiều rộng thật của vật hoặc khoảng cách đã nhập.');return}
    $('fov').value=F.toFixed(1);camSave();camMsg('Đã hiệu chuẩn tại '+D+' cm. Góc nhìn camera: '+F.toFixed(1)+'°. Góc này dùng được cho mọi loại vật.');return;
  }
  CAM.k=D*CAM.w;camSave();$('camState').textContent='Đã hiệu chuẩn';camMsg('Đã hiệu chuẩn tại '+D+' cm.');
};
$('btnObj').onclick=()=>{
  const W=+$('objW').value,F=+$('fov').value;
  if(!(W>=1&&W<=200)){camMsg('Chiều rộng thật của vật phải từ 1 đến 200 cm.');return}
  if(!(F>=30&&F<=120)){camMsg('Góc nhìn camera nên từ 30° đến 120° (webcam laptop thường 65–78°).');return}
  CAM.k=W/(2*Math.tan(F*Math.PI/360));camSave();$('camState').textContent='Đã đặt k';
  camMsg('Đã tính k từ chiều rộng thật '+W+' cm và góc nhìn '+F+'°. Cách này sai số cao hơn hiệu chuẩn bằng thước.');
};
$('tol').addEventListener('input',e=>{$('tolLabel').textContent=e.target.value});
setCamSwatch();setMode('auto');


/* ===== Lịch sử cảm biến: tự lưu từng lần đọc + tự bắt đầu/kết thúc phiên ===== */
const RDK='parkguard_rd_v1',RDMAX=5000;
let rd=[],rdLast=0,rdDirty=false,rdView=false,autoStarting=false,autoOwned=false,autoReady=false,armed=true,endD=null,lastD=null,lastMove=0,outAt=null;
try{rd=JSON.parse(localStorage.getItem(RDK))||[]}catch(e){rd=[]}
function rdFlush(){if(!rdDirty)return;try{localStorage.setItem(RDK,JSON.stringify(rd));rdDirty=false}catch(e){storeOK=false;$('storeWarn').style.display='block'}}
function logReading(d){
  if(!session||d>250)return;
  const t=Date.now();if(t-rdLast<1000)return;rdLast=t;
  rd.push({t,d,s:session.id});if(rd.length>RDMAX)rd.splice(0,rd.length-RDMAX);rdDirty=rdView=true;
}
function autoSess(d){
  const now=Date.now();
  if(lastD===null||Math.abs(d-lastD)>3){lastMove=now;lastD=d}
  outAt=d>200?(outAt||now):null;
  if(!armed&&(d>200||(endD!==null&&Math.abs(d-endD)>10)))armed=true;
  if(autoReady&&!session&&armed&&$('autoSess').checked&&d<=200){autoStarting=true;startSession();autoStarting=false;autoOwned=true;lastMove=now}
}
/* tự kết thúc: xe rời vùng đo quá 5 giây, hoặc đứng yên quá 30 giây (đã đỗ xong) */
setInterval(()=>{
  if(!session||!autoOwned||!$('autoSess').checked)return;
  const now=Date.now();
  if((outAt&&now-outAt>5000)||now-lastMove>30000)endSession();
},1000);
setInterval(rdFlush,5000);window.addEventListener('beforeunload',rdFlush);
setInterval(()=>{if(rdView){rdView=false;rdRender()}},3000);
try{const a=localStorage.getItem('pg_auto');if(a!==null)$('autoSess').checked=a==='1'}catch(e){}
$('autoSess').onchange=e=>{try{localStorage.setItem('pg_auto',e.target.checked?'1':'0')}catch(x){}};
function rdRender(){
  const sel=$('rdSel'),cur=sel.value||'all',ids=[...new Set(rd.map(x=>x.s))].sort((a,b)=>b-a),k=ids.join(',');
  if(sel.dataset.k!==k){sel.innerHTML='<option value="all">Tất cả phiên</option>'+ids.map(i=>`<option value="${i}">Phiên #${i}</option>`).join('');sel.dataset.k=k}
  sel.value=(cur==='all'||ids.includes(+cur))?cur:'all';
  const v=sel.value,a=v==='all'?rd:rd.filter(x=>x.s===+v);
  $('rdEmpty').style.display=a.length?'none':'block';
  $('rdBody').innerHTML=a.slice(-100).reverse().map(x=>{const z=zoneOf(x.d);return `<tr><td>#${x.s}</td><td>${fT(x.t)}</td><td>${x.d>200?'---':x.d+' cm'}</td><td><span class="tag" style="background:${UI[z][1]}">${UI[z][0]}</span></td></tr>`}).join('');
  if(a.length){const m=Math.min(...a.map(x=>x.d)),av=Math.round(a.reduce((q,x)=>q+x.d,0)/a.length);$('rdSum').textContent=`${a.length} lần đọc · gần nhất ${m} cm · trung bình ${av} cm (lưu tối đa ${RDMAX} lần đọc mới nhất)`}
  else $('rdSum').textContent='Mỗi giây ghi một lần đọc trong phiên đỗ xe và tự lưu vào trình duyệt.';
  const step=Math.max(1,Math.ceil(a.length/300)),b=a.filter((_,i)=>i%step===0);
  if(b.length>1){const t0=b[0].t,sp=b[b.length-1].t-t0||1;$('rdLine').setAttribute('points',b.map(x=>`${((x.t-t0)/sp*600).toFixed(1)},${(150-Math.min(x.d,250)/250*150).toFixed(1)}`).join(' '))}
  else $('rdLine').setAttribute('points','');
}
$('rdSel').onchange=rdRender;
$('rdCsv').onclick=()=>{
  const v=$('rdSel').value,a=v==='all'?rd:rd.filter(x=>x.s===+v);
  const rows=[['Phiên','Thời điểm','Khoảng cách (cm)','Mức độ'],...a.map(x=>[x.s,fT(x.t),x.d,UI[zoneOf(x.d)][0]])];
  const l=document.createElement('a');l.href=URL.createObjectURL(new Blob(['\ufeff'+rows.map(r=>r.join(',')).join('\n')],{type:'text/csv'}));l.download='lich-su-cam-bien.csv';l.click();
};
$('rdClear').onclick=()=>{if(!confirm('Xóa toàn bộ lịch sử các lần đọc cảm biến?'))return;rd=[];rdDirty=true;rdFlush();rdRender()};
/* ===== Lưu trữ Firebase Realtime Database (REST, không cần SDK) ===== */
const FB={url:'',on:false,last:0,n:0};
const fbSet=(st,cls,info)=>{$('fbStat').textContent=st;$('fbDot').className='dot'+(cls?' '+cls:'');$('fbInfo').textContent=info||''};
const fbEp=p=>FB.url+'/parkguard/'+p+'.json';
const keyE=l=>l.s+'_'+l.t,keyS=x=>x.id+'_'+x.start;
async function fbReq(p,method,body){
  const r=await fetch(fbEp(p),{method,body:body===undefined?undefined:JSON.stringify(body)});
  if(!r.ok)throw new Error(r.status===401||r.status===403?'Firebase từ chối (kiểm tra Rules)':'Lỗi '+r.status);
  return r.json();
}
function fbErr(e){fbSet('Lỗi lưu cloud','err',(e&&e.message)||'Không có mạng');}
function fbSave(){try{localStorage.setItem('pg_fb',JSON.stringify({u:FB.url,a:$('fbAuto').checked,r:$('fbRead').checked}))}catch(e){}}
async function cloudPush(kind,obj){
  if(!FB.on||!$('fbAuto').checked||!obj)return;
  try{await fbReq(kind+'/'+(kind==='events'?keyE(obj):keyS(obj)),'PUT',obj);fbSet('Đã kết nối','on','Vừa lưu '+(kind==='events'?'sự kiện':'phiên')+' lúc '+new Date().toLocaleTimeString('vi-VN'))}catch(e){fbErr(e)}
}
async function cloudReading(d,z){
  if(!FB.on||!session||!$('fbAuto').checked||!$('fbRead').checked)return;
  const t=Date.now();if(t-FB.last<2000)return;FB.last=t;
  try{await fbReq('readings','POST',{distance:Math.min(d,251),level:z,ts:t,session:session.id});FB.n++;fbSet('Đã kết nối','on','Đã lưu '+FB.n+' lần đọc trong lần mở trang này')}catch(e){fbErr(e)}
}
async function fbConnect(quiet){
  let u=$('fbUrl').value.trim().replace(/\/+$/,'');
  if(!/^https:\/\/.+\.(firebaseio\.com|firebasedatabase\.app)$/.test(u)){if(!quiet)alert('Địa chỉ phải có dạng https://…firebaseio.com hoặc https://…firebasedatabase.app');return}
  FB.url=u;fbSet('Đang kiểm tra…','','');
  try{
    await fbReq('ping','PUT',{ts:Date.now()});
    FB.on=true;fbSave();fbSet('Đã kết nối','on','Ghi thử thành công');
  }catch(e){FB.on=false;fbErr(e)}
}
$('fbConnect').onclick=()=>fbConnect(false);
$('fbOff').onclick=()=>{FB.on=false;fbSet('Chưa kết nối','','Đã ngắt, dữ liệu vẫn lưu trên trình duyệt')};
$('fbAuto').onchange=$('fbRead').onchange=fbSave;
const need=()=>{if(!FB.on){alert('Hãy kết nối Firebase trước.');return false}return true};
$('fbPush').onclick=async()=>{
  if(!need())return;
  try{
    const e={},s2={};log.forEach(l=>e[keyE(l)]=l);sessions.forEach(x=>s2[keyS(x)]=x);
    await fbReq('events','PATCH',e);await fbReq('sessions','PATCH',s2);
    fbSet('Đã kết nối','on','Đã đẩy '+log.length+' sự kiện và '+sessions.length+' phiên');
  }catch(e){fbErr(e)}
};
$('fbPull').onclick=async()=>{
  if(!need())return;
  try{
    const [e,s2]=await Promise.all([fbReq('events','GET'),fbReq('sessions','GET')]);
    const em=new Map(log.map(l=>[keyE(l),l])),sm=new Map(sessions.map(x=>[keyS(x),x]));
    Object.values(e||{}).forEach(l=>em.set(keyE(l),l));Object.values(s2||{}).forEach(x=>sm.set(keyS(x),x));
    log=[...em.values()].sort((a,b)=>b.t-a.t);sessions=[...sm.values()].sort((a,b)=>b.start-a.start);
    sessionCount=Math.max(sessionCount,0,...sessions.map(x=>x.id));
    save();renderLog();renderSessions();
    fbSet('Đã kết nối','on','Đã tải về: có '+log.length+' sự kiện và '+sessions.length+' phiên');
  }catch(e){fbErr(e)}
};
$('fbWipe').onclick=async()=>{
  if(!need()||!confirm('Xóa TOÀN BỘ dữ liệu ParkGuard trên Firebase? (Dữ liệu trên trình duyệt không bị xóa)'))return;
  try{await fbReq('','DELETE');FB.n=0;fbSet('Đã kết nối','on','Đã xóa dữ liệu trên cloud')}catch(e){fbErr(e)}
};
try{const f=JSON.parse(localStorage.getItem('pg_fb'));if(f){$('fbUrl').value=f.u||'';$('fbAuto').checked=f.a!==false;$('fbRead').checked=f.r!==false;if(f.u)fbConnect(true)}}catch(e){}
if(!$('fbUrl').value&&window.PG_CONFIG&&PG_CONFIG.firebaseUrl){$('fbUrl').value=PG_CONFIG.firebaseUrl;fbConnect(true)}
if(!storeOK)$('storeWarn').style.display='block';
if(session)showRec();
renderLog();renderSessions();update(150);autoReady=true;rdRender();
