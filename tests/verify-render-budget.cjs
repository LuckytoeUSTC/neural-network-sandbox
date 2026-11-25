const {chromium}=require('playwright'),a=require('node:assert/strict'),{resolve}=require('node:path'),{pathToFileURL}=require('node:url');
(async()=>{const b=await chromium.launch({headless:true,...require('./browser.cjs')});try{
const p=await b.newPage({viewport:{width:1480,height:1000}}),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(pathToFileURL(resolve(__dirname,'../dist/index.html')).href);await p.waitForFunction(()=>document.querySelector('#run').dataset.state==='complete');
await p.evaluate(()=>{const original=NeuroViz.graph;NeuroViz.graph=options=>{const graph=original(options),refresh=graph.refresh;graph.refresh=()=>{window.refreshes=(window.refreshes||0)+1;refresh()};return graph}});
await p.locator('button[data-view=connectivity]').click();await p.locator('.playback-speed input').fill('0.02');await p.locator('.playback-speed input').dispatchEvent('change');await p.evaluate(()=>{window.refreshes=0;window.ticks=0;window.count=true;const count=()=>{if(window.count){ticks++;requestAnimationFrame(count)}};requestAnimationFrame(count)});await p.locator('#nodes-play').click();await p.waitForTimeout(650);await p.locator('#nodes-play').click();
const budget=await p.evaluate(()=>{window.count=false;return {refreshes,ticks}});a.ok(budget.refreshes<budget.ticks/2,JSON.stringify(budget));
await p.locator('#pin-reference').click();
const tabs=await p.locator('#views button[data-view]').evaluateAll(nodes=>nodes.map(n=>n.dataset.view));
for(const width of [1480,1024,390]){await p.setViewportSize({width,height:900});for(const tab of tabs){await p.locator(`#views button[data-view="${tab}"]`).click();await p.waitForTimeout(50);a.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`${width}: ${tab} overflow`)}}
a.deepEqual(errors,[]);console.log('PASS: all tabs at 3 widths, no JS errors; slow-playback redraw budget',budget);
}finally{await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
