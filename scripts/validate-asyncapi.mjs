import {readFileSync,readdirSync} from 'node:fs';
import {Parser} from '@asyncapi/parser';

// Official parser performs schema and semantic validation; all error diagnostics
// fail the gate, matching the previous CLI --fail-severity error policy.
export async function validate(source) {
 const {document,diagnostics}=await new Parser().parse(source);
 const errors=diagnostics.filter(item=>item.severity===0);
 if(!document||errors.length)throw Error('AsyncAPI validation failed: '+errors.map(item=>item.message).join('; '));
 return document;
}
for (const file of readdirSync('contracts/asyncapi').filter(file=>file.endsWith('.json')))
 await validate(readFileSync('contracts/asyncapi/'+file,'utf8'));
console.log('Official AsyncAPI schema and semantic validation passed.');
