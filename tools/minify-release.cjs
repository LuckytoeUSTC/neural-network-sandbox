"use strict";
// Build-time only. Preserve API property names, numeric precision and CSS cascade order.
const { minify } = require('terser');
const CleanCSS = require('clean-css');
async function compressFiles(files) {
  const output = { ...files };
  for (const [name, source] of Object.entries(files)) {
    if (name.endsWith('.js')) {
      // Worker factories are serialized with toString(): keep their lexical structure intact.
      const serialized = source.includes('.toString()');
      output[name] = (await minify(source, {
        ecma: 2020, compress: serialized ? false : { passes: 2, unsafe: false },
        mangle: { properties: false }, format: { comments: false }
      })).code + '\n';
    } else if (name.endsWith('.css')) {
      const result = new CleanCSS({ level: 0, rebase: false, inline: ['none'] }).minify(source);
      if (result.errors.length) throw new Error(`${name}: ${result.errors.join('; ')}`);
      output[name] = result.styles + '\n';
    }
  }
  return output;
}
module.exports = { compressFiles };
if (require.main === module) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', part => { input += part; });
  process.stdin.on('end', async () => {
    try { process.stdout.write(JSON.stringify(await compressFiles(JSON.parse(input)))); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
  });
}
