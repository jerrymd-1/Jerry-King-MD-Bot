// commands/owner/block.js
// BLOCK COMMAND - FINAL FIXED VERSION

module.exports = {
  name: 'block',
  aliases: ['b', 'blk', 'blok', 'bye', 'khatam', 'blockuser'],
  category: 'owner',
  description: 'Block a user from WhatsApp',
  usage: '.block (reply to a message or use in inbox)',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      // IMPORTANT: extra se reply le rahe hain
      const { from, reply, react, sender, config } = extra;
      
      // Check if reply function exists
      if (!reply) {
        // Fallback
        await sock.sendMessage(from, { text: '❌ Reply function error!', react: { text: '❌', key: msg.key } });
        return;
      }
      
      await react('🤐');
      
      let targetJid = null;
      let targetNumber = null;
      let targetName = null;
      
      // ========== METHOD 1: Reply to a message ==========
      if (msg.message?.extendedTextMessage?.contextInfo?.participant) {
        targetJid = msg.message.extendedTextMessage.contextInfo.participant;
      }
      // ========== METHOD 2: Quoted message ==========
      else if (msg.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
        const quotedMsg = msg.message.extendedTextMessage.contextInfo;
        if (quotedMsg.participant) {
          targetJid = quotedMsg.participant;
        } else if (quotedMsg.mentionedJid && quotedMsg.mentionedJid[0]) {
          targetJid = quotedMsg.mentionedJid[0];
        }
      }
      // ========== METHOD 3: Direct personal chat ==========
      else if (from && from.endsWith('@s.whatsapp.net')) {
        targetJid = from;
      }
      // ========== METHOD 4: Mentioned user ==========
      else if (msg.message?.extendedTextMessage?.contextInfo?.mentionedJid) {
        targetJid = msg.message.extendedTextMessage.contextInfo.mentionedJid[0];
      }
      // ========== METHOD 5: Number in argument ==========
      else if (args && args.length > 0) {
        let number = args[0].replace(/[^0-9]/g, '');
        if (number.length === 12 && number.startsWith('92')) {
          targetJid = `${number}@s.whatsapp.net`;
        } else if (number.length === 10) {
          targetJid = `92${number}@s.whatsapp.net`;
        } else if (number.length === 11 && number.startsWith('0')) {
          targetJid = `92${number.substring(1)}@s.whatsapp.net`;
        }
      }
      
      // Check if target found
      if (!targetJid) {
        const helpMsg = `
╭━━『 🔒 BLOCK COMMAND HELP 』━━╮
┃
┃ 📝 *How to use:*
┃ • Reply to a message: .block
┃ • In personal chat: .block
┃ • Mention user: .block @user
┃ • With number: .block 923001234567
┃
┃ 📌 *Examples:*
┃ • .block (reply to user's message)
┃ • .block @username
┃ • .block 923001234567
┃
┃ ⚠️ *Owner Only Command*
┃
┃ 👨‍💻 Developer By Ammar Rai
┃
╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯`;
        await reply(helpMsg);
        return;
      }
      
      // Extract number for display
      targetNumber = targetJid.split('@')[0];
      
      // ========== PROTECTIONS ==========
      // Prevent blocking bot itself
      const botNumber = sock.user.id.split(':')[0];
      if (targetNumber === botNumber) {
        await reply(`❌ *CANNOT BLOCK BOT ITSELF!* 😒`);
        return;
      }
      
      // Prevent blocking owner numbers
      const ownerNumbers = config.ownerNumber || ['923013050530', '96876452594'];
      if (ownerNumbers.includes(targetNumber)) {
        await reply(`❌ *CANNOT BLOCK BOT OWNER!* 😏`);
        return;
      }
      
      // ========== GET USER NAME ==========
      try {
        const contact = await sock.getContact(targetJid);
        if (contact && contact.name) {
          targetName = contact.name;
        } else if (contact && contact.pushname) {
          targetName = contact.pushname;
        } else {
          targetName = targetNumber;
        }
      } catch (e) {
        targetName = targetNumber;
      }
      
      // ========== SEND WARNING MESSAGE ==========
      const warningMsg = `
╭━━『 🔒 BLOCK INITIATED 』━━╮
┃
┃ 👤 *User:* ${targetName}
┃ 📱 *Number:* +${targetNumber}
┃
┃ ⚠️ *"AP MUJHE BAHUT TANG KAR RAHE HO!*
┃ *IS LIE MAI AAPKO BLOCK KAR RAHA HOON!"* 😏
┃
┃ ⏳ Processing...
┃
┃ 👨‍💻 Developer By Ammar Rai
┃
╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯`;
      
      await reply(warningMsg);
      
      // ========== DELAY ==========
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // ========== TRY BLOCKING ==========
      try {
        await sock.updateBlockStatus(targetJid, 'block');
        
        const successMsg = `
╭━━『 ✅ USER BLOCKED 』━━╮
┃
┃ 👤 *User:* ${targetName}
┃ 📱 *Number:* +${targetNumber}
┃
┃ 🔒 *Status:* BLOCKED SUCCESSFULLY
┃
┃ 😒 *Goodbye! No more spam from this user*
┃
┃ 👨‍💻 Developer By Ammar Rai
┃
╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯`;
        
        await reply(successMsg);
        await react('😒');
        
      } catch (blockError) {
        console.error('Block API Error:', blockError);
        
        // Check if user is already blocked
        let isBlocked = false;
        try {
          const blocklist = await sock.getBlocklist();
          if (blocklist && blocklist.includes(targetJid)) {
            isBlocked = true;
          }
        } catch (e) {}
        
        if (isBlocked) {
          await reply(`⚠️ *User is already blocked!*\n\n📱 Number: +${targetNumber}`);
        } else {
          const errorMsg = `
╭━━『 ❌ BLOCK FAILED 』━━╮
┃
┃ 📛 *Error:* ${blockError.message || 'Unknown error'}
┃
┃ 💡 *Note:* 
┃ WhatsApp may have restricted block API.
┃
┃ 🔄 *Alternative:*
┃ • Block manually from WhatsApp app
┃ • Use .unblock if already blocked
┃
┃ 👨‍💻 Developer By Ammar Rai
┃
╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯`;
          
          await reply(errorMsg);
          await react('❌');
        }
      }
      
    } catch (error) {
      console.error('Block Command Error:', error);
      
      // Fallback error message
      const errorMsg = `
╭━━『 ❌ BLOCK FAILED 』━━╮
┃
┃ 📛 *Error:* ${error.message || 'Unknown error'}
┃
┃ 💡 *Solutions:*
┃ • Try blocking from WhatsApp directly
┃ • Make sure you replied to a user's message
┃ • Check if user exists
┃
┃ 👨‍💻 Developer By Ammar Rai
┃
╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯`;
      
      try {
        await extra.reply(errorMsg);
      } catch (e) {
        await sock.sendMessage(extra.from, { text: errorMsg });
      }
      await extra.react('❌');
    }
  }
};
