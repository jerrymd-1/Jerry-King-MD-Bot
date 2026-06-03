/**
 * Session Manager Plugin - Complete Working Version
 * Commands: .sessions, .logoutuser, .blockbot, .unblockbot, .resetall, .checkblocked, .logoutself
 */

const fs = require('fs');
const path = require('path');

module.exports = {
    name: 'sessionmanager',
    aliases: ['sessions', 'logoutuser', 'blockbot', 'unblockbot', 'resetall', 'checkblocked', 'logoutself'],
    category: 'owner',
    description: 'Complete session management system',
    usage: '.sessions | .logoutuser <phone> | .blockbot <phone> | .unblockbot <phone> | .resetall confirm | .checkblocked <phone> | .logoutself',
    
    ownerOnly: true,
    
    blockedSessionsPath: path.join(__dirname, '..', '..', 'database', 'blocked_sessions.json'),
    
    init: async (sock) => {
        console.log('🔒 Session Manager Plugin Loaded - Type .sessions to see active users');
        
        const dbDir = path.dirname(module.exports.blockedSessionsPath);
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }
        
        if (!fs.existsSync(module.exports.blockedSessionsPath)) {
            fs.writeFileSync(module.exports.blockedSessionsPath, JSON.stringify({ blocked: [] }, null, 2));
        }
        
        if (!global.activeSessions) {
            global.activeSessions = [];
        }
    },
    
    execute: async (sock, msg, args, extra) => {
        const { reply, react, isOwner, from, sender } = extra;
        
        // Extract command from message
        let command = '';
        if (msg.message?.conversation) {
            const text = msg.message.conversation;
            if (text.startsWith('.')) {
                command = text.slice(1).split(' ')[0].toLowerCase();
            }
        } else if (msg.message?.extendedTextMessage?.text) {
            const text = msg.message.extendedTextMessage.text;
            if (text.startsWith('.')) {
                command = text.slice(1).split(' ')[0].toLowerCase();
            }
        }
        
        if (!command) return false;
        
        // Get the command arguments
        let fullText = '';
        if (msg.message?.conversation) fullText = msg.message.conversation;
        else if (msg.message?.extendedTextMessage?.text) fullText = msg.message.extendedTextMessage.text;
        
        const commandArgs = fullText.slice(1).trim().split(/\s+/);
        const mainCommand = commandArgs[0]?.toLowerCase();
        const targetPhone = commandArgs[1];
        
        // Owner check
        const senderNumber = sender?.split('@')[0] || from?.split('@')[0];
        const OWNER_NUMBER = '923013050530';
        
        if (senderNumber !== OWNER_NUMBER) {
            await reply('👑 *Owner Only Command*\n\nThis command can only be used by the bot owner.');
            return true;
        }
        
        // ==================== .sessions or .sessions list ====================
        if (mainCommand === 'sessions' || mainCommand === 'sessionmanager') {
            await module.exports.listSessions(sock, reply, react, from);
            return true;
        }
        
        // ==================== .logoutuser ====================
        if (mainCommand === 'logoutuser') {
            await module.exports.logoutUser(sock, reply, react, targetPhone);
            return true;
        }
        
        // ==================== .blockbot ====================
        if (mainCommand === 'blockbot') {
            await module.exports.blockUser(sock, reply, react, targetPhone);
            return true;
        }
        
        // ==================== .unblockbot ====================
        if (mainCommand === 'unblockbot') {
            await module.exports.unblockUser(sock, reply, react, targetPhone);
            return true;
        }
        
        // ==================== .resetall ====================
        if (mainCommand === 'resetall') {
            await module.exports.resetAll(sock, reply, react, targetPhone);
            return true;
        }
        
        // ==================== .checkblocked ====================
        if (mainCommand === 'checkblocked') {
            await module.exports.checkBlocked(reply, targetPhone);
            return true;
        }
        
        // ==================== .logoutself ====================
        if (mainCommand === 'logoutself') {
            await reply('⚠️ Logging out current bot...');
            setTimeout(() => process.exit(0), 2000);
            return true;
        }
        
        return false;
    },
    
    listSessions: async (sock, reply, react, from) => {
        try {
            await react('📊');
            
            // Try to get active sessions from different sources
            let sessionsList = [];
            
            // Check global active sessions
            if (global.activeSessions && global.activeSessions.length > 0) {
                sessionsList = global.activeSessions;
            }
            
            // Also check sessions folder for additional sessions
            const sessionsDir = path.join(__dirname, '..', '..', 'sessions');
            if (fs.existsSync(sessionsDir)) {
                const files = fs.readdirSync(sessionsDir);
                for (const file of files) {
                    if (file.startsWith('auth-') || file.startsWith('session-')) {
                        const phoneMatch = file.match(/\d+/);
                        if (phoneMatch && !sessionsList.some(s => s.phone === phoneMatch[0])) {
                            sessionsList.push({ phone: phoneMatch[0], connected: false, source: 'file' });
                        }
                    }
                }
            }
            
            // Get blocked users
            let blockedList = [];
            if (fs.existsSync(module.exports.blockedSessionsPath)) {
                const data = JSON.parse(fs.readFileSync(module.exports.blockedSessionsPath, 'utf8'));
                blockedList = data.blocked || [];
            }
            
            let msg = '*📱 SESSION MANAGER*\n\n';
            msg += `┃ 👑 Owner: 923013050530\n`;
            msg += `┃ 🤖 Bot: AMMAR-MD-BOT\n`;
            msg += `┗━━━━━━━━━━━━━━━━━━━━\n\n`;
            
            if (sessionsList.length > 0) {
                msg += '*🟢 ACTIVE/CACHED SESSIONS*\n\n';
                for (let i = 0; i < sessionsList.length; i++) {
                    const s = sessionsList[i];
                    const isBlocked = blockedList.includes(s.phone);
                    msg += `┃ ${i + 1}. 📞 *${s.phone}*\n`;
                    msg += `┃    Status: ${s.connected ? '✅ Connected' : '💤 Cached'}\n`;
                    if (isBlocked) msg += `┃    🚫 BLOCKED\n`;
                    msg += `┗━━━━━━━━━━━━━━━━━━━━\n\n`;
                }
            } else {
                msg += '*🟢 ACTIVE SESSIONS*\n\n';
                msg += `┃ No active sessions found\n`;
                msg += `┗━━━━━━━━━━━━━━━━━━━━\n\n`;
            }
            
            if (blockedList.length > 0) {
                msg += '*🚫 BLOCKED USERS*\n\n';
                for (let i = 0; i < blockedList.length; i++) {
                    msg += `┃ ${i + 1}. 🔒 ${blockedList[i]}\n`;
                }
                msg += `┗━━━━━━━━━━━━━━━━━━━━\n\n`;
                msg += `*To unblock:* .unblockbot <phone>\n`;
            }
            
            msg += `\n*📋 COMMANDS*\n`;
            msg += `┃ .logoutuser <phone> - Logout user\n`;
            msg += `┃ .blockbot <phone> - Block user\n`;
            msg += `┃ .unblockbot <phone> - Unblock user\n`;
            msg += `┃ .checkblocked <phone> - Check status\n`;
            msg += `┃ .resetall confirm - Reset all\n`;
            
            await sock.sendMessage(from, { text: msg });
            await react('✅');
            
        } catch (error) {
            await reply(`❌ Error: ${error.message}`);
        }
    },
    
    logoutUser: async (sock, reply, react, targetPhone) => {
        if (!targetPhone) {
            await reply(`❗ *Usage:* \`.logoutuser 923xxxxxxxxx\`\n\nExample: \`.logoutuser 923001234567\``);
            return;
        }
        
        const cleanPhone = targetPhone.replace(/[^0-9]/g, '');
        const OWNER_NUMBER = '923013050530';
        
        if (cleanPhone === OWNER_NUMBER) {
            await reply('⚠️ You cannot logout the owner bot!');
            return;
        }
        
        await react('⏳');
        await reply(`⏳ Logging out user *${cleanPhone}*...`);
        
        try {
            // Send logout message
            const targetJid = `${cleanPhone}@s.whatsapp.net`;
            try {
                await sock.sendMessage(targetJid, { 
                    text: `🔴 *SESSION TERMINATED*\n\nYour bot session has been logged out by the owner.\n\nYou will need to login again.`
                });
            } catch(e) {}
            
            // Remove from global sessions
            if (global.activeSessions) {
                global.activeSessions = global.activeSessions.filter(s => s.phone !== cleanPhone);
            }
            
            // Delete all session files
            const sessionPaths = [
                path.join(__dirname, '..', '..', 'sessions', `auth-${cleanPhone}`),
                path.join(__dirname, '..', '..', 'sessions', `session-${cleanPhone}.json`),
                path.join(__dirname, '..', '..', 'database', 'sessions', `${cleanPhone}.json`),
                path.join(__dirname, '..', '..', `${cleanPhone}.json`),
                path.join(__dirname, '..', '..', `creds-${cleanPhone}.json`),
                path.join(__dirname, '..', '..', `session_${cleanPhone}.json`)
            ];
            
            let deletedCount = 0;
            for (const sessionPath of sessionPaths) {
                if (fs.existsSync(sessionPath)) {
                    fs.rmSync(sessionPath, { recursive: true, force: true });
                    deletedCount++;
                }
            }
            
            // Block then unblock to invalidate session
            try {
                await sock.updateBlockStatus(targetJid, 'block');
                setTimeout(async () => {
                    try { await sock.updateBlockStatus(targetJid, 'unblock'); } catch(e) {}
                }, 3000);
            } catch(e) {}
            
            await react('✅');
            await reply(`✅ *LOGOUT SUCCESSFUL*\n\n┃ 📞 User: ${cleanPhone}\n┃ 🗑️ Files deleted: ${deletedCount}\n┃ 🔒 Session invalidated\n┗━━━━━━━━━━━━━━━━━━━━\n\nUser has been logged out from WhatsApp!`);
            
        } catch (error) {
            await react('❌');
            await reply(`❌ Failed to logout: ${error.message}`);
        }
    },
    
    blockUser: async (sock, reply, react, targetPhone) => {
        if (!targetPhone) {
            await reply(`❗ *Usage:* \`.blockbot 923xxxxxxxxx\`\n\nExample: \`.blockbot 923001234567\``);
            return;
        }
        
        const cleanPhone = targetPhone.replace(/[^0-9]/g, '');
        const OWNER_NUMBER = '923013050530';
        
        if (cleanPhone === OWNER_NUMBER) {
            await reply('⚠️ You cannot block yourself!');
            return;
        }
        
        await react('⏳');
        await reply(`⏳ Blocking user *${cleanPhone}*...`);
        
        try {
            // Send block notification
            const targetJid = `${cleanPhone}@s.whatsapp.net`;
            try {
                await sock.sendMessage(targetJid, { 
                    text: `🔴 *PERMANENT BLOCK*\n\nYour access has been permanently revoked by the owner.\n\nYou cannot reconnect to this bot.`
                });
            } catch(e) {}
            
            // Remove from sessions
            if (global.activeSessions) {
                global.activeSessions = global.activeSessions.filter(s => s.phone !== cleanPhone);
            }
            
            // Delete session files
            const sessionPaths = [
                path.join(__dirname, '..', '..', 'sessions', `auth-${cleanPhone}`),
                path.join(__dirname, '..', '..', 'sessions', `session-${cleanPhone}.json`),
                path.join(__dirname, '..', '..', 'database', 'sessions', `${cleanPhone}.json`)
            ];
            
            for (const sessionPath of sessionPaths) {
                if (fs.existsSync(sessionPath)) {
                    fs.rmSync(sessionPath, { recursive: true, force: true });
                }
            }
            
            // Add to blocked list
            let data = { blocked: [] };
            if (fs.existsSync(module.exports.blockedSessionsPath)) {
                data = JSON.parse(fs.readFileSync(module.exports.blockedSessionsPath, 'utf8'));
            }
            if (!data.blocked.includes(cleanPhone)) {
                data.blocked.push(cleanPhone);
                fs.writeFileSync(module.exports.blockedSessionsPath, JSON.stringify(data, null, 2));
            }
            
            // Block on WhatsApp
            await sock.updateBlockStatus(targetJid, 'block');
            
            await react('🚫');
            await reply(`🚫 *USER BLOCKED PERMANENTLY*\n\n┃ 📞 User: ${cleanPhone}\n┃ 🔒 Status: BLOCKED\n┃ 🗑️ Session: DELETED\n┗━━━━━━━━━━━━━━━━━━━━\n\n*To unblock:* .unblockbot ${cleanPhone}`);
            
        } catch (error) {
            await react('❌');
            await reply(`❌ Failed to block: ${error.message}`);
        }
    },
    
    unblockUser: async (sock, reply, react, targetPhone) => {
        if (!targetPhone) {
            await reply(`❗ *Usage:* \`.unblockbot 923xxxxxxxxx\`\n\nExample: \`.unblockbot 923001234567\``);
            return;
        }
        
        const cleanPhone = targetPhone.replace(/[^0-9]/g, '');
        
        await react('⏳');
        
        try {
            // Remove from blocked list
            let data = { blocked: [] };
            if (fs.existsSync(module.exports.blockedSessionsPath)) {
                data = JSON.parse(fs.readFileSync(module.exports.blockedSessionsPath, 'utf8'));
            }
            data.blocked = data.blocked.filter(p => p !== cleanPhone);
            fs.writeFileSync(module.exports.blockedSessionsPath, JSON.stringify(data, null, 2));
            
            // Unblock on WhatsApp
            const targetJid = `${cleanPhone}@s.whatsapp.net`;
            try {
                await sock.updateBlockStatus(targetJid, 'unblock');
            } catch(e) {}
            
            await react('✅');
            await reply(`✅ *USER UNBLOCKED*\n\n┃ 📞 User: ${cleanPhone}\n┃ 🔓 Status: UNBLOCKED\n┗━━━━━━━━━━━━━━━━━━━━\n\nUser can now reconnect.\n\n*To block again:* .blockbot ${cleanPhone}`);
            
        } catch (error) {
            await react('❌');
            await reply(`❌ Failed to unblock: ${error.message}`);
        }
    },
    
    resetAll: async (sock, reply, react, confirm) => {
        const OWNER_NUMBER = '923013050530';
        
        if (confirm !== 'confirm') {
            await reply(`⚠️ *DANGER!*\n\nThis command will logout ALL users except the owner!\n\nType: \`.resetall confirm\` to proceed.\n\n*Owner will remain connected.*`);
            return;
        }
        
        await react('⚠️');
        await reply(`⏳ Resetting all sessions...`);
        
        try {
            let count = 0;
            
            // Logout all non-owner sessions
            if (global.activeSessions) {
                for (const session of global.activeSessions) {
                    if (session.phone !== OWNER_NUMBER) {
                        const targetJid = `${session.phone}@s.whatsapp.net`;
                        try {
                            await sock.sendMessage(targetJid, { 
                                text: `🔴 *SYSTEM RESET*\n\nAll bot sessions have been reset by the owner.`
                            });
                        } catch(e) {}
                        count++;
                    }
                }
                global.activeSessions = global.activeSessions.filter(s => s.phone === OWNER_NUMBER);
            }
            
            // Delete session folders
            const sessionsDir = path.join(__dirname, '..', '..', 'sessions');
            if (fs.existsSync(sessionsDir)) {
                const files = fs.readdirSync(sessionsDir);
                for (const file of files) {
                    if (!file.includes(OWNER_NUMBER) && file !== 'creds.json' && file !== 'session') {
                        const fullPath = path.join(sessionsDir, file);
                        if (fs.existsSync(fullPath)) {
                            fs.rmSync(fullPath, { recursive: true, force: true });
                        }
                    }
                }
            }
            
            // Clear database sessions
            const dbSessionsDir = path.join(__dirname, '..', '..', 'database', 'sessions');
            if (fs.existsSync(dbSessionsDir)) {
                const files = fs.readdirSync(dbSessionsDir);
                for (const file of files) {
                    if (!file.includes(OWNER_NUMBER)) {
                        fs.rmSync(path.join(dbSessionsDir, file), { force: true });
                    }
                }
            }
            
            await react('✅');
            await reply(`✅ *RESET COMPLETE!*\n\n┃ 📊 Users logged out: ${count}\n┃ 🗑️ Session files: DELETED\n┃ 🧹 Database: CLEARED\n┗━━━━━━━━━━━━━━━━━━━━\n\n⚠️ Only owner (${OWNER_NUMBER}) can reconnect now.\n\n*Restart the bot for fresh start.*`);
            
        } catch (error) {
            await react('❌');
            await reply(`❌ Reset failed: ${error.message}`);
        }
    },
    
    checkBlocked: async (reply, targetPhone) => {
        if (!targetPhone) {
            await reply(`❗ *Usage:* \`.checkblocked 923xxxxxxxxx\`\n\nExample: \`.checkblocked 923001234567\``);
            return;
        }
        
        const cleanPhone = targetPhone.replace(/[^0-9]/g, '');
        
        try {
            let isBlocked = false;
            let data = { blocked: [] };
            
            if (fs.existsSync(module.exports.blockedSessionsPath)) {
                data = JSON.parse(fs.readFileSync(module.exports.blockedSessionsPath, 'utf8'));
                isBlocked = data.blocked.includes(cleanPhone);
            }
            
            const hasSession = global.activeSessions?.some(s => s.phone === cleanPhone) || false;
            
            let msg = `*🔍 USER STATUS: ${cleanPhone}*\n\n`;
            msg += `┃ 🚫 Blocked: ${isBlocked ? 'YES ❌' : 'NO ✅'}\n`;
            msg += `┃ 🔌 Active Session: ${hasSession ? 'YES ✅' : 'NO ❌'}\n`;
            msg += `┗━━━━━━━━━━━━━━━━━━━━\n\n`;
            
            if (isBlocked) {
                msg += `*✅ Actions:*\n`;
                msg += `┃ 🔓 \`.unblockbot ${cleanPhone}\` - Unblock user\n`;
            } else if (hasSession) {
                msg += `*✅ Actions:*\n`;
                msg += `┃ 🔒 \`.logoutuser ${cleanPhone}\` - Logout user\n`;
                msg += `┃ 🚫 \`.blockbot ${cleanPhone}\` - Block permanently\n`;
            } else {
                msg += `*ℹ️ User is not connected and not blocked.*\n`;
            }
            
            await reply(msg);
            
        } catch (error) {
            await reply(`❌ Error: ${error.message}`);
        }
    }
};