// Copyright 2019 British Broadcasting Corporation
// 
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
// 
//   http://www.apache.org/licenses/LICENSE-2.0
// 
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

var minimist    = require('minimist'),
    express     = require('express'),
    http        = require('http'),
    https       = require('https'),
    cors        = require('cors'),
    path        = require("path"),
    fs          = require("fs");

const winston = require('winston');

var logger = new (winston.Logger)({
    transports: [
      new (winston.transports.Console)({'timestamp':true})
    ]
});

logger.level = process.env.LOG_LEVEL || "silly";

var app = express();

function printUsage() {
    console.log('usage: node index.js [-s] webroot');
    console.log('example:  node index.js www-dir');
    console.log('   -s,--https      use https server and wss connections');
    console.log('   webroot         root file serving directory');
}

function serve(webRoot, options) {
    if (options.https) {
        server = https.createServer(options.certs, app);
        startupMsg = 'HTTPS with self-signed certificate!';
    } else {
        server = http.Server(app);
    }

    app.set("trust proxy", true);

    // Cross origin scripting is permitted.
    app.use(cors());
    app.use('/', express.static(webRoot));

    server.listen(options.port, function() {
        logger.log("info",'Listening on port %d', server.address().port);
        logger.log("info","Serving from '" + webRoot + "'.");
    });
}

var argv = minimist(process.argv.slice(2), { 
    boolean: ['https'],
    string: ['port'],
    alias: { s: 'https', p: 'port' }
});

var webRoot = argv._[0];
if(!webRoot) {
   printUsage();
} else {

    var options = {
        https: argv.https,
        port: ((argv.port) ? parseInt(argv.port, 10) : 3000)
    };

    if(argv.https) {
        options.certs = {
            key: fs.readFileSync(path.resolve(__dirname, './certs/server.pem')),
            cert: fs.readFileSync(path.resolve(__dirname, './certs/server.crt')),
        };
    }

    serve(webRoot, options);
}
