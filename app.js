#!/usr/bin/env node

var express = require('express')
var cors = require('cors')
var fs = require('fs');
var app = express();
var exec = require('child_process').exec;
var sha1 = require('sha1');
var bodyParser = require('body-parser');
var multer = require('multer');

var upload = multer();

const MAX_CODE_LENGTH = 20000;
const WRITE_PATH = '/tmp';

app.use(bodyParser.json());
app.use(cors());

function write(fileName, code) {
   return new Promise((resolve, reject) => {
       fs.writeFile(fileName, code, (err) => {
            if (err) {
                reject(err);    
            } else {
                resolve();
            }
        });
    });        
}

function runDockerCommand(fileName, request) {
    return './run-docker ' + fileName + ' ' + request.compiler + ' ' + request.optim + ' ' + request.cppVersion + (request.force ? ' -f' : '');
}

function optionsToString(request) {
    let options = {
        "compiler": request.compiler,
        "optim": request.optim,
        "cppVersion": request.cppVersion
    };
    return JSON.stringify(options);
}

function saveOptions(fileName, request) {
    write(fileName + '.opt', optionsToString(request));
}

function execute(fileName, request) {
    let options = {
        timeout: 30000,
        killSignal: 'SIGKILL'
    }
    return new Promise((resolve, reject) => {
        exec(runDockerCommand(fileName, request), options, function (err, stdout, stderr) {
            if (err) {
                exec("./kill-docker " + fileName);
                reject("\u001b[0m\u001b[0;1;31mError or timeout\u001b[0m\u001b[1m<br>" + stdout);
            } else {
                saveOptions(fileName, request);
                resolve({ res: fs.readFileSync(fileName + '.out'), stdout: stderr});
            }
        });
    });
}

function treat(request) {
    if (request.code.length > MAX_CODE_LENGTH) {
        return Promise.reject('\u001b[0m\u001b[0;1;31mError: Unauthorized code length.\u001b[0m\u001b[1m');
    }
    let name = sha1(request.code + request.compiler + request.optim + request.cppVersion);
    var dir = WRITE_PATH;
    var fileName = dir + '/' + name.substr(0, 2) + '/' + name;
    let code = '#include <benchmark/benchmark_api.h>\n' + request.code + '\nBENCHMARK_MAIN()';
    return Promise.resolve(write(fileName +'.cpp' , code)).then(() => execute(fileName, request));
}

app.post('/', upload.array(), function (req, res) {
    Promise.resolve(treat(req.body))
        .then((done) => res.json({ result: JSON.parse(done.res), message: done.stdout }))
        .catch((err) => res.json({ message: err }));
})

app.listen(3000, function() {
    console.log('Listening to commands');
});
