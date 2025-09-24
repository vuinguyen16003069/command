//lib/Fca-Horizon-Remastered/sendMessage.js
"use strict";

const utils = require("../utils");
const DEBUG_MODE = process.env.DEBUG === "false" || false; // Bật debug mặc định, tắt bằng DEBUG=false
/**
 * Được Fix Hay Làm Màu Bởi: @HarryWakazaki(2022-04-21)
 * Sửa lỗi 1545012 bởi Quang Z (2025-09-14)
 * fix lỗi không phản hồi khi bot vào nhóm bởi Quang Z(2025-09-23)
 */
const allowedProperties = {
  attachment: true,
  url: true,
  sticker: true,
  emoji: true,
  emojiSize: true,
  body: true,
  mentions: true,
  location: true,
};

module.exports = function (defaultFuncs, api, ctx) {
  async function uploadAttachment(attachments, callback) {
    if (DEBUG_MODE) console.log(`[uploadAttachment] Starting upload for ${attachments.length} attachments`);
    const uploads = [];

    for (let i = 0; i < attachments.length; i++) {
      if (!utils.isReadableStream(attachments[i])) {
        console.error(`[uploadAttachment] Invalid attachment at index ${i}, type: ${utils.getType(attachments[i])}`);
        return callback({ error: `Attachment should be a readable stream, not ${utils.getType(attachments[i])}.`, index: i });
      }

      const form = {
        upload_1024: attachments[i],
        voice_clip: "true",
      };
      if (DEBUG_MODE) console.log(`[uploadAttachment] Prepared form for attachment ${i}:`, JSON.stringify(form, null, 2));

      uploads.push(
        defaultFuncs
          .postFormData("https://upload.facebook.com/ajax/mercury/upload.php", ctx.jar, form, {})
          .then(response => {
            if (DEBUG_MODE) console.log(`[uploadAttachment] Raw response for attachment ${i}:`, JSON.stringify(response, null, 2));
            return utils.parseAndCheckLogin(ctx, defaultFuncs)(response);
          })
          .then(resData => {
            if (DEBUG_MODE) console.log(`[uploadAttachment] Parsed response for attachment ${i}:`, JSON.stringify(resData, null, 2));
            if (resData.error) {
              console.error(`[uploadAttachment] Upload failed for attachment ${i}:`, JSON.stringify(resData.error, null, 2));
              throw resData;
            }
            return resData.payload.metadata[0];
          })
          .catch(err => {
            console.error(`[uploadAttachment] Error for attachment ${i}:`, JSON.stringify(err, null, 2));
            throw err;
          })
      );
    }

    try {
      const resData = await Promise.all(uploads);
      if (DEBUG_MODE) console.log("[uploadAttachment] All uploads completed:", JSON.stringify(resData, null, 2));
      callback(null, resData);
    } catch (err) {
      console.error("[uploadAttachment] Failed to upload attachments:", JSON.stringify(err, null, 2));
      callback(err);
    }
  }

  async function getUrl(url, callback) {
    if (DEBUG_MODE) console.log("[getUrl] Fetching URL:", url);
    const form = {
      image_height: 960,
      image_width: 960,
      uri: url,
    };

    try {
      const response = await defaultFuncs.post("https://www.facebook.com/message_share_attachment/fromURI/", ctx.jar, form);
      if (DEBUG_MODE) console.log("[getUrl] Raw response:", JSON.stringify(response, null, 2));
      const resData = await utils.parseAndCheckLogin(ctx, defaultFuncs)(response);
      if (DEBUG_MODE) console.log("[getUrl] Parsed response:", JSON.stringify(resData, null, 2));

      if (resData.error) {
        console.error("[getUrl] Error:", JSON.stringify(resData.error, null, 2));
        return callback(resData);
      }
      if (!resData.payload) {
        console.error("[getUrl] No payload in response");
        return callback({ error: "Invalid URL" });
      }
      callback(null, resData.payload.share_data.share_params);
    } catch (err) {
      console.error("[getUrl] Error:", JSON.stringify(err, null, 2));
      callback(err);
    }
  }

  function sendContent(form, threadID, isSingleUser, messageAndOTID, callback, retries = 0) {
    const MAX_RETRIES = 3;
    if (DEBUG_MODE) {
      console.log(
        `[sendContent] Bot userID: ${ctx.userID}, Login status: ${ctx.loggedIn ? "Logged in" : "Not logged in"}`
      );
      console.log(
        `[sendContent] Preparing to send message to threadID: ${threadID}, isSingleUser: ${isSingleUser}, messageAndOTID: ${messageAndOTID}, retries: ${retries}`
      );
      console.log("[sendContent] Cookies in ctx.jar:", JSON.stringify(ctx.jar.getCookies("https://www.facebook.com"), null, 2));
    }

    // Kiểm tra thông tin nhóm
    api.getThreadInfo(threadID, (err, info) => {
      if (err) {
        console.error(`[sendContent] Error fetching thread info for ${threadID}:`, JSON.stringify(err, null, 2));
      } else {
        if (DEBUG_MODE) {
          console.log(
            "[sendContent] Thread info:",
            JSON.stringify(
              {
                threadID: info.threadID,
                participantIDs: info.participantIDs,
                isGroup: info.isGroup,
                name: info.name,
                adminIDs: info.adminIDs,
              },
              null,
              2
            )
          );
        }
        if (!info.participantIDs.includes(ctx.userID)) {
          console.warn(`[sendContent] Bot userID ${ctx.userID} is not in thread ${threadID}`);
        }
      }
    });

    // Cấu hình form
    if (utils.getType(threadID) === "Array") {
      for (let i = 0; i < threadID.length; i++) {
        form["specific_to_list[" + i + "]"] = "fbid:" + threadID[i];
      }
      form["specific_to_list[" + threadID.length + "]"] = "fbid:" + ctx.userID;
      form["client_thread_id"] = "root:" + messageAndOTID;
      if (DEBUG_MODE) console.log("[sendContent] Sending message to multiple users:", threadID.join(", "));
    } else {
      form["thread_fbid"] = threadID;
      form["specific_to_list[0]"] = "fbid:" + threadID;
      form["specific_to_list[1]"] = "fbid:" + ctx.userID;
      if (isSingleUser) {
        form["other_user_fbid"] = threadID;
        if (DEBUG_MODE) console.log("[sendContent] Using single-user params for threadID:", threadID);
      } else {
        if (DEBUG_MODE) console.log("[sendContent] Using group params for threadID:", threadID);
      }
    }

    if (ctx.globalOptions.pageID) {
      form["author"] = "fbid:" + ctx.globalOptions.pageID;
      form["specific_to_list[1]"] = "fbid:" + ctx.globalOptions.pageID;
      form["creator_info[creatorID]"] = ctx.userID;
      form["creator_info[creatorType]"] = "direct_admin";
      form["creator_info[labelType]"] = "sent_message";
      form["creator_info[pageID]"] = ctx.globalOptions.pageID;
      form["request_user_id"] = ctx.globalOptions.pageID;
      form["creator_info[profileURI]"] = "https://www.facebook.com/profile.php?id=" + ctx.userID;
      if (DEBUG_MODE) console.log("[sendContent] Using pageID settings for form");
    }

    const debugParams = Object.keys(form).reduce((acc, k) => {
      if (k.includes("fbid") || k.includes("thread") || k.includes("body")) {
        acc[k] = form[k];
      }
      return acc;
    }, {});
    if (DEBUG_MODE) console.log("[sendContent] Form sent to API:", JSON.stringify(debugParams, null, 2));

    defaultFuncs
      .post("https://www.facebook.com/messaging/send/", ctx.jar, form)
      .then(response => {
        if (DEBUG_MODE) console.log("[sendContent] Raw API response:", JSON.stringify(response, null, 2));
        return utils.parseAndCheckLogin(ctx, defaultFuncs)(response);
      })
      .then(resData => {
        if (DEBUG_MODE) console.log("[sendContent] Parsed API response:", JSON.stringify(resData, null, 2));
        if (!resData) {
          console.error("[sendContent] No response data received");
          return callback({ error: "Send message failed: No response data." });
        }

        if (resData.error) {
          console.error("[sendContent] API error:", JSON.stringify(resData.error, null, 2));
          if (resData.error === 1545012 && retries < MAX_RETRIES) {
            console.warn(`[sendContent] Retrying (${retries + 1}/${MAX_RETRIES}) for error 1545012 on threadID: ${threadID}`);
            setTimeout(() => sendContent(form, threadID, isSingleUser, messageAndOTID, callback, retries + 1), 5000);
            return;
          }
          return callback(resData);
        }

        const messageInfo = resData.payload.actions.reduce(
          (p, v) => ({
            threadID: v.thread_fbid || p.threadID,
            messageID: v.message_id || p.messageID,
            timestamp: v.timestamp || p.timestamp,
          }),
          { threadID: null, messageID: null, timestamp: null }
        );
        if (DEBUG_MODE) console.log("[sendContent] Message sent successfully:", JSON.stringify(messageInfo, null, 2));
        callback(null, messageInfo);
      })
      .catch(err => {
        console.error("[sendContent] Post failed:", JSON.stringify(err, null, 2));
        if (utils.getType(err) === "Object" && err.error === "Not logged in.") {
          ctx.loggedIn = false;
          console.error("[sendContent] Session expired. Regenerate appstate.");
        }
        callback(err);
      });
  }

  function send(form, threadID, messageAndOTID, callback, isGroup) {
    if (DEBUG_MODE) console.log("[send] Calling sendContent with threadID:", threadID, "isGroup:", isGroup);
    if (utils.getType(threadID) === "Array") {
      sendContent(form, threadID, false, messageAndOTID, callback);
    } else {
      // Kiểm tra loại thread bằng API
      api.getThreadInfo(threadID, (err, info) => {
        if (err) {
          console.error("[send] Error fetching thread info for", threadID, ":", JSON.stringify(err, null, 2));
          // Fallback: Dựa trên độ dài threadID nếu getThreadInfo thất bại
          const isSingleUser = utils.getType(isGroup) !== "Boolean" ? threadID.toString().length <= 15 : !isGroup;
          sendContent(form, threadID, isSingleUser, messageAndOTID, callback);
        } else {
          if (DEBUG_MODE) console.log("[send] Thread type:", info.isGroup ? "Group" : "Single user");
          sendContent(form, threadID, !info.isGroup, messageAndOTID, callback);
        }
      });
    }
  }

  function handleUrl(msg, form, callback, cb) {
    if (DEBUG_MODE) console.log("[handleUrl] Processing URL:", msg.url || "none");
    try {
      if (msg.url) {
        form["shareable_attachment[share_type]"] = "100";
        getUrl(msg.url, (err, params) => {
          if (err) {
            console.error("[handleUrl] Failed to process URL:", JSON.stringify(err, null, 2));
            return callback(err);
          }
          form["shareable_attachment[share_params]"] = params;
          if (DEBUG_MODE) console.log("[handleUrl] URL processed successfully:", JSON.stringify(params, null, 2));
          cb();
        });
      } else {
        cb();
      }
    } catch (err) {
      console.error("[handleUrl] Unexpected error:", JSON.stringify(err, null, 2));
      callback(err);
    }
  }

  function handleLocation(msg, form, callback, cb) {
    if (DEBUG_MODE) console.log("[handleLocation] Processing location:", JSON.stringify(msg.location || {}, null, 2));
    try {
      if (msg.location) {
        if (msg.location.latitude == null || msg.location.longitude == null) {
          console.error("[handleLocation] Location missing latitude or longitude");
          return callback({ error: "Location property needs both latitude and longitude" });
        }
        form["location_attachment[coordinates][latitude]"] = msg.location.latitude;
        form["location_attachment[coordinates][longitude]"] = msg.location.longitude;
        form["location_attachment[is_current_location]"] = !!msg.location.current;
        if (DEBUG_MODE) console.log("[handleLocation] Location added to form");
      }
      cb();
    } catch (err) {
      console.error("[handleLocation] Unexpected error:", JSON.stringify(err, null, 2));
      callback(err);
    }
  }

  function handleSticker(msg, form, callback, cb) {
    if (DEBUG_MODE) console.log("[handleSticker] Processing sticker:", msg.sticker || "none");
    try {
      if (msg.sticker) {
        form["sticker_id"] = msg.sticker;
        if (DEBUG_MODE) console.log("[handleSticker] Sticker", msg.sticker, "added to form");
      }
      cb();
    } catch (err) {
      console.error("[handleSticker] Unexpected error:", JSON.stringify(err, null, 2));
      callback(err);
    }
  }

  function handleEmoji(msg, form, callback, cb) {
    if (DEBUG_MODE) console.log("[handleEmoji] Processing emoji:", msg.emoji || "none", "size:", msg.emojiSize || "none");
    try {
      if (msg.emojiSize != null && msg.emoji == null) {
        console.error("[handleEmoji] Emoji size specified but emoji is empty");
        return callback({ error: "Emoji property is empty" });
      }
      if (msg.emoji) {
        if (msg.emojiSize == null) {
          msg.emojiSize = "medium";
        }
        if (!["small", "medium", "large"].includes(msg.emojiSize)) {
          console.error("[handleEmoji] Invalid emoji size:", msg.emojiSize);
          return callback({ error: "EmojiSize property is invalid" });
        }
        if (form["body"] != null && form["body"] != "") {
          console.error("[handleEmoji] Body is not empty when setting emoji");
          return callback({ error: "Body is not empty" });
        }
        form["body"] = msg.emoji;
        form["tags[0]"] = "hot_emoji_size:" + msg.emojiSize;
        if (DEBUG_MODE) console.log("[handleEmoji] Emoji", msg.emoji, "with size", msg.emojiSize, "added to form");
      }
      cb();
    } catch (err) {
      console.error("[handleEmoji] Unexpected error:", JSON.stringify(err, null, 2));
      callback(err);
    }
  }

  function handleAttachment(msg, form, callback, cb) {
    if (DEBUG_MODE) console.log("[handleAttachment] Processing attachments:", JSON.stringify(msg.attachment || [], null, 2));
    try {
      if (msg.attachment) {
        form["image_ids"] = [];
        form["gif_ids"] = [];
        form["file_ids"] = [];
        form["video_ids"] = [];
        form["audio_ids"] = [];

        if (utils.getType(msg.attachment) !== "Array") {
          msg.attachment = [msg.attachment];
          if (DEBUG_MODE) console.log("[handleAttachment] Converted single attachment to array");
        }

        uploadAttachment(msg.attachment, (err, files) => {
          if (err) {
            console.error("[handleAttachment] Upload attachment failed:", JSON.stringify(err, null, 2));
            return callback(err);
          }
          files.forEach(file => {
            const key = Object.keys(file)[0];
            form[key + "s"].push(file[key]);
            if (DEBUG_MODE) console.log("[handleAttachment] Added uploaded attachment of type", key, ":", file[key]);
          });
          cb();
        });
      } else {
        cb();
      }
    } catch (err) {
      console.error("[handleAttachment] Unexpected error:", JSON.stringify(err, null, 2));
      callback(err);
    }
  }

  function handleMention(msg, form, callback, cb) {
    if (DEBUG_MODE) console.log("[handleMention] Processing mentions:", JSON.stringify(msg.mentions || [], null, 2));
    try {
      if (msg.mentions) {
        for (let i = 0; i < msg.mentions.length; i++) {
          const mention = msg.mentions[i];
          const tag = mention.tag;
          if (typeof tag !== "string") {
            console.error("[handleMention] Invalid mention tag at index", i, ":", JSON.stringify(tag, null, 2));
            return callback({ error: "Mention tags must be strings." });
          }
          const offset = msg.body ? msg.body.indexOf(tag, mention.fromIndex || 0) : -1;
          if (offset < 0) {
            console.warn(`[handleMention] Mention for "${tag}" not found in message string`);
          }
          const id = mention.id || 0;
          const emptyChar = "\u200E";
          if (msg.body) form["body"] = emptyChar + msg.body;
          form[`profile_xmd[${i}][offset]`] = offset + 1;
          form[`profile_xmd[${i}][length]`] = tag.length;
          form[`profile_xmd[${i}][id]`] = id;
          form[`profile_xmd[${i}][type]`] = "p";
          if (DEBUG_MODE) console.log(`[handleMention] Added mention ${i}: tag=${tag}, id=${id}, offset=${offset + 1}`);
        }
      }
      cb();
    } catch (err) {
      console.error("[handleMention] Unexpected error:", JSON.stringify(err, null, 2));
      callback(err);
    }
  }

  return function sendMessage(msg, threadID, callback, replyToMessage, isGroup) {
    if (DEBUG_MODE) console.log(
      "[sendMessage] Starting with msg:",
      JSON.stringify(msg, null, 2),
      "threadID:",
      threadID,
      "replyToMessage:",
      replyToMessage,
      "isGroup:",
      isGroup
    );
    if (typeof isGroup === "undefined") isGroup = null;

    if (!callback && (utils.getType(threadID) === "Function" || utils.getType(threadID) === "AsyncFunction")) {
      console.error("[sendMessage] ThreadID passed as a function, expected a number, string, or array");
      return threadID({ error: "Pass a threadID as a second argument." });
    }
    if (!replyToMessage && utils.getType(callback) === "String") {
      replyToMessage = callback;
      callback = undefined;
      if (DEBUG_MODE) console.log("[sendMessage] Swapped callback and replyToMessage: replyToMessage=", replyToMessage);
    }

    let resolveFunc = () => {};
    let rejectFunc = () => {};
    const returnPromise = new Promise((resolve, reject) => {
      resolveFunc = resolve;
      rejectFunc = reject;
    });

    if (!callback) {
      callback = (err, data) => {
        if (err) return rejectFunc(err);
        resolveFunc(data);
      };
    }

    const msgType = utils.getType(msg);
    const threadIDType = utils.getType(threadID);
    const messageIDType = utils.getType(replyToMessage);

    if (msgType !== "String" && msgType !== "Object") {
      console.error("[sendMessage] Invalid message type:", msgType);
      return callback({ error: `Message should be of type string or object, not ${msgType}.` });
    }

    if (threadIDType !== "Array" && threadIDType !== "Number" && threadIDType !== "String") {
      console.error("[sendMessage] Invalid threadID type:", threadIDType);
      return callback({ error: `ThreadID should be of type number, string, or array, not ${threadIDType}.` });
    }

    if (replyToMessage && messageIDType !== "String") {
      console.error("[sendMessage] Invalid messageID type:", messageIDType);
      return callback({ error: `MessageID should be of type string, not ${messageIDType}.` });
    }

    if (msgType === "String") {
      msg = { body: msg };
      if (DEBUG_MODE) console.log("[sendMessage] Converted string message to object:", JSON.stringify(msg, null, 2));
    }

    const disallowedProperties = Object.keys(msg).filter(prop => !allowedProperties[prop]);
    if (disallowedProperties.length > 0) {
      console.error("[sendMessage] Disallowed properties in message:", disallowedProperties.join(", "));
      return callback({ error: `Disallowed props: \`${disallowedProperties.join(", ")}\`` });
    }

    const messageAndOTID = utils.generateOfflineThreadingID();
    if (DEBUG_MODE) console.log("[sendMessage] Generated messageAndOTID:", messageAndOTID);

    const form = {
      client: "mercury",
      action_type: "ma-type:user-generated-message",
      author: "fbid:" + ctx.userID,
      timestamp: Date.now(),
      timestamp_absolute: "Today",
      timestamp_relative: utils.generateTimestampRelative(),
      timestamp_time_passed: "0",
      is_unread: false,
      is_cleared: false,
      is_forward: false,
      is_filtered_content: false,
      is_filtered_content_bh: false,
      is_filtered_content_account: false,
      is_filtered_content_quasar: false,
      is_filtered_content_invalid_app: false,
      is_spoof_warning: false,
      source: "source:chat:web",
      "source_tags[0]": "source:chat",
      body: msg.body ? msg.body.toString() : "",
      html_body: false,
      ui_push_phase: "V3",
      status: "0",
      offline_threading_id: messageAndOTID,
      message_id: messageAndOTID,
      threading_id: utils.generateThreadingID(ctx.clientID),
      "ephemeral_ttl_mode:": "0",
      manual_retry_cnt: "0",
      has_attachment: !!(msg.attachment || msg.url || msg.sticker),
      signatureID: utils.getSignatureID(),
      replied_to_message_id: replyToMessage,
    };
    if (DEBUG_MODE) console.log("[sendMessage] Form initialized:", JSON.stringify(form, null, 2));

    try {
      handleLocation(
        msg,
        form,
        callback,
        () =>
          handleSticker(
            msg,
            form,
            callback,
            () =>
              handleAttachment(
                msg,
                form,
                callback,
                () =>
                  handleUrl(
                    msg,
                    form,
                    callback,
                    () =>
                      handleEmoji(
                        msg,
                        form,
                        callback,
                        () => handleMention(msg, form, callback, () => send(form, threadID, messageAndOTID, callback, isGroup))
                      )
                  )
              )
          )
      );
    } catch (err) {
      console.error("[sendMessage] Error in handler chain:", JSON.stringify(err, null, 2));
      callback(err);
    }

    return returnPromise;
  };
};
