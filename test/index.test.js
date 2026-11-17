const assert = require('node:assert/strict');
const { once } = require('node:events');
const path = require('node:path');
const { before, after, test } = require('node:test');
const request = require('supertest');
const { spawn } = require('node:child_process');

let serverProcess;
let serverUrl;

before(async () => {
  // Keep the server smoke test offline. Client requests are covered separately.
  const bootstrap = `
    require('axios').defaults.adapter = async () => {
      throw new Error('API requests are disabled in the homepage test');
    };
    const express = require('express');
    const listen = express.application.listen;
    express.application.listen = function () {
      const server = listen.call(this, 0, '127.0.0.1', () => {
        process.send({ port: server.address().port });
      });
      return server;
    };
    require('./index.js');
  `;
  serverProcess = spawn(process.execPath, ['-e', bootstrap], {
    cwd: path.resolve(__dirname, '..'),
    env: {
      GITHUB_PAT: 'testtoken',
      OPENAI_API_KEY: 'test-api-key',
      OPENAI_ORG: 'test-organization'
    },
    stdio: ['ignore', 'ignore', 'pipe', 'ipc']
  });

  const { port } = await new Promise((resolve, reject) => {
    let stderr = '';
    serverProcess.stderr.on('data', chunk => { stderr += chunk; });
    serverProcess.once('error', reject);
    serverProcess.once('exit', code => {
      reject(new Error(`Server exited before startup (${code}): ${stderr}`));
    });
    serverProcess.once('message', resolve);
  });
  serverUrl = `http://127.0.0.1:${port}`;
}, { timeout: 5000 });

after(async () => {
  if (serverProcess && serverProcess.exitCode === null && serverProcess.signalCode === null) {
    const exited = once(serverProcess, 'exit');
    serverProcess.kill();
    await exited;
  }
});

test('GET / returns Hello World', { timeout: 5000 }, async () => {
  const res = await request(serverUrl).get('/');
  assert.equal(res.status, 200);
  assert.match(res.text, /Hello World!/);
});
