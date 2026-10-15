// Maintenance only: node build-app.cjs 28 (requires existing vendor/babel.js).
const fs=require('fs'),path=require('path'),crypto=require('crypto');const root=__dirname;
const read=file=>fs.readFileSync(path.join(root,file),'utf8');const write=(file,text)=>fs.writeFileSync(path.join(root,file),text);
require('child_process').execFileSync(process.execPath,[path.join(root,'build-styles.cjs')],{stdio:'inherit'});
let sw=read('sw.js');const previous=Number(sw.match(/const SHELL_VERSION=(\d+);/)[1]);const version=process.argv[2]?Number(process.argv[2]):previous;if(!Number.isInteger(version)||version<previous)throw Error('Use uma versão igual ou maior que a atual.');
const code=require(path.join(root,'vendor/babel.js')).transform(read('source/app.jsx'),{presets:['react'],comments:false,compact:true}).code;write('app-main.js',code+'\n');
write('index.html',read('index.html').replace(/(<meta name="zebrol-shell-version" content=")\d+(" \/>)/,'$1'+version+'$2'));
sw=sw.replace(/const SHELL_VERSION=\d+;/,'const SHELL_VERSION='+version+';');const hashes=JSON.parse(sw.match(/const HASHES=(\{[^\n]+\});/)[1]);for(const file of Object.keys(hashes))hashes[file]=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');write('sw.js',sw.replace(/const HASHES=\{[^\n]+\};/,'const HASHES='+JSON.stringify(hashes)+';'));console.log('Build e hashes atualizados: v'+version);
