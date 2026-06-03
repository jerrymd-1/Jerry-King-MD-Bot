/**
 * Group Command Auto‑Trigger Plugin – SIMPLE VERSION
 * Usage: .gccmd <subcommand> [arguments]
 * 
 * FEATURES:
 * - Sirf NUMBER par reply aayega
 * - Koi welcome message nahi
 * - Koi delete nahi
 * - Koi command block nahi
 * - Bus number bhejo, data aa jayega
 */

const { loadCommands } = require('../../utils/commandLoader');

// In‑memory cache (loaded from database)
let groupCmdMappings = new Map();

// Helper to load mappings from database
async function loadMappings(db) {
  const saved = await db.getGlobalSetting('groupCmdMappings');
  if (saved && typeof saved === 'object') {
    groupCmdMappings = new Map(Object.entries(saved));
  }
  console.log('[GCCMD] Mappings loaded:', Array.from(groupCmdMappings.keys()));
}

// Helper to save mappings to database
async function saveMappings(db) {
  const obj = Object.fromEntries(groupCmdMappings);
  await db.setGlobalSetting('groupCmdMappings', obj);
}

// Number validation function - Sirf number hi accept hoga
function isValidNumberFormat(text) {
  const cleanText = text.trim();
  
  // Format 1: 923001234567 (with country code 92)
  if (/^92\d{10}$/.test(cleanText)) {
    return true;
  }
  
  // Format 2: 03001234567 (with leading zero)
  if (/^0\d{10}$/.test(cleanText)) {
    return true;
  }
  
  // Format 3: 3001234567 (without code)
  if (/^\d{10}$/.test(cleanText)) {
    return true;
  }
  
  return false;
}

module.exports = {
  name: 'gccmd',
  aliases: ['groupcmd'],
  category: 'owner',
  description: 'Manage group command auto‑trigger',
  usage: '.gccmd <subcommand> [arguments]',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    const { from, reply, react, database, config } = extra;
    const subCmd = args[0]?.toLowerCase();

    await loadMappings(database);

    if (!subCmd) {
      const helpText = `╭━❖ *GROUP COMMAND AUTO‑TRIGGER* ❖━╮
┃
┃  📌 *Available Subcommands:*
┃
┃  🔹 *set*   – Enable auto-command in group
┃  ┃    Usage: .gccmd set <group_jid> <command>
┃  ┃    Example: .gccmd set 120363409634477982@g.us sim
┃
┃  🔹 *remove* – Remove mapping from group
┃  ┃    Usage: .gccmd remove <group_jid>
┃
┃  🔹 *list*   – Show all active mappings
┃
┃  🔹 *off*    – Disable auto-command
┃  ┃    Usage: .gccmd off <group_jid>
┃
┃  🔹 *help*   – Show this help message
┃
┃  ⚠️ *Sirf number par reply aayega*
┃
╰━━━━━━━━━━━━━━━━━━━━━━━╯
👨‍💻 *Developer By Ammar Rai*`;
      return reply(helpText);
    }

    if (subCmd === 'set') {
      const groupJid = args[1];
      const commandName = args[2];
      
      if (!groupJid || !commandName) {
        return reply(`❌ Usage: .gccmd set <group_jid> <command_name>`);
      }
      
      if (!groupJid.endsWith('@g.us')) {
        return reply(`❌ Invalid group JID. Must end with @g.us`);
      }
      
      try {
        await sock.groupMetadata(groupJid);
      } catch {
        return reply(`❌ Bot is not a member of this group`);
      }
      
      const commands = loadCommands();
      let targetCmd = null;
      for (const [name, cmd] of commands) {
        if (name === commandName || (cmd.aliases && cmd.aliases.includes(commandName))) {
          targetCmd = { name, cmd };
          break;
        }
      }
      
      if (!targetCmd) {
        return reply(`❌ Command "${commandName}" not found.`);
      }
      
      groupCmdMappings.set(groupJid, { 
        command: targetCmd.name, 
        enabled: true
      });
      
      await saveMappings(database);
      
      const successMsg = `✅ *AUTO-COMMAND ENABLED* for ${groupJid}\n\n` +
        `📌 *Auto-Command:* .${targetCmd.name}\n\n` +
        `📝 *Valid Number Formats:*\n` +
        `• 923001234567\n` +
        `• 03001234567\n` +
        `• 3001234567\n\n` +
        `🔹 To disable: .gccmd off ${groupJid}\n\n` +
        `👨‍💻 *Developer By Ammar Rai*`;
      
      await reply(successMsg);
      await react('✅');
    }

    else if (subCmd === 'remove') {
      const groupJid = args[1];
      if (!groupJid) return reply(`❌ Usage: .gccmd remove <group_jid>`);
      
      if (!groupCmdMappings.has(groupJid)) {
        return reply(`❌ No mapping found for ${groupJid}`);
      }
      
      groupCmdMappings.delete(groupJid);
      await saveMappings(database);
      await reply(`✅ Removed auto-command for ${groupJid}\n\n👨‍💻 *Developer By Ammar Rai*`);
      await react('✅');
    }

    else if (subCmd === 'list') {
      if (groupCmdMappings.size === 0) {
        return reply(`📋 No group mappings set.\n\n👨‍💻 *Developer By Ammar Rai*`);
      }
      
      let listMsg = `╭━❖ *AUTO-COMMAND GROUPS* ❖━╮\n`;
      for (const [jid, data] of groupCmdMappings) {
        listMsg += `┃ 🏷️ *${jid}*\n`;
        listMsg += `┃    Auto-Command: .${data.command}\n`;
        listMsg += `┃    Status: ${data.enabled ? '✅ Active' : '❌ Disabled'}\n`;
        listMsg += `┃ ───────────────────────\n`;
      }
      listMsg += `╰━━━━━━━━━━━━━━━━━━━━━━━╯\n\n👨‍💻 *Developer By Ammar Rai*`;
      await reply(listMsg);
      await react('✅');
    }

    else if (subCmd === 'off') {
      const groupJid = args[1];
      if (!groupJid) return reply(`❌ Usage: .gccmd off <group_jid>`);
      
      if (!groupCmdMappings.has(groupJid)) {
        return reply(`❌ No mapping found for ${groupJid}`);
      }
      
      const data = groupCmdMappings.get(groupJid);
      data.enabled = false;
      groupCmdMappings.set(groupJid, data);
      await saveMappings(database);
      
      await reply(`✅ Auto-command DISABLED for ${groupJid}\n\n👨‍💻 *Developer By Ammar Rai*`);
      await react('✅');
    }

    else if (subCmd === 'help') {
      const helpText = `╭━❖ *GROUP COMMAND AUTO‑TRIGGER* ❖━╮
┃
┃  📌 *Available Subcommands:*
┃
┃  🔹 *set*   – Enable auto-command in group
┃  🔹 *remove* – Remove mapping completely
┃  🔹 *list*   – Show all mappings
┃  🔹 *off*    – Disable auto-command
┃  🔹 *help*   – This message
┃
╰━━━━━━━━━━━━━━━━━━━━━━━╯\n\n👨‍💻 *Developer By Ammar Rai*`;
      return reply(helpText);
    }

    else {
      return reply(`❌ Invalid subcommand: ${subCmd}\n\nUse .gccmd help`);
    }
  },

  // Message handler - Sirf number par reply aayega
  async handleMessage(sock, msg, extra) {
    const { from, isGroup, config, database, sender } = extra;
    
    if (!isGroup) return;

    await loadMappings(database);
    const mapping = groupCmdMappings.get(from);
    
    // If no mapping or disabled, do nothing
    if (!mapping || !mapping.enabled) return;

    // Get message text
    let text = '';
    const msgType = Object.keys(msg.message || {})[0];
    const isFromBot = sender === config.botNumber;
    
    if (msgType === 'conversation') {
      text = msg.message.conversation;
    } else if (msgType === 'extendedTextMessage') {
      text = msg.message.extendedTextMessage?.text || '';
    } else {
      // Photo, video, sticker, etc. - No reply
      return;
    }
    
    // Bot's own messages - skip
    if (isFromBot) return;
    
    // Check if message is a valid number format
    if (!isValidNumberFormat(text)) {
      // Not a valid number - No reply
      return;
    }
    
    // Valid number - Run the command
    const commands = loadCommands();
    const commandName = mapping.command;
    const commandObj = commands.get(commandName);
    
    if (commandObj && typeof commandObj.execute === 'function') {
      const args = text.trim().split(/\s+/);
      try {
        const originalReply = extra.reply;
        
        extra.reply = async (responseText) => {
          return await originalReply(responseText);
        };
        
        await commandObj.execute(sock, msg, args, extra);
        extra.reply = originalReply;
        
      } catch (err) {
        console.error('[GCCMD] Error:', err);
      }
    }
  }
};
