#!/usr/bin/env bash
# GÖK ITIL Assessment: IONOS Ubuntu deployment. No production credentials in source.
set -euo pipefail
umask 077
BASE=/opt/goek-itil
DOMAIN=itil.goek.consulting
if [ "$(id -u)" != 0 ]; then echo 'Run as root.'; exit 1; fi
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl unzip git nginx certbot python3-certbot-nginx python3
id goek-itil >/dev/null 2>&1 || useradd --system --home-dir /var/lib/goek-itil --shell /usr/sbin/nologin goek-itil
mkdir -p "$BASE/pb_hooks" "$BASE/pb_migrations" "$BASE/public" /var/lib/goek-itil
if [ ! -x "$BASE/pocketbase" ]; then
  curl --fail --location --proto '=https' --tlsv1.2 https://ganigeorgiev.com/meta/pocketbase/pocketbase/download/v0.41.0/pocketbase_0.41.0_linux_amd64.zip -o /root/goek-pocketbase.zip
  unzip -o /root/goek-pocketbase.zip pocketbase -d "$BASE"
  chmod 755 "$BASE/pocketbase"
fi
if [ ! -d "$BASE/source/.git" ]; then
  git clone https://github.com/GOEKConsulting/GOEK_ITIL_Maturity_Modell.git "$BASE/source"
fi
# Pin the assessed frontend rather than silently deploying an unreviewed later commit.
git -C "$BASE/source" checkout 2ed8c1c8db369fb3e0bd1f706c9696fe5bb3c332
cp -a "$BASE/source"/. "$BASE/public"/
rm -rf "$BASE/public/.git"
chmod -R a+rX "$BASE/public"
# Backend files and the adapter are inserted below by the generated installer.

cat > "$BASE/pb_migrations/1793090000_team_schema.js" <<'GOEK_SCHEMA'
migrate((app) => {
  const users = new Collection({type:'auth', name:'team_users',
    listRule:null, viewRule:'id = @request.auth.id', createRule:null,
    updateRule:'id = @request.auth.id', deleteRule:null,
    fields:[{type:'text',name:'name',required:true,max:120}],
    authRule:'',passwordAuth:{enabled:true,identityFields:['email']}});
  app.save(users);
  app.save(new Collection({type:'base',name:'assessment_projects',
    listRule:null,viewRule:null,createRule:null,updateRule:null,deleteRule:null,
    fields:[
      {type:'text',name:'external_id',required:true,max:200},
      {type:'text',name:'name',max:500},
      {type:'json',name:'data',required:true,maxSize:30000000},
      {type:'select',name:'kind',required:true,maxSelect:1,values:['active','trash']},
      {type:'number',name:'revision',required:true,onlyInt:true,min:1},
      {type:'relation',name:'owner',required:true,collectionId:users.id,maxSelect:1,cascadeDelete:false},
      {type:'relation',name:'access_users',collectionId:users.id,maxSelect:1000,cascadeDelete:false}],
    indexes:['CREATE UNIQUE INDEX idx_assessment_external_id ON assessment_projects (external_id)']}));
  app.save(new Collection({type:'base',name:'user_workspaces',
    listRule:null,viewRule:null,createRule:null,updateRule:null,deleteRule:null,
    fields:[{type:'relation',name:'user',required:true,collectionId:users.id,maxSelect:1,cascadeDelete:true},
      {type:'json',name:'data',required:true,maxSize:1000000}],
    indexes:['CREATE UNIQUE INDEX idx_workspace_user ON user_workspaces (user)']}));
  const settings=app.settings();
  settings.meta.appName='GÖK ITIL Assessment';
  settings.meta.appURL='https://itil.goek.consulting';
  settings.logs.maxDays=14;
  settings.logs.logIP=false;
  settings.rateLimits.enabled=true;
  settings.trustedProxy.headers=['X-Real-IP'];
  settings.backups.cron='0 2 * * *';
  settings.backups.cronMaxKeep=30;
  app.save(settings);
});

GOEK_SCHEMA

cat > "$BASE/pb_hooks/workspace.js" <<'GOEK_WORKSPACE'
// Each custom request is authenticated. Database collections have no public CRUD rules.
const plain=x=>JSON.parse(JSON.stringify(x));
const value=r=>plain(r.publicExport());
function allowed(r,uid){return r.getString('owner')===uid || plain(r.getStringSlice('access_users')).indexOf(uid)>=0;}
function existing(app,id){
  const found=app.findRecordsByFilter('assessment_projects','external_id = {:id}','',1,0,{id:id});
  return found.length ? found[0] : null;
}
function metaRecord(app,uid){
  const found=app.findRecordsByFilter('user_workspaces','user = {:id}','',1,0,{id:uid});
  return found.length ? found[0] : null;
}
function load(e){
  const uid=e.auth.id;
  const rows=e.app.findRecordsByFilter('assessment_projects','owner = {:id} || access_users ?= {:id}','external_id',10000,0,{id:uid});
  const mr=metaRecord(e.app,uid);
  const workspace=mr ? value(mr).data : {};
  workspace.projects=[];workspace.deletedProjects=[];
  const versions={};
  for(const r of rows){const p=value(r);versions[p.external_id]=p.revision;
    if(p.kind==='trash')workspace.deletedProjects.push(p.data);else workspace.projects.push(p.data);}
  if(!workspace.projects.some(p=>p.id===workspace.activeId))workspace.activeId=workspace.projects.length ? workspace.projects[0].id : null;
  return e.json(200,{workspace:workspace,versions:versions,user:{id:uid,name:e.auth.getString('name'),email:e.auth.getString('email')}});
}
function save(e){
  const uid=e.auth.id, body=plain(e.requestInfo().body);
  if(!Array.isArray(body.changes)||body.changes.length>1000||!body.meta||typeof body.meta!=='object'||Array.isArray(body.meta))throw new BadRequestError('Ungültiger Arbeitsstand.');
  const versions={}, seen={};
  e.app.runInTransaction(tx=>{
    for(const c of body.changes){
      if(typeof c.id!=='string'||!c.id||c.id.length>200||seen[c.id])throw new BadRequestError('Ungültige oder doppelte Projekt-ID.');
      seen[c.id]=true;
      const r=existing(tx,c.id);
      if(r&&!allowed(r,uid))throw new ForbiddenError('Kein Zugriff auf dieses Projekt.');
      if(!Number.isInteger(c.expected)||c.expected<0)throw new BadRequestError('Projektversion fehlt.');
      if(r ? c.expected!==r.getInt('revision') : c.expected!==0)throw new ApiError(409,'Das Projekt wurde inzwischen geändert. Bitte lokalen Stand sichern und neu laden.');
      if(c.remove){
        if(!r)throw new ApiError(409,'Das Projekt wurde bereits entfernt.');
        if(r.getString('owner')!==uid||r.getString('kind')!=='trash')throw new ForbiddenError('Nur der Eigentümer kann ein Projekt aus dem Papierkorb endgültig entfernen.');
        tx.delete(r);versions[c.id]=null;continue;
      }
      if(!c.data||typeof c.data!=='object'||!['active','trash'].includes(c.kind))throw new BadRequestError('Projektdaten fehlen.');
      const p=c.kind==='trash'?c.data.project:c.data;
      if(!p||p.id!==c.id||typeof p.name!=='string'||!p.payload||typeof p.payload.assessments!=='object')throw new BadRequestError('Ungültige Bewertungsdaten.');
      if(c.kind==='trash'&&typeof c.data.trashId!=='string')throw new BadRequestError('Papierkorb-ID fehlt.');
      const rec=r||new Record(tx.findCollectionByNameOrId('assessment_projects'));
      if(!r){rec.set('external_id',c.id);rec.set('owner',uid);}
      rec.set('data',c.data);rec.set('kind',c.kind);rec.set('name',p.name);
      const version=r?r.getInt('revision')+1:1;
      rec.set('revision',version);tx.save(rec);versions[c.id]=version;
    }
    const old=metaRecord(tx,uid), mr=old||new Record(tx.findCollectionByNameOrId('user_workspaces'));
    const meta=body.meta;delete meta.projects;delete meta.deletedProjects;
    mr.set('user',uid);mr.set('data',meta);tx.save(mr);
  });
  return e.json(200,{versions:versions});
}
function sharing(e){
  const uid=e.auth.id;
  const rows=e.app.findRecordsByFilter('assessment_projects','owner = {:id}','name',10000,0,{id:uid});
  const users=e.app.findRecordsByFilter('team_users','','name',10000,0);
  return e.json(200,{projects:rows.map(r=>{const p=value(r);return {id:p.external_id,name:p.name,users:p.access_users||[]};}),users:users.map(r=>({id:r.id,name:r.getString('name'),email:r.getString('email')}))});
}
function share(e){
  const body=plain(e.requestInfo().body),uid=e.auth.id;
  if(typeof body.id!=='string'||!Array.isArray(body.users)||body.users.length>1000)throw new BadRequestError('Ungültige Freigabe.');
  e.app.runInTransaction(tx=>{
    const r=existing(tx,body.id);
    if(!r||r.getString('owner')!==uid)throw new ForbiddenError('Nur der Eigentümer kann Zugriffe verwalten.');
    const ids=[...new Set(body.users)];
    for(const id of ids){if(typeof id!=='string')throw new BadRequestError('Ungültiger Benutzer.');tx.findRecordById('team_users',id);}
    r.set('access_users',ids);r.set('revision',r.getInt('revision')+1);tx.save(r);
  });
  return e.json(200,{success:true});
}
module.exports={load:load,save:save,sharing:sharing,share:share};

GOEK_WORKSPACE

cat > "$BASE/pb_hooks/routes.pb.js" <<'GOEK_ROUTES'
routerAdd('GET','/api/goek/workspace',e=>require(__hooks+'/workspace.js').load(e),$apis.requireAuth('team_users'));
routerAdd('POST','/api/goek/workspace',e=>require(__hooks+'/workspace.js').save(e),$apis.requireAuth('team_users'));
routerAdd('GET','/api/goek/sharing',e=>require(__hooks+'/workspace.js').sharing(e),$apis.requireAuth('team_users'));
routerAdd('POST','/api/goek/sharing',e=>require(__hooks+'/workspace.js').share(e),$apis.requireAuth('team_users'));

GOEK_ROUTES

cat > "$BASE/public/server-loader.js" <<'GOEK_LOADER'
const KEY='goek-svs-workspace-fragenkatalog-20261022',AUTH='goek-team-session';
let token=sessionStorage.getItem(AUTH)||'',versions={},baseline=new Map(),queue=Promise.resolve(),pending=0,frozen=false;
const app=document.querySelector('#app');
function stable(x){if(Array.isArray(x))return '['+x.map(stable).join(',')+']';if(x&&typeof x==='object')return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+stable(x[k])).join(',')+'}';return JSON.stringify(x);}
function mapOf(w){const m=new Map();for(const p of w.projects||[])m.set(p.id,{kind:'active',data:p});for(const p of w.deletedProjects||[])m.set(p.project.id,{kind:'trash',data:p});return m;}
async function api(path,data){const r=await fetch(path,{method:data?'POST':'GET',headers:{Authorization:token,...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined,cache:'no-store'});const b=await r.json();if(!r.ok){const e=new Error(b.message||'Speicherung fehlgeschlagen.');e.status=r.status;throw e;}return b;}
function status(text,bad=false){const el=document.querySelector('#server-sync');if(el){el.textContent=text;el.style.color=bad?'#a50021':'#216747';}}
function localBackup(){const raw=localStorage.getItem(KEY);if(!raw)return;const blob=new Blob([JSON.stringify({format:'goek-svs-workspace-backup',format_version:1,exported_at:new Date().toISOString(),workspace:JSON.parse(raw)},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='GOEK-Lokaler-Arbeitsstand-'+Date.now()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
function failure(e){frozen=true;status('Nicht auf dem Server gespeichert',true);if(document.querySelector('#sync-error'))return;const box=document.createElement('div');box.id='sync-error';box.setAttribute('role','alert');box.style.cssText='position:fixed;inset:10px 10px auto 10px;z-index:20000;background:#fff4f4;color:#65152a;border:2px solid #951e38;padding:18px;border-radius:10px;box-shadow:0 3px 20px #0003';const p=document.createElement('p');p.textContent=(e.status===409?'Ein anderer Benutzer hat dieses Projekt geändert. ':e.status===401?'Die Anmeldung ist abgelaufen. ':'Der Server konnte den Arbeitsstand nicht speichern. ')+e.message+' Der lokale Stand bleibt für eine Sicherung erhalten.';box.append(p);const backup=document.createElement('button');backup.textContent='Lokalen Stand sichern';backup.onclick=localBackup;const reload=document.createElement('button');reload.textContent='Serverstand neu laden';reload.onclick=()=>{localBackup();location.reload();};box.append(backup,' ',reload);document.body.append(box);}
function login(){sessionStorage.removeItem(AUTH);localStorage.removeItem(KEY);app.innerHTML='<main class="team-login"><strong>GÖK CONSULTING</strong><h1>ITIL Assessment</h1><p>Gemeinsame Projekte und Bewertungen.</p><form id="team-login"><label>E-Mail<input id="identity" type="email" autocomplete="username" required></label><label>Passwort<input id="password" type="password" autocomplete="current-password" required></label><button type="submit">Anmelden</button><p id="login-error" role="alert"></p></form></main>';document.querySelector('#team-login').onsubmit=async e=>{e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;try{const r=await fetch('/api/collections/team_users/auth-with-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identity:document.querySelector('#identity').value,password:document.querySelector('#password').value})});const b=await r.json();if(!r.ok)throw new Error('Anmeldung fehlgeschlagen. Bitte E-Mail und Passwort prüfen.');sessionStorage.setItem(AUTH,b.token);location.reload();}catch(err){document.querySelector('#login-error').textContent=err.message;button.disabled=false;}};}
window.goekPersistWorkspace=function(workspace){const snapshot=structuredClone(workspace);localStorage.setItem(KEY,JSON.stringify(snapshot));pending++;status('Wird zentral gespeichert …');const task=queue.then(async()=>{if(frozen)throw new Error('Bitte zuerst den lokalen Stand sichern und neu laden.');const now=mapOf(snapshot),changes=[];for(const [id,p]of now){if(!baseline.has(id)||stable(baseline.get(id))!==stable(p))changes.push({id,expected:versions[id]||0,kind:p.kind,data:p.data});}for(const [id,p]of baseline){if(!now.has(id))changes.push({id,expected:versions[id],remove:true});}const meta={...snapshot};delete meta.projects;delete meta.deletedProjects;const result=await api('/api/goek/workspace',{changes,meta});for(const [id,revision]of Object.entries(result.versions)){if(revision===null)delete versions[id];else versions[id]=revision;}baseline=mapOf(snapshot);status('Zentral gespeichert · '+new Date().toLocaleTimeString('de-DE'));});queue=task.catch(e=>{failure(e);}).finally(()=>{pending--;});return task;};
window.addEventListener('beforeunload',e=>{if(pending){e.preventDefault();e.returnValue='';}});
const style=document.createElement('style');style.textContent='.team-login{max-width:440px;margin:10vh auto;padding:36px;background:#fff;border:1px solid #ddd;border-radius:18px}.team-login strong{color:#951e38}.team-login label{display:block;margin:18px 0}.team-login input{display:block;width:100%;padding:12px;margin-top:6px;border:1px solid #aaa;border-radius:6px}.team-login button{background:#951e38;color:white;padding:12px 20px;border:0;border-radius:6px}.team-bar{position:fixed;bottom:10px;right:16px;z-index:10000;max-width:95vw;display:flex;gap:12px;align-items:center;flex-wrap:wrap;background:white;border:1px solid #ddd;border-radius:10px;padding:10px 16px;font:13px system-ui;box-shadow:0 2px 8px #0002}.team-bar a{color:#951e38}.team-bar button{padding:5px 9px}';document.head.append(style);
if(!token)login();else{try{const b=await api('/api/goek/workspace');versions=b.versions;baseline=mapOf(b.workspace);localStorage.setItem(KEY,JSON.stringify(b.workspace));const bar=document.createElement('div');bar.className='team-bar';const user=document.createElement('span');user.textContent=b.user.name||b.user.email;const sync=document.createElement('span');sync.id='server-sync';sync.textContent='Zentral verbunden';const share=document.createElement('a');share.href='/sharing.html';share.textContent='Projektzugriffe';const logout=document.createElement('button');logout.textContent='Abmelden';logout.onclick=()=>{if(pending||frozen)localBackup();sessionStorage.removeItem(AUTH);localStorage.removeItem(KEY);location.reload();};bar.append(user,sync,share,logout);document.body.append(bar);await import('./main.js');}catch(e){if(e.status===401){login();}else{app.textContent='Die Anwendung konnte nicht geladen werden: '+e.message;}}}

GOEK_LOADER

cat > "$BASE/public/sharing.html" <<'GOEK_SHARINGHTML'
<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Projektzugriffe · GÖK</title><link rel="stylesheet" href="/styles.css"></head><body><main style="max-width:800px;margin:50px auto;padding:24px"><a href="/">← Zur Bewertung</a><h1>Projektzugriffe</h1><p>Als Eigentümer kannst du vorhandenen Teammitgliedern Zugriff auf deine Projekte geben.</p><label>Projekt <select id="project"></select></label><form id="access"><div id="users"></div><button type="submit" class="btn btn-primary">Zugriffe speichern</button></form><p id="status" role="status"></p></main><script type="module" src="/sharing.js"></script></body></html>

GOEK_SHARINGHTML

cat > "$BASE/public/sharing.js" <<'GOEK_SHARINGJS'
const token=sessionStorage.getItem('goek-team-session');if(!token)location.replace('/');
async function api(path,data){const r=await fetch(path,{method:data?'POST':'GET',headers:{Authorization:token,...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined});const b=await r.json();if(!r.ok)throw new Error(b.message||'Zugriff fehlgeschlagen');return b;}
const status=document.querySelector('#status');
try{const b=await api('/api/goek/sharing');const select=document.querySelector('#project'),list=document.querySelector('#users');for(const p of b.projects){const o=document.createElement('option');o.value=p.id;o.textContent=p.name;select.append(o);}function render(){list.replaceChildren();const p=b.projects.find(p=>p.id===select.value);for(const u of b.users){const label=document.createElement('label');label.style.cssText='display:block;padding:10px 0';const box=document.createElement('input');box.type='checkbox';box.value=u.id;box.checked=Boolean(p?.users.includes(u.id));label.append(box,' '+u.name+' ('+u.email+')');list.append(label);}}select.onchange=render;render();document.querySelector('#access').onsubmit=async e=>{e.preventDefault();try{await api('/api/goek/sharing',{id:select.value,users:[...list.querySelectorAll('input:checked')].map(el=>el.value)});status.textContent='Projektzugriffe gespeichert. Die Bewertung bitte neu laden.';}catch(err){status.textContent=err.message;}};if(!b.projects.length)status.textContent='Du hast noch keine eigenen Projekte. Lege zunächst eine Bewertung an.';}catch(e){status.textContent=e.message;}

GOEK_SHARINGJS

cat > "$BASE/verify.py" <<'GOEK_TEST'
"""Integration checks against an isolated PocketBase database; no production credentials."""
import concurrent.futures, json, os, pathlib, secrets, subprocess, sys, tempfile, time, urllib.request, urllib.error

base=pathlib.Path(sys.argv[1]); temporary=tempfile.TemporaryDirectory(prefix='goek-itil-test-')
data=pathlib.Path(temporary.name)/'data'; password=secrets.token_urlsafe(24)
flags=['--dir='+str(data),'--migrationsDir='+str(base/'pb_migrations'),'--hooksDir='+str(base/'pb_hooks')]
subprocess.run([str(base/'pocketbase'),'migrate','up',*flags],check=True,stdout=subprocess.DEVNULL)
subprocess.run([str(base/'pocketbase'),'superuser','create','test@example.invalid',password,*flags],check=True,stdout=subprocess.DEVNULL)
log=open(pathlib.Path(temporary.name)/'server.log','w+')
process=subprocess.Popen([str(base/'pocketbase'),'serve','--http=127.0.0.1:8099',*flags],stdout=log,stderr=subprocess.STDOUT)
checks=0
def call(path,payload=None,token=None,method=None):
    headers={'Content-Type':'application/json'}
    if token:headers['Authorization']=token
    req=urllib.request.Request('http://127.0.0.1:8099'+path,data=None if payload is None else json.dumps(payload).encode(),headers=headers,method=method)
    try:
        with urllib.request.urlopen(req,timeout=15) as response:return response.status,json.load(response)
    except urllib.error.HTTPError as error:return error.code,json.load(error)
def expect(condition,label):
    global checks
    assert condition,label
    checks+=1
try:
    for _ in range(60):
        try:
            if call('/api/health')[0]==200:break
        except OSError:pass
        time.sleep(.25)
    status,root=call('/api/collections/_superusers/auth-with-password',{'identity':'test@example.invalid','password':password})
    expect(status==200,'test administrator login')
    users=[]
    for n in range(3):
        email='user'+str(n)+'@example.invalid'
        status,user=call('/api/collections/team_users/records',{'email':email,'password':password,'passwordConfirm':password,'name':'Test '+str(n)},root['token'])
        expect(status==200,'create isolated team user')
        time.sleep(3.2)  # Respect the enabled authentication rate limit.
        status,auth=call('/api/collections/team_users/auth-with-password',{'identity':email,'password':password})
        expect(status==200,'team user login: '+str(status)+' '+str(auth))
        users.append((user,auth['token']))
    a,b,c=[row[1] for row in users]
    expect(call('/api/goek/workspace')[0]==401,'anonymous workspace denied')
    expect(call('/api/collections/team_users/records',{'email':'intruder@example.invalid','password':password,'passwordConfirm':password,'name':'No'})[0] in (400,403),'public registration denied')
    project={'id':'integration-project','name':'Test project','payload':{'assessments':{'test':{}}}}
    change={'id':project['id'],'expected':0,'kind':'active','data':project}
    status,saved=call('/api/goek/workspace',{'changes':[change],'meta':{'activeId':project['id']}},a)
    expect(status==200 and saved['versions'][project['id']]==1,'project persisted: '+str(status)+' '+str(saved))
    expect(call('/api/goek/workspace',token=b)[1]['workspace']['projects']==[],'unshared project hidden')
    expect(call('/api/goek/workspace',{'changes':[dict(change,expected=1)],'meta':{}},b)[0]==403,'unauthorized mutation denied')
    expect(call('/api/goek/sharing',{'id':project['id'],'users':[users[1][0]['id']]},a)[0]==200,'owner can share project')
    loaded=call('/api/goek/workspace',token=b)[1]
    expect(loaded['workspace']['projects'][0]==project,'shared project visible on another account')
    expect(call('/api/goek/sharing',{'id':project['id'],'users':[users[2][0]['id']]},b)[0]==403,'member cannot broaden access')
    change['expected']=loaded['versions'][project['id']]
    change['data']=dict(project,name='Changed by member')
    expect(call('/api/goek/workspace',{'changes':[change],'meta':{}},b)[0]==200,'member can edit shared project')
    expect(call('/api/goek/workspace',{'changes':[change],'meta':{}},a)[0]==409,'stale client cannot overwrite')
    current=call('/api/goek/workspace',token=a)[1]
    expect(current['workspace']['projects'][0]['name']=='Changed by member','conflict preserves saved data')
    change['expected']=current['versions'][project['id']]
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        codes=list(pool.map(lambda _:call('/api/goek/workspace',{'changes':[change],'meta':{}},a)[0],range(2)))
    expect(sorted(codes)==[200,409],'concurrent writes serialized without lost update')
    expect(call('/api/goek/workspace',token=c)[1]['workspace']['projects']==[],'third account remains isolated')
    expect(call('/api/collections/assessment_projects/records',token=b)[0]==403,'direct collection access denied')
    current=call('/api/goek/workspace',token=a)[1]
    row={'trashId':'test-trash','deletedAt':'2026-10-27','project':current['workspace']['projects'][0]}
    change=dict(id=project['id'],expected=current['versions'][project['id']],kind='trash',data=row)
    expect(call('/api/goek/workspace',{'changes':[change],'meta':{}},a)[0]==200,'soft delete retained')
    current=call('/api/goek/workspace',token=b)[1]
    expect(current['workspace']['deletedProjects'][0]==row,'trash preserved across users')
    deletion={'id':project['id'],'expected':current['versions'][project['id']],'remove':True}
    expect(call('/api/goek/workspace',{'changes':[deletion],'meta':{}},b)[0]==403,'member cannot purge owner project')
    expect(call('/api/goek/workspace',{'changes':[deletion],'meta':{}},a)[0]==200,'owner can purge confirmed trash')
    expect(call('/api/goek/workspace',token=b)[1]['workspace']['deletedProjects']==[],'purge visible to shared user')
    print('PASS:',checks,'authentication, persistence, permission, concurrency and trash checks')
finally:
    process.terminate()
    process.wait(timeout=10)
    if sys.exc_info()[0]:
        log.seek(0)
        print(log.read()[-8000:])
    log.close();temporary.cleanup()

GOEK_TEST

python3 - "$BASE/public" <<'PY_PATCH'
from pathlib import Path
import sys
p=Path(sys.argv[1]); index=(p/'index.html').read_text(); main=(p/'main.js').read_text()
assert index.count('src="./main.js"')==1,'Unexpected index entry point'
assert main.count('function persistWorkspace(){')==1,'Unexpected persistence function'
assert main.count('localStorage.setItem(STORAGE_KEY,JSON.stringify(workspace));')==1,'Unexpected storage adapter'
(p/'index.html').write_text(index.replace('src="./main.js"','src="./server-loader.js"'))
main=main.replace('function persistWorkspace(){','async function persistWorkspace(){',1)
main=main.replace('localStorage.setItem(STORAGE_KEY,JSON.stringify(workspace));','await window.goekPersistWorkspace(workspace);',1)
main=main.replace('aus diesem Browser','aus dem gemeinsamen Arbeitsstand').replace('im Browser entfernt','im gemeinsamen Arbeitsstand entfernt')
(p/'main.js').write_text(main)
PY_PATCH
python3 "$BASE/verify.py" "$BASE"
chown -R root:root "$BASE"
chmod -R a+rX "$BASE"
chown -R goek-itil:goek-itil /var/lib/goek-itil
chmod 700 /var/lib/goek-itil
cat > /etc/systemd/system/goek-itil.service <<'UNIT'
[Unit]
Description=GOEK ITIL Assessment
After=network-online.target
Wants=network-online.target
[Service]
Type=simple
User=goek-itil
Group=goek-itil
WorkingDirectory=/opt/goek-itil
Environment=TZ=Europe/Berlin
Environment=GOMEMLIMIT=768MiB
ExecStart=/opt/goek-itil/pocketbase serve --http=127.0.0.1:8090 --dir=/var/lib/goek-itil --publicDir=/opt/goek-itil/public --hooksDir=/opt/goek-itil/pb_hooks --migrationsDir=/opt/goek-itil/pb_migrations --automigrate=false --origins=https://itil.goek.consulting
Restart=on-failure
RestartSec=3
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/goek-itil
LimitNOFILE=4096
[Install]
WantedBy=multi-user.target
UNIT
cat > /etc/nginx/sites-available/goek-itil <<'NGINX'
server {
    listen 80;
    server_name itil.goek.consulting;
    client_max_body_size 32m;
    location / {
        proxy_pass http://127.0.0.1:8090;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
        add_header X-Content-Type-Options nosniff always;
        add_header Referrer-Policy same-origin always;
        add_header X-Frame-Options DENY always;
    }
}
NGINX
ln -sf /etc/nginx/sites-available/goek-itil /etc/nginx/sites-enabled/goek-itil
if [ -L /etc/nginx/sites-enabled/default ]; then rm /etc/nginx/sites-enabled/default; fi
nginx -t
systemctl daemon-reload
systemctl enable --now goek-itil nginx
systemctl restart goek-itil
systemctl reload nginx
sleep 2
curl --fail http://127.0.0.1:8090/api/health
printf '\nBackend installed and integration checks passed.\n'
printf 'Next: issue HTTPS certificate, then create the first administrator and team account.\n'
# Intentionally do not accept certificate authority terms or create production passwords automatically.
