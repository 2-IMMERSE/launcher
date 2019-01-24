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

let loadConfig = require("./configloader.js");

function URLToArray(url) {
    var request = {};
    var pairs = url.substring(url.indexOf('?') + 1).split('&');
    for (var i = 0; i < pairs.length; i++) {
        if(!pairs[i])
            continue;
        var pair = pairs[i].split('=');
        request[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1]);
     }
     return request;
}

module.exports = function(callback) {
    // If loaded via a cordova app, the server configuration will be available on Javascript's 
    // window object, otherwise it must be specified via Url GET params.
    let serverConfig = window.immerse2_companion_launcher_server_config || URLToArray(location.search);

    // Determine which service URLs to use based on server env configuration
    if('servicePresetsUrl' in serverConfig) {
        
        if(!serverConfig.hasOwnProperty("serverEnv")) {
            serverConfig.serverEnv = "production-nogateway";
            console.warn('No serverEnv specified, defaulting to "production-nogateway"');
        }

        loadConfig(serverConfig.servicePresetsUrl, function(servicePresets) {
            if(servicePresets) {
                serverConfig.serviceUrls = servicePresets[serverConfig.serverEnv];
                // Fixup to ensure origin server doesn't have a trailing slash
                let originServer = serverConfig.serviceUrls.originServer;
                if(originServer.slice(-1) === "/") {
                    serverConfig.serviceUrls.originServer = originServer.substring(0, originServer.length - 1);
                }
                callback(serverConfig);
            } else {
                console.log("Failed to load service presets from: " + serverConfig.servicePresetsUrl);
                callback(null);
            }
        });
    } else {
        console.error('No servicePresetsUrl specified.');
    }
};