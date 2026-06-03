// commands/owner/connect.js
// Owner-only multi-session controller for AMMAR-MD-BOT
// Custom Box Design - Style like you showed

module.exports = {
  name: 'connect',
  aliases: ['con', 'session', 'sessions'],
  category: 'owner',
  description: 'Manage multi-session WhatsApp connections',
  usage: '.connect <session_id>\n.connect status\n.connect del <number>',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      // ========== DUAL OWNER VERIFICATION ==========
      const senderNum = extra.sender.split('@')[0];
      
      // Both owner numbers
      const ownerNumbers = ['923013050530', '96876452594'];
      const isOwner = ownerNumbers.includes(senderNum);
      
      if (!isOwner) {
        const denyMsg = `
╭━━『 ❌ ACCESS DENIED 』━━╮
┃
┃ Only bot owners can use this command
┃
┃ 👨‍💻 Developer By Ammar Rai
┃
╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯`;
        return extra.reply(denyMsg);
      }

      // ========== SESSION MANAGER CHECK ==========
      const manager = globalThis.ProBoySessionManager;
      if (!manager) {
        const errorMsg = `
╭━━『 ❌ SESSION ERROR 』━━╮
┃
┃ Session manager not available
┃ Please restart the bot
┃
┃ 👨‍💻 Developer By Ammar Rai
┃
╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯`;
        return extra.reply(errorMsg);
      }

      const command = (args[0] || '').toLowerCase();

      // ========== STATUS COMMAND ==========
      if (command === 'status') {
        const status = manager.status();
        
        const activeNumbers = [...new Set((status.active || [])
          .map(s => String(s.phone || '').trim())
          .filter(Boolean))];
        
        const savedNumbers = [...new Set((status.saved || [])
          .map(s => String(s.phone || '').trim())
          .filter(Boolean))];

        let statusText = `
╭━━『 🔌 SESSION MANAGER 』━━╮
┃
┃ 📱 ACTIVE SESSIONS: ${activeNumbers.length}
┃`;
        
        if (activeNumbers.length > 0) {
          for (const num of activeNumbers) {
            statusText += `\n┃ • ${num}`;
          }
        } else {
          statusText += `\n┃ • No active sessions`;
        }
        
        statusText += `
┃
┃ 💾 SAVED SESSIONS: ${savedNumbers.length}
┃`;
        
        if (savedNumbers.length > 0) {
          for (const num of savedNumbers) {
            statusText += `\n┃ • ${num}`;
          }
        } else {
          statusText += `\n┃ • No saved sessions`;
        }
        
        statusText += `
┃
┃ 📝 COMMANDS:
┃ • .connect <id> - Start session
┃ • .connect status - Show status
┃ • .connect del <num> - Remove
┃
┃ 👨‍💻 Developer By Ammar Rai
┃
╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯`;

        return extra.reply(statusText);
      }

      // ========== DELETE/REMOVE COMMAND ==========
      if (command === 'del' || command === 'delete' || command === 'remove') {
        const number = (args[1] || '').replace(/[^0-9]/g, '');
        
        if (!number) {
          const errorMsg = `
╭━━『 ❌ NUMBER MISSING 』━━╮
┃
┃ Usage: .connect del 923001234567
┃
┃ 👨‍💻 Developer By Ammar Rai
┃
╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯`;
          return extra.reply(errorMsg);
        }
        
        if (ownerNumbers.includes(number)) {
          const errorMsg = `
╭━━『 ⚠️ CANNOT REMOVE 』━━╮
┃
┃ Primary bot numbers cannot be removed
┃
┃ 👨‍💻 Developer By Ammar Rai
┃
╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯`;
          return extra.reply(errorMsg);
        }
        
        const result = await manager.disconnect(number);
        
        if (!result.ok) {
          const errorMsg = `
╭━━『 ❌ DISCONNECT FAILED 』━━╮
┃
┃ ${result.error || 'Unknown error'}
┃
┃ 👨‍💻 Developer By Ammar Rai
┃
╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯`;
          return extra.reply(errorMsg);
        }
        
        const successMsg = `
╭━━『 ✅ DISCONNECTED 』━━╮
┃
┃ 📱 Number: ${result.phone || number}
┃ 🏷️ Label: ${result.label || 'Session'}
┃
┃ 👨‍💻 Developer By Ammar Rai
┃
╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯`;
        return extra.reply(successMsg);
      }

      // ========== CONNECT NEW SESSION ==========
      const sessionId = args.join(' ').trim();
      
      if (!sessionId) {
        const helpMsg = `
╭━━『 🔌 CONNECT HELP 』━━╮
┃
┃ 📝 USAGE:
┃ • .connect ProBoy-MD!xxxxx
┃ • .connect status
┃ • .connect del 923001234567
┃
┃ 📌 EXAMPLE:
┃ • .connect ProBoy-MD!abc123xyz
┃
┃ 👨‍💻 Developer By Ammar Rai
┃
╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯`;
        return extra.reply(helpMsg);
      }

      if (!sessionId.startsWith('ProBoy-MD!')) {
        const errorMsg = `
╭━━『 ❌ INVALID FORMAT 』━━╮
┃
┃ Session ID must start with "ProBoy-MD!"
┃
┃ Example: ProBoy-MD!base64gzipdata
┃
┃ 👨‍💻 Developer By Ammar Rai
┃
╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯`;
        return extra.reply(errorMsg);
      }

      const result = await manager.connect(sessionId);
      
      if (!result.ok) {
        const errorMsg = `
╭━━『 ❌ CONNECTION FAILED 』━━╮
┃
┃ ${result.error || 'Unknown error'}
┃
┃ 💡 Check session ID and try again
┃
┃ 👨‍💻 Developer By Ammar Rai
┃
╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯`;
        return extra.reply(errorMsg);
      }

      const startedSessions = (result.started || []).map(s => `┃ ✅ ${s.label}`).join('\n');
      
      const successMsg = `
╭━━『 ✅ SESSION STARTED 』━━╮
┃
${startedSessions || '┃ ✅ Session started'}
┃
┃ 📊 NEXT STEPS:
┃ • .connect status - Check status
┃ • Wait for online notification
┃
┃ 👨‍💻 Developer By Ammar Rai
┃
╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯`;

      return extra.reply(successMsg);

    } catch (error) {
      console.error('Connect Command Error:', error);
      const errorMsg = `
╭━━『 ❌ COMMAND ERROR 』━━╮
┃
┃ ${error.message}
┃
┃ Please try again later
┃
┃ 👨‍💻 Developer By Ammar Rai
┃
╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯`;
      return extra.reply(errorMsg);
    }
  }
};
