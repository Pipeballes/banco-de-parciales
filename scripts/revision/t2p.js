// t2p.js jobs.json: texto -> PDF. jobs: [{src,out,title,sub,mono}]
const { chromium } = require('playwright'); const fs=require('fs');
(async () => { const b = await chromium.launch(); const p = await b.newPage();
const jobs=JSON.parse(fs.readFileSync(process.argv[2]));
for (const j of jobs){ const t=fs.readFileSync(j.src,'utf8').replace(/\r/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;');
 const mono=j.mono?'font-family:"DejaVu Sans Mono",monospace;font-size:8.5pt':'font-family:"DejaVu Sans",sans-serif;font-size:10.5pt';
 await p.setContent(`<html><head><meta charset="utf-8"></head><body style="margin:0"><h2 style="font-family:DejaVu Sans;font-size:14pt;margin:0 0 4px">${j.title}</h2><div style="font-family:DejaVu Sans;font-size:9pt;color:#666;margin-bottom:14px">${j.sub}</div><pre style="white-space:pre-wrap;${mono};line-height:1.4">${t}</pre></body></html>`);
 await p.pdf({path:j.out,format:'A4',margin:{top:'1.8cm',bottom:'1.8cm',left:'2cm',right:'2cm'}}); }
await b.close(); })();
