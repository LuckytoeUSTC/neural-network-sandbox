"use strict";
const { existsSync } = require("node:fs");
const candidates = [process.env.THREE_NEURONS_CHROME,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"];
module.exports = { executablePath: candidates.find(path => path && existsSync(path)) };
