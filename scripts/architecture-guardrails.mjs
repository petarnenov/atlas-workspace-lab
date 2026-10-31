import {readFileSync, readdirSync, existsSync} from 'node:fs';
import {resolve, basename} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

const roles = ['domain','application','port','inbound','outbound','bootstrap'];
const safePath = value => typeof value === 'string' && /^[a-zA-Z0-9_./-]+$/.test(value) && !value.startsWith('/') && !value.split('/').includes('..');
function exact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join() !== [...keys].sort().join()) throw Error('Invalid architecture policy/baseline fields');
}
export function validatePolicy(policy) {
  exact(policy,['version','roots','files','providerContracts']);
  if(policy.version!==1 || !Array.isArray(policy.roots) || !policy.roots.length || !Array.isArray(policy.providerContracts)) throw Error('Invalid policy version/roots');
  exact(policy.files,Object.keys(policy.files ?? {}));
  for(const path of [...policy.roots,...policy.providerContracts,...Object.keys(policy.files)]) if(!safePath(path)) throw Error('Unsafe policy path');
  if(new Set(policy.roots).size!==policy.roots.length || new Set(policy.providerContracts).size!==policy.providerContracts.length) throw Error('Duplicate policy root/contract');
  for(const role of Object.values(policy.files)) if(!roles.includes(role)) throw Error('Invalid layer role');
  return policy;
}

// Lexical guard, not a Java/Python compiler. Preserve offsets/newlines while
// removing comments and strings from executable-token checks. Keep literal data
// separately for SQL and provider-schema checks; handle text blocks/triple quotes.
export function lex(source, python=false) {
  const literals=[];
  const pattern=python ? /#[^\n]*|("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g
    : /\/\/[^\n]*|\/\*[\s\S]*?\*\/|("""[\s\S]*?"""|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g;
  const code=source.replace(pattern,(text,literal,offset)=>{
    if(literal) literals.push({value:text,offset});
    return text.replace(/[^\n]/g,' ');
  });
  return {code,literals};
}
function roleFor(path,policy) {
  if(policy.files[path]) return policy.files[path];
  const names={domain:'domain',application:'application',ports:'port',bootstrap:'bootstrap'};
  if(/\/adapters\/in\//.test(path)) return 'inbound';
  if(/\/adapters\/out\//.test(path)) return 'outbound';
  for(const [part,role] of Object.entries(names)) if(path.includes('/'+part+'/')) return role;
  return null;
}
function finding(path,rule,fragment,line=1) {
  const normalized=fragment.trim().replace(/\s+/g,' ');
  return {path,rule,hash:createHash('sha256').update(normalized).digest('hex'),fragment:normalized,line};
}
export function inspectSource(path,source,role,adapterTypes=[]) {
  if(!role) return [finding(path,'UNCLASSIFIED_SOURCE',path)];
  const {code,literals}=lex(source,path.endsWith('.py'));
  const core=['domain','application','port'].includes(role), output=[];
  const emit=(rule,fragment,offset)=>output.push(finding(path,rule,fragment,source.slice(0,offset).split('\n').length));
  let offset=0;
  for(const line of code.split('\n')) {
    if(core && /\b(?:org\.springframework|java\.sql|javax\.sql|java\.net\.http|java\.nio\.file|software\.amazon|com\.fasterxml|docling(?:\.|\b)|sqlite3|boto3|requests|httpx)\b|\.adapters\./.test(line)) emit('CORE_INFRA_DEPENDENCY',line,offset);
    if(core && /\b(?:ParserClient|ObjectsStore|DoclingDocument|DocumentConverter|S3Client|JdbcTemplate|TransactionTemplate|HttpClient|Files|Path)\b/.test(line)) emit('CORE_CONCRETE_PROVIDER',line,offset);
    if(core && adapterTypes.some(type=>new RegExp('\\b'+type+'\\b').test(line))) emit('CORE_ADAPTER_TYPE',line,offset);
    if((core||role==='inbound') && /\.\s*(?:query|queryForList|queryForMap|queryForObject|update|execute|executeWithoutResult)\s*\(/.test(line)) emit('PERSISTENCE_IN_POLICY_OR_INBOUND',line,offset);
    if(core && /\b(?:if|switch)\s*\(.*(?:[Dd]ocling|[Ss]3|[Pp]ostgres)/.test(line)) emit('PROVIDER_BRANCH',line,offset);
    offset+=line.length+1;
  }
  for(const {value,offset:at} of literals) {
    if((core||role==='inbound') && /\b(?:SELECT\s+.+\s+FROM|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|CREATE\s+TABLE|TRUNCATE\s+)\b/i.test(value)) emit('SQL_IN_POLICY_OR_INBOUND',value,at);
    if(core && /docling|tablefc0f2d45|heron8f39ad3c/i.test(value)) emit('CORE_PROVIDER_LITERAL',value,at);
  }
  return output;
}
function walk(root,path,files=[]) {
  for(const entry of readdirSync(resolve(root,path),{withFileTypes:true})) {
    if(['build','node_modules','.venv','__pycache__','tests','test','k8sProbeTest'].includes(entry.name)) continue;
    const child=path+'/'+entry.name;
    if(entry.isDirectory()) walk(root,child,files);
    else if(/\.(java|py)$/.test(child)) files.push(child);
  }
  return files;
}
export function inventory(root,policy) {
  validatePolicy(policy);
  for(const path of [...policy.roots,...Object.keys(policy.files),...policy.providerContracts]) if(!existsSync(resolve(root,path))) throw Error('Missing declared path: '+path);
  const sources=[...new Set(policy.roots.flatMap(path=>walk(root,path)))].sort();
  for(const path of Object.keys(policy.files)) if(!sources.includes(path)) throw Error('Declared source outside roots: '+path);
  const adapterTypes=sources.filter(path=>['inbound','outbound','bootstrap'].includes(roleFor(path,policy))).map(path=>basename(path).replace(/\.(java|py)$/,''));
  const output=sources.flatMap(path=>inspectSource(path,readFileSync(resolve(root,path),'utf8'),roleFor(path,policy),adapterTypes));
  for(const path of readdirSync(resolve(root,'contracts/openapi')).filter(p=>p.endsWith('.json')).sort()) {
    const file='contracts/openapi/'+path;
    const doc=JSON.parse(readFileSync(resolve(root,file),'utf8'));
    if(!policy.providerContracts.includes(file) && /DoclingDocument|docling/i.test(JSON.stringify(doc))) output.push(finding(file,'PROVIDER_CORE_CONTRACT',JSON.stringify(doc)));
  }
  return output;
}
export function evaluate(findings,baseline,{strict=false,today=new Date().toISOString().slice(0,10)}={}) {
  exact(baseline,['version','approval','entries']);
  if(baseline.version!==1 || !Array.isArray(baseline.entries)) throw Error('Invalid baseline');
  const errors=[], counts=new Map(), debt=[];
  const key=x=>[x.path,x.rule,x.hash].join(':');
  for(const f of findings) counts.set(key(f),(counts.get(key(f))??0)+1);
  const seen=new Set();
  for(const entry of baseline.entries) {
    exact(entry,['path','rule','hash','count','owner','rationale','story','reviewBy']);
    if(!safePath(entry.path) || !/^[a-f0-9]{64}$/.test(entry.hash) || !Number.isInteger(entry.count) || entry.count<1 || !entry.owner?.trim() || !entry.rationale?.trim() || !/^LAB-\d+$/.test(entry.story) || !/^\d{4}-\d{2}-\d{2}$/.test(entry.reviewBy) || Number.isNaN(Date.parse(entry.reviewBy)) || new Date(entry.reviewBy).toISOString().slice(0,10)!==entry.reviewBy || entry.reviewBy>'2026-11-30') throw Error('Invalid debt entry');
    const id=key(entry);
    if(seen.has(id)) errors.push('Duplicate baseline: '+id);
    seen.add(id);
    if(entry.reviewBy<today) errors.push('Expired debt: '+id);
    const count=counts.get(id)??0;
    if(count!==entry.count) errors.push((count<entry.count?'Stale/decreased':'Increased')+' baseline: '+id);
    counts.delete(id);
    debt.push(entry);
  }
  for(const id of counts.keys()) errors.push('New violation: '+id);
  if(baseline.entries.length && baseline.approval!=='owner-reviewed') errors.push('Initial debt inventory requires explicit owner approval');
  if(!['pending','owner-reviewed'].includes(baseline.approval)) throw Error('Invalid approval status');
  if(strict && findings.length) errors.push('Strict audit: '+findings.length+' findings');
  return {errors,debt};
}
export function run(root=process.cwd(),mode='check') {
  if(!['check','audit','inventory'].includes(mode)) throw Error('Use check, audit or inventory (no auto-accept mode)');
  const policy=JSON.parse(readFileSync(resolve(root,'docs/architecture/policy.json'),'utf8'));
  const findings=inventory(root,policy);
  if(mode==='inventory') { console.log(JSON.stringify(findings,null,2)); return 0; }
  const baseline=JSON.parse(readFileSync(resolve(root,'docs/architecture/debt-baseline.json'),'utf8'));
  const result=evaluate(findings,baseline,{strict:mode==='audit'});
  for(const f of findings) console.log(`DEBT ${f.path}:${f.line} ${f.rule} ${f.hash}`);
  for(const error of result.errors) console.error(error);
  console.log(`${findings.length} findings; ratchet is not full architectural compliance. Semantic wiring and substitution require tests/review.`);
  return result.errors.length?1:0;
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  try {process.exitCode=run(process.cwd(),process.argv[2]??'check');}
  catch(error) {console.error(error.message);process.exitCode=1;}
}
