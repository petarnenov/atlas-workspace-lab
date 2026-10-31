import assert from 'node:assert/strict';
import test from 'node:test';
import {plan,run} from './local.mjs';
test('local plan includes quality, real-runtime and security gates in dev only',()=>{
 const commands=plan();
 for(const name of ['check','contracts-validate','parser-test','test-integration','test-e2e','k8s-test','k8s-security','helm-test-dev','helm-security-dev'])
  assert.ok(commands.some(args=>args[0]===name));
 assert.ok(commands.every(args=>args.at(-1)==='ENV=dev'));
 for(const env of ['prod','production','',null])assert.throws(()=>plan(env));
});
test('check failures stop subsequent work and cannot produce complete evidence',()=>{
 const calls=[],reports=[];
 const execute=(cmd,args)=>{calls.push([cmd,args]);return cmd==='git'?{status:0,stdout:args[0]==='status'?' M changed\n':'abc\n'}:{status:1};};
 assert.throws(()=>run('dev',execute,(_path,value)=>reports.push(JSON.parse(value))));
 assert.equal(calls.filter(([cmd])=>cmd==='make').length,1);
 assert.equal(reports.at(-1).complete,false);assert.equal(reports.at(-1).dirty,true);
 assert.throws(()=>run('dev',()=>({status:1}),()=>{}));
});
test('success records every check and exact source identity',()=>{
 let report;
 const result=run('dev',(cmd,args)=>({status:0,stdout:cmd==='git'&&args[0]==='rev-parse'?'abc\n':''}),(_path,text)=>report=JSON.parse(text));
 assert.equal(result.commit,'abc');assert.equal(result.dirty,false);
 assert.equal(report.complete,true);assert.equal(report.checks.length,plan().length);
});
