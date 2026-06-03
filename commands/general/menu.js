/**
 * MENU - Dynamic Category Menu System
 * WITH ALL MENU BUTTON - Shows all categories with their commands
 */

const config = require('../../config');
const { sendInteractiveMessage } = require('gifted-btns');
const fs = require('fs');
const path = require('path');
const { loadCommands } = require('../../utils/commandLoader');

module.exports = {
  name: 'menu',
  aliases: ['help', 'cmd'],
  category: 'general',
  description: 'Show category menu',
  usage: '.menu',

  async execute(sock, msg, args, extra) {
    try {
      await extra.react('📱');

      const commandsPath = path.join(__dirname, '../../commands');
      const categories = this.getCategoriesFromFolders(commandsPath);
      
      const allCommands = loadCommands();
      
      const categoryCommands = {};
      allCommands.forEach((cmd, name) => {
        if (cmd.name === name && cmd.category) {
          if (!categoryCommands[cmd.category]) {
            categoryCommands[cmd.category] = [];
          }
          categoryCommands[cmd.category].push(cmd);
        }
      });

      const botName = config.botName || 'AMMAR-MD-BOT';
      const ownerName = Array.isArray(config.ownerName) ? config.ownerName[0] : config.ownerName;
      const userName = extra.sender.split('@')[0];
      const totalCommands = allCommands.size;

      // Header - NO ARROWS
      const header = `╭━ ${botName} ━╮
┃
┃ Owner: ${ownerName}
┃ User: @${userName}
┃ Total Commands: ${totalCommands}
┃ Categories: ${categories.length}
┃
┃ SELECT ANY CATEGORY
┃
╰━━━━━━━━━━━━━━━╯`;

      const imagePath = path.join(__dirname, '../../utils/bot_image.jpg');
      if (fs.existsSync(imagePath)) {
        await sock.sendMessage(extra.from, {
          image: fs.readFileSync(imagePath),
          caption: header,
          mentions: [extra.sender]
        }, { quoted: msg });
      } else {
        await sock.sendMessage(extra.from, {
          text: header,
          mentions: [extra.sender]
        }, { quoted: msg });
      }

      const buttons = [];
      for (const category of categories) {
        const cmdCount = categoryCommands[category]?.length || 0;
        buttons.push({
          name: 'quick_reply',
          buttonParamsJson: JSON.stringify({
            display_text: `${category.toUpperCase()} (${cmdCount})`,
            id: `menu_cat_${category}`
          })
        });
      }

      // ADD ALL MENU BUTTON
      buttons.push({
        name: 'quick_reply',
        buttonParamsJson: JSON.stringify({
          display_text: '📋 ALL MENU',
          id: 'menu_cat_all'
        })
      });

      // Button message - NO ARROWS
      await sendInteractiveMessage(sock, extra.from, {
        text: '━━━━━━━━━━━━━━━\nCLICK ANY BUTTON\n━━━━━━━━━━━━━━━',
        footer: botName,
        interactiveButtons: buttons
      }, { quoted: msg });

      await extra.react('✅');

    } catch (error) {
      console.error('Menu error:', error);
      await extra.reply(`X ${error.message}`);
    }
  },

  getCategoriesFromFolders(commandsPath) {
    try {
      const folders = fs.readdirSync(commandsPath, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name.toLowerCase());
      
      const originalOrder = ['general', 'media', 'owner', 'utility', 'ai', 'group', 'fun', 'anime', 'textmaker'];
      
      const sorted = folders.sort((a, b) => {
        const indexA = originalOrder.indexOf(a);
        const indexB = originalOrder.indexOf(b);
        if (indexA !== -1 && indexB !== -1) return indexA - indexB;
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;
        return a.localeCompare(b);
      });
      
      return sorted;
    } catch (error) {
      console.error('Error reading categories:', error);
      return ['general', 'media', 'owner', 'utility', 'ai', 'group', 'fun', 'anime', 'textmaker'];
    }
  },

  // SHOW ALL MENU - All categories with their commands
  async showAllMenu(sock, msg, extra) {
    try {
      console.log('[MENU] Showing ALL MENU with all categories');
      
      const allCommands = loadCommands();
      const categories = this.getCategoriesFromFolders(path.join(__dirname, '../../commands'));
      
      const categoryCommands = {};
      allCommands.forEach((cmd, name) => {
        if (cmd.name === name && cmd.category) {
          if (!categoryCommands[cmd.category]) {
            categoryCommands[cmd.category] = [];
          }
          categoryCommands[cmd.category].push(cmd);
        }
      });

      const botName = config.botName || 'AMMAR-MD-BOT';
      const ownerName = Array.isArray(config.ownerName) ? config.ownerName[0] : config.ownerName;
      const totalCommands = allCommands.size;

      let menu = `╭━ ALL COMMANDS ━╮\n`;
      menu += `┃\n`;
      menu += `┃ Owner: ${ownerName}\n`;
      menu += `┃ Total Commands: ${totalCommands}\n`;
      menu += `┃ Categories: ${categories.length}\n`;
      menu += `┃\n`;
      menu += `╰━━━━━━━━━━━━━━━╯\n\n`;

      // Loop through each category
      for (const category of categories) {
        const commands = categoryCommands[category] || [];
        
        if (commands.length > 0) {
          let categoryDisplayName = category.toUpperCase();
          
          if (category === 'general') categoryDisplayName = 'GENERAL COMMANDS';
          else if (category === 'owner') categoryDisplayName = 'OWNER COMMANDS';
          else if (category === 'group') categoryDisplayName = 'GROUP COMMANDS';
          else if (category === 'media') categoryDisplayName = 'MEDIA COMMANDS';
          else if (category === 'utility') categoryDisplayName = 'UTILITY COMMANDS';
          else if (category === 'ai') categoryDisplayName = 'AI COMMANDS';
          else if (category === 'fun') categoryDisplayName = 'FUN COMMANDS';
          else if (category === 'anime') categoryDisplayName = 'ANIME COMMANDS';
          else if (category === 'textmaker') categoryDisplayName = 'TEXTMAKER COMMANDS';
          else categoryDisplayName = category.toUpperCase() + ' COMMANDS';

          // Category header
          menu += `╭─ ${categoryDisplayName}\n`;
          menu += `│\n`;
          menu += `│ Total: ${commands.length} commands\n`;
          menu += `│ Prefix: ${config.prefix}\n`;
          menu += `│\n`;
          
          // Commands with arrow - NO GAPS
          for (const cmd of commands) {
            menu += `│ ➜ ${config.prefix}${cmd.name}\n`;
          }
          
          menu += `│\n`;
          menu += `╰──────────────\n\n`;
        }
      }

      menu += `━━━━━━━━━━━━━━━━━━━━━━━\n`;
      menu += `Usage: ${config.prefix}[command]\n`;
      menu += `Type .menu to go back to main menu\n`;
      
      // Send the menu (might be long, WhatsApp will handle it)
      await sock.sendMessage(extra.from, { text: menu }, { quoted: msg });
      
    } catch (error) {
      console.error('All menu error:', error);
      await extra.reply(`X Error: ${error.message}`);
    }
  },

  // Show specific category commands - Arrow ONLY before command names
  async showCategoryCommands(sock, msg, extra, categoryId) {
    try {
      console.log(`[MENU] Showing commands for category: ${categoryId}`);
      
      const allCommands = loadCommands();
      const categoryCommands = [];
      
      allCommands.forEach((cmd, name) => {
        if (cmd.name === name && cmd.category && cmd.category.toLowerCase() === categoryId) {
          categoryCommands.push(cmd);
        }
      });

      if (categoryCommands.length === 0) {
        return await extra.reply(`X No commands found in ${categoryId.toUpperCase()} category`);
      }

      let categoryDisplayName = categoryId.toUpperCase();
      
      if (categoryId === 'general') categoryDisplayName = 'GENERAL COMMANDS';
      else if (categoryId === 'owner') categoryDisplayName = 'OWNER COMMANDS';
      else if (categoryId === 'group') categoryDisplayName = 'GROUP COMMANDS';
      else if (categoryId === 'media') categoryDisplayName = 'MEDIA COMMANDS';
      else if (categoryId === 'utility') categoryDisplayName = 'UTILITY COMMANDS';
      else if (categoryId === 'ai') categoryDisplayName = 'AI COMMANDS';
      else if (categoryId === 'fun') categoryDisplayName = 'FUN COMMANDS';
      else if (categoryId === 'anime') categoryDisplayName = 'ANIME COMMANDS';
      else if (categoryId === 'textmaker') categoryDisplayName = 'TEXTMAKER COMMANDS';
      else categoryDisplayName = categoryId.toUpperCase() + ' COMMANDS';

      let menu = `╭─ ${categoryDisplayName}\n`;
      menu += `│\n`;
      menu += `│ Total Commands: ${categoryCommands.length}\n`;
      menu += `│ Prefix: ${config.prefix}\n`;
      menu += `│\n`;
      
      // Commands with arrow (➜) ONLY before each command - NO GAPS
      for (const cmd of categoryCommands) {
        menu += `│ ➜ ${config.prefix}${cmd.name}\n`;
      }
      
      menu += `│\n`;
      menu += `│ Usage: ${config.prefix}[command]\n`;
      menu += `│\n`;
      menu += `│ Type .menu to go back\n`;
      menu += `╰──────────────`;
      
      await sock.sendMessage(extra.from, { text: menu }, { quoted: msg });
      
    } catch (error) {
      console.error('Category menu error:', error);
      await extra.reply(`X Error: ${error.message}`);
    }
  },

  async handleButtonResponse(sock, msg, extra) {
    try {
      console.log('[MENU] handleButtonResponse called');
      
      let buttonId = null;
      
      if (msg.message?.buttonsResponseMessage?.selectedButtonId) {
        buttonId = msg.message.buttonsResponseMessage.selectedButtonId;
        console.log('[MENU] Button ID from buttonsResponseMessage:', buttonId);
      }
      
      if (msg.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson) {
        try {
          const params = JSON.parse(msg.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson);
          buttonId = params.id;
          console.log('[MENU] Button ID from interactiveResponseMessage:', buttonId);
        } catch (e) {}
      }
      
      if (msg.message?.templateButtonReplyMessage?.selectedId) {
        buttonId = msg.message.templateButtonReplyMessage.selectedId;
        console.log('[MENU] Button ID from templateButtonReplyMessage:', buttonId);
      }
      
      if (!buttonId) {
        console.log('[MENU] No button ID found');
        return false;
      }
      
      // Check for ALL MENU button
      if (buttonId === 'menu_cat_all') {
        console.log('[MENU] ALL MENU selected');
        await this.showAllMenu(sock, msg, extra);
        return true;
      }
      
      // Check for category buttons
      if (buttonId.startsWith('menu_cat_')) {
        const categoryId = buttonId.replace('menu_cat_', '');
        console.log('[MENU] Category selected:', categoryId);
        
        await this.showCategoryCommands(sock, msg, extra, categoryId);
        return true;
      }
      
      return false;
      
    } catch (error) {
      console.error('[MENU] Button handler error:', error);
      return false;
    }
  }
};