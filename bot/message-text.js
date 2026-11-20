// Keep message cleanup independent of the Bot transport and device RPCs.
export function exactCommand(text) {
  const commandText = String(text).replace(/(^|\s)@[^\s/@]+(?=\s|\/|$)/gu, '$1').trim();
  const match = commandText.match(/^\/([a-zA-Z0-9_-]+)(?:@[^\s/@]+)?$/u);
  return match ? match[1].toLowerCase() : '';
}

export function botMentionNames(...profiles) {
  const names = new Set();
  for (const profile of profiles) {
    const detail = profile?.result || profile;
    for (const item of [detail, detail?.bot, detail?.botInfo]) {
      for (const field of ['name', 'username', 'nickName', 'botName', 'id', 'botId']) {
        if (typeof item?.[field] === 'string' && item[field].trim()) names.add(item[field].trim());
      }
    }
  }
  return [...names];
}

export function stripBotMentions(text, names) {
  let result = String(text);
  for (const name of [...names].sort((a, b) => b.length - a.length)) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // A mention can precede a slash command without a space, or follow it.
    const pattern = new RegExp('(^|\\s|/[\\w-]+)@' + escaped + '(?=$|\\s|/)', 'gu');
    result = result.replace(pattern, '$1');
  }
  return result.trim();
}
