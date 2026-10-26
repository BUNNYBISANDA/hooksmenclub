import { spawn } from 'node:child_process';
console.log('Hook Menclub TEST MODE: appointments are synthetic and stay in browser memory.');
const child=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1',...process.argv.slice(2)],{
  stdio:'inherit',windowsHide:true,env:{...process.env,VITE_API_MODE:'fixtures',VITE_TURNSTILE_SITE_KEY:''},
});
child.on('exit',code=>{process.exitCode=code??1;});
child.on('error',()=>{console.error('Could not start Vite. Run npm ci first.');process.exitCode=1;});
