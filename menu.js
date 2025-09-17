module.exports.config = {
  name: 'menu',
  version: '2.1.0',
  hasPermssion: 0,
  credits: 'DC-Nam mod by Vtuan + Kiên (tối ưu bởi ChatGPT)',
  description: 'Xem toàn bộ danh sách lệnh bot đẹp',
  commandCategory: 'Danh sách lệnh',
  usages: '[all|per <quyền>|tên lệnh]',
  cooldowns: 5,
  envConfig: {
    autoUnsend: { status: true, timeOut: 60 },
    sendAttachments: {
      status: true,
      random: true,
      url: [
        'https://files.catbox.moe/qof2fm.png'
      ]
    }
  }
};

const { findBestMatch } = require('string-similarity');

const { autoUnsend, sendAttachments } =
  global.config?.menu ?? module.exports.config.envConfig;

// ---- Hàm lấy ảnh từ config ----
async function getAttachment() {
  if (!sendAttachments?.status || !Array.isArray(sendAttachments.url) || !sendAttachments.url.length) {
    return null;
  }
  try {
    const urls = sendAttachments.url;
    const url = sendAttachments.random
      ? urls[Math.floor(Math.random() * urls.length)]
      : urls[0];
    return await global.utils.getStreamFromURL(url);
  } catch {
    return null;
  }
}

// ---- Hàm gửi tin nhắn kèm auto unsend + ảnh ----
async function sendMenuMessage(api, content, tid, mid, sid, dataForReply) {
  const { sendMessage: send, unsendMessage: un } = api;

  let payload = { body: content };
  const attach = await getAttachment();
  if (attach) payload.attachment = attach;

  send(payload, tid, (err, info) => {
    if (err) return console.log(err);

    if (Array.isArray(global.client.handleReply)) {
      global.client.handleReply.push({
        name: module.exports.config.name,
        messageID: info.messageID,
        author: sid,
        case: 'infoGr',
        data: dataForReply
      });
    }

    if (autoUnsend?.status) {
      setTimeout(() => {
        try { un(info.messageID); } catch { }
      }, 1000 * (autoUnsend.timeOut || 60));
    }
  }, mid);
}

// --- Hàm lấy prefix thread ---
function prefix(threadID) {
  const tidData = global.data.threadData.get(threadID) || {};
  return tidData.PREFIX || global.config.PREFIX;
}

// --- Hiển thị info lệnh ---
function infoCmds(a, threadID) {
  const pre = prefix(threadID);
  return `『 ${a.name} 』\n
➜ Phiên bản : ${a.version}
➜ Quyền hạn : ${premssionTxt(a.hasPermssion)}
➜ Tác giả : ${a.credits}
➜ Mô tả : ${a.description}
➜ Thuộc nhóm : ${a.commandCategory}
➜ Cách dùng : ${pre}${a.usages}
➜ Thời gian chờ : ${a.cooldowns} giây`;
}

function premssionTxt(a) {
  return a === 0 ? 'Thành Viên'
    : a === 1 ? 'Quản Trị Viên Nhóm'
      : a === 2 ? 'Người Điều Hành Bot'
        : 'ADMINBOT';
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
    const find = array.find(i => i.commandCategory == commandCategory);
    !find
      ? array.push({ commandCategory, commandsName: [name] })
      : find.commandsName.push(name);
  }
  array.sort((a, b) => b.commandsName.length - a.commandsName.length);
  return array;
}

module.exports.run = async function ({ api, event, args }) {
  const { threadID: tid, messageID: mid, senderID: sid } = event;
  const cmds = global.client.commands;
  const isAdmin = global.config?.ADMINBOT?.includes(sid);

  if (args.length >= 1) {
    if (args[0] === 'per' && !isNaN(args[1])) {
      const permissionLevel = parseInt(args[1]);
      const filteredCmds = filterCommandsByPermission(cmds.values(), permissionLevel);
      let txt = `✦════════════════✦
「 LỆNH THEO QUYỀN ${permissionLevel} 」
✦════════════════✦\n\n`;
      filteredCmds.forEach((cmd, i) => txt += `${i + 1}. ${cmd.config.name} | ${cmd.config.description || 'Không có mô tả'}\n`);
      return sendMenuMessage(api, txt, tid, mid, sid, null);
    }
    if (args[0] === 'all') {
      const data = filterCommands(cmds.values(), isAdmin);
      let txt = `✦════════════════✦
「 MENU TOÀN BỘ LỆNH 」
✦════════════════✦\n\n`;
      data.forEach((cmd, i) => txt += `${i + 1}. ${cmd.config.name} | ${cmd.config.description || 'Không có mô tả'}\n`);
      txt += `\nTổng: ${data.length} lệnh
⏰ ${new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}
『 🤖 Bot by Kiên 』`;
      return sendMenuMessage(api, txt, tid, mid, sid, null);
    }
  }

  // Hiển thị menu nhóm đẹp
  const data = commandsGroup(isAdmin);
  const totalCmds = data.reduce((acc, cur) => acc + cur.commandsName.length, 0);
  const emojis = ["🌸", "🔥", "⚡", "🍀", "🌙", "⭐", "🎶", "🌀", "💎", "🐉"];
  const pick = () => emojis[Math.floor(Math.random() * emojis.length)];
  const vnTime = new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });

  let txt = `╔✦════════════════════════✦╗
   🌸  MENU BOT 🌸
   ⏰ ${vnTime}
╚✦════════════════════════✦╝\n\n`;

  data.forEach((grp, i) => txt += `${pick()} ${i + 1}. ${grp.commandCategory} — ${grp.commandsName.length} lệnh\n`);

  txt += `\n╠✦════════════════════════✦╣
📌 Tổng: ${totalCmds} lệnh
👉 Reply từ 1 → ${data.length} để chọn nhóm
『 🤖 Bot by Kiên ✨ 』
➜ Thả icon 😾 để bot gỡ menu ngay!
╚✦════════════════════════✦╝`;

  return sendMenuMessage(api, txt, tid, mid, sid, data);
};

module.exports.handleReply = async function ({ handleReply: $, api, event }) {
  const { sendMessage: send, unsendMessage: un } = api;
  const { threadID: tid, messageID: mid, senderID: sid, args } = event;
  if (sid != $.author) return send("Đi ra chỗ khác chơi 🥹", tid, mid);

  switch ($.case) {
    case 'infoGr': {
      const data = $.data[(+args[0]) - 1];
      if (!data) return send(`"${args[0]}" không nằm trong menu`, tid, mid);
      try { un($.messageID); } catch { }

      const emojis = ["🌸", "🔥", "⚡", "🍀", "🌙", "⭐", "🎶", "🌀", "💎", "🐉"];
      const pick = () => emojis[Math.floor(Math.random() * emojis.length)];
      const vnTime = new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });

      let txt = `╔✦════════════════════════✦╗
   🌸  ${data.commandCategory}  🌸
   ⏰ ${vnTime}
╚✦════════════════════════✦╝\n\n`;

      data.commandsName.forEach((name, i) => txt += `${pick()} ${i + 1}. ${name}\n`);

      txt += `\n╠✦════════════════════════✦╣
👉 Reply từ 1 đến ${data.commandsName.length}
╚✦════════════════════════✦╝`;

      let payload = { body: txt };
      const attach = await getAttachment();
      if (attach) payload.attachment = attach;

      send(payload, tid, (a, b) => {
        global.client.handleReply.push({
          name: module.exports.config.name,
          messageID: b.messageID,
          author: sid,
          case: 'infoCmds',
          data: data.commandsName
        });
        if (autoUnsend?.status) setTimeout(v1 => un(v1), 1000 * autoUnsend.timeOut, b.messageID);
      }, mid);
    }; break;

    case 'infoCmds': {
      const cmd = global.client.commands.get($.data[(+args[0]) - 1]);
      if (!cmd) return send(`"${args[0]}" không nằm trong menu`, tid, mid);
      try { un($.messageID); } catch { }

      let payload = { body: infoCmds(cmd.config, tid) };
      const attach = await getAttachment();
      if (attach) payload.attachment = attach;

      send(payload, tid, mid);
    }; break;
  }
};
