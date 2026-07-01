const linkify = require("linkifyjs");

/**
 * The linkify return type
 * @typedef {Object} LinkifyLink
 * @property {string}  type
 * @property {string}  value
 * @property {boolean} isLink
 * @property {string}  href
 * @property {number}  start
 * @property {number}  end
 */

/**
 * Link holds metadata about extracted link that can be used for postprocessing and filtering
 */
class Link {
  /**
   * @param {LinkifyLink} object
   */
  constructor(object) {
    // type should be always url, not necessary to store
    // this.type = object.type

    // The value of the link (the URL itself)
    this.value = object.value;

    // isLink should be always true, not necessary to store
    // this.isLink = object.isLink

    // href is presently unused, but kept for future
    this.href = object.href;

    this.start = object.start;

    // ! IMPORTANT: end is the index AFTER the last character !
    this.end = object.end;

    // All links start as valid, and processors may invalidate them.
    this.valid = true;

    // This must be set for links that are not created during extraction but during postprocessing.
    // These links are will be ignored by some filters, that might otherwise remove them.
    // This allows processors to create duplicates or partial duplicates that share position in text with other links.
    this.createdByPostprocessor = false;
  }

  /**
   * Create deep copy of itself and return it.
   * @returns {Link}
   */
  createCopy() {
    /**
     * @type {LinkifyLink}
     */
    const ll = {
      value: "".concat(this.value),
      href: "".concat(this.href),
      start: this.start,
      end: this.end,
      isLink: true,
      type: "url",
    };

    const newLink = new Link(ll);
    newLink.valid = this.valid;

    return newLink;
  }
}

/**
 * LinkCollection holds links and text from which they were extracted for postprocessing and filtering
 */
class LinkCollection {
  /**
   * @param {string} text
   */
  constructor(text) {
    this.text = text;
    /** @type {Link[]} */
    this.links = [];
  }

  /**
   * @param {LinkifyLink} link
   */
  addNew(link) {
    this.links.push(new Link(link));
  }

  /**
   * Return all valid links
   * @returns {Link[]}
   */
  getValid() {
    return this.links.filter((link) => link.valid);
  }

  /**
   * Return all valid link values
   * @returns {string[]}
   */
  getValues() {
    return this.getValid().map((link) => link.value);
  }
}

/**
 * Abstract class.
 * Each derived postprocessor should transform links in LinkCollection.
 */
class Postprocessor {
  /**
   * @param {LinkCollection} linkCollection
   */
  process(linkCollection) {
    linkCollection.links.forEach((link, index) => {
      if (this.shouldProcess(link, index, linkCollection)) {
        this.processLink(link, index, linkCollection);
      }
    });
  }

  /**
   * Abstract method. Override in subclasses.
   * @param {Link} link
   * @param {number} index
   * @param {LinkCollection} linkCollection
   */
  processLink(link, index, linkCollection) {
    throw new Error("Abstract method called!");
  }

  /**
   * By default process only valid links.
   * @param {Link} link
   * @param {number} index
   * @param {LinkCollection} linkCollection
   * @returns {boolean}
   */
  shouldProcess(link, index, linkCollection) {
    return link.valid;
  }
}

/**
 * This postprocessor handles cases where link was extracted without schema / protocol
 */
class PrependHttp extends Postprocessor {
  constructor(checkPreviousLine = true) {
    super();
    this.checkPreviousLine = checkPreviousLine;
  }

  /**
   * @param {Link} link
   * @param {number} index
   * @param {LinkCollection} linkCollection
   */
  processLink(link, index, linkCollection) {
    if (
      this.checkPreviousLine &&
      linkCollection.text.slice(link.start - 9, link.start).includes("\n")
    ) {
      this.onPreviousLine(link, index, linkCollection);
    } else {
      this.onSameLine(link, index, linkCollection);
    }
  }

  /**
   * @param {Link} link
   * @param {number} index
   * @param {LinkCollection} linkCollection
   */
  onSameLine(link, index, linkCollection) {
    // http://  -- length 7
    // https:// -- length 8

    // Check that there is at least 7 bytes of space.
    if (link.start < 7) {
      return;
    }

    // Check the space before for http
    if (linkCollection.text.slice(link.start - 7, link.start) === "http://") {
      link.start = link.start - 7;
      link.value = `http://${link.value}`;
      return;
    }

    // Now again for https
    if (link.start < 8) {
      return;
    }

    if (linkCollection.text.slice(link.start - 8, link.start) === "https://") {
      link.start = link.start - 8;
      link.value = `https://${link.value}`;
      return;
    }
  }

  /**
   * @param {Link} link
   * @param {number} index
   * @param {LinkCollection} linkCollection
   */
  onPreviousLine(link, index, linkCollection) {
    // NOTE: This could probably be replaced by something that searches backwards for the scheme ignoring newlines.
    // But at this point it is not completely impossible for link.value to contain partial scheme.

    // We assume at most one newline.
    // We also assume that we normalized newlines to just LF, so they have length 1.
    if (link.start < 9) {
      return;
    }
    // Slice of previous line, without the newline. In theory, it can be multiple lines, but for now, I decided to only handle one.
    // If future shows that there are many cases where the scheme contains multiple newlines, then I will fix it.
    // As of now, I never saw more than one.
    let prevLineSlice = linkCollection.text.slice(link.start - 9, link.start);
    let count = 0;
    for (let i = 0; i < prevLineSlice.length; i++) {
      if (prevLineSlice[i] === "\n") {
        count++;
      }
    }
    if (count > 1) {
      // Can't handle more than one for now
      return;
    }

    prevLineSlice = prevLineSlice.replace("\n", "");

    // Check if http:// or https:// exists somewhere before or among link.value
    const concatenatedValue = prevLineSlice.concat(link.value);

    // Try http.

    let schemeIndex = concatenatedValue.indexOf("http://");
    // Get global index.
    let newStart = link.start - 8 + schemeIndex - count;
    // New start can't be bigger. That would mean we found "http" in the path of the link and we don't care for that.
    if (schemeIndex !== -1 && newStart < link.start) {
      // Success for http.
      link.value = concatenatedValue.slice(schemeIndex);
      link.start = newStart;
      return;
    }

    // Try https instead.

    schemeIndex = concatenatedValue.indexOf("https://");
    // Get global index.
    newStart = link.start - 8 + schemeIndex - count;
    // New start can't be bigger. That would mean we found "https" in the path of the link and we don't care for that.
    if (schemeIndex !== -1 && newStart < link.start) {
      // Success for https.
      link.value = concatenatedValue.slice(schemeIndex);
      link.start = newStart;
      return;
    }

    // We found nothing.
  }

  /**
   * If link starts with http, skip it. Works even for https.
   * @param {Link} link
   * @param {number} index
   * @param {LinkCollection} linkCollection
   * @returns {boolean}
   */
  shouldProcess(link, index, linkCollection) {
    return link.valid && !link.value.startsWith("http");
  }
}

/**
 * This postprocessor tries to append a character or characters, that the link matching
 * algorithm decided should not be part of the link. Sometimes this happens incorrectly,
 * because the link is split among multiple lines.
 *
 * It is advised to always run this postprocessor before AppendMultiline postprocessor.
 * Otherwise it may not be able to handle some splits properly.
 */
class AppendPotentialSeparators extends Postprocessor {
  constructor() {
    super();
    // Always append these
    this.separators = ["%", ":", ".", "?"];
  }

  /**
   * @param {Link} link
   * @param {number} index
   * @param {LinkCollection} linkCollection
   */
  processLink(link, index, linkCollection) {
    const text = linkCollection.text;
    if (link.end >= text.length - 1) {
      return;
    }

    // Check if the next character is in separators and append it if yes.
    // link.end already points to character after the last character in value so don't increment!
    if (this.separators.includes(text[link.end])) {
      link.value += text[link.end];
      // Now we increment
      link.end += 1;
    }
  }
}

/**
 * This postprocessor tries to detect links that were split by a newline and will
 * try and append the rest of the link.
 * This is sadly not an exact process and results may vary.
 * It should work best for extracting links from PDFs generated by word processors.
 */
class AppendMultiline extends Postprocessor {
  constructor(shouldProcessHardCases = true) {
    super();

    // The simple cases, these almost always mean that we should append next line to link.
    this.separators = ["-", "_", "%", "=", ":", "?", "&"];

    // We need to do more complex checking and processing with these.
    this.hardCases = [".", "/"];
    this.shouldProcessHardCases = shouldProcessHardCases;
  }

  /**
   * @param {string} linkValue
   * @returns {boolean}
   */
  endsWithSeparator(linkValue) {
    for (const separator of this.separators) {
      if (linkValue.endsWith(separator)) {
        return true;
      }
    }
    return false;
  }

  /**
   * @param {string} linkValue
   * @returns {boolean}
   */
  isHardCase(linkValue) {
    for (const separator of this.hardCases) {
      if (linkValue.endsWith(separator)) {
        return true;
      }
    }
    return false;
  }

  /**
   * @param {Link} link
   * @param {number} index
   * @param {LinkCollection} linkCollection
   */
  processLink(link, index, linkCollection) {
    while (true) {
      // if (i >= 20) {
      //   throw new Error("Too many iterations");
      // }
      // i++;
      const oldValue = "".concat(link.value);
      if (this.isHardCase(link.value)) {
        this.processHardCase(link, index, linkCollection);
      } else if (this.endsWithSeparator(link.value)) {
        this.processSimpleCase(link, index, linkCollection);
      } else {
        break;
      }
      if (oldValue === link.value) {
        break;
      }
    }
  }

  /**
   * @param {Link} link
   * @param {number} index
   * @param {LinkCollection} linkCollection
   */
  processSimpleCase(link, index, linkCollection) {
    let value = "".concat(link.value);
    let end = link.end;
    let text = linkCollection.text;

    let pointer = end;

    // NOTE: This could be replaced by simpler solution (similar to processSlash), but it works ok.
    while (this.endsWithSeparator(value)) {
      if (pointer >= text.length - 1 || text[pointer] !== "\n") {
        break;
      }

      // If the separator is equals sign, then proceed only when it's in query.
      // It's a simple check and could be confused by some URLs, but those would be broken anyway.
      // Eg. unescaped question mark in path. It should be good enough for most cases.
      if (value.endsWith("=") && !value.includes("?")) {
        break;
      }

      if (value.endsWith("&") && !value.includes("?")) {
        break;
      }

      // If there isn't an equals before whitespace, then the query is missing and we won't append next line.
      if (
        value.endsWith("?") &&
        text.slice(end).search(/\s/) > text.slice(end).search("=")
      ) {
        break;
      }

      // +1 so we leave behind the newline
      const sliceStart = pointer + 1;
      while (true) {
        pointer++;
        if (!(pointer < text.length) || text[pointer].trim() === "") {
          break;
        }
      }
      const sliceEnd = pointer;

      // If we have nothing to slice then break early
      if (sliceStart > sliceEnd) {
        break;
      }

      const linkPiece = text.slice(sliceStart, sliceEnd);

      value = value.concat(linkPiece);
      // ! End must point to character after the last character in value !
      end = pointer;
    }

    link.value = value;
    link.end = end;
  }

  /**
   * @param {Link} link
   * @param {number} index
   * @param {LinkCollection} linkCollection
   */
  processHardCase(link, index, linkCollection) {
    // Each hard case should have it's own function.
    if (link.value.endsWith(".")) {
      this.processDot(link, index, linkCollection);
    } else if (link.value.endsWith("/")) {
      this.processSlash(link, index, linkCollection);
    } else {
      throw new Error("Programmer error. There is missing case!");
    }
  }

  /**
   * @param {Link} link
   * @param {number} index
   * @param {LinkCollection} linkCollection
   */
  processDot(link, index, linkCollection) {
    // Ok, the cases where the link is split on dots are pretty complex, so I will write down some of my thoughts.
    // Dot on the end of link may also mean an and of a sentence or citation (very common, technically not part of the link but removing it is not responsibility of this processor).
    // It may also just be part of the links path (not common at all, but completely possible).
    // Dots may appear almost anywhere in a URL and some cases will need separate handling.

    // 1. newline after the bottommost level domain (eg. http://www.)
    // ASSUMPTION: The library that extracted the links also recognized the rest of the URL and it is stored in the next index.
    // This assumption generally holds for linkify, but if different approach for extracting URLs is used, then it may break.
    // But this is what the tests are for. Let's do it :)

    const onlyBldRegex = /^https?:\/\/[^.]*?\.$/;
    // This regex is not able to recognize every new URL, but should be good enough for reducing the number of false positives.
    const newUrlStartRegex = /^(?:http:|https:|www\.)+/;
    const links = linkCollection.links;

    // Check that this link is only bottommost level domain.
    // Also check that the next link does not start with http, https or www.
    // Also check that only newline is between the two links.
    if (
      link.value.search(onlyBldRegex) !== -1 &&
      links.length > index + 1 &&
      link.end + 1 === links[index + 1].start &&
      linkCollection.text[link.end] === "\n" &&
      links[index + 1].value.search(newUrlStartRegex) === -1
    ) {
      const nextLink = links[index + 1];
      const firstPart = link.value;
      const secondPart = nextLink.value;
      link.value = firstPart.concat(secondPart);
      link.end = nextLink.end;
      nextLink.valid = false; // Stop further processing of the next link that was concatenated to this one.
      return;
    }

    // Prepare slice of the next line. This is used in multiple places below.
    const text = linkCollection.text;
    const nextLineStart = link.end + 1;
    let nextLineEnd = text.indexOf("\n", nextLineStart);

    if (nextLineEnd === -1) {
      nextLineEnd = text.length;
    }

    // The end index is not part of the slice. That is expected.
    let nextLine = text.slice(nextLineStart, nextLineEnd);

    // We only want the line until first whitespace.
    const firstWhitespaceIndex = nextLine.search(/\s/);
    if (firstWhitespaceIndex !== -1) {
      nextLineEnd = nextLineStart + firstWhitespaceIndex;
      nextLine = nextLine.slice(0, firstWhitespaceIndex);
    }

    // 2. newline after any domain level
    // This will also fix cases where the next line was not recognized as link.

    // This time, we also want to check for links not starting with http.
    const onlyDomainRegex = /^(?:https?:\/\/)?(?:[^.\/]*?\.)+?$/;

    if (
      link.value.search(onlyDomainRegex) !== -1 &&
      nextLine !== null &&
      isUrlPath(nextLine)
    ) {
      link.value += nextLine;
      link.end = nextLineEnd;
      // Disable next link if we included it
      if (links.length > index + 1 && links[index + 1].end === link.end) {
        links[index + 1].valid = false;
      }
      return;
    }

    // 3. newline after dots in path
    // Some notes
    // - Dots do often appear at the end of link paths (those dots are not actually parts of the link just ends of sentence)
    // - Dots may appear in the last segment of the path usually separating the file extension (example.com/somepage.html)
    // - Dots may appear at after a single "word" in the beginning of the next sentence (example.com/somepath\n1.2. Sometitle)
    // - Dots may appear anywhere alse in rest of the path
    //
    // Some of these cases are just impossible to handle. We don't know if something is a part of the link or just another sentence.
    // We must always try to determine that a piece of string is still part of the processed link. Avoid false positives.
    // We also may check for some file extensions.

    // We only check links which have dot at the end of path.
    if (
      link.value.search(/^(?:[^\/]*\/\/)?(?:[^\/]+\/)+[^\/]*\.$/) !== -1 &&
      nextLine !== null &&
      (isUrlPath(nextLine) || isFileExtension(nextLine))
    ) {
      link.value += nextLine;
      link.end = nextLineEnd;
      return;
    }

    return;
  }

  /**
   * @param {Link} link
   * @param {number} index
   * @param {LinkCollection} linkCollection
   */
  processSlash(link, index, linkCollection) {
    // For slashes, if the next line looks like URL path, then we can append it.

    const text = linkCollection.text;
    const nextLineStart = link.end + 1; // Leaves behind the first newline.
    let nextLineEnd = text.indexOf("\n", nextLineStart);
    if (nextLineEnd === -1) {
      nextLineEnd = text.length;
    }
    let nextLine = text.slice(nextLineStart, nextLineEnd);
    const firstWhitespaceIndex = nextLine.search(/\s/);
    if (firstWhitespaceIndex !== -1) {
      nextLineEnd = nextLineStart + firstWhitespaceIndex;
      nextLine = nextLine.slice(0, firstWhitespaceIndex);
    }

    if (
      !isUrlPath(
        nextLine,
        new UrlPathSearchOptions(link, index, linkCollection, nextLineStart),
      )
    ) {
      return;
    }

    link.value += nextLine;
    link.end = nextLineEnd;
  }

  /**
   * @param {Link} link
   * @param {number} index
   * @param {LinkCollection} linkCollection
   * @returns {boolean}
   */
  shouldProcess(link, index, linkCollection) {
    if (!link.valid) {
      return false;
    }
    if (this.shouldProcessHardCases) {
      return this.endsWithSeparator(link.value) || this.isHardCase(link.value);
    } else {
      return this.endsWithSeparator(link.value);
    }
  }
}

class UrlPathSearchOptions {
  /**
   * @param {Link} currentLink The link to which of which "str" may be path.
   * @param {number} currentIndex The index of currentLink.
   * @param {LinkCollection} linkCollection
   * @param {number} strStart The start index of str.
   */
  constructor(currentLink, currentIndex, linkCollection, strStart) {
    this.currentLink = currentLink;
    this.currentIndex = currentIndex;
    this.linkCollection = linkCollection;
    this.strStart = strStart;
  }
}

/**
 * This function tries to decide whether a string may be part of URL path.
 * The results may not be correct, but should be in most expected cases.
 *
 * UrlPathSearchOptions when passed to isUrlPath are used to determine whether the next
 * extracted link is actually just a part of path the one we are currently inspecting.
 * This check has a big chance to produce false positives, but it also allows
 * us to make more correct fixes, that would be otherwise impossible.
 * It should almost always work, but for example, some URL lists may be problematic.
 *
 * @param {string} str
 * @param {UrlPathSearchOptions} [options=null]
 * @returns {boolean}
 */
function isUrlPath(str, options = null) {
  // TODO: Maybe more accurate test for determining the beginning of URL would be
  // to use test whether some existing URL shares the same space with the tested string
  // but currently the rate of false positives generated by linkify is very high. I need to try this.

  if (str.length === 0) {
    return false;
  }

  if (str.search(/^(?:http:|https:|www\.)+/) !== -1) {
    // We only want continuation of URL not entire URL.
    return false;
  }
  if (str.includes("/")) {
    return true;
  }
  if (
    str.includes("?") &&
    str.includes("=") &&
    str.indexOf("?") < str.lastIndexOf("=")
  ) {
    return true;
  }

  // This check should be last.
  if (options != null) {
    // We should already know this. But it's important part of the logic and the function may be changed in future.
    // If the str is an actual full URL, then we must not proceed.
    if (str.includes("/")) {
      return false;
    }

    // We need to determine, whether the "str" is the value of next link.
    // Compare indexes instead of comparing values directly.
    if (options.currentIndex + 1 >= options.linkCollection.links.length) {
      return false;
    }
    const link = options.linkCollection.links[options.currentIndex + 1];
    // Checking start is enough. The value in link might be changed and unsuitable for this check.
    if (link.start === options.strStart) {
      // Disable the link. We think it's part of another link, not a link on it's own.
      link.valid = false;
      return true;
    }
  }

  return false;
}

const recognizedExtensions = new Set([
  "html",
  "htm",
  "pdf",
  "php",
  "jpg",
  "png",
  "gif",
]);
/**
 * @param {string} str
 * @returns {boolean}
 */
function isFileExtension(str) {
  return recognizedExtensions.has(str);
}

/**
 * This processor removes punctuation from links.
 * Punctuation after links is almost never actually part of the link.
 * This also helps to clear negative effects of AppendPotentialSeparators.
 */
class PunctuationFilter extends Postprocessor {
  constructor() {
    super();
    this.punctuation = ["%", ":", ".", "?", ","];
  }

  /**
   * @param {Link} link
   * @param {number} index
   * @param {LinkCollection} linkCollection
   */
  processLink(link, index, linkCollection) {
    const value = link.value;
    if (
      value.length > 0 &&
      this.punctuation.includes(value[value.length - 1])
    ) {
      link.value = value.slice(0, value.length - 1);
      link.end -= 1;
    }
  }
}

/**
 * This processor removes (marks as not valid) links that are "contained" in other link.
 * It does it using the start and end indexes of the links.
 * It does not compare the values of the links, so it doesn't remove duplicates.
 */
class LinksInLinksFilter extends Postprocessor {
  constructor() {
    super();
  }

  /**
   * @param {Link} link
   * @param {number} index
   * @param {LinkCollection} linkCollection
   */
  processLink(link, index, linkCollection) {
    const start = link.start;
    const end = link.end;
    const links = linkCollection.links;

    for (let i = 0; i < links.length; i++) {
      if (i === index) {
        continue;
      }
      const otherLink = links[i];
      if (link.createdByPostprocessor) {
        continue;
      }
      link.index = index;
      // Are we contained in otherLink?
      if (start >= otherLink.start && end <= otherLink.end) {
        link.valid = false;
        link.removedBy = i;
        break;
      }
    }
  }

  /**
   * @param {Link} link
   * @param {number} index
   * @param {LinkCollection} linkCollection
   * @returns {boolean}
   */
  shouldProcess(link, index, linkCollection) {
    return link.valid && !link.createdByPostprocessor;
  }
}

/**
 * This filter removes links that look like hosts without path and scheme (those may be valid links),
 * but that are most likely just gibberish.
 *
 * It tries to preserve those, that may be actual links, by allowing some TLDs.
 * We can't allow all registered TLDs, because it let's through too much junk.
 * Feel free to modify the whitelist to suite your needs.
 */
class NonsenseHostsFilter extends Postprocessor {
  constructor() {
    super();
    // I tried to choose those that are used often (and not also used as extension of python files, among other things...)
    this.allowedTLDs = [
      "com",
      "org",
      "net",
      "int",
      "edu",
      "gov",
      "ai",
      "at",
      "be",
      "br",
      "by",
      "ca",
      "ch",
      "cn",
      "cz",
      "de",
      "eu",
      "fr",
      "gg",
      "in",
      "io",
      "it",
      "jp",
      "ly",
      "me",
      "pl",
      "ru",
      "sk",
      "uk",
      "us",
    ];
  }

  /**
   * @param {Link} link
   * @param {number} index
   * @param {LinkCollection} linkCollection
   */
  processLink(link, index, linkCollection) {
    // in "shouldProcess" we check that link.value is just host, so we can safely separate it's domains into list.
    const domains = link.value.split(".");

    // Sanity check
    if (domains.length < 2) {
      throw new Error(
        "If you see this error, then there is a bug in the NonsenseHostsFilter class. Please open an issue.",
      );
    }

    const tld = domains[domains.length - 1];
    if (!this.allowedTLDs.includes(tld.toLowerCase())) {
      link.valid = false;
      return;
    }
  }

  /**
   * @param {Link} link
   * @param {number} index
   * @param {LinkCollection} linkCollection
   * @returns {boolean}
   */
  shouldProcess(link, index, linkCollection) {
    const value = link.value;
    return (
      link.valid && this._isOnlyNonIpHost(value) && !value.startsWith("www")
    );
  }

  /**
   * @param {string} str
   * @returns {boolean}
   */
  _isOnlyNonIpHost(str) {
    return str.search(/^(?:[A-Za-z0-9-]+\.)+[A-Za-z0-9-]{2,}$/) !== -1;
  }
}

class PostprocessorChain {
  constructor() {
    /** @type {Postprocessor[]} */
    this.postprocessors = [];
  }

  /**
   * @param {Postprocessor} postprocessor
   */
  add(postprocessor) {
    this.postprocessors.push(postprocessor);
  }

  /**
   * @param {LinkCollection} linkCollection
   */
  process(linkCollection) {
    this.postprocessors.forEach((postprocessor) =>
      postprocessor.process(linkCollection),
    );
  }
}

class LinkExtractor {
  /**
   * @param {PostprocessorChain} postprocessorChain
   */
  constructor(postprocessorChain = null) {
    if (postprocessorChain) {
      this.postprocessorChain = postprocessorChain;
    } else {
      this.postprocessorChain = new PostprocessorChain();
      // Default postprocessors:
      this.postprocessorChain.add(new PrependHttp());
    }
  }

  /**
   * Extract all links from string
   * @param {string} text
   * @returns {LinkCollection}
   */
  extract(text) {
    // Normalize newlines
    text = text.replace(/\r\n/g, "\n");

    const linkCollection = new LinkCollection(text);
    const linkifyResults = linkify.find(text, "url");
    linkifyResults.forEach((link) => linkCollection.addNew(link));

    this.postprocessorChain.process(linkCollection);

    return linkCollection;
  }
}

/**
 * This function returns PostprocessorChain that is intended to be used for extracting links from PDF files.
 * @returns {PostprocessorChain}
 */
function getPdfPostprocessorChain() {
  const pdfPostprocessorChain = new PostprocessorChain();
  pdfPostprocessorChain.postprocessors = [
    new PrependHttp(),
    new AppendPotentialSeparators(),
    new AppendMultiline(),
    new PunctuationFilter(),
    new LinksInLinksFilter(),
    new NonsenseHostsFilter(),
  ];
  return pdfPostprocessorChain;
}

module.exports = {
  LinkExtractor,
  Link,
  LinkCollection,
  Postprocessor,
  PostprocessorChain,
  PrependHttp,
  AppendMultiline,
  AppendPotentialSeparators,
  PunctuationFilter,
  LinksInLinksFilter,
  NonsenseHostsFilter,
  getPdfPostprocessorChain,
};
