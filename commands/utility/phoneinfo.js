// commands/utility/phoneinfo.js
// PHONE INFO PLUGIN - FIXED VERSION

const axios = require('axios');

module.exports = {
  name: 'phoneinfo',
  aliases: ['phone', 'phonespecs', 'specs', 'deviceinfo', 'mobileinfo', 'hp'],
  category: 'utility',
  description: 'Get detailed smartphone specifications',
  usage: '.phoneinfo <phone_name>',
  
  async execute(sock, msg, args, extra) {
    try {
      // ========== ARGUMENT CHECK ==========
      if (!args || args.length === 0) {
        const helpMsg = `╭━━『 📱 PHONE INFO 』━━╮
┃
┃ 📝 *Usage:* .phoneinfo <phone_name>
┃
┃ 📌 *Examples:*
┃ • .phoneinfo poco f5
┃ • .phoneinfo iphone 14
┃ • .phoneinfo samsung s23
┃
┃ 👨‍💻 Developer By Ammar Rai
┃
╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯`;
        await extra.reply(helpMsg);
        return;
      }

      await extra.react('📱');
      
      const query = args.join(' ');
      
      // Send initial message
      await extra.reply(`🔍 *Searching:* "${query}"\n⏳ Please wait...`);
      
      // ========== API CALL WITH MULTIPLE ENDPOINTS ==========
      let data = null;
      let error = null;
      
      // Try primary API
      const endpoints = [
        `https://api.yabes-desu.workers.dev/tools/phone-info?query=${encodeURIComponent(query)}`,
        `https://api.yabes-desu.workers.dev/tools/phone-info?query=${encodeURIComponent(query.toLowerCase())}`,
        `https://api.yabes-desu.workers.dev/tools/phone-info?query=${encodeURIComponent(query.replace(/ /g, '%20'))}`
      ];
      
      for (const endpoint of endpoints) {
        try {
          console.log(`Trying endpoint: ${endpoint}`);
          const response = await axios.get(endpoint, {
            timeout: 10000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          });
          
          if (response.data && response.data.success === true && response.data.phoneName) {
            data = response.data;
            console.log('API Success:', data.phoneName);
            break;
          }
        } catch (err) {
          console.log(`Endpoint failed: ${err.message}`);
          error = err;
        }
      }
      
      // Check if we got data
      if (!data || !data.success) {
        // Try alternative API
        try {
          const altResponse = await axios.get(`https://api.yabes-desu.workers.dev/tools/phone-info?query=${encodeURIComponent(query)}`, {
            timeout: 15000
          });
          if (altResponse.data && altResponse.data.phoneName) {
            data = altResponse.data;
          }
        } catch (altErr) {
          console.log('Alternative API also failed');
        }
      }
      
      if (!data || !data.phoneName) {
        const notFoundMsg = `╭━━『 ❌ NOT FOUND 』━━╮
┃
┃ 🔍 *Phone:* "${query}"
┃
┃ ⚠️ Could not find specifications!
┃
┃ 💡 *Try these formats:*
┃ • .phoneinfo poco f5
┃ • .phoneinfo "iphone 14"
┃ • .phoneinfo samsung galaxy s23
┃
┃ 📝 *Tips:*
┃ • Use brand + model name
┃ • Check spelling
┃ • Try shorter keywords
┃
┃ 👨‍💻 Developer By Ammar Rai
┃
╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯`;
        await extra.reply(notFoundMsg);
        await extra.react('❌');
        return;
      }
      
      const specs = data.specs || {};
      
      // ========== CREATE BEAUTIFUL OUTPUT ==========
      let infoText = `╭━━『 📱 ${data.phoneName || 'Phone Specs'} 』━━╮\n`;
      infoText += `┃\n`;
      
      // Launch Info
      if (specs.Launch) {
        infoText += `┃ 📅 *Launched:* ${specs.Launch.Announced || 'N/A'}\n`;
        infoText += `┃ ✅ *Status:* ${specs.Launch.Status || 'N/A'}\n`;
        infoText += `┃\n`;
      }
      
      // Network
      if (specs.Network && specs.Network.Technology) {
        infoText += `┃ 🌐 *NETWORK*\n`;
        infoText += `┃ • ${specs.Network.Technology}\n`;
        if (specs.Network['5G bands']) {
          let bands = specs.Network['5G bands'];
          if (bands.length > 40) bands = bands.substring(0, 40) + '...';
          infoText += `┃ • 5G: ${bands}\n`;
        }
        infoText += `┃\n`;
      }
      
      // Body
      if (specs.Body) {
        infoText += `┃ 📏 *BODY*\n`;
        if (specs.Body.Dimensions) infoText += `┃ • Size: ${specs.Body.Dimensions}\n`;
        if (specs.Body.Weight) infoText += `┃ • Weight: ${specs.Body.Weight}\n`;
        if (specs.Body.Build && specs.Body.Build.length < 50) infoText += `┃ • Build: ${specs.Body.Build}\n`;
        infoText += `┃\n`;
      }
      
      // Display
      if (specs.Display) {
        infoText += `┃ 📺 *DISPLAY*\n`;
        if (specs.Display.Type) {
          let displayType = specs.Display.Type;
          if (displayType.length > 45) displayType = displayType.substring(0, 42) + '...';
          infoText += `┃ • Type: ${displayType}\n`;
        }
        if (specs.Display.Size) infoText += `┃ • Size: ${specs.Display.Size}\n`;
        if (specs.Display.Resolution) infoText += `┃ • Resolution: ${specs.Display.Resolution}\n`;
        infoText += `┃\n`;
      }
      
      // Platform
      if (specs.Platform) {
        infoText += `┃ ⚙️ *PLATFORM*\n`;
        if (specs.Platform.OS) infoText += `┃ • OS: ${specs.Platform.OS}\n`;
        if (specs.Platform.Chipset) {
          let chipset = specs.Platform.Chipset;
          if (chipset.length > 45) chipset = chipset.substring(0, 42) + '...';
          infoText += `┃ • Chipset: ${chipset}\n`;
        }
        if (specs.Platform.CPU) {
          let cpu = specs.Platform.CPU;
          if (cpu.length > 45) cpu = cpu.substring(0, 42) + '...';
          infoText += `┃ • CPU: ${cpu}\n`;
        }
        infoText += `┃\n`;
      }
      
      // Memory
      if (specs.Memory) {
        infoText += `┃ 💾 *MEMORY*\n`;
        if (specs.Memory.Internal) {
          let internal = Array.isArray(specs.Memory.Internal) ? specs.Memory.Internal[0] : specs.Memory.Internal;
          if (internal && internal.length > 40) internal = internal.substring(0, 37) + '...';
          infoText += `┃ • Storage: ${internal}\n`;
        }
        if (specs.Memory['Card slot'] && specs.Memory['Card slot'] !== 'No') {
          infoText += `┃ • Card: ${specs.Memory['Card slot']}\n`;
        }
        infoText += `┃\n`;
      }
      
      // Main Camera
      if (specs['Main Camera']) {
        infoText += `┃ 📸 *MAIN CAMERA*\n`;
        if (specs['Main Camera'].Modules) {
          let cam = Array.isArray(specs['Main Camera'].Modules) ? specs['Main Camera'].Modules[0] : specs['Main Camera'].Modules;
          if (cam && cam.length > 45) cam = cam.substring(0, 42) + '...';
          infoText += `┃ • ${cam}\n`;
        }
        if (specs['Main Camera'].Video) {
          let video = specs['Main Camera'].Video;
          if (video.length > 45) video = video.substring(0, 42) + '...';
          infoText += `┃ • Video: ${video}\n`;
        }
        infoText += `┃\n`;
      }
      
      // Selfie Camera
      if (specs['Selfie Camera'] && specs['Selfie Camera'].Modules) {
        infoText += `┃ 🤳 *SELFIE*\n`;
        infoText += `┃ • ${specs['Selfie Camera'].Modules}\n`;
        infoText += `┃\n`;
      }
      
      // Battery
      if (specs.Battery) {
        infoText += `┃ 🔋 *BATTERY*\n`;
        if (specs.Battery.Type) infoText += `┃ • ${specs.Battery.Type}\n`;
        if (specs.Battery.Charging) {
          let charging = specs.Battery.Charging;
          if (charging.length > 45) charging = charging.substring(0, 42) + '...';
          infoText += `┃ • Charging: ${charging}\n`;
        }
        infoText += `┃\n`;
      }
      
      // Price
      if (data.prices || (specs.Misc && specs.Misc.Price)) {
        infoText += `┃ 💰 *PRICE*\n`;
        if (data.prices && data.prices.UnitedStates) {
          const usPrice = Object.values(data.prices.UnitedStates)[0];
          if (usPrice) infoText += `┃ • USA: ${usPrice}\n`;
        }
        if (specs.Misc && specs.Misc.Price) {
          infoText += `┃ • Global: ${specs.Misc.Price}\n`;
        }
        infoText += `┃\n`;
      }
      
      // Colors
      if (specs.Misc && specs.Misc.Colors) {
        infoText += `┃ 🎨 *COLORS*\n`;
        infoText += `┃ • ${specs.Misc.Colors}\n`;
        infoText += `┃\n`;
      }
      
      infoText += `╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯\n\n`;
      infoText += `👨‍💻 *Developer By Ammar Rai*`;
      
      // ========== SEND RESPONSE ==========
      if (data.imageUrl && data.imageUrl !== "https://fdn2.gsmarena.com/vv/bigpic/xiaomi-poco-f5-2.jpg") {
        try {
          await sock.sendMessage(extra.from, {
            image: { url: data.imageUrl },
            caption: infoText
          }, { quoted: msg });
        } catch (imgError) {
          await extra.reply(infoText);
        }
      } else {
        await extra.reply(infoText);
      }
      
      await extra.react('✅');
      console.log('Phone Info Sent Successfully');
      
    } catch (error) {
      console.error('Phone Info Error:', error);
      
      const errorMsg = `╭━━『 ❌ ERROR 』━━╮
┃
┃ 📛 *Error:* ${error.message || 'Unknown'}
┃
┃ 💡 *Try these:*
┃ • .phoneinfo iphone 14
┃ • .phoneinfo samsung s23
┃ • .phoneinfo poco f5
┃
┃ 🔧 *If still not working:*
┃ • Check internet connection
┃ • Restart the bot
┃ • Try again in a few seconds
┃
┃ 👨‍💻 Developer By Ammar Rai
┃
╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯`;
      
      await extra.reply(errorMsg);
      await extra.react('❌');
    }
  }
};
