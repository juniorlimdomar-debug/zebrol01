const fs=require('fs'),path=require('path');
const modulePath=process.env.ZEBROL_BUILD_MODULES || path.join(__dirname,'build-tools/node_modules');
const dep=name=>require(modulePath?path.join(modulePath,name):name);
dep('postcss')([dep('tailwindcss')({content:[path.join(__dirname,'index.html'),path.join(__dirname,'source/app.jsx'),path.join(__dirname,'document-ocr.js')],theme:{extend:{}},plugins:[]})])
  .process('@tailwind base;\n@tailwind components;\n@tailwind utilities;',{from:undefined})
  .then(result=>fs.writeFileSync(path.join(__dirname,'app-styles.css'),result.css+'\n'))
  .catch(error=>{console.error(error);process.exitCode=1;});
