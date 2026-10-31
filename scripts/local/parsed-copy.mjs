import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { directory, environment } from '../helm/runtime.mjs';
import { token, guard, kubectlTool, root, context } from '../k8s/runtime.mjs';

export function argumentsFor(env, id, format = 'markdown', tenant = 'a', version = '2') {
  environment(env);
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id ?? ''))
    throw Error('ASSET_ID must be a canonical UUID');
  if (!['markdown', 'json'].includes(format)) throw Error('FORMAT must be markdown or json');
  if (!['a', 'b'].includes(tenant)) throw Error('TENANT must be a or b');
  if (!['1','2'].includes(version)) throw Error('PARSED_API_VERSION must be 1 or 2');
  return `/api/v${version}/assets/${id}/parsed?format=${format}`;
}

export function forward(env, start = spawn, check = guard, timeout = 15000) {
  check();
  const child = start(kubectlTool,['--kubeconfig',`${root}/kubeconfig`,'--context',context,'-n',`atlas-${env}`,
    'port-forward','--address=127.0.0.1','service/workspace-api',':8080'],{stdio:['ignore','pipe','pipe']});
  const ready = new Promise((resolve,reject)=>{
    let output='';
    const timer=setTimeout(()=>reject(Error('API forwarding timed out')),timeout);
    child.stdout.on('data',chunk=>{output+=chunk;const match=/127\.0\.0\.1:(\d+) ->/.exec(output);if(match){clearTimeout(timer);resolve(Number(match[1]));}});
    child.once('error',()=>{clearTimeout(timer);reject(Error('API forwarding failed'));});
    child.once('exit',()=>{clearTimeout(timer);reject(Error('API forwarding stopped'));});
  });
  return {ready, close:()=>child.kill('SIGTERM')};
}

export async function main(env=process.env.ENV ?? 'dev', id=process.env.ASSET_ID,
  format=process.env.FORMAT ?? 'markdown', tenant=process.env.TENANT ?? 'a',
  dependencies={forward,issue:token,request:fetch,write:text=>process.stdout.write(text)}) {
  const path = argumentsFor(env,id,format,tenant,process.env.PARSED_API_VERSION ?? '2');
  const connection = dependencies.forward(env);
  try {
    const port = await connection.ready;
    const response=await dependencies.request(`http://127.0.0.1:${port}${path}`,{
      headers:{Authorization:`Bearer ${dependencies.issue(tenant,directory(env))}`},signal:AbortSignal.timeout(20000)});
    if(!response.ok)throw Error(`Parsed copy unavailable: HTTP ${response.status}`);
    const data=await response.text();
    dependencies.write(data.endsWith('\n')?data:data+'\n');
  } finally { connection.close(); }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
  main().catch(error=>{console.error(error.message);process.exitCode=1;});
