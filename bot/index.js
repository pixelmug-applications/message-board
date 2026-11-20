import { BubbleBot, isNeedBindDeviceError } from "@jeejio-bubble/bot/sdk";
import PixelMugS1 from "@jeejio-bubble/bot/devices/pixelmug-s1/ext";
import { exactCommand, botMentionNames, stripBotMentions } from "./message-text.js";

const MAX_MESSAGE_BYTES = 256;
const MPS_LAUNCH_TIMEOUT_MS = Number(process.env.MPS_LAUNCH_TIMEOUT_MS || 45000);
const READY_EVENT = "MPS_IS_RUNNING";
const FAILED_EVENTS = new Set(["INSTALL_FAIL", "RUNNING_FAIL"]);
const token = requiredEnv("BOT_TOKEN");
const mpsID = requiredEnv("STUDIO_MPS_ID");
const mpsVersion = requiredEnv("STUDIO_MPS_VERSION");
const mpsLaunchConfig = { id: mpsID, version: mpsVersion };
const pendingInstalls = new Map();
const mentionProfiles = new Map();

const pixelMugS1 = new PixelMugS1();
const bot = new BubbleBot(token, {
  apiBaseUrl: process.env.BOT_API_BASE_URL,  
  webAppDeviceAccess: "none",
});

bot.registerDevices([pixelMugS1]);

bot.on("error", async (ctx) => {
  console.error("[push-message-bot]", ctx.error || ctx);
});

bot.on("message:bind_device", async (ctx) => {
  console.log("[push-message-bot] PixelMugS1 binding updated", {
    chat: ctx.chat,
    attachedDevices: ctx.message?.attachedDevices,
  });
});

bot.on("message:text", async (ctx) => {
  const rawText = messageText(ctx);
  if (rawText === null) return;
  let text;
  try {
    text = await displayText(ctx, rawText);
  } catch (error) {
    console.error("[push-message-bot] mention cleanup failed", error);
    await ctx.sendText("Could not identify the Bot mention. Please try sending your message again.");
    return;
  }
  if (!text) return;

  const command = exactCommand(text);
  if (command === "binddevice") {
    await sendBindDevice(ctx);
    return;
  }

  if (command === "install") {
    await installMps(ctx);
    return;
  }

  if (command !== "clear" && /^\/[\w-]+(?:@[^\s/@]+)?(?:\s|$)/u.test(text)) {
    await ctx.sendText("Available commands: /bindDevice, /install, /clear.");
    return;
  }
  const message = command === "clear" ? "/clear" : text;
  if (Buffer.byteLength(message, "utf8") > MAX_MESSAGE_BYTES) {
    await ctx.sendText(`Message is too long. The limit is ${MAX_MESSAGE_BYTES} UTF-8 bytes.`);
    return;
  }

  await pushToMps(ctx, message);
});

bot.on("device_notify", async (ctx) => {
  const events = pixelMugS1.parseNotify(ctx.tal?.notify || []);
  const deviceKey = deviceKeyFromNotify(ctx);

  for (const event of events) {
    const pending = deviceKey ? pendingInstalls.get(deviceKey) : firstPendingInstall();
    if (!pending) continue;

    if (event.name === "mpyVmError") {
      finishPendingLaunch(pending);
      await pending.ctx.sendText(`MPS install failed: ${event.params?.value || "unknown error"}`);
      continue;
    }

    if (event.name !== "mpyVmEvent") continue;
    const value = String(event.params?.value || "");

    if (value === READY_EVENT) {
      finishPendingLaunch(pending);
      await pending.ctx.sendText("MPS installed and running.");
    } else if (FAILED_EVENTS.has(value)) {
      finishPendingLaunch(pending);
      await pending.ctx.sendText(`MPS failed to start: ${value}`);
    }
  }
});

await bot.setCommands([
  { command: "bindDevice", description: "Bind PixelMugS1 to this chat" },
  { command: "install", description: "Install and start the push-message MPS" },
  { command: "clear", description: "Clear the MicroPython message board" },
]);

await bot.start();

console.log("mps-push-message bot is running.");
console.log(`MPS launch config: ${mpsLaunchConfig.id}@${mpsLaunchConfig.version}`);

async function installMps(ctx) {
  const device = await getBoundPixelMug(ctx);
  if (!device) {
    await sendBindDevice(ctx);
    return;
  }

  const initialKey = deviceKey(device) || chatKey(ctx.chat);
  const activeLaunch = pendingInstalls.get(initialKey);
  if (activeLaunch) {
    await ctx.sendText("MPS installation is already in progress.");
    return;
  }

  const pending = {
    key: initialKey,
    ctx,
    timer: null,
    finished: false,
  };
  pendingInstalls.set(initialKey, pending);

  try {
    const responseCtx = await bot.callDevice(
      ctx.chat,
      pixelMugS1,
      pixelMugS1.rpc.talMpyExecOneScript(mpsLaunchConfig)
    );
    if (pending.finished) return;

    const responseKey = deviceKeyFromResponse(responseCtx);
    if (responseKey && responseKey !== pending.key) migratePendingLaunch(pending, responseKey);

    const code = mpyExecReturnCode(responseCtx.tal?.result);
    if (code === 264) {
      finishPendingLaunch(pending);
      await ctx.sendText("MPS is already running.");
      return;
    }

    if (![260, 261, 262, 263, 265].includes(code)) {
      finishPendingLaunch(pending);
      await ctx.sendText(`Could not start MPS. Device returned code ${code || "unknown"}.`);
      return;
    }

    pending.timer = setTimeout(async () => {
      finishPendingLaunch(pending);
      await ctx.sendText("Timed out waiting for the push-message MPS to start.");
    }, MPS_LAUNCH_TIMEOUT_MS);
    if (typeof pending.timer.unref === "function") pending.timer.unref();
  } catch (error) {
    finishPendingLaunch(pending);
    if (isNeedBindDeviceError(error)) {
      await sendBindDevice(ctx);
      return;
    }

    await ctx.sendText(`Could not start MPS: ${errorMessage(error)}`);
    console.error("[push-message-bot] MPS launch failed", error);
  }
}

async function pushToMps(ctx, message) {
  try {
    const responseCtx = await bot.callDevice(
      ctx.chat,
      pixelMugS1,
      pixelMugS1.rpc.pushMessage({ message })
    );
    const result = responseCtx.tal?.result;
    if (result === false || result?.return === false) {
      await ctx.sendText("PixelMugS1 rejected the message. The MPS may not be ready yet.");
    }
  } catch (error) {
    if (isNeedBindDeviceError(error)) {
      await sendBindDevice(ctx);
      return;
    }

    await ctx.sendText(`Push message failed: ${errorMessage(error)}`);
    console.error("[push-message-bot] push failed", error);
  }
}

async function getBoundPixelMug(ctx) {
  const devices = await bot.getBoundDevices(ctx);
  return devices.find((device) =>
    device.talId === pixelMugS1.talId ||
    device.deviceTalId === pixelMugS1.talId ||
    (device.compatible || []).includes(pixelMugS1.talId)
  );
}

async function sendBindDevice(ctx) {
  await ctx.sendBindDevice({
    content: "Bind PixelMugS1 before sending messages.",
    actionButtonTitle: "Bind PixelMugS1",
  });
}

function migratePendingLaunch(pending, nextKey) {
  pendingInstalls.delete(pending.key);
  pending.key = nextKey;
  pendingInstalls.set(nextKey, pending);
}

function finishPendingLaunch(pending) {
  if (pending.finished) return;
  pending.finished = true;
  if (pending.timer) clearTimeout(pending.timer);
  pendingInstalls.delete(pending.key);
}

function firstPendingInstall() {
  return pendingInstalls.values().next().value;
}

function mpyExecReturnCode(response) {
  if (typeof response === "number" || typeof response === "string") {
    const direct = Number(response);
    if (Number.isFinite(direct)) return direct;
  }

  const data = response || {};
  const result = data.result;
  const value = typeof result === "object" && result !== null
    ? result.value ?? result.return
    : result ?? data.value ?? data.return;
  const code = Number(value);
  return Number.isFinite(code) ? code : Number(data.code);
}

function messageText(ctx) {
  const value = ctx.message?.content ?? ctx.message?.text;
  if (value === undefined || value === null) return null;
  return typeof value === "string" ? value : String(value);
}

async function displayText(ctx, text) {
  if (ctx.chat?.type !== "group" || !text.includes("@")) return text.trim();
  const key = String(ctx.chat.id);
  let cached = mentionProfiles.get(key);
  if (!cached || Date.now() - cached.at > 60000) {
    const profile = await ctx.getMe();
    const names = botMentionNames(profile, ctx.me, bot.me);
    if (!names.length) throw new Error("Bot profile has no mention name or ID");
    cached = { names, at: Date.now() };
    if (mentionProfiles.size >= 128) mentionProfiles.delete(mentionProfiles.keys().next().value);
    mentionProfiles.set(key, cached);
  }
  return stripBotMentions(text, cached.names);
}

function deviceKey(device) {
  return String(device?.deviceId || device?.id || device?.sn || device?.slotId || "");
}

function deviceKeyFromResponse(ctx) {
  return String(ctx.from?.id || ctx.webAppDeviceCall?.deviceId || ctx.tal?.response?.from || "");
}

function deviceKeyFromNotify(ctx) {
  return String(ctx.from?.id || "");
}

function chatKey(chat) {
  return `${chat?.type || "chat"}:${chat?.id || chat?.name || ""}`;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error || "Unknown error");
}

function requiredEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}
