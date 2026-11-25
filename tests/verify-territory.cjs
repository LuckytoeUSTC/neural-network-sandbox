const {chromium}=require('playwright'),a=require('node:assert/strict'),{resolve}=require('node:path'),{pathToFileURL}=require('node:url');
(async()=>{const b=await chromium.launch({headless:true,...require('./browser.cjs')});try{
const p=await b.newPage();await p.goto(pathToFileURL(resolve(__dirname,'../dist/index.html')).href);
const result=await p.evaluate(()=>{
const c=document.createElement('canvas');c.width=640;c.height=420;const ctx=c.getContext('2d'),f=NeuroTerritory.field();
const points=[[210,210],[290,210],[430,290]],colors=['rgb(200,60,30)','rgb(10,130,100)','rgb(50,80,190)'];
f.paint(ctx,640,420,points,colors,90,true); const pixel=(x,y)=>Array.from(ctx.getImageData(x,y,1,1).data);
const out={backend:f.backend,blank:pixel(10,10),left:pixel(210,210),right:pixel(290,210),bridge:pixel(250,210),outside:pixel(430,395),png:c.toDataURL()};
const positions=Array.from({length:1000},(_,i)=>[15+(i%40)*15,15+Math.floor(i/40)*15]),tones=positions.map((_,i)=>`rgb(${i%255},100,150)`),times=[];
for(let k=0;k<12;k++){const start=performance.now();f.paint(ctx,640,420,positions,tones,24,true);ctx.getImageData(0,0,1,1);times.push(performance.now()-start);}
out.ms=times.slice(2).sort((a,b)=>a-b);f.dispose();return out;});
const exactSize=await p.evaluate(()=>{const f=NeuroTerritory.field(),c=document.createElement('canvas');c.width=300;c.height=150;const ctx=c.getContext('2d');f.paint(ctx,300,150,[[150,75]],['rgb(200,60,30)'],40,true);const out={backend:f.backend,pixel:Array.from(ctx.getImageData(150,75,1,1).data)};f.dispose();return out;});
a.equal(exactSize.backend,'webgl2');a.deepEqual(exactSize.pixel,[200,60,30,255]);
a.equal(result.backend,'webgl2');a.equal(result.blank[3],0);a.ok(result.left[0]>180);a.ok(result.right[1]>110);a.ok(result.bridge[3]>240);a.equal(result.outside[3],0);
require('fs').writeFileSync(resolve(__dirname,'../.test-output/territory-gpu.png'),Buffer.from(result.png.split(',')[1],'base64'));delete result.png;
const fallback=await p.evaluate(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl2'?null:original.call(this,type,...args)};try{const f=NeuroTerritory.field(),c=document.createElement('canvas');c.width=200;c.height=200;const ctx=c.getContext('2d');f.paint(ctx,200,200,[[100,100]],['rgb(200,60,30)'],40,true);const center=Array.from(ctx.getImageData(100,100,1,1).data),outside=ctx.getImageData(0,0,1,1).data[3],backend=f.backend;f.dispose();return{center,outside,backend};}finally{HTMLCanvasElement.prototype.getContext=original;}});
a.equal(fallback.backend,'canvas');a.deepEqual(fallback.center,[200,60,30,255]);a.equal(fallback.outside,0);console.log(result,fallback);
}finally{await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
