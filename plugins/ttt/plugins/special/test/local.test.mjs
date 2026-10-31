import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {buildSync} from 'esbuild';
import {fixture,behaviorTests} from './fixture.mjs';
const entry=fileURLToPath(new URL('../src/plugin.ts',import.meta.url));
const code=buildSync({entryPoints:[entry],bundle:true,write:false,format:'cjs',platform:'node',external:['@s2script/*']}).outputFiles[0].text;
behaviorTests(test,assert,()=>fixture(code),'local');
