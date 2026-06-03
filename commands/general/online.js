// commands/general/online.js
// ONLINE COMMAND - Check who's online in group
// Fixed for AMMAR-MD-BOT

module.exports = {
  name: 'online',
  aliases: ['whosonline', 'onlinemembers', 'activeusers', 'isonline', 'aktiv'],
  category: 'general',
  description: 'Check whos online in the group',
  usage: '.online',
  groupOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      const { from, isGroup, groupMetadata, reply, react, sender, config } = extra;
      
      // ========== GROUP CHECK ==========
      if (!isGroup) {
        return reply("❌ YEH COMMAND SIRF GROUPS ME USE KARO! 😊");
      }

      await react('🟢');

      // ========== OWNER & ADMIN CHECK ==========
      const senderNumber = sender.split('@')[0];
      const ownerNumbers = config.ownerNumber || ['923013050530', '96876452594'];
      const isOwner = ownerNumbers.includes(senderNumber);
      
      // Get group participants
      const participants = groupMetadata.participants || [];
      const isAdmin = participants.some(p => p.id === sender && p.admin === 'admin');
      
      // Check if user is owner or admin
      if (!isOwner && !isAdmin) {
        return reply("*❌ YEH COMMAND SIRF OWNER AUR GROUP ADMINS KE LIE HAI ! 😎*");
      }

      // ========== PROCESSING MESSAGE ==========
      await reply("*🔍 ONLINE MEMBERS KI LIST TAYAR HO RAHI HAI...*\n*⏳ THORA SA INTAZAR KAREIN...*");

      const onlineMembers = new Set();
      const participantsList = participants.map(p => p.id);
      
      // ========== CHECK ONLINE STATUS ==========
      // Method 1: Direct presence check
      for (const participant of participantsList) {
        // Skip bot itself
        if (participant === sock.user.id) continue;
        
        try {
          // Try to get presence
          const presence = await sock.presenceSubscribe(participant);
          
          if (presence && presence.presences && presence.presences[participant]) {
            const p = presence.presences[participant];
            const lastKnown = p.lastKnownPresence;
            
            // Check all possible online states
            if (lastKnown === 'available' || 
                lastKnown === 'composing' ||
                lastKnown === 'recording' ||
                lastKnown === 'online') {
              onlineMembers.add(participant);
            }
          }
          
          // Add small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));
          
        } catch (err) {
          // User has privacy settings - skip silently
          continue;
        }
      }
      
      // ========== METHOD 2: Check recent message activity ==========
      try {
        // Get recent messages to find active users
        const recentMsgs = await sock.loadMessages(from, 30);
        
        const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
        
        for (const msgObj of recentMsgs) {
          if (msgObj.message && msgObj.key) {
            const msgTime = msgObj.messageTimestamp ? msgObj.messageTimestamp * 1000 : Date.now();
            const senderId = msgObj.key.participant || msgObj.key.remoteJid;
            
            if (senderId && senderId !== sock.user.id && msgTime > fiveMinutesAgo) {
              onlineMembers.add(senderId);
            }
          }
        }
      } catch (err) {
        // Can't fetch messages - continue
      }
      
      // ========== RESULT ==========
      const onlineArray = Array.from(onlineMembers);
      
      if (onlineArray.length === 0) {
        const noOnlineMsg = `
╭━━『 🟢 ONLINE MEMBERS 』━━╮
┃
┃ 📍 *Group:* ${groupMetadata.subject || 'Unknown'}
┃ 👥 *Total Members:* ${participantsList.length - 1}
┃ 🟢 *Online:* 0
┃
┃ ⚠️ *Couldn't detect any online members*
┃
┃ 💡 *Possible Reasons:*
┃ • Members have privacy settings on
┃ • No one is currently active
┃ • Members have hidden their online status
┃
┃ 👨‍💻 Developer By Ammar Rai
┃
╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯`;
        return reply(noOnlineMsg);
      }
      
      // Create online list with @mentions
      let onlineList = `╭━━『 🟢 ONLINE MEMBERS 』━━╮\n`;
      onlineList += `┃\n`;
      onlineList += `┃ 📍 *Group:* ${groupMetadata.subject || 'Unknown'}\n`;
      onlineList += `┃ 👥 *Total:* ${participantsList.length - 1}\n`;
      onlineList += `┃ 🟢 *Online:* ${onlineArray.length}\n`;
      onlineList += `┃\n`;
      onlineList += `╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯\n\n`;
      onlineList += `👑 *ONLINE MEMBERS LIST*\n`;
      onlineList += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
      
      onlineArray.forEach((member, index) => {
        onlineList += `${index + 1}. @${member.split('@')[0]}\n`;
      });
      
      onlineList += `\n⏱️ *Time:* ${new Date().toLocaleTimeString()}`;
      onlineList += `\n👨‍💻 *Developer By Ammar Rai*`;
      
      // Send message with mentions
      await sock.sendMessage(from, {
        text: onlineList,
        mentions: onlineArray
      }, { quoted: msg });
      
      await react('✅');
      
    } catch (error) {
      console.error('Online Command Error:', error);
      
      const errorMsg = `
╭━━『 ❌ ONLINE COMMAND ERROR 』━━╮
┃
┃ 📛 *Error:* ${error.message}
┃
┃ 💡 *Solution:*
┃ • Make sure bot is in the group
┃ • Try again after a few seconds
┃ • Some users may have privacy settings
┃
┃ 👨‍💻 Developer By Ammar Rai
┃
╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯`;
      
      await reply(errorMsg);
      await react('❌');
    }
  }
};
