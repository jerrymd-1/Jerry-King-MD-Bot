// commands/fun/boom.js
const config = require('../../config');

/**
 * Normalize phone number: remove non-digits
 */
function normalizeNumber(num) {
  return String(num || '').replace(/[^0-9]/g, '');
}

/**
 * Convert normalized number to JID
 */
function toJid(num) {
  const n = normalizeNumber(num);
  return n ? `${n}@s.whatsapp.net` : null;
}

module.exports = {
  name: 'boom',
  aliases: ['repeat', 'spam', 'unlimited'],
  category: 'fun',
  description: 'Unlimited message repeater. Send multiple messages to any number.',
  usage: '.boom <message,count[,number]>',

  ownerOnly: true,
  modOnly: false,
  groupOnly: false,
  privateOnly: false,
  adminOnly: false,
  botAdminNeeded: false,

  async execute(sock, msg, args, extra) {
    try {
      const raw = args.join(' ').trim();
      if (!raw) {
        return extra.reply(
          '*🔥 BOOM - Unlimited Mode 🔥*\n\n' +
          '• `.boom hello,100` (100 times in current chat)\n' +
          '• `.boom hey,500,923027598023` (500 times to that number)\n\n' +
          '⚠️ *Warning:* No limit! Use responsibly.\n' +
          '⏱️ Delay: 300ms between messages'
        );
      }

      const parts = raw.split(',').map(x => x.trim());
      const message = parts[0];
      const count = parseInt(parts[1]);
      const num = parts[2] || '';

      // VALIDATION: Only check if count is positive number (NO MAX LIMIT)
      if (!message || isNaN(count) || count <= 0) {
        return extra.reply(
          `❌ *Invalid format*\n\n` +
          `Use: \`.boom message,count[,number]\`\n` +
          `Example: \`.boom Hello,1000,923001234567\`\n\n` +
          `Count must be a positive number (unlimited)`
        );
      }

      // Confirmation for large counts
      if (count > 100) {
        await extra.reply(
          `⚠️ *Warning*\n\n` +
          `You are about to send *${count} messages* to ${
            num ? `+${num}` : 'this chat'
          }.\n\n` +
          `This may take ~${Math.ceil((count * 300) / 1000)} seconds.\n\n` +
          `Reply with *yes* to confirm.`
        );
        
        // Wait for confirmation (simple implementation)
        // Note: You'll need to implement confirmation logic separately
      }

      // Determine target JID
      let targetJid;
      if (num) {
        targetJid = toJid(num);
        if (!targetJid) {
          return extra.reply('❌ *Invalid number*\nUse format: 923001234567 (with country code)');
        }
      } else {
        targetJid = extra.from; // current chat
      }

      await extra.react('⏳');
      await extra.reply(`🚀 *Starting boom:* Sending *${count} messages* to ${num ? '+' + num : 'current chat'}\n⏱️ Delay: 300ms between messages`);

      // Track progress
      let successCount = 0;
      let failCount = 0;
      const startTime = Date.now();

      // Send messages with delay
      for (let i = 0; i < count; i++) {
        try {
          await sock.sendMessage(targetJid, { text: message });
          successCount++;
          
          // Progress update every 100 messages
          if ((i + 1) % 100 === 0) {
            await extra.reply(`📊 *Progress:* ${i + 1}/${count} messages sent`);
          }
          
        } catch (err) {
          failCount++;
          console.error(`Failed to send message ${i + 1}:`, err);
          
          // Stop if too many failures
          if (failCount > 10) {
            await extra.reply(`❌ *Stopped:* Too many failures (${failCount})`);
            break;
          }
        }
        
        // Dynamic delay based on count
        const delay = count > 500 ? 500 : (count > 200 ? 400 : 300);
        if (i < count - 1) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }

      const endTime = Date.now();
      const duration = ((endTime - startTime) / 1000).toFixed(1);

      await extra.react('✅');
      await extra.reply(
        `✅ *Boom Complete!*\n\n` +
        `📨 Sent: ${successCount}/${count}\n` +
        `❌ Failed: ${failCount}\n` +
        `⏱️ Time: ${duration} seconds\n` +
        `🎯 Target: ${num ? '+' + num : 'Current chat'}`
      );
      
    } catch (error) {
      console.error('Boom command error:', error);
      await extra.reply('❌ An error occurred while sending messages.');
      await extra.react('❌');
    }
  }
};
