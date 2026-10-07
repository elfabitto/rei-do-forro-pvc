/* Regera logo-data.js a partir de logo-rf.jpeg.  Uso:  node gerar-logo-data.js  */
const fs = require("fs");
const b64 = fs.readFileSync(__dirname + "/logo-rf.jpeg").toString("base64");
fs.writeFileSync(__dirname + "/logo-data.js",
  "/* Logo Rei do Forro embutida como data URI (gerada de logo-rf.jpeg).\n" +
  "   Embutida para que o PNG exportado funcione tambem com o arquivo aberto localmente.\n" +
  "   Trocou a logo? rode:  node gerar-logo-data.js  */\n" +
  'const LOGO = "data:image/jpeg;base64,' + b64 + '";\n');
console.log("logo-data.js gerado:", Math.round(fs.statSync(__dirname + "/logo-data.js").size / 1024) + " KB");
