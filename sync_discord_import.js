const fs = require('fs');
const path = require('path');

const ROOT = '/home/user/computer/streamrecwebsite-site';
const APP = path.join(ROOT, 'streamrecwebsite-main');
const DB_PATH = path.join(APP, 'data', 'fixedheymate-db.json');
const OUT_PATH = path.join(APP, 'data', 'discord-import-parsed.json');
const INPUT_HTML = path.join(ROOT, 'div-class-scroller__36d07-customThe-1777206581716.txt');
const MD_PROMPTS = [
  path.join(ROOT, 'user_prompt-1777204653197.md'),
  path.join(ROOT, 'user_prompt-1777204657806.md')
].filter((p) => fs.existsSync(p));

const monthMap = {
  january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
  july: '07', august: '08', september: '09', october: '10', november: '11', december: '12'
};

const decodeEntities = (s) => String(s || '')
  .replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>');

const stripQuery = (u) => String(u || '').split('?')[0];

function parseTitleLine(titleLine) {
  let working = String(titleLine || '').trim();
  let title = working;
  let channel = 'Unknown';
  let upload_date = null;

  const channelMatch = working.match(/(?:-|\||\s)\s*@\s*([A-Za-z0-9_]+)\s*$/);
  if (channelMatch) {
    channel = `@${channelMatch[1]}`;
    working = working.slice(0, channelMatch.index).trim().replace(/[-|]\s*$/, '').trim();
  }

  const monthDayYear = working.match(/([A-Za-z]+)\s+(\d{1,2})\s+(\d{4})\s*$/);
  const dayMonthYear = working.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\s*$/);
  const slashDate = working.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*$/);
  const slashDateAnywhere = working.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);

  if (monthDayYear) {
    const mm = monthMap[monthDayYear[1].toLowerCase()];
    if (mm) {
      upload_date = `${monthDayYear[3]}${mm}${String(Number(monthDayYear[2])).padStart(2, '0')}`;
      working = working.slice(0, monthDayYear.index).trim().replace(/[-|]\s*$/, '').trim();
    }
  } else if (dayMonthYear) {
    const mm = monthMap[dayMonthYear[2].toLowerCase()];
    if (mm) {
      upload_date = `${dayMonthYear[3]}${mm}${String(Number(dayMonthYear[1])).padStart(2, '0')}`;
      working = working.slice(0, dayMonthYear.index).trim().replace(/[-|]\s*$/, '').trim();
    }
  } else if (slashDate) {
    const yy = slashDate[3].length === 2 ? `20${slashDate[3]}` : slashDate[3];
    upload_date = `${yy}${String(Number(slashDate[1])).padStart(2, '0')}${String(Number(slashDate[2])).padStart(2, '0')}`;
    working = working.slice(0, slashDate.index).trim().replace(/[-|]\s*$/, '').trim();
  } else if (slashDateAnywhere) {
    const yy = slashDateAnywhere[3].length === 2 ? `20${slashDateAnywhere[3]}` : slashDateAnywhere[3];
    upload_date = `${yy}${String(Number(slashDateAnywhere[1])).padStart(2, '0')}${String(Number(slashDateAnywhere[2])).padStart(2, '0')}`;
  }

  if (channel === 'Unknown' && /jumanne/i.test(working)) {
    channel = '@Jumanneee';
  }

  title = working || title;
  return { title, channel, upload_date };
}

function parseFromHtml(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const html = fs.readFileSync(filePath, 'utf8');
  const liRegex = /<li id="chat-messages-[\s\S]*?<\/li>/g;
  const rows = [];
  let m;

  while ((m = liRegex.exec(html))) {
    const block = m[0];
    const t = block.match(/<h1><span><span>([^<]+)<\/span><\/span><span class="hiddenVisually_b18fe2">,<\/span><\/h1>/);
    if (!t) continue;

    const titleLine = decodeEntities(t[1].trim());
    const urls = [...block.matchAll(/(?:src|href)="(https:\/\/cdn\.discordapp\.com\/attachments\/[^"]+\.(?:mp4|mov)(?:\?[^"]*)?)"/gi)]
      .map((x) => decodeEntities(x[1]));
    if (!urls.length) continue;

    const preferred = urls.find((u) => /\?ex=|\?is=|\?hm=/i.test(u)) || urls[0];
    const parsed = parseTitleLine(titleLine);
    rows.push({
      titleLine,
      url: preferred,
      baseUrl: stripQuery(preferred),
      ...parsed
    });
  }

  const uniq = [];
  const seen = new Set();
  for (const row of rows) {
    const key = `${row.titleLine}|${row.baseUrl}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(row);
  }
  return uniq;
}

function parseFromPrompts(mdFiles) {
  const rows = [];
  for (const file of mdFiles) {
    const text = fs.readFileSync(file, 'utf8');
    const lines = text.split(/\r?\n/);
    let pendingTitle = null;

    for (const lineRaw of lines) {
      const line = decodeEntities(lineRaw.trim());
      if (!line) continue;
      const urlMatch = line.match(/https:\/\/cdn\.discordapp\.com\/attachments\/[\w/.-]+\.(?:mp4|mov)(?:\?[^^\s)]*)?/i);
      if (urlMatch) {
        const url = decodeEntities(urlMatch[0]);
        const titleLine = pendingTitle || path.basename(stripQuery(url)).replace(/[_-]+/g, ' ').replace(/\.[a-z0-9]+$/i, '').trim();
        const parsed = parseTitleLine(titleLine);
        rows.push({ titleLine, url, baseUrl: stripQuery(url), ...parsed });
        pendingTitle = null;
        continue;
      }
      if (!line.startsWith('http')) {
        pendingTitle = line;
      }
    }
  }

  const uniq = [];
  const seen = new Set();
  for (const row of rows) {
    const key = `${row.titleLine}|${row.baseUrl}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(row);
  }
  return uniq;
}

function mergeIntoDb(rows) {
  const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  const bySourceBase = new Map();
  const byPlaybackBase = new Map();
  const byTitleDate = new Map();

  for (const v of db.videos) {
    if (v.source_url) bySourceBase.set(stripQuery(v.source_url), v);
    if (v.playback_url && /^https?:\/\//i.test(v.playback_url)) byPlaybackBase.set(stripQuery(v.playback_url), v);
    byTitleDate.set(`${(v.title || '').toLowerCase()}|${v.upload_date || ''}`, v);
  }

  let added = 0;
  let updated = 0;

  for (const row of rows) {
    let rec = bySourceBase.get(row.baseUrl) || byPlaybackBase.get(row.baseUrl) || byTitleDate.get(`${row.title.toLowerCase()}|${row.upload_date || ''}`);
    if (!rec) {
      rec = {
        id: `disc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        youtube_id: '',
        title: row.title,
        channel: row.channel,
        upload_date: row.upload_date,
        description: null,
        duration: null,
        file_size: null,
        thumbnail_url: null,
        source_url: row.url,
        playback_url: row.url,
        storage_type: 'remote',
        status: 'ready',
        archived_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        error_message: null
      };
      db.videos.unshift(rec);
      added++;
    }

    rec.title = row.title || rec.title;
    if (row.channel && row.channel !== 'Unknown') {
      rec.channel = row.channel;
    } else if (!rec.channel) {
      rec.channel = 'Unknown';
    }
    if (row.upload_date) rec.upload_date = row.upload_date;

    // Keep full tokenized URL for remote playback; this is critical for Discord links.
    if (row.url) {
      rec.source_url = row.url;
      if (rec.storage_type !== 'local') {
        rec.playback_url = row.url;
      }
    }

    if (rec.storage_type !== 'local') {
      rec.status = 'ready';
      rec.error_message = null;
    }
    updated++;
  }

  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
  fs.writeFileSync(OUT_PATH, JSON.stringify(rows, null, 2));
  return { parsed: rows.length, added, updated, total: db.videos.length };
}

const htmlRows = parseFromHtml(INPUT_HTML);
const promptRows = parseFromPrompts(MD_PROMPTS);
const merged = [...htmlRows, ...promptRows];

const bestByBase = new Map();
const score = (row) => {
  let s = 0;
  if (row.channel && row.channel !== 'Unknown') s += 4;
  if (row.upload_date) s += 3;
  if (row.title && row.title.length > 5) s += 1;
  return s;
};
for (const row of merged) {
  const current = bestByBase.get(row.baseUrl);
  if (!current || score(row) > score(current)) {
    bestByBase.set(row.baseUrl, row);
  }
}
const uniq = Array.from(bestByBase.values());

const summary = mergeIntoDb(uniq);
console.log(JSON.stringify({ html: htmlRows.length, prompts: promptRows.length, unique: uniq.length, ...summary }, null, 2));
