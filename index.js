/*
Hello World!

This app is really simple.  It will eventually generate the space of all possible programs.

Within this code and through integration with OpenAI API you can start generating, running and publishing to github OpenAI Codex generated code.

This is also the fastest way to iterate through good codex prompts.

Basically,
1. we start with a seed/prompt.
2. classify the prompt for type of code it might generate and set Codex params accordingly
3. generate code, classify what kind of code it is
4. run code in virtual machine
5. if errors process errors and generate a new seed to try to get running code
6. keep iterating for number of max iterations
7. if successful code then save code to github gists

your code and all the processing will output to console.

LANGUAGES SUPPORTED: Javascript.  It is possible to do this for Python and other interactive languages but you have you create/instrument various virtual machines.  Javascript is the best for this because VMs are on server and in browser.

The code is commented inline to help you and your computer understand what's going on.

Thanks for coding!

find me at 
@un1crom and https://github.com/HeyMaslo

*/

//normal libraries to add to serve via express and call APIs via axios.
const express = require('express');
const app = express();
const port = 3000;
const axios = require('axios');
const { Octokit } = require('@octokit/rest');

//get your various API keys set up in your environment
const apiKey = process.env['OPENAI_API_KEY'];
const apiOrg = process.env['OPENAI_ORG'];
const githubPAT = process.env['GITHUB_PAT']; // requires a github Personal Access Token - makes github API easier to use.

//this stuff helps us run the gnerated code
const util = require('util'); // requires --expose_internals

//This provides this app a Virtual Machine to run generated code
//https://nodejs.org/api/vm.html

const vm = require('vm');

//Child Process for firing up more node kernals.
var childProcess = require('child_process');

//this is a helper function to run generated code on a virtual machine.
function runScript(scriptPath, callback) {
	// keep track of whether callback has been invoked to prevent multiple invocations
	var invoked = false;

	var process = childProcess.fork(scriptPath);

	// listen for errors as they may prevent the exit event from firing
	process.on('error', function(err) {
		if (invoked) return;
		invoked = true;
		callback(err);
	});

	// execute the callback once the process has finished running
	process.on('exit', function(code) {
		if (invoked) return;
		invoked = true;
		var err = code === 0 ? null : new Error('exit code ' + code);
		callback(err);
	});
}


//Get into the code we actually care about....

/*
TODO: it's not clear what stop sequences to adjust to produce best effects.
TODO: use codex as much as possible to do the work.  RESIST using other libraries.  use the model all the way.
TODO: keep in mind all we care about it is expressing ideas as humans, computers understanding and doing stuff, and using Transformers to handle ALL OF IT.
TODO: make a nodejs kernal OUT OF TRANSFORMERS.  a compiler and runtime made completely from js.
TODO: don't fall for the trick of letting non-codex stuff do the work of the magic.
TODO: investigate various runtimes/interpreters
https://github.com/browserify/vm-browserify
https://60devs.com/running-react-os-in-browser.html

*/

//helper function for express URL handling
app.use(
	express.urlencoded({
		extended: true
	})
);

//OpenAI API Calls
const client = axios.create({
	headers: {
		Authorization: 'Bearer ' + apiKey,
		'OpenAI-Organization': apiOrg,
		'Content-Type': 'application/json'
	}
});
//defaults

const paramsDefault = {
	prompt: 'Hellow World!',
	temperature: 0.5,
	max_tokens: 64,
	top_p: 1,
	frequency_penalty: 0.5,
	presence_penalty: 0.5,
	stop: ['});']
};


//Semantic Search
//Semantic search is used to classify codex prompts and generated code for what type of program/code it might be generating.

async function search(
	querySeed = 'for each',
	engine = 'curie',
	classes = ['javascriptBrowser', 'javascriptServer', 'python', 'unknown']
) {
	const data = {
		documents: classes,
		query: querySeed
	};

	const endpoint = 'https://api.openai.com/v1/engines/' + engine + '/search';

	return (classOut = await client
		.post(endpoint, data)
		.then(async results => {
			//console.log(results)

			//get us the ordered results
			classes.forEach(mergeSearch);

			function mergeSearch(item, index, arr) {
				arr[index] = {
					class: item,
					doc: results.data.data[index].document,
					score: results.data.data[index].score
				};
			}
			classes.sort((a, b) => parseFloat(b.score) - parseFloat(a.score));
			console.log(classes);
			console.log('this query is class: ' + classes[0].class);
			return (classOut = await Promise.resolve(classes[0].class));
		})
		.catch(err => {
			//console.log(err);
			return 'unknown';
		}));
}

//call to GPT3 models
//GPT3 can be used to generate comments, read and interpret code and more.

function gpt3(
        codeSeed = '//write a nodejs javascript function to count to a number between 13 and 98.\n',
        temp = 0.5,
        tokens = 100,
        tp = 1,
        fp = 0.5,
        pp = 0.5,
        stopSequence = '});',
        engine = 'davinci'
) {
        let endpoint;
        let params;
        if (engine === 'o4-mini') {
                endpoint = 'https://api.openai.com/v1/responses';
                params = {
                        model: engine,
                        input: codeSeed
                };
        } else {
                endpoint =
                        'https://api.openai.com/v1/engines/' + engine + '/completions';

                params = {
                        prompt: codeSeed,
                        temperature: temp,
                        max_tokens: tokens,
                        top_p: tp,
                        frequency_penalty: fp,
                        presence_penalty: pp,
                        stop: [stopSequence]
                };
        }

	client
		.post(endpoint, params)
		.then(result => {
			console.log('gpt3 is thinking');

			console.log('logging the code');
			console.log(params.prompt + result.data.choices[0].text);
			return result.data.choices[0].text;
			// console.log(result.data);
		})
		.catch(err => {
			console.log(err);
			return err;
		});
}

//call codeX model
//Here's where we actually generate code
//you can pass in the number of generations you want to attempt with the genAttempts.

async function codeX(
	codeSeed = '//using node make some stuff!',
	temp = 0.5,
	tokens = 100,
	tp = 1,
	fp = 0.5,
	pp = 0.5,
	stopSequence = '});',
        engine = 'o4-mini',
	genAttempts = 5,
  defaultCode = "hello world!"
) {
	console.log('the code seed is:' + codeSeed);
        let endpoint;
        let params;
        if (engine === 'o4-mini') {
                endpoint = 'https://api.openai.com/v1/responses';
                params = {
                        model: engine,
                        input: codeSeed
                };
        } else {
                endpoint =
                        'https://api.openai.com/v1/engines/' + engine + '/completions';

                params = {
                        prompt: codeSeed,
                        temperature: temp,
                        max_tokens: tokens,
                        top_p: tp,
                        frequency_penalty: fp,
                        presence_penalty: pp,
                        stop: [stopSequence]
                };
        }

	/*test code for vm contexts
  const x = 1;
  const context = { x: 2 };
  const code = 'x += 40; var y = 17;';
  console.log(context.x); // 42
  console.log(context.y); // 17
  console.log(x); // 1; y is not defined.
  // `x` and `y` are global variables in the context.
  // Initially, x has the value 2 because that is the value of context.x.
  */
return new Promise((resolve, reject) => {
      client
        .post(endpoint, params)
        .then(result => {

          
          console.log('running the code');
        //Test the Result for whether it's all comments.
        //if result.lines()
        //
          //we set the context of the code gen VM and make sure that we get to trap the console.log from the VM.
          const context = {
            console: console
          };

          /* const context = {
                            console: {
                                log: (...args) => {
                                    console.log(...args);
                                }
                            }
                        };
        */
          vm.createContext(context); // Contextify the object.

          //attempt to run the generated code in nodejs process.   trap errors.  decide what to do with the errors.

          //note that VM will not give access console in some super nice way...

          //
                  let generatedText;
                  try {
                    generatedText =
                      engine === 'o4-mini'
                        ? (((result.data.output || [])[0] || {}).content || [])[0]?.text || ''
                        : result.data.choices[0].text;
                    vm.runInContext(generatedText, context);
                    const regex = /\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm;
                    const found = generatedText.match(regex);
                    console.log('COMMENTED LINE!' + found);
                    console.log(JSON.stringify(context, undefined, 4));
                    console.log('call github');
                    github(
                      params.prompt || codeSeed,
                      generatedText,
                      params,
                      JSON.stringify(context, undefined, 4)
                    );
                    resolve(generatedText);



                  } catch (e) {
                    /*this is a really important deal. Error handling is really the main thing we want in code generation workflows.  how aggressively do we remediate errors (stay in adjacent possible) vs. just jump around for new computations.*/
                    console.error(e);
                    console.log(e.code);
                    console.log(e.message);
                    //recurse for the number of genAttempts
                    if (genAttempts > 0) {
                      var genAttemptsNew = genAttempts - 1;
                      console.log('gen attempts left: ' + genAttemptsNew);
                      codeX(
                        codeSeed + '\n//but try to avoid this error: ' + e.message + '\n',
                        temp,
                        tokens,
                        tp,
                        fp,
                        pp,
                        stopSequence,
                        engine,
                        genAttemptsNew,
                        defaultCode
                      );
                    }
                    else{
                      //
                       resolve(defaultCode);
                    }
                  }

          console.log('logging the code');
          console.log(codeSeed + generatedText);
          // console.log(result.data);
        })
        .catch(err => {
          console.log(err);
          resolve(defaultCode);
        });
  });
}

//function to publish code to github
async function github(
	codeTitle = 'new code',
	codeBody = 'content for a new world',
	codexVals = paramsDefault,
	outputFromCode = ''
) {
	//here we create our github API
	const octokit = new Octokit({
		auth: githubPAT,

		userAgent: 'invertedcomputationalflow',

		previews: ['jean-grey', 'symmetra'],

		//timeZone: 'Europe/Amsterdam',

		baseUrl: 'https://api.github.com',

		log: {
			debug: () => {},
			info: () => {},
			warn: console.warn,
			error: console.error
		},

		request: {
			agent: undefined,
			fetch: undefined,
			timeout: 0
		}
	});

	//create a pull request
	// TODO: extract the github details to some constants
	// un1crom-hypertest

	/*
      await octokit.request('POST /repos/un1crom/hypercodex/pulls', {
            owner: 'un1crom',
            repo: 'hypercodex',
            head: 'un1crom-hypertest',
            base: 'main',
            title: codeTitle,
            body: codeBody
      })

     const pulls = await octokit.request('GET /repos/un1crom/hypercodex/pulls', {
        owner: 'un1crom',
        repo: 'hypercodex'
      })
      */

	//build the codex file name (useful for a hyperlink you can parse)
	jsFile =
		'cX_' +
		codexVals.max_tokens +
		'_' +
		parseInt(codexVals.top_p * 100).toString() +
		'_' +
		parseInt(codexVals.frequency_penalty * 100).toString() +
		'_' +
		parseInt(codexVals.presence_penalty * 100).toString() +
		'_' +
		parseInt(codexVals.temperature * 100).toString() +
		'_' +
		Date.now().toString() +
		'_' +
		codeTitle
			.substring(1, Math.floor(Math.random() * 20))
			.replace(/[^\w]/gi, '') +
		'.js';

	//analysis using semantic search
	//TODO: wrap this is all in some horrible promise so that it returns super fast
	console.log('analyzing using search');
	var typeOfCode = await search(codeBody, 'curie', [
		'javascriptBrowser',
		'javascriptServer',
		'python',
		'unknown'
	]);

	console.log('do i have a value for the type of Code' + typeOfCode);
	//you have to use the [] notation to have json key evaluated before using
	//including the prompt for later parsing
	const files = {
		[jsFile]: {
			content:
				'/*(<seed> ' +
				codeTitle +
				'</seed>)\n<stop>' +
				codexVals.stop +
				'</stop>\n<codeType>' +
				typeOfCode +
				'</codeType>*/\n' +
				codeBody +
				'\n/*<output>' +
				outputFromCode +
				'\n</output>*/'
		}
	};

	console.log(files);
	//set public to TRUE to go public with your Codex 
	await octokit.request('POST /gists', {
		public: true,
		files
	});

	// const gists = await octokit.request('GET /gists/public')

	//console.log(gists);
}

//bootstrap own interface and make it async
async function codeXProxy(	codeSeed = '//using node make some stuff!',
	temp = 0.5,
	tokens = 100,
	tp = 1,
	fp = 0.5,
	pp = 0.5,
	stopSequence = '});',
        engine = 'o4-mini',
	genAttempts = 5,
  defaultCode = "hello world!") {

  var bs = await codeX(
      codeSeed,
      temp,
      tokens,
      tp,
      fp,
      pp,
      stopSequence,
      engine,
      genAttempts,
      defaultCode
		)

  return bs;

}

//this is the default page to present a prompt box
app.get('/', (req, res) => {

 
	res.send(
      '<h1>Hello World!</h1>From hello world you can get to any other program.  This simple Hello World app integrates with OpenAI API CodeX to evolve code with you.   Simple give it a seed a go!</br><form action="/" method="post"><textarea id="helloworld" name="helloworld" placeholder="Hello World!" rows="4" cols="50">//write a javascript function to say Hello World!.</textarea><br/><input type="submit" value="hello world!"></form>'
	);
	//console.log(req.query.helloworld);
	if (
		req.query.helloworld &&
		typeof req.query.helloworld !== 'undefined' &&
		req.query.helloworld != 'undefined'
	) {
		console.log('query time' + req.query);
		codeXProxy(
			'//' + req.query.helloworld + '.\n',
			0.5,
			100,
			1,
			0.5,
			0.5,
                        'COOKED',
                        'o4-mini',
			5,
      "<blink>I tried</blink>"
		);
	} else {
		//default seed
		codeXProxy(
			'//write a nodejs javascript function to count to a number between 34 and 98 and say Hello World.\n',
			0.5,
			100,
			1,
			0.5,
			0.5,
                        '});',
                        'o4-mini',
			5,
      "<blink>I did not try</blink>"
		);
	}
});

//main express funtion to accept post requests and kick of generations
app.post('/', (req, res) => {
	console.log(req.body.helloworld);
	if (
		req.body.helloworld !== null &&
		req.body.helloworld !== '' &&
		req.body.helloworld !== 'undefined'
	) {
		res.send(
			'<h1>Hello World!</h1>From hello world you can get to any other program.  This simple Hello World app integrates with OpenAI API CodeX to evolve code with you.   Simple give it a seed a go!</br><form action="/" method="post"><textarea id="helloworld" name="helloworld" placeholder="say hello to more computation, world." rows="4" cols="50">' +
				req.body.helloworld +
				'</textarea><br/><input type="submit" value="hello world!"></form>'
		);

		var cleanUpHello = req.body.helloworld.replace(/\r/g, '\n');
		var typeOfSeed = search(cleanUpHello, 'curie', [
			'app',
			'algorithm',
			'knowledge',
			'advanced algorithm'
		]);
		if (typeOfSeed == 'algorithm') {
			codeXProxy(
				'//' + cleanUpHello + '.\n',
				0.7,
				1000,
				1,
				0.2,
				0.2,
                                '});',
                                'o4-mini',
				5,
         "<blink>I try</blink>"
			);
		} else {
			codeXProxy(
				'//' + cleanUpHello + '.\n',
				0.5,
				300,
				1,
				0.5,
				0.5,
                                '});',
                                'o4-mini',
				5,
      "<blink>I did not try</blink>"
			);
		}
	} else {
		//default seed

		res.send(
			'<h1>Hello World!</h1>From hello world you can get to any other program.  This simple Hello World app integrates with OpenAI API CodeX to evolve code with you.   Simple give it a seed a go!</br><form action="/" method="post"><textarea id="helloworld" name="helloworld" placeholder="Hello World!" rows="4" cols="50">say hello to more computation, world.</textarea><br/><input type="submit" value="hello world!"></form>'
		);

		codeXProxy(
			'//write a nodejs javascript function to count to a number between 34 and 98.\n',
			0.5,
			100,
			1,
			0.5,
			0.5,
                        '});',
                        'o4-mini',
			5,
      "<blink>I did try</blink>"
		);
	}
});

app.listen(port, () => {
	console.log(`Example app listening at http://localhost:${port}`);
});
