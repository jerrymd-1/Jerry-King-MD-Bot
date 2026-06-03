/**
 * Backup Plugin – Creates .tar.gz of index.js and commands folder using system tar.
 * Backup is sent to a hardcoded number: 923013050530.
 * Can be run from any chat by the bot owner.
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const execPromise = promisify(exec);

const BACKUP_RECIPIENT = '923013050530@s.whatsapp.net';

module.exports = {
  name: 'backup',
  aliases: ['backupbot'],
  category: 'owner',
  description: '📦 Create backup of index.js and commands folder, send to fixed number',
  usage: '.backup',
  ownerOnly: true, // Only owner can execute

  async execute(sock, msg, args, extra) {
    const { from, reply, react, isOwner } = extra;

    if (!isOwner) {
      return reply('❌ Only the bot owner can use this command.');
    }

    try {
      await react('⏳');
      await reply('📦 Creating backup archive... This may take a few seconds.');

      const timestamp = Date.now();
      const archiveName = `ammar_md_bot_backup_${timestamp}.tar.gz`;
      const archivePath = path.join(process.cwd(), archiveName);

      const filesToBackup = ['index.js', 'commands'];
      const tarCmd = `cd ${process.cwd()} && tar -czf ${archivePath} ${filesToBackup.join(' ')} 2>/dev/null`;

      await execPromise(tarCmd);

      if (!fs.existsSync(archivePath)) {
        throw new Error('Archive creation failed');
      }

      const stats = fs.statSync(archivePath);
      const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

      // Send backup to hardcoded number
      await sock.sendMessage(BACKUP_RECIPIENT, {
        document: fs.readFileSync(archivePath),
        fileName: archiveName,
        mimetype: 'application/gzip',
        caption: `📦 *Bot Backup*\n\n📄 Includes:\n- index.js\n- commands/ (full folder)\n📅 ${new Date().toLocaleString()}\n📦 Size: ${fileSizeMB} MB`
      });

      // Delete the archive from server
      fs.unlinkSync(archivePath);

      await reply(`✅ Backup sent successfully to ${BACKUP_RECIPIENT}. (${fileSizeMB} MB)`);
      await react('✅');

    } catch (error) {
      console.error('Backup error:', error);
      let errorMsg = '❌ Backup failed.';
      if (error.message.includes('tar')) {
        errorMsg += ' System `tar` command not found. Please install tar or use a different method.';
      } else {
        errorMsg += ` ${error.message}`;
      }
      await reply(errorMsg);
      await react('❌');
    }
  }
};
