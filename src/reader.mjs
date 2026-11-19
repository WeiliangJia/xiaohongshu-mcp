import { access } from 'node:fs/promises';
import { chromium } from 'playwright';
import { profileDir } from './settings.mjs';

const origin = 'https://www.xiaohongshu.com';
const home = `${origin}/explore`;
const noteHosts = new Set(['www.xiaohongshu.com', 'xiaohongshu.com', 'www.rednote.com', 'rednote.com']);
const shortHosts = new Set(['xhslink.com', 'www.xhslink.com']);
const notePath = /^\/(?:explore|discovery\/item|search_result)\/([a-f\d]{24})\/?$/i;
const profilePath = /^\/user\/profile\/([a-f\d]{24})\/?$/i;
const titleSelector = '#detail-title';
const bodySelector = '#detail-desc';
const resultSelector = 'a[href*="/search_result/"], a[href*="/explore/"], a[href*="/discovery/item/"]';
const timeout = 14000;

export class ReadError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function allowedPage(url) {
  return url.protocol === 'https:' && !url.port && !url.username && !url.password &&
    (noteHosts.has(url.hostname) || shortHosts.has(url.hostname));
}

export function noteLink(value) {
  let url;
  try { url = new URL(value); } catch { return null; }
  if (!allowedPage(url)) return null;
  if (shortHosts.has(url.hostname)) {
    return /^\/(?:a\/|m\/)?[a-z\d]+\/?$/i.test(url.pathname)
      ? { url: `${url.origin}${url.pathname}`, id: null } : null;
  }
  const match = url.pathname.match(notePath);
  if (!match) return null;
  const cleaned = new URL(`/explore/${match[1]}`, url.origin);
  for (const key of ['xsec_token', 'xsec_source']) {
    if (url.searchParams.has(key)) cleaned.searchParams.set(key, url.searchParams.get(key));
  }
  return { url: cleaned.href, id: match[1].toLowerCase() };
}

export function countValue(text) {
  if (!text) return null;
  const match = text.trim().replace(/[\s,，]/g, '').match(/^(\d+(?:\.\d+)?)(万|亿|[kKmM])?\+?$/);
  if (!match) return null;
  const scale = { 万: 1e4, 亿: 1e8, k: 1e3, m: 1e6 };
  const value = Math.round(Number(match[1]) * (scale[match[2]?.toLowerCase()] ?? 1));
  return Number.isSafeInteger(value) ? value : null;
}

async function openBrowser(headless) {
  try {
    return await chromium.launchPersistentContext(profileDir, {
      channel: 'chromium',
      headless,
      acceptDownloads: false,
      serviceWorkers: 'block',
      timeout: 12000,
    });
  } catch (error) {
    if (/ProcessSingleton|SingletonLock|profile.*(?:in use|being used)/i.test(error.message)) {
      throw new ReadError('PROFILE_BUSY', 'Close the dedicated login window, then retry.');
    }
    if (/executable doesn't exist/i.test(error.message)) {
      throw new ReadError('BROWSER_NOT_INSTALLED', 'Run npx playwright install chromium in the checkout.');
    }
    throw new ReadError('BROWSER_UNAVAILABLE', 'Unable to open the dedicated Chromium profile.');
  }
}

export async function login() {
  const browser = await openBrowser(false);
  try {
    const page = browser.pages()[0] ?? await browser.newPage();
    await page.goto(home, { waitUntil: 'domcontentloaded', timeout });
    console.log('在专用窗口完成小红书登录后，关闭该窗口。');
    if (!page.isClosed()) await page.waitForEvent('close', { timeout: 0 });
  } finally {
    await browser.close();
  }
}

async function withPage(operation) {
  try { await access(profileDir); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    throw new ReadError('LOGIN_REQUIRED', 'Run npm run login in the checkout first.');
  }
  const browser = await openBrowser(true);
  try {
    const page = browser.pages()[0] ?? await browser.newPage();
    page.setDefaultTimeout(timeout);
    await page.route('**/*', route => {
      const request = route.request();
      if (request.isNavigationRequest() &&
          request.frame() === page.mainFrame() && !allowedPage(new URL(request.url()))) {
        return route.abort();
      }
      return route.continue();
    });
    return await operation(page);
  } finally {
    await browser.close();
  }
}

async function checkGate(page) {
  const url = new URL(page.url());
  const challenge = page.getByText(/^(安全验证|访问异常|请求过于频繁|请完成安全验证|Verify you are human)$/i);
  if (/(?:captcha|security|website-login\/error)/i.test(url.pathname) ||
      await challenge.filter({ visible: true }).first().isVisible()) {
    throw new ReadError('VERIFICATION_REQUIRED', 'Open the dedicated login window and complete verification on the site.');
  }
  const loginGate = page.getByText(/^(扫码登录|手机号登录|登录后查看更多|登录后查看完整内容|Log in to continue)$/i);
  if (/\/(?:login|signin)(?:\/|$)/i.test(url.pathname) ||
      await loginGate.filter({ visible: true }).first().isVisible()) {
    throw new ReadError('LOGIN_REQUIRED', 'Run npm run login and sign in on the website.');
  }
}

async function navigate(page, url, waitUntil = 'domcontentloaded') {
  let response;
  try { response = await page.goto(url, { waitUntil }); } catch {
    throw new ReadError('PAGE_UNAVAILABLE', 'Unable to open the requested Xiaohongshu page.');
  }
  if (!allowedPage(new URL(page.url()))) throw new ReadError('PAGE_UNAVAILABLE', 'The link left Xiaohongshu.');
  await checkGate(page);
  if (response?.status() === 429) throw new ReadError('VERIFICATION_REQUIRED', 'Xiaohongshu temporarily limited this session.');
  if (response && response.status() >= 400) throw new ReadError('PAGE_UNAVAILABLE', 'Xiaohongshu returned a page error.');
}

async function waitForContent(page, locator, message) {
  try { await locator.first().waitFor({ state: 'visible' }); } catch (error) {
    if (error.name !== 'TimeoutError') throw error;
    await checkGate(page);
    throw new ReadError('PAGE_CHANGED', message);
  }
}

async function openSearch(page, keyword) {
  await navigate(page, home);
  const search = page.locator('#search-input-in-feeds, #search-input, #search-input-ai').filter({ visible: true }).first();
  await waitForContent(page, search, 'Search input could not be found.');
  await search.click();
  await search.press('ControlOrMeta+A');
  await page.keyboard.insertText(keyword);
  await page.keyboard.press('Enter');
  const isSearchPage = url => allowedPage(url) && /^\/search_result(?:_ai)?\/?$/.test(url.pathname);
  try { await page.waitForURL(isSearchPage, { timeout: 4000 }); } catch (error) {
    if (error.name !== 'TimeoutError') throw error;
    await checkGate(page);
    const current = new URL(page.url());
    if (!allowedPage(current) || current.pathname !== '/explore') {
      throw new ReadError('PAGE_CHANGED', 'Search results did not open.');
    }
    const results = new URL('/search_result_ai', current.origin);
    // The search page decodes its keyword after reading the query string.
    results.searchParams.set('keyword', encodeURIComponent(keyword));
    results.searchParams.set('source', 'unknown');
    await navigate(page, results.href);
    if (!isSearchPage(new URL(page.url()))) {
      throw new ReadError('PAGE_CHANGED', 'Search results did not open.');
    }
  }
  await checkGate(page);
}

export async function searchNotes(keyword, limit) {
  return withPage(async page => {
    await openSearch(page, keyword);
    const notesTab = page.getByText(/^(笔记|Notes)$/i).filter({ visible: true }).first();
    const resultLinks = page.locator(resultSelector).filter({ visible: true });
    const noResults = page.getByText(/^(暂无搜索结果|没有找到相关内容|未找到相关笔记|无搜索结果|No results found)$/i).filter({ visible: true });
    await waitForContent(page, notesTab.or(resultLinks).or(noResults), 'The search results page did not show its result controls.');
    if (await notesTab.isVisible() && new URL(page.url()).pathname.includes('_ai')) {
      await notesTab.click();
    }
    await waitForContent(page, resultLinks.or(noResults), 'The notes list did not load after opening the search results.');
    if (await noResults.first().isVisible()) return [];
    const rows = await resultLinks.evaluateAll(links => links.map(link => {
      const card = link.closest('section, [class*="note-item"]');
      const title = card?.querySelector('.title, [class*="note-title"]') ?? link;
      const author = card?.querySelector('.author .name, [class*="author"] [class*="name"], a[href*="/user/profile/"]');
      return {
        href: link.href,
        title: title.innerText?.trim() || title.getAttribute('aria-label'),
        author: author?.innerText?.trim().split(/\r?\n/, 1)[0]?.trim() || null,
      };
    }));
    const notes = new Map();
    for (const row of rows) {
      const link = noteLink(row.href);
      if (!link?.id || !row.title || notes.has(link.id)) continue;
      notes.set(link.id, { id: link.id, title: row.title, author: row.author, url: link.url });
      if (notes.size === limit) break;
    }
    if (!notes.size) throw new ReadError('PAGE_CHANGED', 'Search results were visible, but note cards could not be parsed.');
    return [...notes.values()];
  });
}

const followingLabels = /^(已关注|互相关注|Following|Mutual follow)$/i;
const notFollowingLabels = /^(关注|回关|Follow|Follow back)$/i;
const followLabels = /^(已关注|互相关注|关注|回关|Following|Mutual follow|Follow|Follow back)$/i;

export function followState(label) {
  if (followingLabels.test(label)) return true;
  if (notFollowingLabels.test(label)) return false;
  return null;
}

export async function checkFollow(username) {
  return withPage(async page => {
    await openSearch(page, username);
    const usersTab = page.getByText(/^(用户|Users|People)$/i).filter({ visible: true }).first();
    const notesTab = page.getByText(/^(笔记|Notes)$/i).filter({ visible: true }).first();
    const matches = page.getByText(username, { exact: true }).filter({ visible: true });
    const noResults = page.getByText(/^(暂无搜索结果|没有找到相关内容|未找到相关用户|无搜索结果|No results found)$/i).filter({ visible: true });
    await waitForContent(page, usersTab.or(notesTab).or(matches).or(noResults), 'The search page did not display user results or search tabs.');
    if (!await usersTab.isVisible() && await notesTab.isVisible() && new URL(page.url()).pathname.includes('_ai')) {
      await notesTab.click();
      await waitForContent(page, usersTab.or(matches).or(noResults), 'The search results did not show a matching user or a Users tab.');
    }
    if (await usersTab.isVisible()) await usersTab.click();
    await waitForContent(page, matches.or(noResults), 'No exact username was visible in the user search results.');
    if (await noResults.first().isVisible()) throw new ReadError('USER_NOT_FOUND', 'The user search reported no matching accounts.');
    const links = await matches.evaluateAll(nodes => nodes.flatMap(node => {
      const selector = 'a[href*="/user/profile/"]';
      let row = node;
      for (let level = 0; row && level < 5; level++, row = row.parentElement) {
        const anchor = row.closest(selector);
        if (anchor) return [anchor.href];
        const links = [...row.querySelectorAll(selector)];
        if (links.length) return links.map(link => link.href);
      }
      return [];
    }));
    const candidates = new Map();
    for (const link of links) {
      const url = new URL(link);
      const id = profilePath.exec(url.pathname)?.[1];
      if (id && allowedPage(url)) candidates.set(id, url);
    }
    if (!candidates.size) throw new ReadError('USER_NOT_FOUND', 'The exact username did not have a profile link.');
    if (candidates.size > 1) throw new ReadError('USER_AMBIGUOUS', 'More than one profile matched this username.');
    const [[id, profile]] = candidates;
    await navigate(page, profile.href, 'commit');
    await waitForContent(page, page.getByText(username, { exact: true }).filter({ visible: true }), 'Could not confirm the username on the profile.');
    if (profilePath.exec(new URL(page.url()).pathname)?.[1] !== id) {
      throw new ReadError('PAGE_CHANGED', 'The result did not open the matching profile.');
    }
    const controls = page.getByRole('button', { name: followLabels }).filter({ visible: true });
    await waitForContent(page, controls, 'The profile did not show a follow status button.');
    if (await controls.count() !== 1) throw new ReadError('FOLLOW_STATUS_UNAVAILABLE', 'The profile displayed multiple follow controls.');
    const label = (await controls.innerText()).trim();
    const following = followState(label);
    if (following === null) throw new ReadError('FOLLOW_STATUS_UNAVAILABLE', 'The visible follow status was not recognized.');
    return { username, following, label, url: `${profile.origin}${profile.pathname}` };
  });
}

export async function getNote(value) {
  const requested = noteLink(value);
  if (!requested) throw new ReadError('INVALID_NOTE_URL', 'Use a Xiaohongshu/Rednote note URL or an xhslink.com share URL.');
  return withPage(async page => {
    await navigate(page, requested.id ? requested.url : await resolveShareLink(requested.url), 'commit');
    const title = page.locator(titleSelector);
    const body = page.locator(bodySelector);
    const missing = page.getByText(/^(当前笔记暂时无法浏览|该笔记已删除|笔记不存在|该内容无法查看|This note is unavailable)$/i).filter({ visible: true });
    await waitForContent(page, title.or(body).or(missing), 'The note detail layout could not be read.');
    if (await missing.first().isVisible()) throw new ReadError('NOTE_UNAVAILABLE', 'Xiaohongshu reports that this note is unavailable.');
    const link = noteLink(page.url());
    if (!link?.id || (requested.id && requested.id !== link.id)) {
      throw new ReadError('NOTE_UNAVAILABLE', 'The URL did not open the requested note.');
    }
    const visibleText = async selector => {
      const locator = page.locator(selector).filter({ visible: true }).first();
      return await locator.isVisible() ? (await locator.innerText()).trim() || null : null;
    };
    const [noteTitle, text, author, publishedAt, likes, saves, comments, total] = await Promise.all([
      visibleText(titleSelector), visibleText(bodySelector),
      visibleText('.author-container .username, .author-container .name'),
      visibleText('.note-content .date, .bottom-container .date'),
      visibleText('.like-wrapper .count'), visibleText('.collect-wrapper .count'),
      visibleText('.chat-wrapper .count'), visibleText('.total'),
    ]);
    return {
      id: link.id, url: link.url, title: noteTitle, author, text, publishedAt,
      likes: countValue(likes), saves: countValue(saves),
      comments: countValue(comments) ?? countValue(total?.match(/^共\s*(.+?)\s*条评论$/)?.[1]),
    };
  });
}

async function resolveShareLink(value) {
  let current = new URL(value);
  for (let redirect = 0; redirect < 5; redirect++) {
    const link = noteLink(current.href);
    if (link?.id) return link.url;
    if (!allowedPage(current) || !shortHosts.has(current.hostname)) break;
    let response;
    try {
      response = await fetch(current, { redirect: 'manual', signal: AbortSignal.timeout(2500) });
    } catch { break; }
    await response.body?.cancel();
    const location = response.headers.get('location');
    if (!location || response.status < 300 || response.status >= 400) break;
    current = new URL(location, current);
  }
  throw new ReadError('NOTE_UNAVAILABLE', 'The short link could not be resolved to a Xiaohongshu note.');
}
