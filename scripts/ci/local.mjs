import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

export function plan(env='dev') {
  if(env!=='dev')throw Error('Local development checks require ENV=dev');
  return [
    ['setup'],['check'],['architecture-test'],['ci-policy-test'],['contracts-validate'],
    ['test-tools'],['test-java'],['build-ui'],['test-frontend'],['parser-test'],
    ['up'],['test-integration'],['test-e2e'],['install-trivy'],['security'],
    ['k8s-tools'],['k8s-setup'],['k8s-build'],['k8s-up'],['k8s-test'],['k8s-security'],
    ['helm-tools'],['helm-setup'],['helm-build'],['helm-lint'],['helm-up'],
    ['helm-test-dev'],['helm-security-dev'],
  ].map(args=>[...args,'ENV=dev']);
}
export function run(env=process.env.ENV??'dev', execute=spawnSync, save=writeFileSync) {
  const commands=plan(env);
  const revision=execute('git',['rev-parse','HEAD'],{encoding:'utf8'});
  const tree=execute('git',['status','--porcelain'],{encoding:'utf8'});
  if(revision.status!==0||tree.status!==0)throw Error('Cannot identify tested source');
  if(tree.stdout.trim())throw Error('Commit the candidate before local CI so evidence identifies the exact tree');
  const candidate=revision.stdout.trim().slice(0,12);
  const isolated={...process.env,ENV:'dev',ATLAS_COMPOSE_PROJECT:`atlas-ci-${candidate}`,ATLAS_CLUSTER:`atlas-ci-${candidate}`,ATLAS_RUNTIME_ROOT:`.local/ci-${candidate}`,
    ATLAS_POSTGRES_PORT:'15432',ATLAS_STORAGE_PORT:'19000',ATLAS_KAFKA_PORT:'19092',ATLAS_API_PORT:'18080',ATLAS_ASSET_PORT:'18081',ATLAS_WORKER_PORT:'18082',ATLAS_PARSER_PORT:'18083',ATLAS_UI_PORT:'15173',
    ASSET_DB_URL:'jdbc:postgresql://localhost:15432/assets',WORKER_DB_URL:'jdbc:postgresql://localhost:15432/worker_checkpoint',LAB_OBJECT_ENDPOINT:'http://localhost:19000',KAFKA_BOOTSTRAP:'localhost:19092'};
  const report={commit:revision.stdout.trim(),dirty:tree.stdout.trim()!=='',environment:'dev',
    startedAt:new Date().toISOString(),checks:[],complete:false};
  for(const args of commands) {
    const result=execute('make',args,{stdio:'inherit',env:isolated});
    report.checks.push({command:['make',...args],passed:result.status===0});
    save('.local/ci/evidence.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});
    if(result.status!==0)throw Error(`Local check failed: make ${args[0]}`);
  }
  report.complete=true;
  save('.local/ci/evidence.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});
  return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  try { plan(process.env.ENV??'dev');mkdirSync('.local/ci',{recursive:true});run(); }
  catch(error){console.error(error.message);process.exitCode=1;}
}
