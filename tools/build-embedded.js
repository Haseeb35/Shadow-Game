/* Shadow Self - regenerate levels/embedded.js from the level JSON files.
   Usage: node tools/build-embedded.js   (run from the project root)        */
const fs = require("fs");
const path = require("path");

const levelsDir = path.resolve("levels");
const levels = [];
let i = 1;
for (;;) {
  const p = path.join(levelsDir, "level" + i + ".json");
  if (!fs.existsSync(p)) break;
  levels.push(JSON.parse(fs.readFileSync(p, "utf8")));
  i++;
}

const out =
  "/* Shadow Self - embedded level data fallback.\n" +
  "   Generated from levels/level1-" + levels.length + ".json so the game also runs via file://.\n" +
  "   Regenerate with: node tools/build-embedded.js */\n" +
  "(function () {\n" +
  '  "use strict";\n' +
  "  window.EMBEDDED_LEVELS = " +
  JSON.stringify(levels, null, 2) +
  ";\n" +
  "})();\n";

fs.writeFileSync(path.join(levelsDir, "embedded.js"), out, "utf8");
console.log("embedded.js written with " + levels.length + " levels");
