"use strict";

const fs = require("fs");

/**
 * Performs a recursive link check starting from a base URL. The crawler will check all hrefs found in anchor tags.
 * If the href is on the same domain, the response will be added to a queue of sites to crawl, and the URL will be added to a set of visited URLs.
 * If the href is not on the same domain, it will be checked for a status response in the 200s.
 * Links that return something other than the 200s will be added to a list of broken links alongside their HTTP response code.
 */

let [, , startingUrl] = process.argv;

if (startingUrl.startsWith("http")) {
  startingUrl = startingUrl.replace("http://", "https://");
} else {
  startingUrl = "https://" + startingUrl;
}

const urlQueue = [
  {
    url: startingUrl,
    foundOn: "base URL",
  },
];
const visitedUrls = new Set();
const brokenLinks = [];
const baseUrl = startingUrl;

runLinkCheck(urlQueue).then(() => {
  process.exit(); // completed successfully
});

async function runLinkCheck(queue) {
  let queuePosition = 0;

  const progressUpdateTimer = setInterval(() => {
    const completion = Math.floor((queuePosition / queue.length) * 100);
    console.log(`Progress: ${completion}%`);
  }, 1000);

  const startMessage = `Starting broken link checker for ${baseUrl}`;
  console.log();
  console.log("-".repeat(startMessage.length));
  console.log(startMessage);
  console.log("-".repeat(startMessage.length));
  console.log();

  const startTime = Date.now();

  while (queuePosition < queue.length) {
    const { url, foundOn } = queue[queuePosition];
    queuePosition++;

    if (visitedUrls.has(url)) {
      continue;
    } else {
      visitedUrls.add(url);
    }

    try {
      const response = await fetch(url);

      if (response.status === 404) {
        throw new Error("404 Page not found.");
      }

      if (url.startsWith(baseUrl)) {
        const contentType = response.headers.get("content-type");
        let html = "";
        if (contentType.includes("text/html")) {
          html = await response.text();
        }

        const hrefs = getHrefs(html, url)
          .filter((href) => visitedUrls.has(href) === false)
          .map((href) => ({
            url: href,
            foundOn: url,
          }));

        urlQueue.push(...hrefs);
      }
    } catch (err) {
      console.warn(`broken: ${url}`);
      brokenLinks.push({
        url,
        foundOn,
      });
    }
  }

  clearInterval(progressUpdateTimer);
  const endTime = Date.now();
  const totalTimeSeconds = Math.floor((endTime - startTime) / 1000)
    .toString()
    .padStart(6, " ");

  console.log();
  console.log("-----------------------------------");
  console.log(`Completed link check in ${totalTimeSeconds} sec.`);
  console.log(`Checked ${queuePosition} links.`);
  console.log("-----------------------------------");
  console.log();

  let output = "Broken Links: \n";
  for (let brokenLink of brokenLinks) {
    output += `
      
      ${brokenLink.url}
      Found on: ${brokenLink.foundOn}`;
  }

  const saveLocation = saveOutput(output, "broken-links.txt");
  console.log(`Saved results to ${saveLocation}`);
}

function getHrefs(text, currentUrl) {
  let hrefs = text.match(/href=".+?"/g) || [];

  hrefs = hrefs
    .map((href) => {
      href = href.slice(6, -1);

      if (href.startsWith("/")) {
        href = baseUrl + href;
      } else if (
        href.startsWith("#") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:")
      ) {
        // don't check same page links, mailto, or tel
        href = null;
      } else if (href === "true" || href === "false") {
        console.warn(`WARNING: found href ${href}, ignoring suspicious value.`);
        href = null;
      } else if (href.startsWith("http")) {
        // nothing needed
      } else {
        href = currentUrl + href;
      }

      if (href) {
        href = href.split("?")[0]; // removes query string
      }

      return href;
    })
    .filter((href) => !!href);

  return hrefs;
}

/**
 * Save text output to a file in the cwd. Returns the path to the file.
 * @param {string} text text to save
 * @param {string} fileName name of output file (stored in cwd)
 * @returns {string} path to saved file
 */
function saveOutput(text, fileName) {
  const cwd = process.cwd();
  const filePath = `${cwd}/${fileName}`;

  fs.writeFileSync(filePath, text, function (err) {
    console.error(err);
    process.exit(1);
  });

  return filePath;
}
