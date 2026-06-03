// commands/media/tts.js
const fs = require('fs');
const axios = require('axios');
const path = require('path');

module.exports = {
  name: 'tts',
  aliases: ['texttospeech', 'speak', 'voice', 'bol'],
  category: 'media',
  description: 'Text to Speech - WhatsApp Voice Note',
  usage: '.tts <lang> <accent> <text>\n\n📌 Example: .tts en us Hello world\n\n🌍 Languages: en, es, fr, de, hi, ar\n🎙️ Accents: us, uk, au, ca, in',
  
  async execute(sock, msg, args, extra) {
    try {
      // Validate arguments
      if (args.length < 3) {
        return extra.reply(`🎙️ *Voice Note Generator*\n\n❌ Invalid usage!\n\n📝 *Format:*\n${this.usage}\n\n💡 *Examples:*\n.tts en us Hello friends\n.tts hi in नमस्ते दोस्तों\n.tts ar us مرحبا اصدقاء`);
      }

      const lang = args[0].toLowerCase();
      const accent = args[1].toLowerCase();
      const text = args.slice(2).join(' ');

      // Supported languages and accents
      const supportedLangs = {
        en: 'English',
        es: 'Spanish',
        fr: 'French',
        de: 'German',
        hi: 'Hindi',
        ar: 'Arabic'
      };
      
      const supportedAccents = {
        us: 'US 🇺🇸',
        uk: 'UK 🇬🇧',
        au: 'Australian 🇦🇺',
        ca: 'Canadian 🇨🇦',
        in: 'Indian 🇮🇳'
      };

      if (!supportedLangs[lang]) {
        return extra.reply(`❌ *Unsupported Language:* ${lang}\n\n✅ *Supported Languages:*\n${Object.entries(supportedLangs).map(([code, name]) => `• ${code} = ${name}`).join('\n')}`);
      }

      if (!supportedAccents[accent]) {
        return extra.reply(`❌ *Unsupported Accent:* ${accent}\n\n✅ *Supported Accents:*\n${Object.entries(supportedAccents).map(([code, name]) => `• ${code} = ${name}`).join('\n')}`);
      }

      if (text.length > 200) {
        return extra.reply('❌ *Text too long!*\n\nMaximum 200 characters allowed.\nYour text: ' + text.length + ' characters');
      }

      // Send status messages
      await extra.react('🎙️');
      
      const statusMsg = await extra.reply(`🎙️ *Generating Voice Note...*\n\n📝 *Text:* ${text}\n🌐 *Language:* ${supportedLangs[lang]}\n🎭 *Accent:* ${supportedAccents[accent]}\n⏳ *Please wait...*`);

      // Call the Ghost TTS API
      const apiUrl = `https://ghost-text-to-speech-generator-api.vercel.app/tts?text=${encodeURIComponent(text)}&lang=${lang}&accent=${accent}`;
      
      const response = await axios.get(apiUrl, {
        timeout: 30000, // 30 seconds timeout
        headers: {
          'User-Agent': 'AMMAR-MD-BOT/1.0'
        }
      });
      
      if (!response.data.success) {
        throw new Error(response.data.message || 'Failed to generate speech');
      }

      const { download_url, filename, size_kb, language, accent: respAccent } = response.data.data;

      // Download the audio file
      const audioResponse = await axios.get(download_url, { 
        responseType: 'arraybuffer',
        timeout: 30000
      });
      
      const tempFilePath = path.join(__dirname, '..', '..', 'temp', filename);
      
      // Ensure temp directory exists
      if (!fs.existsSync(path.join(__dirname, '..', '..', 'temp'))) {
        fs.mkdirSync(path.join(__dirname, '..', '..', 'temp'), { recursive: true });
      }

      fs.writeFileSync(tempFilePath, audioResponse.data);

      // Edit status message
      await sock.sendMessage(extra.from, {
        text: `🎙️ *Sending Voice Note...*\n\n✅ Generated successfully!\n📦 Size: ${size_kb} KB\n🎵 Duration: ~${Math.ceil(size_kb / 16)} seconds`,
        edit: statusMsg.key
      });

      // Send as WhatsApp Voice Note (PTT)
      await sock.sendMessage(extra.from, {
        audio: fs.readFileSync(tempFilePath),
        mimetype: 'audio/mpeg',
        ptt: true, // THIS MAKES IT A VOICE NOTE!
        waveform: [100, 80, 120, 90, 110, 95], // Optional: voice wave effect
        caption: `🎙️ *Voice Note Generated*\n\n📝 *Text:* ${text}\n🌐 *Language:* ${language.toUpperCase()}\n🎭 *Accent:* ${respAccent.toUpperCase()}\n⚡ *Powered by Ghost TTS*`
      }, { quoted: msg });

      // Clean up temp file
      fs.unlinkSync(tempFilePath);
      
      await extra.react('🎵');
      
    } catch (error) {
      console.error('TTS Error:', error);
      
      let errorMsg = '❌ *Error Generating Voice Note*\n\n';
      
      if (error.code === 'ECONNABORTED') {
        errorMsg += '⏰ *Timeout!* API took too long to respond.\nTry again with shorter text.';
      } else if (error.response?.status === 404) {
        errorMsg += '🔊 *File expired!*\nPlease try again immediately.';
      } else if (error.message.includes('timeout')) {
        errorMsg += '⏰ *Download timeout!*\nTry with shorter text or try again.';
      } else {
        errorMsg += `🔴 *Error:* ${error.message || 'Unknown error'}\n\nTry again or use different text.`;
      }
      
      await extra.reply(errorMsg);
      await extra.react('❌');
    }
  }
};
