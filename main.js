const extractor = require("./extractor.js");
const fs = require("node:fs");

/**
 * @returns {string}
 */
function readStdinSync() {
  const buffer = Buffer.alloc(4 << 10 /* 4kB */);
  let data = "";

  const stdin = fs.openSync("/dev/stdin", "r");

  while (true) {
    const n = fs.readSync(stdin, buffer, 0, buffer.length);
    if (n === 0) {
      break;
    }
    data += buffer.toString("utf-8", 0, n);
  }

  return data;
}

const linkExtractor = new extractor.LinkExtractor(
  extractor.getPdfPostprocessorChain(),
);

const results = linkExtractor.extract(readStdinSync());
results.getValues().forEach((link) => process.stdout.write(link + "\n"));
