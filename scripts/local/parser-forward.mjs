import {createServer} from 'node:net';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';

/** Local harness fixture; fixed Docker exec target, no tokens or document data in argv/logs. */
export function startForward(port=Number(process.env.ATLAS_PARSER_PORT??8083), start=spawn) {
  const server=createServer(socket=>{
    const child=start('docker',['exec','-i',`${process.env.ATLAS_COMPOSE_PROJECT ?? 'atlas-lab'}-docling-parser-1`,'/app/.venv/bin/python','/app/stdio_bridge.py'],{stdio:['pipe','pipe','ignore']});
    socket.setTimeout(50000,()=>socket.destroy());
    socket.pipe(child.stdin);child.stdout.pipe(socket);
    child.stdin.on('error',()=>socket.destroy());
    child.once('error',()=>socket.destroy());
    child.once('exit',()=>socket.destroy());
    socket.once('close',()=>{child.stdin.destroy();child.kill('SIGTERM');});
  });
  server.maxConnections=4;
  server.listen(port,'127.0.0.1');
  return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
 const server=startForward();
 const stop=()=>{server.close();};
 process.once('SIGINT',stop);process.once('SIGTERM',stop);
 server.once('error',()=>{console.error('Local parser forwarding unavailable');process.exitCode=1;});
}
