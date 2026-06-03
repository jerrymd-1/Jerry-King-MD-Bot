// commands/owner/autoreact.js
// AUTO-REACT COMMAND - Configure automatic reactions

const { load, save, defaultConfig } = require('../../utils/autoReact');

module.exports = {
  name: 'autoreact',
  aliases: ['ar', 'autoreactconfig', 'reactconfig'],
  category: 'owner',
  description: 'Configure automatic reactions to messages',
  usage: `.autoreact <on/off/set bot/set all/status/emojis/keywords/cooldown>`,
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      // Load current config
      let config = load();
      
      // No args - show current status
      if (!args.length) {
        const statusMsg = `
╭━━『 🤖 AUTO-REACT STATUS 』━━╮
┃
┃ 📊 *Status:* ${config.enabled ? '✅ ENABLED' : '❌ DISABLED'}
┃ 🎯 *Mode:* ${config.mode === 'bot' ? '🤖 Bot Commands Only' : '💬 All Messages'}
┃ ⏱️ *Cooldown:* ${config.cooldown.seconds} seconds
┃
┃ 📝 *Commands:*
┃ • .autoreact on/off
┃ • .autoreact set bot/all
┃ • .autoreact status
┃ • .autoreact emojis
┃ • .autoreact keywords
┃ • .autoreact cooldown <seconds>
┃
┃ 👨‍💻 Developer By Ammar Rai
┃
╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯`;
        return extra.reply(statusMsg);
      }
      
      const command = args[0].toLowerCase();
      
      // ========== ENABLE/DISABLE ==========
      if (command === 'on') {
        config.enabled = true;
        save(config);
        
        const msg = `
╭━━『 ✅ AUTO-REACT ENABLED 』━━╮
┃
┃ 🤖 Bot will now react to messages
┃ 🎯 Mode: ${config.mode === 'bot' ? 'Bot Commands Only' : 'All Messages'}
┃
┃ 📝 Use .autoreact status to view settings
┃
┃ 👨‍💻 Developer By Ammar Rai
┃
╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯`;
        return extra.reply(msg);
      }
      
      if (command === 'off') {
        config.enabled = false;
        save(config);
        
        const msg = `
╭━━『 ❌ AUTO-REACT DISABLED 』━━╮
┃
┃ 🤖 Bot will not react to messages
┃
┃ 📝 Use .autoreact on to enable
┃
┃ 👨‍💻 Developer By Ammar Rai
┃
╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯`;
        return extra.reply(msg);
      }
      
      // ========== SET MODE ==========
      if (command === 'set' && args[1]) {
        const mode = args[1].toLowerCase();
        
        if (mode === 'bot') {
          config.mode = 'bot';
          save(config);
          return extra.reply(`✅ Mode set to: *Bot Commands Only*\n\n🤖 Bot will react to commands like .ping, .menu, etc.`);
        }
        
        if (mode === 'all') {
          config.mode = 'all';
          save(config);
          return extra.reply(`✅ Mode set to: *All Messages*\n\n💬 Bot will react to every message in the chat.`);
        }
        
        return extra.reply(`❌ Invalid mode!\n\nUse: .autoreact set bot | .autoreact set all`);
      }
      
      // ========== SHOW STATUS ==========
      if (command === 'status') {
        const statusMsg = `
╭━━『 🤖 AUTO-REACT DETAILS 』━━╮
┃
┃ 📊 *Status:* ${config.enabled ? '✅ ENABLED' : '❌ DISABLED'}
┃ 🎯 *Mode:* ${config.mode === 'bot' ? '🤖 Bot Commands Only' : '💬 All Messages'}
┃
┃ 😊 *Bot Emojis:* ${config.emojis.bot.join(', ')}
┃ 🌟 *All Emojis:* ${config.emojis.all.slice(0,6).join(', ')}...
┃ 🔑 *Keywords:* ${Object.keys(config.keywords).length}
┃ ⏱️ *Cooldown:* ${config.cooldown.seconds} seconds
┃
┃ 📝 *Commands:* .autoreact help
┃
┃ 👨‍💻 Developer By Ammar Rai
┃
╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯`;
        return extra.reply(statusMsg);
      }
      
      // ========== SHOW EMOJIS ==========
      if (command === 'emojis') {
        const emojiMsg = `
╭━━『 😊 AUTO-REACT EMOJIS 』━━╮
┃
┃ 🤖 *Bot Mode Emojis:*
┃ ${config.emojis.bot.join(', ')}
┃
┃ 💬 *All Mode Emojis:*
┃ ${config.emojis.all.join(', ')}
┃
┃ ✅ *Success Emojis:*
┃ ${config.emojis.success.join(', ')}
┃
┃ ❌ *Error Emojis:*
┃ ${config.emojis.error.join(', ')}
┃
┃ 👨‍💻 Developer By Ammar Rai
┃
╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯`;
        return extra.reply(emojiMsg);
      }
      
      // ========== SHOW KEYWORDS ==========
      if (command === 'keywords') {
        let keywordText = `╭━━『 🔑 KEYWORD EMOJIS 』━━╮\n┃\n`;
        for (const [keyword, emoji] of Object.entries(config.keywords)) {
          keywordText += `┃ • ${keyword}: ${emoji}\n`;
        }
        keywordText += `┃\n┃ 👨‍💻 Developer By Ammar Rai\n┃\n╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯`;
        return extra.reply(keywordText);
      }
      
      // ========== SET COOLDOWN ==========
      if (command === 'cooldown' && args[1]) {
        const seconds = parseInt(args[1]);
        
        if (isNaN(seconds) || seconds < 1 || seconds > 60) {
          return extra.reply(`❌ Invalid cooldown!\n\nUse: .autoreact cooldown <1-60>\n📝 Example: .autoreact cooldown 5`);
        }
        
        config.cooldown.seconds = seconds;
        save(config);
        return extra.reply(`✅ Cooldown set to *${seconds} seconds*\n\nBot will wait ${seconds} seconds between reactions per user.`);
      }
      
      // ========== RESET TO DEFAULT ==========
      if (command === 'reset') {
        config = { ...defaultConfig };
        save(config);
        return extra.reply(`✅ Auto-react reset to default settings!`);
      }
      
      // ========== HELP ==========
      if (command === 'help') {
        const helpMsg = `
╭━━『 🤖 AUTO-REACT HELP 』━━╮
┃
┃ 📝 *Commands:*
┃ • .autoreact on - Enable auto-react
┃ • .autoreact off - Disable auto-react
┃ • .autoreact set bot - React to bot commands only
┃ • .autoreact set all - React to all messages
┃ • .autoreact status - Show current status
┃ • .autoreact emojis - Show available emojis
┃ • .autoreact keywords - Show keyword mapping
┃ • .autoreact cooldown <sec> - Set cooldown (1-60 sec)
┃ • .autoreact reset - Reset to default
┃
┃ 📌 *Examples:*
┃ • .autoreact on
┃ • .autoreact set bot
┃ • .autoreact cooldown 3
┃
┃ 👨‍💻 Developer By Ammar Rai
┃
╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯`;
        return extra.reply(helpMsg);
      }
      
      extra.reply(`❌ Unknown command!\n\nUse .autoreact help for available commands.`);
      
    } catch (err) {
      console.error('[autoreact cmd] error:', err);
      extra.reply(`❌ Error configuring auto-react: ${err.message}\n\nUse .autoreact help for assistance.`);
    }
  }
};
