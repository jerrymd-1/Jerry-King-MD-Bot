const axios = require('axios');
const fs = require('fs');

module.exports = {
  name: 'qr',
  aliases: ['qrcode', 'generateqr', 'makeqr'],
  category: 'media',
  description: 'Generate QR code from any link | .qr <url>',
  usage: '.qr https://google.com',
  
  async execute(sock, msg, args, extra) {
    try {
      // ========== COMMAND PARSING ==========
      if (args.length < 1) {
        return extra.reply(`📱 *QR CODE GENERATOR*\n\n📝 *Usage:* .qr <url>\n\n📌 *Examples:*\n• .qr https://google.com\n• .qr https://chat.whatsapp.com/invite/xxxx\n• .qr https://github.com\n\n⚡ *Generates QR code that opens the link when scanned!*`);
      }

      await extra.react('📱');

      let inputUrl = args.join(' ');
      
      // Add https:// if no protocol specified
      if (!inputUrl.startsWith('http://') && !inputUrl.startsWith('https://')) {
        inputUrl = 'https://' + inputUrl;
      }
      
      // Validate URL format
      const urlPattern = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/;
      if (!urlPattern.test(inputUrl)) {
        return extra.reply('❌ *Invalid URL!*\n\n📝 Please enter a valid URL.\n📌 Example: .qr https://google.com');
      }

      if (inputUrl.length > 500) {
        return extra.reply('❌ *URL too long!* Maximum 500 characters.');
      }

      await extra.reply(`📱 *Generating QR code...*\n🔗 *Link:* ${inputUrl}\n⏳ Please wait.`);

      // ========== GENERATE QR CODE FROM API ==========
      const encodedUrl = encodeURIComponent(inputUrl);
      const apiUrl = `https://r-gengpt-api.vercel.app/api/generate-qr?data=${encodedUrl}`;
      
      console.log('Generating QR for:', inputUrl);
      console.log('API URL:', apiUrl);
      
      // Fetch QR code image
      const response = await axios({
        method: 'get',
        url: apiUrl,
        responseType: 'arraybuffer',
        timeout: 15000,
        headers: {
          'User-Agent': 'AMMAR-MD-BOT/1.0',
          'Accept': 'image/png,image/jpeg,image/webp,*/*'
        }
      });

      // Check if response is valid image
      if (!response.data || response.data.byteLength < 100) {
        throw new Error('QR code generation failed - empty response');
      }

      // ========== SAVE AND SEND QR CODE ==========
      // Ensure temp directory exists
      if (!fs.existsSync('./temp')) {
        fs.mkdirSync('./temp', { recursive: true });
      }
      
      const tempFile = `./temp/qr_${Date.now()}.png`;
      fs.writeFileSync(tempFile, Buffer.from(response.data));
      
      // Verify file size
      const stats = fs.statSync(tempFile);
      if (stats.size < 500) {
        fs.unlinkSync(tempFile);
        throw new Error('Generated QR code file is too small - invalid image');
      }
      
      // Send QR code image
      await sock.sendMessage(extra.from, {
        image: { url: tempFile },
        caption: `📱 *QR CODE GENERATED*\n\n🔗 *Link:* ${inputUrl}\n📱 *Scan to open*\n\n⚡ *${extra.config.botName}*`
      }, { quoted: msg });
      
      // Cleanup
      fs.unlinkSync(tempFile);
      
      await extra.react('✅');
      
    } catch (error) {
      console.error('QR Plugin Error:', error);
      
      let errorMessage = '❌ *Failed to generate QR code!*\n\n';
      
      if (error.code === 'ECONNABORTED') {
        errorMessage += '⏰ *Timeout:* Server took too long. Please try again.';
      } else if (error.response?.status === 404) {
        errorMessage += '🔌 *API Error:* QR service unavailable. Try later.\n\n💡 Try using: .qr google.com';
      } else if (error.response?.status === 400) {
        errorMessage += '📛 *Invalid URL:* Please check your link.\n\n📌 Example: .qr https://google.com';
      } else if (error.message.includes('ENOTFOUND')) {
        errorMessage += '🌐 *Network Error:* No internet connection.';
      } else if (error.message.includes('invalid QR')) {
        errorMessage += '📛 Could not generate QR for this URL. Try a different link.';
      } else {
        errorMessage += `📛 ${error.message}\n\n💡 Try a different URL or use format: .qr https://google.com`;
      }
      
      await extra.reply(errorMessage);
      await extra.react('❌');
    }
  },
  
  async init(sock) {
    console.log('📱 QR Code Generator Plugin Loaded!');
    console.log('📋 Command: .qr <url>');
    console.log('🔗 Generates QR code that opens the link when scanned');
    
    // Ensure temp directory exists
    if (!fs.existsSync('./temp')) {
      fs.mkdirSync('./temp', { recursive: true });
    }
  }
};
