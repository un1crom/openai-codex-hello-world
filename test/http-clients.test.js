const http = require('node:http');
const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
const axios = require('axios');
const { Octokit } = require('@octokit/rest');

let server;
let baseUrl;
let receivedRequest;

before(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      receivedRequest = {
        method: req.method,
        path: req.url,
        headers: req.headers,
        body: JSON.parse(body)
      };
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Connection', 'close');

      if (req.url === '/rate-limited') {
        res.writeHead(429);
        res.end(JSON.stringify({ error: { message: 'Rate limit exceeded' } }));
      } else if (req.url === '/gists') {
        res.writeHead(201);
        res.end(JSON.stringify({ id: 'local-gist', files: receivedRequest.body.files }));
      } else {
        res.end(JSON.stringify({
          output: [{ content: [{ text: 'console.log("Hello World!");' }] }]
        }));
      }
    });
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close(err => err ? reject(err) : resolve());
  });
});

test('Axios sends configured authentication headers and parses a JSON response', async () => {
  const client = axios.create({
    headers: {
      Authorization: 'Bearer local-api-key',
      'OpenAI-Organization': 'local-organization',
      'Content-Type': 'application/json'
    },
    proxy: false
  });
  const params = { model: 'o4-mini', input: '// Say hello' };

  const result = await client.post(`${baseUrl}/responses`, params);

  assert.equal(receivedRequest.method, 'POST');
  assert.equal(receivedRequest.path, '/responses');
  assert.equal(receivedRequest.headers.authorization, 'Bearer local-api-key');
  assert.equal(receivedRequest.headers['openai-organization'], 'local-organization');
  assert.equal(receivedRequest.headers['content-type'], 'application/json');
  assert.deepStrictEqual(receivedRequest.body, params);
  assert.equal(result.data.output[0].content[0].text, 'console.log("Hello World!");');
});

test('Axios rejects an HTTP failure with the status and parsed error body', async () => {
  await assert.rejects(
    axios.post(`${baseUrl}/rate-limited`, {}, { proxy: false }),
    err => {
      assert.equal(err.isAxiosError, true);
      assert.equal(err.response.status, 429);
      assert.deepStrictEqual(err.response.data, { error: { message: 'Rate limit exceeded' } });
      return true;
    }
  );
});

test('Octokit posts Gist content and returns the parsed response', async () => {
  const octokit = new Octokit({ auth: 'local-github-token', baseUrl });
  const files = { 'generated.js': { content: 'console.log("Hello World!");' } };

  const result = await octokit.request('POST /gists', { public: true, files });

  assert.equal(receivedRequest.method, 'POST');
  assert.equal(receivedRequest.path, '/gists');
  assert.equal(receivedRequest.headers.authorization, 'token local-github-token');
  assert.equal(receivedRequest.headers['content-type'], 'application/json; charset=utf-8');
  assert.deepStrictEqual(receivedRequest.body, { public: true, files });
  assert.equal(result.status, 201);
  assert.deepStrictEqual(result.data, { id: 'local-gist', files });
});
