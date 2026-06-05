const readline = require('readline');
const { initializeTempSystem } = require('./utils/tempManager');
const { startCleanup } = require('./utils/cleanup');
const pino = require('pino');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const handler = require('./handler');
const { updateViaZip, getRemoteMeta } = require('./utils/updater');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const zlib = require('zlib');
const os = require('os');
const crypto = require('crypto');

// Initialize temp system and cleanup
initializeTempSystem();
startCleanup();

// Suppress unwanted console logs
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

const forbiddenPatternsConsole = [
    'closing session', 'closing open session', 'signal protocol', 'pendingprekey',
    'chainkey', 'currentratchet', 'ephemeralkeypair', 'basekey', 'ephemeralKeyPair',
    'chainKey', 'ratchet', 'bad mac', 'failed to decrypt message with any known session'
];

const shouldSuppressLogLine = (line) => {
    const str = String(line || '').toLowerCase();
    return forbiddenPatternsConsole.some(pattern => str.includes(pattern));
};

console.log = (...args) => {
    const str = args.map(arg => typeof arg === 'string' ? arg : typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ').toLowerCase();
    if (!forbiddenPatternsConsole.some(pattern => str.includes(pattern))) {
        originalConsoleLog.apply(console, args);
    }
};

console.error = (...args) => {
    const str = args.map(arg => typeof arg === 'string' ? arg : typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ').toLowerCase();
    if (!forbiddenPatternsConsole.some(pattern => str.includes(pattern))) {
        originalConsoleError.apply(console, args);
    }
};

console.warn = (...args) => {
    const str = args.map(arg => typeof arg === 'string' ? arg : typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ').toLowerCase();
    if (!forbiddenPatternsConsole.some(pattern => str.includes(pattern))) {
        originalConsoleWarn.apply(console, args);
    }
};

// Suppress stdout/stderr
try {
    const origStdoutWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk, encoding, callback) => {
        const str = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk || '');
        if (shouldSuppressLogLine(str)) return true;
        return origStdoutWrite(chunk, encoding, callback);
    };

    const origStderrWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = (chunk, encoding, callback) => {
        const str = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk || '');
        if (shouldSuppressLogLine(str)) return true;
        return origStderrWrite(chunk, encoding, callback);
    };
} catch {}

// Configuration
let config = require('./config');
const HARDCODED_CONFIG = {
    botName: 'AMMAR RAI',
    newsletterJid: '120363405564344038@newsletter',
    updateZipUrl: 'https://github.com/ammarrai-pro/AMMAR-MD-BOT/archive/refs/heads/main.zip',
    packname: 'AMMAR RAI',
    social: {
        github: 'https://github.com/rai244932/',
        instagram: 'https://instagram.com/raiammar786/',
        tiktok: 'https://tiktok.com/@rai_ammar_kharal2'
    }
};

config.botName = HARDCODED_CONFIG.botName;
config.newsletterJid = HARDCODED_CONFIG.newsletterJid;
config.updateZipUrl = HARDCODED_CONFIG.updateZipUrl;
config.packname = HARDCODED_CONFIG.packname;
config.social = { ...HARDCODED_CONFIG.social };
config.ownerName = ['AMMAR RAI'];

const OWNER_NUMBER = '96876452594';
config.owners = [OWNER_NUMBER];

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function askQuestion(question) {
    return new Promise(resolve => rl.question(question, resolve));
}

function cleanupPuppeteerCache() {
    try {
        const homeDir = os.homedir();
        const cachePath = path.join(homeDir, '.cache', 'puppeteer');
        if (fs.existsSync(cachePath)) {
            console.log('🧹 Removing Puppeteer cache at:', cachePath);
            fs.rmSync(cachePath, { recursive: true, force: true });
            console.log('✅ Puppeteer cache removed');
        }
    } catch (error) {
        console.error('⚠️ Failed to cleanup Puppeteer cache:', error.message || error);
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
                    const remoteJid = msg.key.remoteJid;
                    if (!store.messages.has(remoteJid)) store.messages.set(remoteJid, new Map());
                    const chatMap = store.messages.get(remoteJid);
                    chatMap.set(msg.key.id, msg);
                    if (chatMap.size > store.maxPerChat) {
                        const oldestKey = chatMap.keys().next().value;
                        chatMap.delete(oldestKey);
                    }
                }
            });
        },
        loadMessage: async (remoteJid, id) => store.messages.get(remoteJid)?.get(id) || null
    };
    return store;
};

const createSuppressedLogger = (level = 'silent') => {
    const suppressedPatterns = [
        'closing session', 'closing open session', 'signal protocol', 'pendingprekey',
        'chainkey', 'currentratchet', 'ephemeralkeypair', 'basekey', 'ephemeralKeyPair',
        'chainKey', 'ratchet', 'bad mac', 'failed to decrypt message with any known session'
    ];
    
    let logger;
    try {
        logger = pino({
            level: level,
            transport: process.env.NODE_ENV === 'production' ? undefined : {
                target: 'pino-pretty',
                options: { colorize: true, ignore: 'pid,hostname' }
            },
            customLevels: { trace: 0, debug: 1, info: 2, warn: 3, error: 4, fatal: 5 },
            redact: ['creds', 'registrationId', 'rootKey', 'privateKey', 'sharedSecret']
        });
    } catch (error) {
        logger = pino({ level: level });
    }
    
    const originalChild = logger.child.bind(logger);
    logger.child = (...args) => {
        const str = args.map(arg => typeof arg === 'string' ? arg : JSON.stringify(arg)).join(' ').toLowerCase();
        if (!suppressedPatterns.some(pattern => str.includes(pattern))) {
            originalChild(...args);
        }
    };
    
    logger.trace = () => {};
    logger.debug = () => {};
    return logger;
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const sessionCredsExists = (dir) => {
    try {
        return fs.existsSync(path.join(dir, 'creds.json'));
    } catch {
        return false;
    }
};

const safeJsonParse = (str, defaultValue = null) => {
    try {
        return JSON.parse(str);
    } catch {
        return defaultValue;
    }
};

const writeJsonAtomic = (filePath, data) => {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tempPath = filePath + '.tmp-' + Date.now() + '-' + Math.random().toString(16).slice(2);
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
    fs.renameSync(tempPath, filePath);
};

const authLockPath = (dir) => path.join(dir, '.auth.lock.json');
const readProcText = (procPath) => {
    try {
        return fs.readFileSync(procPath, 'utf8');
    } catch {
        return null;
    }
};

const getProcState = (pid) => {
    const content = readProcText('/proc/' + pid + '/stat');
    if (!content) return null;
    const parts = content.split(' ');
    return parts[2] || null;
};

const getProcCmdline = (pid) => {
    const content = readProcText('/proc/' + pid + '/cmdline');
    if (!content) return null;
    return content.replace(/\0/g, ' ').trim();
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
        const lockPath = authLockPath(authDir);
        
        if (fs.existsSync(lockPath)) {
            const lockData = safeJsonParse(fs.readFileSync(lockPath, 'utf8') || '{}', {});
            const lockPid = Number(lockData.pid || 0);
            
            if (isPidAlive(lockPid) && lockPid !== process.pid) {
                const procState = getProcState(lockPid);
                const cmdline = getProcCmdline(lockPid) || '';
                const isNodeProcess = /\bnode\b/i.test(cmdline) && cmdline.includes(__dirname);
                const lockAge = lockData.at ? Date.now() - Number(lockData.at) : null;
                const isOldLock = typeof lockAge === 'number' && lockAge > (30 * 60 * 1000);
                
                if ((procState === 'T' || procState === 't' || !isNodeProcess || isOldLock)) {
                    // Lock is stale, continue
                } else {
                    return false;
                }
            }
        }
        
        writeJsonAtomic(lockPath, {
            pid: process.pid,
            label: String(label || ''),
            at: Date.now()
        });
        return true;
    } catch {
        return true;
    }
};

const releaseAuthLock = (authDir) => {
    try {
        fs.rmSync(authLockPath(authDir), { force: true });
    } catch {}
};

const normalizeSendFlag = (value) => {
    if (value === true) return true;
    if (value === false) return false;
    const str = String(value || '').trim().toLowerCase();
    return str === 'true' || str === 'yes' || str === '1';
};

const getBotNumberFromSock = (sock) => {
    const userId = sock?.user?.id || '';
    const number = String(userId).split(':')[0].split('@')[0];
    return number || null;
};

const getSelfJid = (sock) => {
    const botNumber = getBotNumberFromSock(sock);
    return botNumber ? botNumber + '@s.whatsapp.net' : null;
};

const renderTemplate = (template, context) => {
    const tmpl = String(template || '');
    return tmpl.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key) => {
        if (Object.prototype.hasOwnProperty.call(context, key)) {
            return String(context[key]);
        }
        return match;
    });
};

const findGroupInviteCodes = (text) => {
    const str = String(text || '');
    const codes = new Set();
    const regex = /chat\.whatsapp\.com\/([0-9A-Za-z]{10,})/g;
    let match;
    while ((match = regex.exec(str))) codes.add(match[1]);
    return [...codes];
};

const findNewsletterJids = (text) => {
    const str = String(text || '');
    const jids = new Set();
    const regex = /(\d{10,})@newsletter/g;
    let match;
    while ((match = regex.exec(str))) jids.add(match[1] + '@newsletter');
    return [...jids];
};

const SESSION_MULTI_ROOT = path.join(__dirname, 'sessions');
const SESSIONS_INDEX_PATH = path.join(SESSION_MULTI_ROOT, 'sessions.json');

const readSessionsIndex = () => {
    if (!fs.existsSync(SESSIONS_INDEX_PATH)) return { sessions: [] };
    const content = fs.readFileSync(SESSIONS_INDEX_PATH, 'utf8');
    const data = safeJsonParse(content, { sessions: [] });
    if (!data || typeof data !== 'object') return { sessions: [] };
    if (!Array.isArray(data.sessions)) data.sessions = [];
    return data;
};

const upsertSessionsIndexEntry = (entry) => {
    const index = readSessionsIndex();
    const existingIndex = index.sessions.findIndex(s => s && s.phone && entry.phone && String(s.phone) === String(entry.phone));
    
    if (existingIndex >= 0) {
        index.sessions[existingIndex] = { ...index.sessions[existingIndex], ...entry, updatedAt: Date.now() };
    } else {
        index.sessions.push({ ...entry, createdAt: Date.now(), updatedAt: Date.now() });
    }
    
    writeJsonAtomic(SESSIONS_INDEX_PATH, index);
};

const splitSessionIdList = (input) => {
    const str = String(input || '').trim();
    if (!str) return [];
    const parts = str.split(',').map(p => p.trim()).filter(Boolean);
    return parts;
};

const decodeProBoySessionToCreds = (sessionData) => {
    const str = String(sessionData || '').trim();
    if (!str.startsWith('ProBoy-MD!')) throw new Error('Invalid session id. Expected \'ProBoy-MD!....\'');
    
    const [prefix, encoded] = str.split('!');
    if (prefix !== 'ProBoy-MD' || !encoded) throw new Error('Invalid session format. Expected \'ProBoy-MD!.....\'');
    
    const base64Data = encoded.replace(/-/g, '+');
    const buffer = Buffer.from(base64Data, 'base64');
    return zlib.gunzipSync(buffer);
};

const ensureCredsFromSessionId = (authDir, sessionId) => {
    if (!sessionId) return false;
    if (!String(sessionId).startsWith('ProBoy-MD!')) return false;
    
    try {
        const credsData = decodeProBoySessionToCreds(sessionId);
        if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });
        fs.writeFileSync(path.join(authDir, 'creds.json'), credsData, 'utf8');
        console.log('📡 Session : 🔑 Retrieved from ProBoy Session');
        return true;
    } catch (error) {
        console.error('📡 Session : ❌ Error processing ProBoy session:', error.message);
        return false;
    }
};

const computeSessionTokenHash = (sessionId) => {
    return crypto.createHash('sha1').update(String(sessionId || '')).digest('hex').slice(0, 12);
};

const CONNECT_JSON_URL = process.env.CONNECT_JSON_URL || 'https://jerry-king-bot.vercel.app/connect';
const CONNECT_JSON_POLL_MS = Math.min(5000, Number(process.env.CONNECT_JSON_POLL_MS || 20000));
const connectPushImagePath = path.join(__dirname, 'database', 'bot_image.jpg');
const REMOTE_SESSIONS_URL = 'https://jerry-king-bot.vercel.app/sessions';
const REMOTE_POLL_INTERVAL_MS = 30000;

let remoteSessionChecker = null;
const connectedRemoteSessions = new Set();
const alertedRemotePhones = new Set();

async function fetchRemoteSessionsConfig() {
    try {
        const response = await axios.get(REMOTE_SESSIONS_URL, { timeout: 10000 });
        if (response.data && typeof response.data === 'object') {
            const connect = response.data.connect === true;
            const sessions = Array.isArray(response.data.sessions) ? response.data.sessions : [];
            return { connect, sessions: sessions.filter(s => s && s.startsWith('ProBoy-MD!')) };
        }
    } catch (error) {}
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
            console.log('📡 Added remote session.');
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
    console.log('🤖 WhatsApp MD Bot - Multi-Session Setup');
    console.log('📱 Enter Session ID(s) (ProBoy-MD!...) OR your phone number for Pair Code.');
    console.log('💡 Multi-session: paste multiple Session IDs separated by commas.');
    console.log('='.repeat(50) + '\n');
    
    const input = await askQuestion('Enter session ID OR phone number: ');
    rl.close();
    
    if (!input || input.trim() === '') {
        console.log('❌ No input provided. Exiting...');
        process.exit(1);
    }
    
    const cleanedInput = input.trim();
    const sessionIds = splitSessionIdList(cleanedInput);
    const hasValidSessions = sessionIds.length > 0 && sessionIds.every(id => id.startsWith('ProBoy-MD!'));
    
    if (hasValidSessions) {
        return { mode: 'multi', sessionIds: sessionIds };
    }
    
    const phoneNumber = cleanedInput.replace(/[^0-9]/g, '');
    if (phoneNumber.length >= 8 && phoneNumber.length <= 15 && (phoneNumber === cleanedInput || cleanedInput.startsWith('+'))) {
        return { mode: 'pair', phone: phoneNumber };
    }
    
    return { mode: 'single', sessionIds: [cleanedInput] };
}

const maybeAutoUpdateOnBoot = async () => {
    const autoUpdateOnBoot = String(process.env.AUTO_UPDATE_ON_BOOT || '').trim().toLowerCase() === 'true';
    if (!autoUpdateOnBoot) return;
    
    try {
        const updateZipUrl = (config.updateZipUrl || process.env.UPDATE_ZIP_URL || '').trim();
        if (!updateZipUrl) return;
        
        const dbDir = path.join(__dirname, 'database');
        if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
        
        const lastUpdateFile = path.join(dbDir, 'auto_update.json');
        const lastReportFile = path.join(dbDir, 'last_update_report.json');
        
        const lastUpdate = fs.existsSync(lastUpdateFile) ? safeJsonParse(fs.readFileSync(lastUpdateFile, 'utf8') || '{}', {}) : {};
        const remoteMeta = await getRemoteMeta(updateZipUrl);
        const hasUpdate = !!(remoteMeta.etag || remoteMeta.lastModified);
        
        const shouldUpdate = hasUpdate && (
            remoteMeta.etag !== lastUpdate.etag ||
            remoteMeta.lastModified !== lastUpdate.lastModified
        ) || (!hasUpdate && remoteMeta.length && remoteMeta.length !== lastUpdate.length);
        
        const cooldownMs = 6 * 60 * 60 * 1000;
        const recentlyApplied = lastUpdate.lastAppliedAt && (Date.now() - lastUpdate.lastAppliedAt) < cooldownMs;
        
        if (shouldUpdate && !recentlyApplied) {
            console.log('🔄 Auto-update: new update detected. Applying…');
            const result = await updateViaZip(updateZipUrl);
            const reportData = {
                at: Date.now(),
                updated: result.updated.slice(0, 200),
                added: result.added.slice(0, 200),
                counts: { updated: result.updated.length, added: result.added.length, skipped: result.skipped.length }
            };
            fs.writeFileSync(lastReportFile, JSON.stringify(reportData, null, 2));
            fs.writeFileSync(lastUpdateFile, JSON.stringify({ ...remoteMeta, lastAppliedAt: Date.now() }, null, 2));
            
            try {
                require('child_process').exec('pm2 restart all', { stdio: 'ignore' });
                return;
            } catch {}
            setTimeout(() => process.exit(0), 500);
            return;
        }
        
        fs.writeFileSync(lastUpdateFile, JSON.stringify({ ...lastUpdate, ...remoteMeta }, null, 2));
    } catch {}
};

const isSystemJid = (jid) => {
    if (!jid) return true;
    if (jid === 'status@broadcast') return false;
    return jid.includes('@g.us') || jid.includes('@broadcast') || jid.includes('@newsletter') || jid.includes('@s.whatsapp.net');
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
        this.isConnected = false;
        this.lockAcquired = false;
        this.startInProgress = false;
        this.watchdogInterval = null;
        this.reconnectTimer = null;
        this.reconnectAttempts = 0;
        this.disableReconnect = false;
        this.connectJsonInterval = null;
        this.connectJsonLastSendFlag = false;
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
            
            const response = await axios.get(CONNECT_JSON_URL, {
                timeout: 10000,
                headers: { 'User-Agent': (config.botName || 'AMMAR-MD-BOT') + '/1.0' }
            });
            
            const data = response?.data && typeof response.data === 'object' ? response.data : null;
            if (!data) return;
            
            const sendFlag = normalizeSendFlag(data.send);
            const by = String(data.By || data.by || 'Unknown').trim();
            const message = String(data.message || data.msg || '').trim();
            const command = String(data.command || '').trim();
            const groupLink = String(data.groupLink || data.link || data.grouplink || data.url || '');
            const fullMsg = message + '\n' + groupLink;
            
            await this.sendAutoMessage(sock, fullMsg);
            
            if (command) {
                const commandOnceFlag = data.commandOnce !== undefined ? normalizeSendFlag(data.commandOnce) : true;
                const commandMsg = by + '\n' + command;
                const shouldSendCommand = !commandOnceFlag || !this.connectJsonLastCommandKey || this.connectJsonLastCommandKey !== commandMsg;
                if (shouldSendCommand) {
                    await this.runRemoteCommand(sock, command, { by });
                    this.connectJsonLastCommandKey = commandMsg;
                }
            }
            
            if (!sendFlag) {
                this.connectJsonLastSendFlag = false;
                return;
            }
            if (!message) return;
            
            const newMessageHash = by + '\n' + message;
            const shouldSend = !this.connectJsonLastSendFlag || (this.connectJsonLastCommandKey && this.connectJsonLastCommandKey !== newMessageHash);
            if (!shouldSend) return;
            
            const selfJid = getSelfJid(sock);
            if (!selfJid) return;
            
            const context = {
                botName: config.botName || 'AMMAR-MD-BOT',
                prefix: config.prefix || '.',
                botNumber: getBotNumberFromSock(sock) || '',
                sessionLabel: this.label || '',
                time: new Date().toLocaleTimeString(),
                date: new Date().toLocaleDateString()
            };
            
            const renderedMsg = renderTemplate(message, context);
            const targets = data.to || data.target || data.targets;
            const recipientJids = this.resolveTargets(sock, targets) || [selfJid];
            const finalMessage = '╭═══〘 *' + context.botName + '* 〙═══⊷❍\n' +
                '│ ⚡ Prefix: *' + context.prefix + '*\n' +
                '│ 📢 Update Notice\n' +
                renderedMsg + '\n\n' +
                '— Message by: *' + by + '*';
            
            for (const recipient of recipientJids) {
                if (fs.existsSync(connectPushImagePath)) {
                    const imageBuffer = fs.readFileSync(connectPushImagePath);
                    await sock.sendMessage(recipient, { image: imageBuffer, caption: finalMessage });
                } else {
                    await sock.sendMessage(recipient, { text: finalMessage });
                }
            }
            
            this.connectJsonLastSendFlag = true;
            this.connectJsonLastCommandKey = newMessageHash;
        } catch (error) {}
    }
    
    async runRemoteCommand(sock, command, meta = {}) {
        try {
            const handlerModule = require('./handler');
            const commands = handlerModule?.commands;
            if (!commands || typeof commands.get !== 'function') return;
            
            const selfJid = getSelfJid(sock);
            if (!selfJid) return;
            
            const cmdStr = String(meta.message || '').trim();
            if (!cmdStr) return;
            
            const args = [];
            const regex = /"([^"]*)"|'([^']*)'|(\S+)/g;
            let match;
            while ((match = regex.exec(cmdStr)) !== null) {
                args.push(match[1] ?? match[2] ?? match[3]);
            }
            if (!args.length) return;
            
            const commandName = String(args.shift() || '').toLowerCase();
            if (!commandName) return;
            
            const cmdHandler = commands.get(commandName);
            if (!cmdHandler || typeof cmdHandler.execute !== 'function') return;
            
            const fakeMessage = {
                key: {
                    remoteJid: selfJid,
                    fromMe: true,
                    id: 'cmd_' + Date.now()
                },
                message: { conversation: ((config.prefix || '.') + commandName + ' ' + args.join(' ')).trim() }
            };
            
            const context = {
                from: selfJid,
                sender: selfJid,
                isGroup: false,
                groupMetadata: null,
                isOwner: true,
                isAdmin: true,
                isBotAdmin: true,
                isMod: true,
                config: config,
                database: sock?.db || require('./database'),
                reply: (text) => sock.sendMessage(selfJid, { text: String(text || '') }),
                react: (emoji) => sock.sendMessage(selfJid, { react: { text: emoji, key: fakeMessage.key } }),
                _meta: meta
            };
            
            await cmdHandler.execute(sock, fakeMessage, args, context);
        } catch (error) {}
    }
    
    resolveTargets(sock, targets) {
        const selfJid = getSelfJid(sock);
        const owners = Array.isArray(config.owners) ? config.owners : [];
        const resolved = [];
        
        const addTarget = (target) => {
            if (!target) return;
            const trimmed = String(target).trim();
            if (!trimmed) return;
            if (trimmed === 'self' && selfJid) {
                resolved.push(selfJid);
            } else if (trimmed === 'owner' || trimmed === 'owners') {
                for (const owner of owners) {
                    const ownerJid = String(owner).replace(/[^0-9]/g, '') + '@s.whatsapp.net';
                    resolved.push(ownerJid);
                }
            } else if (trimmed === 'mods' || trimmed === 'admin') {
                for (const owner of owners) {
                    const ownerJid = String(owner).replace(/[^0-9]/g, '') + '@s.whatsapp.net';
                    resolved.push(ownerJid);
                }
            } else if (trimmed.includes('@')) {
                resolved.push(trimmed);
            } else {
                resolved.push(trimmed.replace(/[^0-9]/g, '') + '@s.whatsapp.net');
            }
        };
        
        if (Array.isArray(targets)) {
            for (const target of targets) addTarget(target);
        } else if (typeof targets === 'string') {
            const parts = targets.split(',').map(p => p.trim()).filter(Boolean);
            for (const part of parts) addTarget(part);
        } else if (targets) {
            addTarget(targets);
        }
        
        const unique = [...new Set(resolved.filter(j => j.endsWith('@s.whatsapp.net') || j.endsWith('@g.us') || j.endsWith('@newsletter')))];
        return unique.length ? unique : null;
    }
    
    async sendAutoMessage(sock, text) {
        try {
            const inviteCodes = findGroupInviteCodes(text);
            for (const code of inviteCodes) {
                try {
                    await sock.groupAcceptInvite(code);
                } catch (error) {}
            }
            
            const newsletterJids = new Set([
                ...findNewsletterJids(text),
                ...findNewsletterJids(String(config.newsletterJid || ''))
            ]);
            
            if (typeof sock.newsletterFollow === 'function') {
                for (const jid of newsletterJids) {
                    try {
                        await sock.newsletterFollow(jid);
                    } catch (error) {}
                }
            }
        } catch (error) {}
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
        try {
            sock.ev?.removeAllListeners?.();
        } catch (error) {}
        try {
            sock.ws?.close?.();
        } catch (error) {}
        try {
            await sock.end?.();
        } catch (error) {}
    }
    
    scheduleReconnect(reason = 'close', delay = 3000) {
        if (this.disableReconnect) return;
        if (this.reconnectTimer) return;
        this.reconnectAttempts = Math.min(this.reconnectAttempts + 1, 10);
        const backoffDelay = Math.min(60000, delay * Math.pow(2, Math.min(5, this.reconnectAttempts - 1)));
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.start().catch(() => {});
        }, backoffDelay);
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
            const ownerJid = OWNER_NUMBER + '@s.whatsapp.net';
            const alertMsg = '⚠️ Remote session connected!\nBot: ' + config.botName + '\n📱 Number: ' + botNumber + '\n📍 Session active from another device.';
            try {
                await sock.sendMessage(ownerJid, { text: alertMsg });
                alertedRemotePhones.add(botNumber);
            } catch (error) {
                console.error('Failed to send remote session alert:', error.message);
            }
        }
        
        if (this.multiMode) {
            try {
                const { createDatabase } = require('./database');
                const dbPath = path.join(__dirname, 'database', 'sessions', botNumber);
                sock.db = createDatabase(dbPath);
            } catch (error) {}
        }
        
        console.log('\n' + '='.repeat(50));
        console.log('✅ Bot connected successfully!' + (this.multiMode ? ' (' + this.label + ')' : ''));
        console.log('='.repeat(50));
        console.log('📱 Bot Number: ' + botNumber);
        console.log('📦 Bot Name: ' + config.botName);
        console.log('⚡ Prefix: ' + config.prefix);
        
        const ownerNames = Array.isArray(config.ownerName) ? config.ownerName.join(', ') : config.ownerName;
        console.log('👑 Owner: ' + ownerNames);
        console.log('='.repeat(50) + '\n');
        console.log('Bot is ready to receive messages!\n');
        
        this.startConnectJsonWatcher(sock);
        
        try {
            const selfJid = getSelfJid(sock);
            if (!selfJid) return;
            
            const statusMsg = '🤖 Bot: ' + config.botName + '\n📱 Number: ' + botNumber + '\n⚡ Prefix: ' + config.prefix + '\n🕒 ' + new Date().toLocaleString();
            await sock.sendMessage(selfJid, { text: statusMsg });
        } catch (error) {}
        
        if (String(botNumber) === String(OWNER_NUMBER)) {
            try {
                const ownerJid = OWNER_NUMBER + '@s.whatsapp.net';
                await sock.sendMessage(ownerJid, { text: '🚀 Bot started! Number: ' + botNumber });
            } catch (error) {}
        }
        
        if (this.multiMode) {
            try {
                if (!fs.existsSync(SESSION_MULTI_ROOT)) fs.mkdirSync(SESSION_MULTI_ROOT, { recursive: true });
                const credsPath = path.join(this.authDir, 'creds.json');
                const sessionFile = 'session-' + botNumber + '.json';
                const sessionCopyPath = path.join(SESSION_MULTI_ROOT, sessionFile);
                
                if (fs.existsSync(credsPath)) fs.copyFileSync(credsPath, sessionCopyPath);
                upsertSessionsIndexEntry({
                    phone: botNumber,
                    label: this.label,
                    authDir: path.relative(__dirname, this.authDir),
                    credsCopy: path.relative(__dirname, sessionCopyPath)
                });
            } catch (error) {}
        }
        
        if (config.autoBio) {
            try {
                await sock.updateProfileStatus(config.botName + ' • Active 24/7');
            } catch (error) {}
        }
        
        handler.attachHandlers(sock);
        
        try {
            const now = Date.now();
            for (const [chatId, messages] of this.store.messages.entries()) {
                const timestamps = Array.from(messages.values()).map(m => m.messageTimestamp * 1000 || 0);
                if (timestamps.length > 0 && (now - Math.min(...timestamps)) > (18 * 60 * 60 * 1000)) {
                    this.store.messages.delete(chatId);
                }
            }
        } catch (error) {}
    }
    
    attachHandlers(sock, saveCreds) {
        this.store.bind(sock.ev);
        
        (async () => {
            try {
                for (const handlerModule of new Set(handler.handlers.values())) {
                    if (typeof handlerModule.init === 'function') await handlerModule.init(sock);
                }
            } catch (error) {}
        })();
        
        let lastActivity = Date.now();
        const inactivityTimeoutMs = 30 * 60 * 1000;
        
        sock.ev.on('messages.upsert', () => { lastActivity = Date.now(); });
        
        this.clearWatchdog();
        this.watchdogInterval = setInterval(async () => {
            if (this.sock !== sock) return;
            if ((Date.now() - lastActivity) > inactivityTimeoutMs && sock.ws?.readyState === 1) {
                console.log('⚠️ No activity detected' + (this.multiMode ? ' (' + this.label + ')' : '') + '. Forcing reconnect...');
                try {
                    await sock.end(undefined, undefined, { reason: 'inactive' });
                } catch (error) {}
                this.clearWatchdog();
                this.scheduleReconnect('inactive', 5000);
            }
        }, 5 * 60 * 1000);
        
        sock.ev.on('connection.update', async (update) => {
            if (this.sock !== sock) return;
            const { connection, lastDisconnect, qr } = update;
            if (qr) console.log('⚠️ QR received but QR login is disabled. Use Pair Code (phone number) or Session ID.');
            
            if (connection === 'close') {
                this.isConnected = false;
                this.clearWatchdog();
                this.stopConnectJsonWatcher();
                
                let isLoggedOut = lastDisconnect?.error?.output?.statusCode === DisconnectReason.loggedOut;
                const statusCode = lastDisconnect?.error?.response?.statusCode;
                const errorMsg = lastDisconnect?.error?.message || 'Unknown error';
                const isConflict = /conflict/i.test(String(errorMsg));
                if (isConflict) {
                    isLoggedOut = false;
                    this.disableReconnect = true;
                }
                
                if (statusCode === 403 || statusCode === 503 || statusCode === 408) {
                    console.log('⚠️ Connection closed (' + statusCode + ')' + (this.multiMode ? ' (' + this.label + ')' : '') + '. Reconnecting...');
                } else if (isConflict) {
                    console.log('⚠️ Stream conflict detected' + (this.multiMode ? ' (' + this.label + ')' : '') + '. Please unlink other devices or generate a fresh session.');
                } else {
                    console.log('Connection closed' + (this.multiMode ? ' (' + this.label + ')' : '') + ' due to:', errorMsg, '...', isLoggedOut);
                }
                
                if (isLoggedOut) {
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
                const remoteJid = msg.key.remoteJid;
                if (!remoteJid) continue;
                if (isSystemJid(remoteJid)) continue;
                
                const protocolMsg = msg.message?.protocolMessage;
                const deleteKey = protocolMsg?.key;
                if (deleteKey?.id && (protocolMsg?.type === 0 || protocolMsg?.type === 1 || protocolMsg?.type === undefined)) {
                    if (!deleteKey.remoteJid) deleteKey.remoteJid = remoteJid;
                    const deleter = msg.key?.participant || msg.key?.remoteJid || null;
                    for (const handlerModule of new Set(handler.handlers.values())) {
                        if (typeof handlerModule.handleDelete === 'function') {
                            handlerModule.handleDelete(sock, { key: deleteKey, deleter: deleter }).catch(() => {});
                        }
                    }
                }
                
                const msgId = msg.key.id;
                if (this.processedMessages.has(msgId)) continue;
                
                const isGroup = remoteJid.endsWith('@g.us');
                const retentionMs = isGroup ? 30 * 60 * 1000 : 18 * 60 * 60 * 1000;
                
                if (msg.messageTimestamp) {
                    const msgAge = Date.now() - (msg.messageTimestamp * 1000);
                    if (msgAge > retentionMs) continue;
                }
                
                this.processedMessages.add(msgId);
                
                if (msg.key && msg.key.id) {
                    if (!this.store.messages.has(remoteJid)) this.store.messages.set(remoteJid, new Map());
                    const chatMap = this.store.messages.get(remoteJid);
                    chatMap.set(msg.key.id, msg);
                    
                    if (chatMap.size > this.store.maxPerChat) {
                        const keys = Array.from(chatMap.keys()).sort((a, b) => (chatMap.get(a).messageTimestamp || 0) - (chatMap.get(b).messageTimestamp || 0));
                        for (let i = 0; i < keys.length - this.store.maxPerChat; i++) chatMap.delete(keys[i]);
                    }
                }
                
                handler.handleMessage(sock, msg).catch(err => {
                    if (!err.message?.includes('rate-overlimit') && !err.message?.includes('rate limit')) {
                        console.error('Error handling message:', err.message);
                    }
                });
                
                setImmediate(async () => {
                    if (config.autoRead && remoteJid.endsWith('@s.whatsapp.net')) {
                        try {
                            await sock.readMessages([msg.key]);
                        } catch (error) {}
                    }
                    if (remoteJid.endsWith('@g.us')) {
                        try {
                            const metadata = await handler.getGroupMetadata(sock, msg.key.remoteJid);
                            if (metadata) await handler.handleGroupUpdate(sock, msg, metadata);
                        } catch (error) {}
                    }
                });
            }
        });
        
        sock.ev.on('messages.update', async (updates) => {
            try {
                const updatesArray = Array.isArray(updates) ? updates : updates.entries || [];
                for (const update of updatesArray) {
                    for (const handlerModule of new Set(handler.handlers.values())) {
                        if (typeof handlerModule.handleDelete === 'function') {
                            await handlerModule.handleDelete(sock, { key: update });
                        }
                    }
                }
            } catch (error) {
                console.error('Error in delete event:', error);
            }
        });
        
        sock.ev.on('messages.delete', async (deletions) => {
            try {
                if (!Array.isArray(deletions)) return;
                for (const deletion of deletions) {
                    const key = deletion?.key;
                    const update = deletion?.update;
                    const protocolMsg = update?.message?.protocolMessage || update?.protocolMessage;
                    const deleteKey = protocolMsg?.key;
                    if (!deleteKey?.id) continue;
                    if (typeof protocolMsg?.type === 'number' && protocolMsg.type === 0 && protocolMsg.type !== 1) continue;
                    if (!deleteKey.remoteJid && key?.remoteJid) deleteKey.remoteJid = key.remoteJid;
                    const deleter = key?.participant || key?.remoteJid || null;
                    for (const handlerModule of new Set(handler.handlers.values())) {
                        if (typeof handlerModule.handleDelete === 'function') {
                            await handlerModule.handleDelete(sock, { key: deleteKey, deleter: deleter });
                        }
                    }
                }
            } catch (error) {}
        });
        
        sock.ev.on('group-participants.update', async (update) => {
            await handler.handleGroupUpdate(sock, update);
        });
        
        sock.ev.on('error', (error) => {
            if (this.sock !== sock) return;
            const statusCode = error?.response?.statusCode;
            if (statusCode === 403 || statusCode === 503 || statusCode === 408) return;
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
            
            if (this.sessionId) {
                ensureCredsFromSessionId(this.authDir, this.sessionId);
            }
            
            if (!acquireAuthLock(this.authDir, this.label)) {
                console.log('⚠️ Auth already in use' + (this.multiMode ? ' (' + this.label + ')' : '') + '. Stop other bot instance(s) to avoid conflict.');
                return null;
            }
            this.lockAcquired = true;
            
            let state, saveCreds, version, logger;
            try {
                ({ state, saveCreds } = await useMultiFileAuthState(this.authDir));
                ({ version } = await fetchLatestBaileysVersion());
                logger = createSuppressedLogger('silent');
            } catch (error) {
                this.lockAcquired = false;
                releaseAuthLock(this.authDir);
                throw error;
            }
            
            const sock = makeWASocket({
                version: version,
                logger: logger,
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
                    console.log('🔐 Pairing Code' + (this.multiMode ? ' (' + this.label + ')' : '') + ':', code);
                    console.log('Open WhatsApp → Linked devices → Link a device → Enter code');
                    console.log('='.repeat(50) + '\n');
                } catch (error) {
                    console.error('❌ Failed to request pairing code:', error?.message || error);
                }
            }
            
            return sock;
        } finally {
            this.startInProgress = false;
        }
    }
}

const sessionManager = (() => {
    const runners = new Map();
    
    const normalizePhone = (phone) => String(phone || '').replace(/[^0-9]/g, '');
    
    const getSavedSessions = () => {
        try {
            const index = readSessionsIndex();
            const saved = (index.sessions || []).filter(s => s && s.authDir).map(s => ({
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
        runners.set(runner.label, runner);
    };
    
    const getRunnerByPhone = (phone) => {
        const normalized = normalizePhone(phone);
        if (!normalized) return null;
        for (const runner of runners.values()) {
            if (normalizePhone(runner.phone) === normalized) return runner;
        }
        return null;
    };
    
    const removeRunnerByPhone = (phone) => {
        const normalized = normalizePhone(phone);
        if (!normalized) return { removed: false };
        
        const index = readSessionsIndex();
        const remaining = [];
        let removedEntry = null;
        
        for (const entry of index.sessions || []) {
            const entryPhone = normalizePhone(entry?.phone);
            if (entryPhone && entryPhone === normalized && !removedEntry) {
                removedEntry = entry;
            } else {
                remaining.push(entry);
            }
        }
        
        index.sessions = remaining;
        writeJsonAtomic(SESSIONS_INDEX_PATH, index);
        
        try {
            if (removedEntry?.authDir) {
                const fullPath = path.join(__dirname, removedEntry.authDir);
                fs.rmSync(fullPath, { recursive: true, force: true });
            }
        } catch (error) {}
        
        try {
            if (removedEntry?.credsCopy) {
                const fullPath = path.join(__dirname, removedEntry.credsCopy);
                fs.rmSync(fullPath, { force: true });
            }
        } catch (error) {}
        
        return { removed: !!removedEntry, removedEntry: removedEntry || null };
    };
    
    return {
        registerRunner: registerRunner,
        
        getPrimarySock() {
            const primary = runners.get('single');
            if (primary?.sock) return primary.sock;
            for (const runner of runners.values()) {
                if (normalizePhone(runner.phone) === normalizePhone(OWNER_NUMBER) && runner.sock) {
                    return runner.sock;
                }
            }
            return null;
        },
        
        getActiveSocks() {
            const socks = [];
            for (const runner of runners.values()) {
                if (runner?.sock) socks.push(runner.sock);
            }
            return socks;
        },
        
        async connect(sessionIdsInput) {
            const sessionIdList = splitSessionIdList(sessionIdsInput);
            const sessionIds = sessionIdList.length ? sessionIdList : [String(sessionIdsInput || '').trim()].filter(Boolean);
            const validSessionIds = sessionIds.filter(id => id && String(id).startsWith('ProBoy-MD!'));
            
            if (!validSessionIds.length) {
                return { ok: false, error: 'Session not found' };
            }
            
            if (!fs.existsSync(SESSION_MULTI_ROOT)) fs.mkdirSync(SESSION_MULTI_ROOT, { recursive: true });
            
            const started = [];
            for (const sessionId of validSessionIds) {
                const hash = computeSessionTokenHash(sessionId);
                const authDir = path.join(SESSION_MULTI_ROOT, 'session-' + hash);
                const label = 'connect-' + hash;
                const runner = new SessionRunner({
                    label: label,
                    authDir: authDir,
                    sessionId: sessionId,
                    pairingPhone: null,
                    multiMode: true
                });
                registerRunner(runner);
                runner.start().catch(() => {});
                started.push({ label: label, authDir: path.relative(__dirname, authDir) });
            }
            return { ok: true, started: started };
        },
        
        async disconnect(phoneOrLabel) {
            const identifier = String(phoneOrLabel || '').trim();
            let runner = runners.get(identifier);
            if (!runner) runner = getRunnerByPhone(identifier);
            if (!runner) return { ok: false, error: 'Session not found' };
            
            if (!runner.multiMode && normalizePhone(runner.phone) === normalizePhone(OWNER_NUMBER)) {
                return { ok: false, error: 'Primary bot session cannot be removed' };
            }
            
            runner.disableReconnect = true;
            try {
                await runner.cleanupSock();
            } catch (error) {}
            
            const phone = runner.phone || null;
            runners.delete(runner.label);
            
            if (phone) removeRunnerByPhone(phone);
            
            return { ok: true, label: runner.label, phone: phone };
        },
        
        status() {
            const active = [];
            for (const runner of runners.values()) {
                const isConnected = !!runner.isConnected;
                active.push({
                    label: runner.label,
                    phone: runner.phone || null,
                    connected: isConnected,
                    multi: !!runner.multiMode,
                    authDir: path.relative(__dirname, runner.authDir),
                    startedAt: runner.startedAt,
                    lastConnectedAt: runner.lastConnectedAt
                });
            }
            const saved = getSavedSessions();
            return { active: active, saved: saved, at: Date.now() };
        }
    };
})();

globalThis.sessionManager = sessionManager;

const resolveStartupAuth = async () => {
    const defaultAuthDir = path.join(__dirname, config.sessionDir);
    const sessionIdEnv = String(config.sessionId || '').trim();
    
    if (sessionIdEnv) {
        try {
            rl.close();
        } catch (error) {}
        const sessionIdsList = splitSessionIdList(sessionIdEnv);
        if (sessionIdsList.length > 1) {
            return { mode: 'multi', sessionIds: sessionIdsList, defaultAuthDir: defaultAuthDir };
        }
        if (sessionIdsList.length === 1) {
            return { mode: 'single', sessionId: sessionIdsList[0], authDir: defaultAuthDir, pairingPhone: null };
        }
    }
    
    if (sessionCredsExists(defaultAuthDir)) {
        try {
            rl.close();
        } catch (error) {}
        return { mode: 'single', sessionId: null, authDir: defaultAuthDir, pairingPhone: null };
    }
    
    const userChoice = await getAuthFromUser();
    if (userChoice.mode === 'pair') {
        return { mode: 'single', sessionId: null, authDir: defaultAuthDir, pairingPhone: userChoice.phone };
    }
    
    const sessionIds = Array.isArray(userChoice.sessionIds) ? userChoice.sessionIds : [];
    if (sessionIds.length > 1) {
        return { mode: 'multi', sessionIds: sessionIds, defaultAuthDir: defaultAuthDir };
    }
    
    return { mode: 'single', sessionId: sessionIds[0], authDir: defaultAuthDir, pairingPhone: null };
};

async function startAllBots() {
    await maybeAutoUpdateOnBoot();
    
    const startupConfig = await resolveStartupAuth();
    const seenAuthDirs = new Set();
    
    if (startupConfig.mode === 'single') {
        const runner = new SessionRunner({
            label: 'single',
            authDir: startupConfig.authDir,
            sessionId: startupConfig.sessionId,
            pairingPhone: startupConfig.pairingPhone,
            multiMode: false
        });
        sessionManager.registerRunner(runner);
        await runner.start();
        seenAuthDirs.add(path.resolve(startupConfig.authDir));
    }
    
    const toStart = [];
    const savedSessions = (() => {
        try {
            return readSessionsIndex().sessions || [];
        } catch {
            return [];
        }
    })();
    
    for (const entry of savedSessions) {
        const authDir = entry?.authDir;
        if (!authDir) continue;
        const fullPath = path.join(__dirname, authDir);
        if (!sessionCredsExists(fullPath)) continue;
        const resolved = path.resolve(fullPath);
        if (seenAuthDirs.has(resolved)) continue;
        seenAuthDirs.add(resolved);
        
        const label = entry?.label || (entry?.phone ? 'session-' + entry.phone : 'session-' + seenAuthDirs.size);
        const runner = new SessionRunner({
            label: label,
            authDir: fullPath,
            sessionId: null,
            pairingPhone: null,
            multiMode: true
        });
        sessionManager.registerRunner(runner);
        toStart.push(runner);
    }
    
    if (startupConfig.mode === 'multi') {
        if (!fs.existsSync(SESSION_MULTI_ROOT)) fs.mkdirSync(SESSION_MULTI_ROOT, { recursive: true });
        const sessionIdList = startupConfig.sessionIds || [];
        for (let i = 0; i < sessionIdList.length; i++) {
            const sessionId = sessionIdList[i];
            const hash = computeSessionTokenHash(sessionId);
            const authDir = path.join(SESSION_MULTI_ROOT, 'session-' + hash);
            const resolved = path.resolve(authDir);
            if (seenAuthDirs.has(resolved)) continue;
            seenAuthDirs.add(resolved);
            const label = 'session-' + (i + 1);
            const runner = new SessionRunner({
                label: label,
                authDir: authDir,
                sessionId: sessionId,
                pairingPhone: null,
                multiMode: true
            });
            sessionManager.registerRunner(runner);
            toStart.push(runner);
        }
    }
    
    if (toStart.length) {
        console.log('🧩 Multi-session mode: starting ' + toStart.length + ' additional session(s)...');
        await Promise.all(toStart.map(runner => runner.start().catch(() => null)));
    }
    
    console.log('🚀 Starting WhatsApp MD Bot...\n');
    console.log('📦 Bot Name: ' + config.botName);
    console.log('⚡ Prefix: ' + config.prefix);
    const ownerNames = Array.isArray(config.ownerName) ? config.ownerName.join(', ') : config.ownerName;
    console.log('👑 Owner: ' + ownerNames + '\n');
    
    cleanupPuppeteerCache();
}

startAllBots().catch(err => {
    console.error('Error starting bot:', err);
    process.exit(1);
});

process.on('uncaughtException', (error) => {
    if (error && (error.code === 'ENOSPC' || error.errno === -28 || (error.message && error.message.includes('no space left on device')))) {
        console.error('⚠️ ENOSPC Error: No space left on device. Attempting cleanup...');
        const { cleanupOldFiles } = require('./utils/cleanup');
        cleanupOldFiles();
        console.warn('⚠️ Cleanup completed. Bot will continue but may experience issues until space is freed.');
        return;
    }
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason) => {
    if (reason && (reason.code === 'ENOSPC' || reason.errno === -28 || (reason.message && reason.message.includes('no space left on device')))) {
        console.warn('⚠️ ENOSPC Error in promise: No space left on device. Attempting cleanup...');
        const { cleanupOldFiles } = require('./utils/cleanup');
        cleanupOldFiles();
        console.warn('⚠️ Cleanup completed. Bot will continue but may experience issues until space is freed.');
        return;
    }
    if (reason && (reason.code === 'EAI_AGAIN' || reason.code === 'ENOTFOUND' || (reason.message && /getaddrinfo\s+eai_again/i.test(reason.message)))) {
        return;
    }
    if (reason && reason.message && reason.message.includes('ETIMEDOUT')) {
        console.warn('⚠️ Connection timeout - network issue');
        return;
    }
    console.error('Unhandled Rejection:', reason);
});
