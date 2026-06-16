const extractor = require("./extractor.js");
const fs = require("node:fs");

// TODO: DRY this mess

test("'http://example.com' is link", () => {
  const linkExtractor = new extractor.LinkExtractor();
  const input = "http://example.com";
  const result = linkExtractor.extract(input);
  expect(result.links.length).toBe(1);
  expect(result.links[0].value).toBe(input);
});

// Loop over common links. A sanity check, that we are not leaving something behind.
test("check that simple links get extracted correctly", () => {
  const simpleLinks = fs
    .readFileSync("./test_data/simple-links.txt", { encoding: "utf-8" })
    .split("\n");

  const linkExtractor = new extractor.LinkExtractor();

  simpleLinks.forEach((input) => {
    const result = linkExtractor.extract(input);
    expect(result.links.length).toBe(1);
    expect(result.links[0].value).toBe(input);
  });
});

// Still simple but there is text around links and more than one link per input.
test("links in text", () => {
  const tests = JSON.parse(
    fs.readFileSync("./test_data/links-in-text.json", { encoding: "utf-8" }),
  );
  const linkExtractor = new extractor.LinkExtractor();

  tests.forEach((test) => {
    if (test.skip) {
      return;
    }
    const result = linkExtractor.extract(test.input);
    expect(result.links.length).toBe(test.want.length);
    result.links.forEach((link, i) => expect(link.value).toBe(test.want[i]));
  });
});

// We need to handle cases where the URL is surrounded by different kind of brackets
describe("brackets", () => {
  const testUnits = JSON.parse(
    fs.readFileSync("./test_data/links-in-brackets.json", {
      encoding: "utf-8",
    }),
  );
  const linkExtractor = new extractor.LinkExtractor();

  testUnits.forEach((unit) => {
    if (unit.skip) {
      return;
    }
    test(unit.name, () => {
      const result = linkExtractor.extract(unit.input);
      expect(result.links.length).toBe(unit.want.length);
      result.links.forEach((link, i) => expect(link.value).toBe(unit.want[i]));
    });
  });
});

// Test the AppendPotentialSeparators postprocessor
describe("append separators postprocessor", () => {
  const testUnits = JSON.parse(
    fs.readFileSync("./test_data/append-separators.json", {
      encoding: "utf-8",
    }),
  );

  const linkExtractor = new extractor.LinkExtractor();
  linkExtractor.postprocessorChain.add(
    new extractor.AppendPotentialSeparators(),
  );

  testUnits.forEach((unit) => {
    if (unit.skip) {
      return;
    }
    test(unit.name, () => {
      const result = linkExtractor.extract(unit.input);
      expect(result.links.length).toBe(unit.want.length);
      result.links.forEach((link, i) => expect(link.value).toBe(unit.want[i]));
    });
  });
});

// Links that are split over multiple lines
describe("newline splits", () => {
  const testUnits = JSON.parse(
    fs.readFileSync("./test_data/newline-splits.json", {
      encoding: "utf-8",
    }),
  );

  // This needs the PDF chain.
  const linkExtractor = new extractor.LinkExtractor(
    extractor.getPdfPostprocessorChain(),
  );

  testUnits.forEach((unit) => {
    if (unit.skip) {
      return;
    }
    test(unit.name, () => {
      const result = linkExtractor.extract(unit.input);
      const links = result.getValid();
      expect(links.length).toBe(unit.want.length);
      links.forEach((link, i) => expect(link.value).toBe(unit.want[i]));
    });
  });
});
