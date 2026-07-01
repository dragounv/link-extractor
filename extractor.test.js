const { describe } = require("node:test");
const extractor = require("./extractor.js");
const fs = require("node:fs");

/**
 * This function adds tests from a json file.
 * The json file must be array of test objects (test units).
 *
 * Each test object must contain "input" and "want" attributes.
 * "input" should be string, containing sme text that we want to extract links from.
 * "want" must be array of expected results.
 *
 * It may contain a "skip" boolean attribute, if true than that test is not run.
 *
 * @param {string} name The name of the test group.
 * @param {string} testsFilePath Path to the json file.
 * @param {extractor.LinkExtractor} linkExtractor Initialized extractor that will be used in the tests.
 */
function addJsonTests(name, testsFilePath, linkExtractor) {
  describe(name, () => {
    const testUnits = JSON.parse(
      fs.readFileSync(testsFilePath, { encoding: "utf-8" }),
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
}

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
addJsonTests(
  "links in text",
  "./test_data/links-in-text.json",
  new extractor.LinkExtractor(),
);

// We need to handle cases where the URL is surrounded by different kind of brackets
addJsonTests(
  "links in brackets",
  "./test_data/links-in-brackets.json",
  new extractor.LinkExtractor(),
);

// Test the AppendPotentialSeparators postprocessor
addJsonTests(
  "append separators postprocessor",
  "./test_data/append-separators.json",
  (() => {
    const linkExtractor = new extractor.LinkExtractor();
    linkExtractor.postprocessorChain.add(
      new extractor.AppendPotentialSeparators(),
    );
    return linkExtractor;
  })(),
);

// Links that are split over multiple lines
addJsonTests(
  "newline splits",
  "./test_data/newline-splits.json",
  new extractor.LinkExtractor(extractor.getPdfPostprocessorChain()),
);

// Links that are split over multiple lines
addJsonTests(
  "remove links contained in other links",
  "./test_data/links-in-links.json",
  new extractor.LinkExtractor(extractor.getPdfPostprocessorChain()),
);

addJsonTests(
  "false positives",
  "./test_data/false-positives.json",
  new extractor.LinkExtractor(extractor.getPdfPostprocessorChain()),
);
