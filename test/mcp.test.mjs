import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { httpServer } from '../src/http.mjs';
import { countValue, followState, noteLink, ReadError } from '../src/reader.mjs';
import { localCaller } from '../src/tools.mjs';

const id = '639001625c16710001c00312';
const url = `https://www.xiaohongshu.com/explore/${id}`;
const detail = {
  id, url, title: '示例笔记', author: null, text: '示例正文', publishedAt: null,
  likes: 10, saves: null, comments: 2,
};

test('note links preserve navigation parameters and reject other destinations', () => {
  assert.deepEqual(noteLink(`https://www.xiaohongshu.com/search_result/${id}?xsec_token=sample&tracking=1`), {
    url: `${url}?xsec_token=sample`, id,
  });
  assert.deepEqual(noteLink('https://xhslink.com/a/aBcd123'), { url: 'https://xhslink.com/a/aBcd123', id: null });
  for (const invalid of ['http://www.xiaohongshu.com', 'https://xhslink.com@127.0.0.1/a', `${url.replace('com/', 'com:8080/')}`, 'https://www.rednote.com/login']) {
    assert.equal(noteLink(invalid), null);
  }
  assert.equal(countValue('1.2万'), 12000);
  assert.equal(countValue('1,234'), 1234);
  assert.equal(countValue('赞'), null);
});

test('follow status uses explicit labels', () => {
  assert.equal(followState('已关注'), true);
  assert.equal(followState('互相关注'), true);
  assert.equal(followState('关注'), false);
  assert.equal(followState('回关'), false);
  assert.equal(followState('取消关注'), null);
});

test('independent MCP client gets structured data and login errors through authenticated HTTP', async t => {
  const reader = {
    ReadError,
    searchNotes: async (keyword, limit) => {
      assert.equal(keyword, '测试');
      assert.equal(limit, 5);
      return [{ id, title: '示例笔记', author: null, url }];
    },
    getNote: async noteUrl => {
      if (noteUrl === url) return detail;
      throw new ReadError('LOGIN_REQUIRED', 'Log in locally.');
    },
    checkFollow: async username => ({ username, following: true, label: '已关注', url: `https://www.xiaohongshu.com/user/profile/${id}` }),
  };
  const token = randomBytes(32).toString('hex');
  const server = httpServer(token, localCaller(reader));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const endpoint = new URL(`http://127.0.0.1:${server.address().port}/mcp`);
  assert.equal((await fetch(endpoint, { method: 'POST' })).status, 401);
  assert.equal((await fetch(endpoint, { method: 'POST', headers: { origin: 'https://example.org' } })).status, 403);
  const client = new Client({ name: 'test', version: '1.0.0' });
  t.after(() => client.close());
  await client.connect(new StreamableHTTPClientTransport(endpoint, {
    requestInit: { headers: { authorization: `Bearer ${token}` } },
  }));
  assert.deepEqual((await client.listTools()).tools.map(tool => tool.name), ['search_notes', 'get_note', 'check_follow']);
  const search = await client.callTool({ name: 'search_notes', arguments: { keyword: '测试' } });
  assert.deepEqual(search.structuredContent, { schemaVersion: 1, notes: [{ id, title: '示例笔记', author: null, url }] });
  const note = await client.callTool({ name: 'get_note', arguments: { url: search.structuredContent.notes[0].url } });
  assert.deepEqual(note.structuredContent, { schemaVersion: 1, ...detail });
  const login = await client.callTool({ name: 'get_note', arguments: { url: 'https://xhslink.com/a/sample' } });
  assert.equal(login.isError, true);
  assert.equal(JSON.parse(login.content[0].text).code, 'LOGIN_REQUIRED');
  const follow = await client.callTool({ name: 'check_follow', arguments: { username: '示例作者' } });
  assert.equal(follow.structuredContent.following, true);
  assert.equal(follow.structuredContent.username, '示例作者');
});
