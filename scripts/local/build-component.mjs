import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
export function build(component=process.env.SERVICE,execute=spawnSync) {
 const modules={'workspace-api':'workspace-api','asset-service':'asset-service','processing-worker':'processing-worker'};
 let command,args;
 if(Object.hasOwn(modules,component)) {command='./gradlew';args=[`:${component}:assemble`,'--no-daemon'];}
 else if(component==='portal-ui'){command='pnpm';args=['--filter','@atlas/portal-ui','build'];}
 else if(component==='docling-parser'){command='docker';args=['build','--provenance=false','-t','atlas/docling-parser:candidate','services/docling-parser'];}
 else throw Error('SERVICE must name an application component');
 const result=execute(command,args,{stdio:'inherit'});if(result.error||result.status!==0)throw Error('Independent component build failed');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)try{build();}catch(error){console.error(error.message);process.exitCode=1;}
