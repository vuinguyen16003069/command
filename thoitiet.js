module.exports.config = {
  name: "thoitiet",
  version: "3.2.0",
  hasPermssion: 0,
  credits: "D-Jukie convert từ Goat mod by Quang Z",
  description: "Xem thời tiết trong 7 ngày với thông tin chi tiết và dự báo theo giờ",
  commandCategory: "Tìm kiếm",
  usages: "[địa điểm] [hourly|daily]",
  cooldowns: 5
};

module.exports.run = async function ({ api, event, args }) {
  const axios = require("axios");
  const moment = require("moment-timezone");
  const Canvas = require("canvas");
  const fs = require("fs");
  const path = require("path");

  const apikey = "2e0d6409939a436d97392547251709"; 

  const bgURL = "https://files.catbox.moe/6wzel6.jpg";

  // --- Hàm bỏ dấu tiếng Việt ---
  function removeVietnameseTones(str) {
    return str
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d").replace(/Đ/g, "D")
      .trim();
  }

  // --- Xử lý input ---
  if (args.length === 0) {
    return api.sendMessage("❗ Vui lòng nhập địa điểm (ví dụ: Hà Nội, Hồ Chí Minh)", event.threadID, event.messageID);
  }

  let mode = "daily";
  if (["hourly", "daily"].includes(args[args.length - 1].toLowerCase())) {
    mode = args.pop().toLowerCase();
  }

  const userInput = args.join(" ");
  const cleanInput = removeVietnameseTones(userInput);

  // --- Forecast API ---
  let dataWeather;
  try {
    const url = `http://api.weatherapi.com/v1/forecast.json?key=${apikey}&q=${encodeURIComponent(cleanInput)}&days=7&lang=vi`;
    const response = await axios.get(url);
    dataWeather = response.data;
  } catch (err) {
    console.error("❌ Lỗi khi gọi forecast API:", err.message);
    return api.sendMessage("⚠️ Không lấy được dữ liệu thời tiết!", event.threadID, event.messageID);
  }

  // --- Format giờ ---
  function formatHours(time) {
    try {
      if (/AM|PM/i.test(time))
        return moment(time, "hh:mm A").tz("Asia/Ho_Chi_Minh").format("HH[h]mm");
      return moment(time, "HH:mm").tz("Asia/Ho_Chi_Minh").format("HH[h]mm");
    } catch {
      return "N/A";
    }
  }

  const currentWeather = dataWeather.current;
  const forecastToday = dataWeather.forecast.forecastday[0];

  // --- Tin nhắn cơ bản ---
  let msg = `🌍 Thời tiết tại ${dataWeather.location.name}, ${dataWeather.location.country} hôm nay:
+ 🌡 Nhiệt độ hiện tại: ${currentWeather.temp_c}°C (Cảm nhận: ${currentWeather.feelslike_c}°C)
+ ☁ Tình trạng: ${forecastToday.day.condition.text}
+ 💧 Độ ẩm: ${currentWeather.humidity}%
+ 💨 Gió: ${currentWeather.wind_kph} km/h
+ 🌫 Áp suất: ${currentWeather.pressure_mb} mb
+ ☀ Chỉ số UV: ${forecastToday.day.uv}
+ 🌧 Khả năng mưa: ${forecastToday.day.daily_chance_of_rain}%
+ 🌅 Mặt trời mọc: ${formatHours(forecastToday.astro.sunrise)}
+ 🌄 Mặt trời lặn: ${formatHours(forecastToday.astro.sunset)}
+ 🌙 Trăng mọc: ${formatHours(forecastToday.astro.moonrise)}
+ 🌑 Trăng lặn: ${formatHours(forecastToday.astro.moonset)}`;

  if (mode === "hourly") {
    msg += `\n\n⏰ Dự báo theo giờ hôm nay:\n`;
    for (let hour of forecastToday.hour) {
      const time = moment(hour.time).tz("Asia/Ho_Chi_Minh").format("HH[h]mm");
      msg += `${time}: ${hour.temp_c}°C, ${hour.condition.text}, Mưa: ${hour.chance_of_rain}%\n`;
    }
  }

  try {
    // tải ảnh nền từ link
    const bg = await Canvas.loadImage(bgURL);
    const { width, height } = bg;
    const canvas = Canvas.createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bg, 0, 0, width, height);
    ctx.fillStyle = "#ffffff";

    let X = 100;
    const data7 = dataWeather.forecast.forecastday.slice(0, 7);
    for (let item of data7) {
      try {
        const icon = await Canvas.loadImage(`https:${item.day.condition.icon}`);
        ctx.drawImage(icon, X, 210, 80, 80);
        ctx.font = "22px Sans";
        ctx.fillText(`${item.day.maxtemp_c}°C`, X, 366);
        ctx.fillText(`${item.day.mintemp_c}°C`, X, 445);
        ctx.fillText(moment(item.date).format("DD"), X + 20, 140);
        X += 135;
      } catch (err) {
        console.error(`❌ Lỗi khi vẽ ngày ${item.date}:`, err.message);
        X += 135;
      }
    }

    const cachePath = path.join(__dirname, "cache", `weather_${event.threadID}.jpg`);
    fs.writeFileSync(cachePath, canvas.toBuffer());

    return api.sendMessage(
      { body: msg, attachment: fs.createReadStream(cachePath) },
      event.threadID,
      () => fs.unlinkSync(cachePath),
      event.messageID
    );
  } catch (err) {
    console.error("❌ Lỗi khi tạo canvas:", err.message);

    try {
      const stream = (await axios.get(bgURL, { responseType: "stream" })).data;
      return api.sendMessage(
        { body: msg + "\n⚠️ (Không tạo được ảnh dự báo, gửi ảnh nền thay thế)", attachment: stream },
        event.threadID,
        event.messageID
      );
    } catch {
      return api.sendMessage(msg, event.threadID, event.messageID);
    }
  }
};
