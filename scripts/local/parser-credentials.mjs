import { createHmac } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
export function parserCredentials() {
  const env=readFileSync('.env','utf8');
  const password=/^LAB_WORKER_DB_PASSWORD=(.+)$/m.exec(env)?.[1];
  if(!password)throw Error('Worker credential missing; run make setup');
  const token=createHmac('sha256',password).update('atlas-docling-parser-v1').digest('hex');
  writeFileSync('.local/parser-token',token,{mode:0o600});
  writeFileSync('.local/parser.env',`PARSER_TOKEN=${token}\n`,{mode:0o600});
}
