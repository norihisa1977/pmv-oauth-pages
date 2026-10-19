// Regression tests use the actual G4 OAuth/viewer source. No credentials or network.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = require('node:path').resolve(__dirname, '..');
const oauth = fs.readFileSync(root + '/pc7c-photo-oauth.js', 'utf8');
const viewer = fs.readFileSync(root + '/pc7c-photo-view.js', 'utf8');
const KEY = 'pmv_g4_pc7c_photo_handoff';
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
let count = 0;
async function test(name, fn) { try { await fn(); console.log('PASS ' + name); count++; } catch (e) { console.error('FAIL ' + name + ': ' + e.message); process.exitCode = 1; } }
function store(opts={}) { const map = new Map(); return {
 getItem(k) { if(opts.getThrows) throw Error('denied'); return map.get(k) ?? null; },
 setItem(k,v) { if(opts.setThrows) throw Error('denied'); if(!opts.dropWrites) map.set(k,v); },
 removeItem(k) { if(opts.removeThrows) throw Error('denied'); map.delete(k); }
}; }
function oauthRun(storage, response) {
 const authorize = { disabled:false }, report = { textContent:'' };
 let callback, navigated = false;
 const ctx = { document:{getElementById:id=>id==='authorize'?authorize:report},
 window:{google:{accounts:{oauth2:{initTokenClient:opts=>{callback=opts.callback;return {requestAccessToken:()=>callback(response)}}}}}},
 google:null, sessionStorage:storage, location:{replace:()=>{navigated=true}}, Date, setTimeout, Promise, Error };
 ctx.google=ctx.window.google;
 vm.runInNewContext(oauth,ctx,{timeout:1000});
 return Promise.resolve(ctx.document.getElementById('authorize').onclick()).then(()=>({report:report.textContent,navigated,authorize}));
}
function consumer(storage) {
 const marker = 'function consumeOAuthHandoff() {';
 const start = viewer.indexOf(marker);
 assert.ok(start>=0);
 const source = viewer.slice(start);
 const ctx={sessionStorage:storage,Date,Error,OAUTH_HANDOFF_KEY:KEY};
 vm.runInNewContext(source+'\nthis.consume=consumeOAuthHandoff;',ctx,{timeout:1000});
 return ()=>ctx.consume();
}
function valid() { const now=Date.now();return JSON.stringify({v:1,scope:SCOPE,token:'FAKE_TEST_TOKEN',created_at:now,expires_at:now+3600000}); }
(async()=>{
 await test('OAuth stores handoff and navigates only after readback',async()=>{const s=store();const r=await oauthRun(s,{access_token:'FAKE_TEST_TOKEN',scope:SCOPE,expires_in:3600});assert.equal(r.navigated,true);assert.equal(r.report,'OAUTH_HANDOFF_STAGED=PASS');assert.ok(s.getItem(KEY));});
 await test('OAuth storage write error blocks navigation',async()=>{const r=await oauthRun(store({setThrows:true}),{access_token:'FAKE_TEST_TOKEN',scope:SCOPE,expires_in:3600});assert.equal(r.navigated,false);assert.match(r.report,/OAUTH_HANDOFF_STORAGE_FAILED/);});
 await test('OAuth readback mismatch blocks navigation',async()=>{const r=await oauthRun(store({dropWrites:true}),{access_token:'FAKE_TEST_TOKEN',scope:SCOPE,expires_in:3600});assert.equal(r.navigated,false);assert.match(r.report,/OAUTH_HANDOFF_STORAGE_FAILED/);});
 await test('Consumer succeeds exactly once',()=>{const s=store();s.setItem(KEY,valid());const c=consumer(s);assert.equal(c().token,'FAKE_TEST_TOKEN');assert.throws(c,/OAUTH_HANDOFF_MISSING/);});
 await test('Missing handoff produces explicit code',()=>assert.throws(consumer(store()),/OAUTH_HANDOFF_MISSING/));
 await test('Storage read failure produces explicit code',()=>assert.throws(consumer(store({getThrows:true})),/OAUTH_HANDOFF_STORAGE_UNAVAILABLE/));
 await test('Malformed handoff rejected and consumed',()=>{const s=store();s.setItem(KEY,'{bad');assert.throws(consumer(s),/OAUTH_HANDOFF_INVALID/);assert.equal(s.getItem(KEY),null);});
 await test('Expired handoff rejected',()=>{const s=store();const now=Date.now();s.setItem(KEY,JSON.stringify({v:1,scope:SCOPE,token:'FAKE',created_at:now-8000,expires_at:now-1000}));assert.throws(consumer(s),/OAUTH_HANDOFF_INVALID/);});
 await test('Storage removal failure is diagnosed',()=>{const st=store({removeThrows:true});st.setItem(KEY,valid());assert.throws(consumer(st),/OAUTH_HANDOFF_STORAGE_UNAVAILABLE/);});
 await test('OAuth rejects missing access token without navigation',async()=>{const r=await oauthRun(store(),{scope:SCOPE,expires_in:3600});assert.equal(r.navigated,false);assert.match(r.report,/ACCESS_TOKEN_MISSING/);});
 await test('OAuth rejects wrong scope without navigation',async()=>{const r=await oauthRun(store(),{access_token:'FAKE_TEST_TOKEN',scope:'other',expires_in:3600});assert.equal(r.navigated,false);assert.match(r.report,/REQUIRED_SCOPE_MISSING/);});
 await test('OAuth rejects invalid expiry without navigation',async()=>{const r=await oauthRun(store(),{access_token:'FAKE_TEST_TOKEN',scope:SCOPE,expires_in:0});assert.equal(r.navigated,false);assert.match(r.report,/TOKEN_EXPIRY_INVALID/);});
 await test('OAuth and viewer use same handoff storage key',()=>{assert.match(oauth,/const HANDOFF_KEY="pmv_g4_pc7c_photo_handoff"/);assert.match(viewer,/const OAUTH_HANDOFF_KEY = "pmv_g4_pc7c_photo_handoff"/);});
 await test('Viewer startup disables password without handoff',()=>{assert.match(viewer,/if \(!sessionStorage\.getItem\(OAUTH_HANDOFF_KEY\)\) \{\s*requireFreshOAuth\(\)/);assert.match(viewer,/OAUTH_HANDOFF_NOT_STAGED=REAUTH_REQUIRED/);});
 await test('Viewer validates password before consuming handoff',()=>{const p=viewer.indexOf('if (!password) throw new Error("PMV_PASSWORD_EMPTY")');const c=viewer.indexOf('const handoff = consumeOAuthHandoff()');assert.ok(p>=0&&c>p);});
 await test('No token or password in error report paths',()=>{assert.ok(!/add\([^\n]*(galleryToken|handoff\.token|passwordEl\.value)/.test(viewer));});
 console.log('REGRESSION_TOTAL='+count+'; RESULT='+(process.exitCode?'FAIL':'PASS'));
})();