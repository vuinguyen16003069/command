module.exports.config = {
  name: 'menu',
  version: '3.0.0',
  hasPermssion: 0,
  credits: 'DC-Nam mod by Vtuan + Kiên (tối ưu bởi ChatGPT & Grok)',
  description: 'Xem danh sách lệnh bot',
  commandCategory: 'Nhóm',
  usages: '[all|per <quyền>|tên lệnh]',
  cooldowns: 5,
  envConfig: {
    autoUnsend: { status: true, timeOut: 60 },
    sendAttachments: {
      random: true,
      url: ['https://files.catbox.moe/qof2fm.png']
    }
  }
};

const { findBestMatch } = require('string-similarity');
const axios = require('axios');
const { autoUnsend = module.exports.config.envConfig.autoUnsend, sendAttachments = module.exports.config.envConfig.sendAttachments } = global.config?.menu || {};
const FALLBACK_IMAGE_URL = 'https://files.catbox.moe/qof2fm.png';

// --- Stream ảnh từ URL ---
async function getAttachment() {
  const urls = Array.isArray(sendAttachments.url) && sendAttachments.url.length ? sendAttachments.url : [FALLBACK_IMAGE_URL];
  const selectedUrl = sendAttachments.random ? urls[Math.floor(Math.random() * urls.length)] : urls[0];

  try {
    const response = await axios.get(selectedUrl, { responseType: 'stream' });
    return response.data;
  } catch (err) {
    console.error('Lỗi khi stream ảnh:', err.message);
    try {
      const fallbackResponse = await axios.get(FALLBACK_IMAGE_URL, { responseType: 'stream' });
      return fallbackResponse.data;
    } catch (fallbackErr) {
      console.error('Lỗi khi stream ảnh dự phòng:', fallbackErr.message);
      return null;
    }
  }
}

// --- Gửi tin nhắn kèm ảnh + auto unsend ---
async function sendMessageWithAttachment(api, content, tid, mid, sid, dataForReply, replyCase = 'infoGr') {
  const payload = { body: content };
  try {
    const attach = await getAttachment();
    if (attach) payload.attachment = attach;
  } catch (err) {
    console.error('Lỗi khi tải attachment:', err);
  }

  api.sendMessage(payload, tid, (err, info) => {
    if (err) return console.error('Lỗi khi gửi tin nhắn:', err);

    if (dataForReply) {
      global.client.handleReply.push({
        name: module.exports.config.name,
        messageID: info.messageID,
        author: sid,
        case: replyCase,
        data: dataForReply
      });
    }

    if (autoUnsend.status) {
      setTimeout(() => {
        try {
          api.unsendMessage(info.messageID);
        } catch (err) {
          console.error('Lỗi khi xóa tin nhắn:', err);
        }
      }, 1000 * (autoUnsend.timeOut || 60));
    }
  }, mid);
}

// --- Lấy prefix thread ---
function prefix(threadID) {
  const tidData = global.data.threadData.get(threadID) || {};
  return tidData.PREFIX || global.config.PREFIX;
}

// --- Hiển thị info lệnh ---
function infoCmds(a, threadID) {
  const pre = prefix(threadID);
  return `『 ${a.name} 』
➜ Ver: ${a.version}
➜ Quyền: ${premssionTxt(a.hasPermssion)}
➜ Tác giả: ${a.credits}
➜ Mô tả: ${a.description}
➜ Nhóm: ${a.commandCategory}
➜ Dùng: ${pre}${a.usages}
➜ Chờ: ${a.cooldowns}s`;
}

function premssionTxt(a) {
  return a === 0 ? 'Thành Viên' : a === 1 ? 'QTV Nhóm' : a === 2 ? 'Người Điều Hành' : 'ADMINBOT';
}

// --- Lọc commands ---
function filterCommands(commands, isAdmin) {
  return Array.from(commands).filter(cmd => {
    const { commandCategory, hasPermssion } = cmd.config;
    if (isAdmin) return true;
    return commandCategory !== 'Hệ Thống' && hasPermssion < 2;
  });
}

// --- Lọc theo quyền ---
function filterCommandsByPermission(commands, permissionLevel) {
  return Array.from(commands).filter(cmd => cmd.config.hasPermssion === permissionLevel);
}

// --- Nhóm commands ---
function commandsGroup(isAdmin) {
  const array = [], cmds = filterCommands(global.client.commands.values(), isAdmin);
  for (const cmd of cmds) {
    const { name, commandCategory } = cmd.config;
    const find = array.find(i => i.commandCategory === commandCategory);
    !find
      ? array.push({ commandCategory, commandsName: [name] })
      : find.commandsName.push(name);
  }
  array.sort((a, b) => b.commandsName.length - a.commandsName.length);
  return array;
}

// --- Lệnh chính ---
module.exports.run = async function ({ api, event, args }) {
  const { threadID: tid, messageID: mid, senderID: sid } = event;
  const cmds = global.client.commands;
  const isAdmin = global.config?.ADMINBOT?.includes(sid);

  // --- Xử lý tìm kiếm lệnh ---
  if (args.length >= 1 && !['all', 'per'].includes(args[0]) && isNaN(args[1])) {
    const commandNames = Array.from(cmds.keys());
    const { bestMatch } = findBestMatch(args.join(' '), commandNames);
    if (bestMatch.rating > 0.5) {
      const cmd = cmds.get(bestMatch.target);
      return sendMessageWithAttachment(api, infoCmds(cmd.config, tid), tid, mid, sid, null, null);
    }
    return api.sendMessage(`Không tìm thấy "${args.join(' ')}". Ý bạn là "${bestMatch.target}"?`, tid, mid);
  }

  if (args.length >= 1) {
    if (args[0] === 'per' && !isNaN(args[1])) {
      const permissionLevel = parseInt(args[1]);
      const filteredCmds = filterCommandsByPermission(cmds.values(), permissionLevel);
      let txt = `✦ LỆNH QUYỀN ${permissionLevel} ✦\n\n`;
      filteredCmds.forEach((cmd, i) => txt += `${i + 1}. ${cmd.config.name} | ${cmd.config.description || 'N/A'}\n`);
      txt += `\nTổng: ${filteredCmds.length} lệnh\n🤖 Bot by Kiên`;
      return sendMessageWithAttachment(api, txt, tid, mid, sid, null, null);
    }
    if (args[0] === 'all') {
      const data = filterCommands(cmds.values(), isAdmin);
      let txt = `✦ TẤT CẢ LỆNH ✦\n\n`;
      data.forEach((cmd, i) => txt += `${i + 1}. ${cmd.config.name} | ${cmd.config.description || 'N/A'}\n`);
      txt += `\nTổng: ${data.length} lệnh\n⏰ ${new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}\n🤖 Bot by Kiên`;
      return sendMessageWithAttachment(api, txt, tid, mid, sid, null, null);
    }
  }

  // --- Menu nhóm (ngắn gọn cho mobile) ---
  const data = commandsGroup(isAdmin);
  const totalCmds = data.reduce((acc, cur) => acc + cur.commandsName.length, 0);
  const emojis = ["🌸", "🔥", "⚡", "🍀", "🌙", "⭐", "🎶", "🌀", "💎", "🐉"];
  const pick = () => emojis[Math.floor(Math.random() * emojis.length)];
  const vnTime = new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });

  let txt = `🌸 MENU BOT 🌸\n⏰ ${vnTime}\n\n`;
  data.forEach((grp, i) => txt += `${pick()} ${i + 1}. ${grp.commandCategory} (${grp.commandsName.length})\n`);
  txt += `\nTổng: ${totalCmds} lệnh\nReply 1-${data.length}\n🤖 Bot by Kiên\nThả 😾 để gỡ!`;

  return sendMessageWithAttachment(api, txt, tid, mid, sid, data);
};

// --- Xử lý reply ---
module.exports.handleReply = async function ({ handleReply: $, api, event }) {
  const { threadID: tid, messageID: mid, senderID: sid, args } = event;
  if (sid !== $.author) return api.sendMessage("Đi ra chỗ khác chơi 🥹", tid, mid);

  const argNum = parseInt(args[0]);
  if (isNaN(argNum) || argNum < 1 || argNum > $.data.length) {
    return api.sendMessage(`Nhập số từ 1 đến ${$.data.length}`, tid, mid);
  }

  switch ($.case) {
    case 'infoGr': {
      const data = $.data[argNum - 1];
      try { api.unsendMessage($.messageID); } catch (err) { console.error('Lỗi xóa tin:', err); }

      const emojis = ["🌸", "🔥", "⚡", "🍀", "🌙", "⭐", "🎶", "🌀", "💎", "🐉"];
      const pick = () => emojis[Math.floor(Math.random() * emojis.length)];
      const vnTime = new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });

      let txt = `🌸 ${data.commandCategory} 🌸\n⏰ ${vnTime}\n\n`;
      data.commandsName.forEach((name, i) => txt += `${pick()} ${i + 1}. ${name}\n`);
      txt += `\nReply 1-${data.commandsName.length}\n🤖 Bot by Kiên`;

      return sendMessageWithAttachment(api, txt, tid, mid, sid, data.commandsName, 'infoCmds');
    }

    case 'infoCmds': {
      const cmd = global.client.commands.get($.data[argNum - 1]);
      if (!cmd) return api.sendMessage("Lệnh không tồn tại", tid, mid);
      try { api.unsendMessage($.messageID); } catch (err) { console.error('Lỗi xóa tin:', err); }

      return sendMessageWithAttachment(api, infoCmds(cmd.config, tid), tid, mid, sid, null, null);
    }
  }
};
