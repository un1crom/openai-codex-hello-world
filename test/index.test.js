const request = require('supertest');
const { spawn } = require('child_process');

let serverProcess;

beforeAll(done => {
  serverProcess = spawn('node', ['index.js'], {
    env: { ...process.env, GITHUB_PAT: 'testtoken' },
    stdio: 'inherit'
  });
  // wait a bit for the server to start
  setTimeout(done, 1000);
});

afterAll(() => {
  if (serverProcess) {
    serverProcess.kill();
  }
});

test('GET / returns Hello World', async () => {
  const res = await request('http://localhost:3000').get('/');
  expect(res.status).toBe(200);
  expect(res.text).toContain('Hello World!');
});
