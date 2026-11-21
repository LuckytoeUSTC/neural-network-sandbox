"use strict";
const {chromium}=require('playwright'),assert=require('node:assert/strict'),{resolve}=require('node:path'),{pathToFileURL}=require('node:url'),fs=require('node:fs/promises');
(async()=>{const browser=await chromium.launch({headless:true,...require('./browser.cjs')});try{
 const page=await browser.newPage({viewport:{width:1480,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(pathToFileURL(resolve(__dirname,'../dist/index.html')).href);await page.waitForFunction(()=>document.querySelector('#run').dataset.state==='complete');
 const parsed=await page.evaluate(()=>{
  const outcomes={};for(const value of ['1, 7','4-2','0','1, x'])try{NeuroUI.parseNeuronIds(value,[0,1,2,3,4,5]);}catch(e){outcomes[value]=e.message}return outcomes;
 });assert.match(parsed['1, 7'],/7 was not recorded/);assert.match(parsed['4-2'],/reversed/);assert.match(parsed['0'],/positive integers/);assert.match(parsed['1, x'],/comma-separated/);
 await page.locator('button[data-view=connectivity]').click();await page.locator('#graph-mode').selectOption('stimulated');
 const speed=page.getByRole('spinbutton',{name:'Playback speed'});assert.equal(await speed.inputValue(),'1.0');await speed.fill('0.5');await speed.dispatchEvent('change');
 const order=await page.locator('.nodes-transport').evaluate(e=>[...e.children].map(x=>x.className.includes('playback-speed')?'speed':x.id));assert.deepEqual(order.slice(0,3),['nodes-gif','speed','nodes-play']);
 await page.locator('#nodes-play').click();await page.waitForTimeout(120);const beforeSpeed=await page.locator('.nodes-transport output').textContent();await speed.fill('2.0');await speed.dispatchEvent('change');const afterSpeed=await page.locator('.nodes-transport output').textContent();assert.ok(parseFloat(afterSpeed)>=parseFloat(beforeSpeed));await page.locator('#nodes-play').click();assert.equal(await speed.inputValue(),'2.0');await page.keyboard.press('x');assert.equal(await speed.inputValue(),'1.9');await page.keyboard.press('c');assert.equal(await speed.inputValue(),'2.0');assert.equal(await speed.evaluate(e=>getComputedStyle(e).borderTopWidth),'0px');await speed.focus();await page.keyboard.press('x');assert.equal(await speed.inputValue(),'2.0');await speed.blur();
 assert.equal(await page.locator('#nodes-layout').count(),0);await page.locator('#nodes-expand').click();assert.equal(await page.locator('#nodes-layout').getAttribute('aria-pressed'),'false');
 await page.locator('#nodes-layout').click();await page.waitForFunction(()=>document.querySelector('#nodes-layout').getAttribute('aria-pressed')==='true');await page.waitForTimeout(750);
 await page.locator('#nodes-layout').click();assert.equal(await page.locator('#nodes-layout').getAttribute('aria-pressed'),'false');await page.waitForTimeout(750);
 await page.locator('#gif-frame-interval').evaluate(e=>e.value='40');
 let download=page.waitForEvent('download',{timeout:60000});await page.locator('#nodes-gif').click();await(await download).saveAs(resolve(__dirname,'../.test-output/nodes-activity.gif'));
 await page.keyboard.press('Escape');await page.locator('#pin-reference').click();await page.locator('button[data-view=compare]').click();download=page.waitForEvent('download',{timeout:60000});await page.locator('[data-cmp-focus=gif]').click();await(await download).saveAs(resolve(__dirname,'../.test-output/comparison-activity.gif'));
 const metrics=await page.evaluate(async()=>{
  const output=[];for(const preset of ['ring','clusters','random','lowrank']){
   const config=NeuroModel.preset(preset),network=NeuroModel.buildNetwork(config),result={network,config,input:NeuroModel.buildInput(config)};
   const graph=NeuroViz.graph({result,observed:[],selected:null,select:()=>{},onlySelected:false});graph.style.width='800px';document.body.append(graph);await new Promise(requestAnimationFrame);const before=graph.normalizedPositions();const after=await NeuroLayout.relax(network,before,new AbortController().signal);
   let weightedBefore=0,weightedAfter=0,weight=0,closeBefore=0,closeAfter=0,within=0,between=0,wcount=0,bcount=0;
   for(const e of network.edges){const w=Math.abs(e.value);weight+=w;weightedBefore+=w*Math.hypot(before[e.from][0]-before[e.to][0],before[e.from][1]-before[e.to][1]);weightedAfter+=w*Math.hypot(after[e.from][0]-after[e.to][0],after[e.from][1]-after[e.to][1]);}
   for(let i=0;i<config.n;i++)for(let j=i+1;j<config.n;j++) { const a=Math.hypot(before[i][0]-before[j][0],before[i][1]-before[j][1]),b=Math.hypot(after[i][0]-after[j][0],after[i][1]-after[j][1]);if(a<.035)closeBefore++;if(b<.035)closeAfter++;if(network.group[i]===network.group[j]){within+=b;wcount++}else{between+=b;bcount++}}
   output.push({preset,before,after,n:config.n,weightedDistanceBefore:weightedBefore/weight,weightedDistanceAfter:weightedAfter/weight,closeBefore,closeAfter,within:within/wcount,between:between/bcount});graph.dispose();graph.remove();
  }return output;
 });await fs.writeFile(resolve(__dirname,'../.test-output/layout-metrics.json'),JSON.stringify(metrics,null,2));
 for(const item of metrics){assert.ok(item.after.every(p=>p.every(Number.isFinite)));assert.equal(item.closeAfter,0,`${item.preset}: nodes must remain separated`)}
 assert.deepEqual(errors,[]);console.log('New features passed: actionable ID errors, layout toggle, two GIF downloads, finite layout and separation.');console.log(metrics.map(({preset,weightedDistanceBefore,weightedDistanceAfter,closeAfter,within,between})=>({preset,weightedDistanceBefore,weightedDistanceAfter,closeAfter,within,between})));
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
