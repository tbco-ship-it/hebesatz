// Regression tests for the money/rate parsers in static/app.js (run: node scripts/test_parse.mjs)
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("../static/app.js", import.meta.url), "utf8");
const grab = name => new Function("return " + src.match(new RegExp("const " + name + " = ([\\s\\S]*?);\\n  (?:const|//)"))[1])();
const parseVal = grab("parseVal"), parseRate = grab("parseRate");
const cases = [["85,20", 85.2], ["85.20", 85.2], ["1.234", 1234], ["1.234,56", 1234.56], ["1.000.000", 1000000], ["1234", 1234], ["0", 0], ["12abc", null], ["-5", null], ["", null], ["85,20 €", 85.2]];
let bad = 0;
for (const [i, e] of cases) { const got = parseVal(i); if (got !== e) { bad++; console.log("parseVal FAIL", JSON.stringify(i), "→", got, "expected", e); } }
for (const [i, e] of [["655", 655], ["1.181", 1181], ["1181", 1181], ["1 181", null], ["0", null], ["82,5", 82.5], ["9999", null]]) { const got = parseRate(i); if (got !== e) { bad++; console.log("parseRate FAIL", JSON.stringify(i), "→", got, "expected", e); } }
console.log(bad ? `${bad} failures` : "all parser tests pass"); process.exit(bad ? 1 : 0);
