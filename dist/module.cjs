'use strict';

const destr = require('destr');
const kit = require('@nuxt/kit');
const consent = require('./shared/telemetry.BS0NLRIM.cjs');
const ofetch = require('ofetch');
const os = require('node:os');
const node_child_process = require('node:child_process');
const isDocker = require('is-docker');
const stdEnv = require('std-env');
const packageManagerDetector = require('package-manager-detector');
const node_crypto = require('node:crypto');
const fs = require('node:fs');
const pathe = require('pathe');
require('consola/utils');
require('consola');
require('rc9');

function _interopDefaultCompat (e) { return e && typeof e === 'object' && 'default' in e ? e.default : e; }

const os__default = /*#__PURE__*/_interopDefaultCompat(os);
const isDocker__default = /*#__PURE__*/_interopDefaultCompat(isDocker);
const fs__default = /*#__PURE__*/_interopDefaultCompat(fs);

async function postEvent(endpoint, body) {
  const res = await ofetch.fetch(endpoint, {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      "user-agent": "Nuxt Telemetry " + consent.version
    }
  });
  if (!res.ok) {
    throw new Error(res.statusText);
  }
}

function hash(str) {
  return node_crypto.createHash("sha256").update(str).digest("hex").substr(0, 16);
}
function randomSeed() {
  return hash(node_crypto.randomUUID());
}

function protocols(input, first) {
  let prots = "";
  if (typeof input === "string") {
    try {
      prots = new URL(input).protocol;
    } catch (e) {
    }
  } else if (input && input.constructor === URL) {
    prots = input.protocol;
  }
  const splits = prots.split(/[:+]/).filter(Boolean);
  return splits;
}
function isSsh(input) {
  if (Array.isArray(input)) {
    return input.includes("ssh") || input.includes("rsync");
  }
  if (typeof input !== "string") {
    return false;
  }
  const prots = protocols(input);
  input = input.substring(input.indexOf("://") + 3);
  if (isSsh(prots)) {
    return true;
  }
  const urlPortPattern = /\.([a-zA-Z\d]+):(\d+)\//;
  return !input.match(urlPortPattern) && input.indexOf("@") < input.indexOf(":");
}
function parsePath(url) {
  const output = {
    protocols: [],
    protocol: null,
    port: null,
    resource: "",
    host: "",
    user: "",
    password: "",
    pathname: "",
    hash: "",
    search: "",
    href: url,
    query: {},
    parse_failed: false
  };
  try {
    const parsed = new URL(url);
    output.protocols = protocols(parsed);
    output.protocol = output.protocols[0];
    output.port = parsed.port;
    output.resource = parsed.hostname;
    output.host = parsed.host;
    output.user = parsed.username || "";
    output.password = parsed.password || "";
    output.pathname = parsed.pathname;
    output.hash = parsed.hash.slice(1);
    output.search = parsed.search.slice(1);
    output.href = parsed.href;
    output.query = Object.fromEntries(parsed.searchParams);
  } catch (e) {
    output.protocols = ["file"];
    output.protocol = output.protocols[0];
    output.port = "";
    output.resource = "";
    output.user = "";
    output.pathname = "";
    output.hash = "";
    output.search = "";
    output.href = url;
    output.query = {};
    output.parse_failed = true;
  }
  return output;
}
function parseUrl(url, normalize = false) {
  const GIT_RE = /^(?:([a-zA-Z_][a-zA-Z0-9_-]{0,31})@|https?:\/\/)([\w.\-@]+)[/:](([~,.\w,\-,_,/,\s]|%[0-9A-Fa-f]{2})+?(?:\.git|\/)?)$/;
  const throwErr = (msg) => {
    const err = new TypeError(msg);
    err.subject_url = url;
    throw err;
  };
  if (typeof url !== "string" || !url.trim()) {
    throwErr("Invalid url.");
  }
  if (url.length > parseUrl.MAX_INPUT_LENGTH) {
    throwErr("Input exceeds maximum length. If needed, change the value of parseUrl.MAX_INPUT_LENGTH.");
  }
  if (normalize) {
    if (typeof normalize !== "object") {
      normalize = {
        stripHash: false
      };
    }
  }
  const parsed = parsePath(url);
  if (parsed.parse_failed) {
    const matched = parsed.href.match(GIT_RE);
    if (matched) {
      parsed.protocols = ["ssh"];
      parsed.protocol = "ssh";
      parsed.resource = matched[2];
      parsed.host = matched[2];
      parsed.user = matched[1] || "";
      parsed.pathname = `/${matched[3]}`;
      parsed.parse_failed = false;
    } else {
      throwErr("URL parsing failed.");
    }
  }
  return parsed;
}
parseUrl.MAX_INPUT_LENGTH = 2048;
function gitUp(input) {
  const output = parseUrl(input);
  output.token = "";
  if (output.password === "x-oauth-basic") {
    output.token = output.user;
  } else if (output.user === "x-token-auth") {
    output.token = output.password;
  }
  if (isSsh(output.protocols) || output.protocols.length === 0 && isSsh(input)) {
    output.protocol = "ssh";
  } else if (output.protocols.length) {
    output.protocol = output.protocols[0];
  } else {
    output.protocol = "file";
    output.protocols = ["file"];
  }
  output.href = output.href.replace(/\/$/, "");
  return output;
}
function gitUrlParse(url, refs = []) {
  if (typeof url !== "string") {
    throw new TypeError("The url must be a string.");
  }
  if (!refs.every((item) => typeof item === "string")) {
    throw new TypeError("The refs should contain only strings");
  }
  const shorthandRe = /^([a-z\d-]{1,39})\/([-.\w]{1,100})$/i;
  if (shorthandRe.test(url)) {
    url = `https://github.com/${url}`;
  }
  const urlInfo = gitUp(url);
  const sourceParts = urlInfo.resource.split(".");
  let splits = null;
  urlInfo.toString = function(type) {
    return gitUrlParse.stringify(this, type);
  };
  urlInfo.source = sourceParts.length > 2 ? sourceParts.slice(1 - sourceParts.length).join(".") : urlInfo.source = urlInfo.resource;
  urlInfo.git_suffix = /\.git$/.test(urlInfo.pathname);
  urlInfo.name = decodeURIComponent((urlInfo.pathname || urlInfo.href).replace(/(^\/)|(\/$)/g, "").replace(/\.git$/, ""));
  urlInfo.owner = decodeURIComponent(urlInfo.user);
  switch (urlInfo.source) {
    case "git.cloudforge.com": {
      urlInfo.owner = urlInfo.user;
      urlInfo.organization = sourceParts[0];
      urlInfo.source = "cloudforge.com";
      break;
    }
    case "visualstudio.com": {
      if (urlInfo.resource === "vs-ssh.visualstudio.com") {
        splits = urlInfo.name.split("/");
        if (splits.length === 4) {
          urlInfo.organization = splits[1];
          urlInfo.owner = splits[2];
          urlInfo.name = splits[3];
          urlInfo.full_name = `${splits[2]}/${splits[3]}`;
        }
        break;
      } else {
        splits = urlInfo.name.split("/");
        if (splits.length === 2) {
          urlInfo.owner = splits[1];
          urlInfo.name = splits[1];
          urlInfo.full_name = `_git/${urlInfo.name}`;
        } else if (splits.length === 3) {
          urlInfo.name = splits[2];
          if (splits[0] === "DefaultCollection") {
            urlInfo.owner = splits[2];
            urlInfo.organization = splits[0];
            urlInfo.full_name = `${urlInfo.organization}/_git/${urlInfo.name}`;
          } else {
            urlInfo.owner = splits[0];
            urlInfo.full_name = `${urlInfo.owner}/_git/${urlInfo.name}`;
          }
        } else if (splits.length === 4) {
          urlInfo.organization = splits[0];
          urlInfo.owner = splits[1];
          urlInfo.name = splits[3];
          urlInfo.full_name = `${urlInfo.organization}/${urlInfo.owner}/_git/${urlInfo.name}`;
        }
        break;
      }
    }
    // Azure DevOps (formerly Visual Studio Team Services)
    case "dev.azure.com":
    case "azure.com": {
      if (urlInfo.resource === "ssh.dev.azure.com") {
        splits = urlInfo.name.split("/");
        if (splits.length === 4) {
          urlInfo.organization = splits[1];
          urlInfo.owner = splits[2];
          urlInfo.name = splits[3];
        }
        break;
      } else {
        splits = urlInfo.name.split("/");
        if (splits.length === 5) {
          urlInfo.organization = splits[0];
          urlInfo.owner = splits[1];
          urlInfo.name = splits[4];
          urlInfo.full_name = `_git/${urlInfo.name}`;
        } else if (splits.length === 3) {
          urlInfo.name = splits[2];
          if (splits[0] === "DefaultCollection") {
            urlInfo.owner = splits[2];
            urlInfo.organization = splits[0];
            urlInfo.full_name = `${urlInfo.organization}/_git/${urlInfo.name}`;
          } else {
            urlInfo.owner = splits[0];
            urlInfo.full_name = `${urlInfo.owner}/_git/${urlInfo.name}`;
          }
        } else if (splits.length === 4) {
          urlInfo.organization = splits[0];
          urlInfo.owner = splits[1];
          urlInfo.name = splits[3];
          urlInfo.full_name = `${urlInfo.organization}/${urlInfo.owner}/_git/${urlInfo.name}`;
        }
        if (urlInfo.query && urlInfo.query.path) {
          urlInfo.filepath = urlInfo.query.path.replace(/^\/+/g, "");
        }
        if (urlInfo.query && urlInfo.query.version) {
          urlInfo.ref = urlInfo.query.version.replace(/^GB/, "");
        }
        break;
      }
    }
    default: {
      splits = urlInfo.name.split("/");
      let nameIndex = splits.length - 1;
      if (splits.length >= 2) {
        const dashIndex = splits.indexOf("-", 2);
        const blobIndex = splits.indexOf("blob", 2);
        const treeIndex = splits.indexOf("tree", 2);
        const commitIndex = splits.indexOf("commit", 2);
        const issuesIndex = splits.indexOf("issues", 2);
        const srcIndex = splits.indexOf("src", 2);
        const rawIndex = splits.indexOf("raw", 2);
        const editIndex = splits.indexOf("edit", 2);
        nameIndex = dashIndex > 0 ? dashIndex - 1 : blobIndex > 0 && treeIndex > 0 ? Math.min(blobIndex - 1, treeIndex - 1) : blobIndex > 0 ? blobIndex - 1 : issuesIndex > 0 ? issuesIndex - 1 : treeIndex > 0 ? treeIndex - 1 : commitIndex > 0 ? commitIndex - 1 : srcIndex > 0 ? srcIndex - 1 : rawIndex > 0 ? rawIndex - 1 : editIndex > 0 ? editIndex - 1 : nameIndex;
        urlInfo.owner = splits.slice(0, nameIndex).join("/");
        urlInfo.name = splits[nameIndex];
        if (commitIndex && issuesIndex < 0) {
          urlInfo.commit = splits[nameIndex + 2];
        }
      }
      urlInfo.ref = "";
      urlInfo.filepathtype = "";
      urlInfo.filepath = "";
      const offsetNameIndex = splits.length > nameIndex && splits[nameIndex + 1] === "-" ? nameIndex + 1 : nameIndex;
      if (splits.length > offsetNameIndex + 2 && ["raw", "src", "blob", "tree", "edit"].includes(splits[offsetNameIndex + 1])) {
        urlInfo.filepathtype = splits[offsetNameIndex + 1];
        urlInfo.ref = splits[offsetNameIndex + 2];
        if (splits.length > offsetNameIndex + 3) {
          urlInfo.filepath = splits.slice(offsetNameIndex + 3).join("/");
        }
      }
      urlInfo.organization = urlInfo.owner;
      break;
    }
  }
  if (!urlInfo.full_name) {
    urlInfo.full_name = urlInfo.owner;
    if (urlInfo.name) {
      urlInfo.full_name && (urlInfo.full_name += "/");
      urlInfo.full_name += urlInfo.name;
    }
  }
  if (urlInfo.owner.startsWith("scm/")) {
    urlInfo.source = "bitbucket-server";
    urlInfo.owner = urlInfo.owner.replace("scm/", "");
    urlInfo.organization = urlInfo.owner;
    urlInfo.full_name = `${urlInfo.owner}/${urlInfo.name}`;
  }
  const bitbucket = /(projects|users)\/(.*?)\/repos\/(.*?)((\/.*$)|$)/;
  const matches = bitbucket.exec(urlInfo.pathname);
  if (matches != null) {
    urlInfo.source = "bitbucket-server";
    if (matches[1] === "users") {
      urlInfo.owner = `~${matches[2]}`;
    } else {
      urlInfo.owner = matches[2];
    }
    urlInfo.organization = urlInfo.owner;
    urlInfo.name = matches[3];
    splits = matches[4].split("/");
    if (splits.length > 1) {
      if (["raw", "browse"].includes(splits[1])) {
        urlInfo.filepathtype = splits[1];
        if (splits.length > 2) {
          urlInfo.filepath = splits.slice(2).join("/");
        }
      } else if (splits[1] === "commits" && splits.length > 2) {
        urlInfo.commit = splits[2];
      }
    }
    urlInfo.full_name = `${urlInfo.owner}/${urlInfo.name}`;
    if (urlInfo.query.at) {
      urlInfo.ref = urlInfo.query.at;
    } else {
      urlInfo.ref = "";
    }
  }
  if (refs.length !== 0 && urlInfo.ref) {
    urlInfo.ref = findLongestMatchingSubstring(urlInfo.href, refs) || urlInfo.ref;
    urlInfo.filepath = urlInfo.href.split(`${urlInfo.ref}/`)[1];
  }
  return urlInfo;
}
gitUrlParse.stringify = function(obj, type) {
  type = type || (obj.protocols && obj.protocols.length ? obj.protocols.join("+") : obj.protocol || "");
  const port = obj.port ? `:${obj.port}` : "";
  const user = obj.user || "git";
  const maybeGitSuffix = obj.git_suffix ? ".git" : "";
  switch (type) {
    case "ssh": {
      if (port)
        return `ssh://${user}@${obj.resource}${port}/${obj.full_name}${maybeGitSuffix}`;
      else
        return `${user}@${obj.resource}:${obj.full_name}${maybeGitSuffix}`;
    }
    case "git+ssh":
    case "ssh+git":
    case "ftp":
    case "ftps": {
      return `${type}://${user}@${obj.resource}${port}/${obj.full_name}${maybeGitSuffix}`;
    }
    case "http":
    case "https": {
      const auth = obj.token ? buildToken(obj) : obj.user && (obj.protocols.includes("http") || obj.protocols.includes("https")) ? `${obj.user}@` : "";
      return `${type}://${auth}${obj.resource}${port}/${buildPath(obj)}${maybeGitSuffix}`;
    }
    default: {
      return obj.href;
    }
  }
};
function buildToken(obj) {
  switch (obj.source) {
    case "bitbucket.org": {
      return `x-token-auth:${obj.token}@`;
    }
    default: {
      return `${obj.token}@`;
    }
  }
}
function buildPath(obj) {
  switch (obj.source) {
    case "bitbucket-server": {
      return `scm/${obj.full_name}`;
    }
    default: {
      const encoded_full_name = obj.full_name.split("/").map((x) => encodeURIComponent(x)).join("/");
      return encoded_full_name;
    }
  }
}
function findLongestMatchingSubstring(string, array) {
  let longestMatch = "";
  array.forEach((item) => {
    if (string.includes(item) && item.length > longestMatch.length) {
      longestMatch = item;
    }
  });
  return longestMatch;
}

async function createContext(nuxt, options) {
  const rootDir = nuxt.options.rootDir || process.cwd();
  const git = await getGit(rootDir);
  const packageManager = await packageManagerDetector.detect({ cwd: rootDir });
  const { seed } = options;
  const projectHash = await getProjectHash(rootDir, git, seed);
  const projectSession = getProjectSession(projectHash, seed);
  const nuxtVersion = kit.getNuxtVersion(nuxt);
  const nuxtMajorVersion = kit.isNuxt3(nuxt) ? 3 : 2;
  const nodeVersion = process.version.replace("v", "");
  const isEdge = nuxtVersion.includes("edge");
  return {
    nuxt,
    seed,
    git,
    projectHash,
    projectSession,
    nuxtVersion,
    nuxtMajorVersion,
    isEdge,
    cli: getCLI(),
    nodeVersion,
    os: os__default.type().toLocaleLowerCase(),
    environment: getEnv(),
    packageManager: packageManager?.name || "unknown",
    concent: options.consent
  };
}
function getEnv() {
  if (stdEnv.provider) {
    return stdEnv.provider;
  }
  if (isDocker__default()) {
    return "Docker";
  }
  return "unknown";
}
function getCLI() {
  const entry = process.argv[1];
  const knownCLIs = {
    "nuxt-ts.js": "nuxt-ts",
    "nuxt-start.js": "nuxt-start",
    "nuxt.js": "nuxt",
    "nuxi": "nuxi"
  };
  for (const _key in knownCLIs) {
    const key = _key;
    if (entry.includes(key)) {
      const edge = entry.includes("-edge") ? "-edge" : entry.includes("-nightly") ? "-nightly" : "";
      return knownCLIs[key] + edge;
    }
  }
  return "programmatic";
}
function getProjectSession(projectHash, sessionId) {
  return hash(`${projectHash}#${sessionId}`);
}
function getProjectHash(rootDir, git, seed) {
  let id;
  if (git && git.url) {
    id = `${git.source}#${git.owner}#${git.name}`;
  } else {
    id = `${rootDir}#${seed}`;
  }
  return hash(id);
}
async function getGitRemote(cwd) {
  let gitRemoteUrl = null;
  try {
    gitRemoteUrl = node_child_process.execSync("git config --get remote.origin.url  ", { encoding: "utf8", cwd }).trim() || null;
  } catch {
  }
  return gitRemoteUrl;
}
async function getGit(rootDir) {
  const gitRemote = await getGitRemote(rootDir);
  if (!gitRemote) {
    return;
  }
  const meta = gitUrlParse(gitRemote);
  const url = meta.toString("https");
  return {
    url,
    gitRemote,
    source: meta.source,
    owner: meta.owner,
    name: meta.name
  };
}

const logger = kit.useLogger("@nuxt/telemetry");

const build = function({ nuxt }, payload) {
  const duration = { build: payload.duration.build };
  let isSuccess = true;
  for (const [name, stat] of Object.entries(payload.stats)) {
    duration[name] = stat.duration;
    if (!stat.success) {
      isSuccess = false;
    }
  }
  return {
    name: "build",
    isSuccess,
    isDev: nuxt.options.dev || false,
    duration
    // size
  };
};

const command = function({ nuxt }) {
  let command2 = process.argv[2] || "unknown";
  const flagMap = {
    dev: "dev",
    _generate: "generate",
    _export: "export",
    _build: "build",
    _serve: "serve",
    _start: "start"
  };
  for (const _flag in flagMap) {
    const flag = _flag;
    if (nuxt.options[flag]) {
      command2 = flagMap[flag];
      break;
    }
  }
  return {
    name: "command",
    command: command2
  };
};

const generate = function generate2({ nuxt }, payload) {
  return {
    name: "generate",
    // @ts-expect-error Legacy type from Nuxt 2
    isExport: !!nuxt.options._export,
    routesCount: payload.routesCount,
    duration: {
      generate: payload.duration.generate
    }
  };
};

const module$2 = function({ nuxt: { options } }) {
  const events = [];
  const modules = (options._installedModules || []).filter((m) => m.meta?.version).map((m) => ({
    name: m.meta.name,
    version: m.meta.version,
    timing: m.timings?.setup || 0
  }));
  for (const m of modules) {
    events.push({
      name: "module",
      moduleName: m.name,
      version: m.version,
      timing: m.timing
    });
  }
  return events;
};

const project = function(context) {
  const { options } = context.nuxt;
  return {
    name: "project",
    type: context.git && context.git.url ? "git" : "local",
    isSSR: options.ssr !== false,
    target: options._generate ? "static" : "server",
    packageManager: context.packageManager
  };
};

const session = function({ seed }) {
  return {
    name: "session",
    id: seed
  };
};

const files = async function(context) {
  const { options } = context.nuxt;
  const nuxtIgnore = fs__default.existsSync(pathe.resolve(options.rootDir, ".nuxtignore"));
  const nuxtRc = fs__default.existsSync(pathe.resolve(options.rootDir, ".nuxtrc"));
  const appConfig = fs__default.existsSync(await kit.resolvePath("~/app.config"));
  return {
    name: "files",
    nuxtIgnore,
    nuxtRc,
    appConfig
  };
};

class Telemetry {
  nuxt;
  options;
  storage;
  // TODO
  _contextPromise;
  events = [];
  eventFactories = {
    build,
    command,
    generate,
    module: module$2,
    project,
    session,
    files
  };
  constructor(nuxt, options) {
    this.nuxt = nuxt;
    this.options = options;
  }
  getContext() {
    if (!this._contextPromise) {
      this._contextPromise = createContext(this.nuxt, this.options);
    }
    return this._contextPromise;
  }
  createEvent(name, payload) {
    const eventFactory = this.eventFactories[name];
    if (typeof eventFactory !== "function") {
      logger.warn("Unknown event:", name);
      return;
    }
    const eventPromise = this._invokeEvent(name, eventFactory, payload);
    this.events.push(eventPromise);
  }
  async _invokeEvent(name, eventFactory, payload) {
    try {
      const context = await this.getContext();
      const event = await eventFactory(context, payload);
      event.name = name;
      return event;
    } catch (err) {
      logger.error("Error while running event:", err);
    }
  }
  async getPublicContext() {
    const context = await this.getContext();
    const eventContext = {};
    for (const key of [
      "nuxtVersion",
      "nuxtMajorVersion",
      "isEdge",
      "nodeVersion",
      "cli",
      "os",
      "environment",
      "projectHash",
      "projectSession"
    ]) {
      eventContext[key] = context[key];
    }
    return eventContext;
  }
  async sendEvents(debug) {
    const events = [].concat(...(await Promise.all(this.events)).filter(Boolean));
    this.events = [];
    const context = await this.getPublicContext();
    const body = {
      timestamp: Date.now(),
      context,
      events
    };
    if (this.options.endpoint) {
      const start = Date.now();
      try {
        if (debug) {
          logger.info("Sending events:", JSON.stringify(body, null, 2));
        }
        await postEvent(this.options.endpoint, body);
        if (debug) {
          logger.success(`Events sent to \`${this.options.endpoint}\` (${Date.now() - start} ms)`);
        }
      } catch (err) {
        if (debug) {
          logger.error(`Error sending sent to \`${this.options.endpoint}\` (${Date.now() - start} ms)
`, err);
        }
      }
    }
  }
}

const module$1 = kit.defineNuxtModule({
  meta: {
    name: "@nuxt/telemetry",
    configKey: "telemetry"
  },
  defaults: {
    endpoint: process.env.NUXT_TELEMETRY_ENDPOINT || "https://telemetry.nuxt.com",
    debug: destr.destr(process.env.NUXT_TELEMETRY_DEBUG),
    enabled: void 0,
    seed: void 0
  },
  async setup(toptions, nuxt) {
    if (!toptions.debug) {
      logger.level = 0;
    }
    const _topLevelTelemetry = nuxt.options.telemetry;
    if (_topLevelTelemetry !== true) {
      if (toptions.enabled === false || _topLevelTelemetry === false || !await consent.ensureUserconsent(toptions)) {
        logger.info("Telemetry disabled");
        return;
      }
    }
    logger.info("Telemetry enabled");
    if (!toptions.seed || typeof toptions.seed !== "string") {
      toptions.seed = randomSeed();
      consent.updateUserNuxtRc("telemetry.seed", toptions.seed);
      logger.info("Seed generated:", toptions.seed);
    }
    const t = new Telemetry(nuxt, toptions);
    nuxt.hook("modules:done", async () => {
      t.createEvent("project");
      if (nuxt.options.dev) {
        t.createEvent("session");
        t.createEvent("files");
      }
      t.createEvent("command");
      t.createEvent("module");
      await nuxt.callHook("telemetry:setup", t);
      t.sendEvents(toptions.debug);
    });
  }
});

module.exports = module$1;
