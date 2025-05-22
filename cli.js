#!/usr/bin/env node
const axios = require('axios');
const vm = require('vm');
const { Octokit } = require('@octokit/rest');

const apiKey = process.env['OPENAI_API_KEY'];
const apiOrg = process.env['OPENAI_ORG'];
const githubPAT = process.env['GITHUB_PAT'];

if (!apiKey) {
  console.error('OPENAI_API_KEY not set');
  process.exit(1);
}
if (!apiOrg) {
  console.error('OPENAI_ORG not set');
  process.exit(1);
}

const client = axios.create({
  headers: {
    Authorization: 'Bearer ' + apiKey,
    'OpenAI-Organization': apiOrg,
    'Content-Type': 'application/json'
  }
});

async function generateCode(seed, {
  temperature = 0.5,
  max_tokens = 100,
  top_p = 1,
  frequency_penalty = 0.5,
  presence_penalty = 0.5,
  stop = ['});'],
  engine = 'davinci-codex'
} = {}) {
  const endpoint = `https://api.openai.com/v1/engines/${engine}/completions`;
  const params = {
    prompt: seed,
    temperature,
    max_tokens,
    top_p,
    frequency_penalty,
    presence_penalty,
    stop
  };
  const result = await client.post(endpoint, params);
  return result.data.choices[0].text;
}

function runGenerated(code) {
  const context = { console };
  vm.createContext(context);
  vm.runInContext(code, context);
}

async function main() {
  const seed = process.argv.slice(2).join(' ') || '//write a nodejs javascript function to say Hello World!';
  try {
    const code = await generateCode(seed);
    console.log('\nGenerated Code:\n');
    console.log(code);
    runGenerated(code);
    if (githubPAT) {
      const octokit = new Octokit({ auth: githubPAT });
      await octokit.request('POST /gists', {
        public: true,
        files: {
          'generated.js': { content: code }
        }
      });
    }
  } catch (err) {
    console.error('Error generating or running code:', err.message);
  }
}

main();
