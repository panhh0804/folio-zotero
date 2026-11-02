const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');

const project=path.resolve(__dirname,'..');
function fixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'folio-publication-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.mkdirSync(path.join(root,'scripts'));
  for(const name of ['.gitignore','scripts/audit-public.py'])fs.copyFileSync(path.join(project,name),path.join(root,name));
  const run=(command,args)=>spawnSync(command,args,{cwd:root,encoding:'utf8'});
  const git=(...args)=>{const result=run('git',args);assert.equal(result.status,0,result.stderr);return result;};
  git('init','-q','-b','main');
  fs.writeFileSync(path.join(root,'README.md'),'Public source fixture.\n');
  git('add','.gitignore','README.md','scripts/audit-public.py');
  return {root,git,write:(name,value)=>{const file=path.join(root,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,value);},audit:(...args)=>run('python3',['scripts/audit-public.py',...args])};
}
function rejectsWithoutDisclosure(result,value){
  assert.notEqual(result.status,0);
  assert.ok(!result.stdout.includes(value));
  assert.ok(!result.stderr.includes(value));
}

test('publication audit accepts public files and excludes local profiles, papers, credentials and packages',t=>{
  const f=fixture(t);
  for(const name of ['.env.local','logins.json','key4.db','prefs.js','private.pdf','verification/paper.pdf','.test-profile/prefs.js','dist/Folio.xpi','scripts/local-only.js'])f.write(name,'local-only fixture');
  const result=f.audit();assert.equal(result.status,0,result.stderr);
  const candidates=f.git('ls-files','--cached','--others','--exclude-standard').stdout;
  assert.ok(!candidates.includes('local-only.js'));assert.ok(!candidates.includes('private.pdf'));assert.ok(!candidates.includes('logins.json'));
});
test('audit detects a staged secret even after the working copy is cleaned',t=>{
  const f=fixture(t),secret='sk-'+'a'.repeat(32);
  f.write('README.md',secret);f.git('add','README.md');f.write('README.md','Clean working content.\n');
  rejectsWithoutDisclosure(f.audit(),secret);
});
test('audit detects an unstaged personal path without displaying its value',t=>{
  const f=fixture(t),privatePath=['','Users','example-person','Documents','paper.pdf'].join('/');
  f.write('README.md',privatePath);rejectsWithoutDisclosure(f.audit(),privatePath);
});
test('audit rejects unexpected publication files even without recognizable secret formats',t=>{
  const f=fixture(t);f.write('credentials.json','{"value":"local-only"}');
  const result=f.audit();assert.notEqual(result.status,0);assert.match(result.stderr,/not in public source allowlist/);
});
test('audit rejects symlinked public files rather than packaging their targets',t=>{
  const f=fixture(t);f.write('private.tmp','private target fixture');fs.unlinkSync(path.join(f.root,'README.md'));fs.symlinkSync('private.tmp',path.join(f.root,'README.md'));
  const result=f.audit();assert.notEqual(result.status,0);assert.match(result.stderr,/symbolic link/);
});
test('audit detects literal generic credentials without disclosing them',t=>{
  const f=fixture(t),secret='credential-value-'+'b'.repeat(24);
  f.write('README.md',`api_key = "${secret}"\n`);rejectsWithoutDisclosure(f.audit(),secret);
});
test('history audit finds a removed secret in previous commits',t=>{
  const f=fixture(t),secret='ghp_'+'c'.repeat(36);
  f.write('README.md',secret);f.git('add','README.md');
  f.git('-c','user.name=Folio fixture','-c','user.email=fixture@example.com','commit','-qm','History fixture');
  f.write('README.md','Clean current source.\n');f.git('add','README.md');
  assert.equal(f.audit().status,0);rejectsWithoutDisclosure(f.audit('--history'),secret);
});
test('approved media paths cannot disguise arbitrary text as an image',t=>{
  const f=fixture(t);f.write('docs/media/overview.png','This is not a PNG image.');
  const result=f.audit();assert.notEqual(result.status,0);assert.match(result.stderr,/invalid publication media format/);
});
test('publication audit rejects oversized demonstration GIFs',t=>{
  const f=fixture(t),data=Buffer.alloc(8*1024*1024+1);data.write('GIF89a');f.write('docs/media/ai-review.gif',data);
  const result=f.audit();assert.notEqual(result.status,0);assert.match(result.stderr,/exceeds 8 MiB/);
});
