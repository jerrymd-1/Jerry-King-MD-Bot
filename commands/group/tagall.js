// commands/group/tagall.js
// Tag All Command - Special Owner + Admin Support

module.exports = {
    name: 'tagall',
    aliases: ['mentionall', 'everyone', 'alltag', 'hiall', 'tag'],
    category: 'group',
    description: 'Tag all group members with various options',
    usage: '.tagall <message>\n.tagall count\n.tagall list\n.tagall silent <msg>',
    groupOnly: true,
    // adminOnly: true,  // REMOVED - Ab admin check manually handle hoga
    
    async execute(sock, msg, args, extra) {
        try {
            // ========== HELP MENU ==========
            if (!args.length || args[0].toLowerCase() === 'help') {
                const helpMsg = `
╭━━『 📢 TAG ALL HELP 』━━╮
┃
┃ 📝 *Commands:*
┃ • .tagall <message>
┃ • .tagall count
┃ • .tagall list
┃ • .tagall silent <msg>
┃
┃ 📌 *Examples:*
┃ • .tagall Hello everyone!
┃ • .tagall count
┃ • .tagall list
┃ • .tagall silent Meeting now
┃
┃ 👑 *Allowed Users:*
┃ • Bot Owner Numbers
┃ • Group Admins
┃
┃ 👨‍💻 Developer By Ammar Rai
┃
╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯`;
                return extra.reply(helpMsg);
            }
            
            await extra.react('📢');
            
            // ========== GET GROUP METADATA ==========
            let groupMetadata;
            try {
                groupMetadata = await sock.groupMetadata(extra.from);
            } catch (err) {
                console.error('Metadata Error:', err);
                return extra.reply(`❌ Failed to get group info: ${err.message}`);
            }
            
            if (!groupMetadata || !groupMetadata.participants) {
                return extra.reply(`❌ Could not fetch group participants!`);
            }
            
            // ========== GET PARTICIPANTS ==========
            const participants = groupMetadata.participants.map(p => p.id);
            
            if (participants.length === 0) {
                return extra.reply(`❌ No participants found in this group!`);
            }
            
            // ========== GET OWNER NUMBERS FROM CONFIG ==========
            const ownerNumbers = extra.config.ownerNumber || ['923013050530', '96876452594'];
            const senderNumber = extra.sender.split('@')[0];
            const isOwner = ownerNumbers.includes(senderNumber);
            
            // ========== CHECK ADMIN STATUS (Group Admin OR Owner) ==========
            const isGroupAdmin = groupMetadata.participants.some(p => p.id === extra.sender && p.admin);
            
            // Allow if: User is Group Admin OR User is Bot Owner
            if (!isGroupAdmin && !isOwner) {
                const denyMsg = `
╭━━『 ❌ ACCESS DENIED 』━━╮
┃
┃ ⚠️ Only group admins or bot owners
┃    can use this command!
┃
┃ 👤 Your Number: +${senderNumber}
┃
┃ 👑 *Allowed:*
┃ • Group Admins
┃ • Bot Owners: ${ownerNumbers.join(', ')}
┃
┃ 👨‍💻 Developer By Ammar Rai
┃
╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯`;
                return extra.reply(denyMsg);
            }
            
            const subCommand = args[0].toLowerCase();
            
            // ========== COUNT MEMBERS ==========
            if (subCommand === 'count') {
                const adminCount = groupMetadata.participants.filter(p => p.admin).length;
                
                const countMsg = `
╭━━『 👥 GROUP STATS 』━━╮
┃
┃ 📊 *${groupMetadata.subject}*
┃
┃ 👥 Total Members: ${participants.length}
┃ 👑 Admins: ${adminCount}
┃ 👤 Command By: ${isOwner ? '👑 Bot Owner' : '👑 Group Admin'}
┃
┃ 👨‍💻 Developer By Ammar Rai
┃
╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯`;
                
                return extra.reply(countMsg);
            }
            
            // ========== LIST MEMBERS ==========
            if (subCommand === 'list') {
                let listMsg = `╭━━『 📋 MEMBERS LIST 』━━╮\n┃\n┃ 📍 *Group:* ${groupMetadata.subject}\n┃ 👤 *By:* ${isOwner ? '👑 Bot Owner' : '👑 Admin'}\n┃\n`;
                
                // Split into chunks
                const chunkSize = 30;
                const chunks = [];
                
                for (let i = 0; i < participants.length; i += chunkSize) {
                    chunks.push(participants.slice(i, i + chunkSize));
                }
                
                for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
                    let chunkMsg = listMsg;
                    const chunk = chunks[chunkIndex];
                    const startIndex = chunkIndex * chunkSize;
                    
                    chunk.forEach((participant, idx) => {
                        const isAdmin = groupMetadata.participants.find(p => p.id === participant)?.admin;
                        const adminTag = isAdmin ? '👑 ' : '• ';
                        chunkMsg += `┃ ${adminTag}${startIndex + idx + 1}. @${participant.split('@')[0]}\n`;
                    });
                    
                    chunkMsg += `┃\n┃ 👨‍💻 Developer By Ammar Rai\n┃\n╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯`;
                    
                    await sock.sendMessage(extra.from, {
                        text: chunkMsg,
                        mentions: participants
                    }, { quoted: msg });
                    
                    if (chunkIndex < chunks.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                }
                
                await extra.react('✅');
                return;
            }
            
            // ========== SILENT TAG ==========
            let isSilent = false;
            let userMessage = args.join(' ');
            
            if (subCommand === 'silent') {
                isSilent = true;
                userMessage = args.slice(1).join(' ');
                if (!userMessage) {
                    return extra.reply(`❌ Please provide a message!\nExample: .tagall silent Hello`);
                }
            }
            
            if (!isSilent && !userMessage) {
                userMessage = "Attention Everyone!";
            }
            
            // ========== REMOVE COMMAND WORDS ==========
            if (!isSilent && (subCommand === 'count' || subCommand === 'list')) {
                return;
            }
            
            if (isSilent && userMessage.toLowerCase().startsWith('silent')) {
                userMessage = userMessage.replace(/^silent\s*/i, '');
            }
            
            // ========== SENDER INFO FOR DISPLAY ==========
            const senderRole = isOwner ? '👑 Bot Owner' : (isGroupAdmin ? '👑 Group Admin' : '👤 Member');
            
            // ========== CREATE MESSAGE ==========
            let text = '';
            
            if (isSilent) {
                text = `🔔 *ANNOUNCEMENT*\n👤 *By:* ${senderRole}\n\n${userMessage}\n\n`;
                
                const mentionGroups = [];
                for (let i = 0; i < participants.length; i += 30) {
                    mentionGroups.push(participants.slice(i, i + 30));
                }
                
                for (const group of mentionGroups) {
                    let groupText = text;
                    group.forEach((participant) => {
                        groupText += `@${participant.split('@')[0]} `;
                    });
                    groupText += `\n`;
                    
                    if (mentionGroups.indexOf(group) === mentionGroups.length - 1) {
                        groupText += `\n👨‍💻 *Developer By Ammar Rai*`;
                    }
                    
                    await sock.sendMessage(extra.from, {
                        text: groupText,
                        mentions: participants
                    }, { quoted: msg });
                    
                    if (mentionGroups.indexOf(group) < mentionGroups.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                }
            } else {
                text = `╭━━『 📢 GROUP TAG ALL 』━━╮\n`;
                text += `┃\n`;
                text += `┃ 📝 *Message:* ${userMessage}\n`;
                text += `┃ 👤 *By:* ${senderRole} @${extra.sender.split('@')[0]}\n`;
                text += `┃ ⏰ *Time:* ${new Date().toLocaleTimeString()}\n`;
                text += `┃ 📅 *Date:* ${new Date().toLocaleDateString()}\n`;
                text += `┃ 👥 *Total:* ${participants.length} members\n`;
                text += `┃\n`;
                text += `╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯\n\n`;
                text += `🔔 *Attention Everyone!*\n\n`;
                
                const maxPerMsg = 40;
                if (participants.length <= maxPerMsg) {
                    participants.forEach((participant, index) => {
                        text += `${index + 1}. @${participant.split('@')[0]}\n`;
                    });
                    text += `\n👨‍💻 *Developer By Ammar Rai*`;
                    
                    await sock.sendMessage(extra.from, {
                        text: text,
                        mentions: participants
                    }, { quoted: msg });
                } else {
                    const chunks = [];
                    for (let i = 0; i < participants.length; i += maxPerMsg) {
                        chunks.push(participants.slice(i, i + maxPerMsg));
                    }
                    
                    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
                        const chunk = chunks[chunkIndex];
                        let chunkText = text;
                        const startIndex = chunkIndex * maxPerMsg;
                        
                        chunk.forEach((participant, idx) => {
                            chunkText += `${startIndex + idx + 1}. @${participant.split('@')[0]}\n`;
                        });
                        
                        if (chunkIndex === chunks.length - 1) {
                            chunkText += `\n👨‍💻 *Developer By Ammar Rai*`;
                        } else {
                            chunkText += `\n📄 *Part ${chunkIndex + 1}/${chunks.length}*`;
                        }
                        
                        await sock.sendMessage(extra.from, {
                            text: chunkText,
                            mentions: participants
                        }, { quoted: msg });
                        
                        if (chunkIndex < chunks.length - 1) {
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        }
                    }
                }
            }
            
            await extra.react('✅');
            
        } catch (error) {
            console.error('TagAll Error:', error);
            
            let errorMsg = `❌ *TagAll Failed*\n\n`;
            
            if (error.message && error.message.includes('participants')) {
                errorMsg += `Could not fetch group members.`;
            } else if (error.message && error.message.includes('429')) {
                errorMsg += `Rate limited! Please wait 10-15 seconds.`;
            } else {
                errorMsg += `${error.message || 'Unknown error'}`;
            }
            
            errorMsg += `\n\n👨‍💻 *Developer By Ammar Rai*`;
            await extra.reply(errorMsg);
            await extra.react('❌');
        }
    }
};
