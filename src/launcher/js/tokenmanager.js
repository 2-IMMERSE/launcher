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

let EventEmitter = require('eventemitter3');

function TokenManager(launchData) {
    if (!(this instanceof TokenManager)) {
        return new TokenManager();
    }
    EventEmitter.call(this);

    let self = this;
    const udn = launchData.udn;

    const loadServicePresets = function(presetsUrl, callback) {
        try {
            let servicePresetRequest = new XMLHttpRequest();
            servicePresetRequest.open("GET", launchData.servicePresetsUrl, true);
            servicePresetRequest.responseType = "json";
            servicePresetRequest.onload = function() {
                let status = servicePresetRequest.status;
                if(status === 200) {
                    callback(servicePresetRequest.response);
                } else {
                    callback(null);
                }
            };
            servicePresetRequest.send();
        } catch(e) {
            console.log(e);
        }
    };

    let deviceIdRequest = new XMLHttpRequest();
    let authTokenRequest = new XMLHttpRequest();
    let deviceId;
    let requestDeviceIdTimer = null;
    let requestAuthTokenTimer = null;
    let servicePresets = null;
    
    const requestDeviceId = function(delay) {
        if(requestDeviceIdTimer === null) {
            requestDeviceIdTimer = window.setTimeout(getDeviceId, delay);
        }
    };

    const getDeviceId = function() {
        requestDeviceIdTimer = null;
        try {
            deviceIdRequest.open("POST", servicePresets.authService + "/devices", true);
            deviceIdRequest.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
            deviceIdRequest.send(JSON.stringify({ "type" : "communal", "code": udn }));
        } catch(e) {
            console.log(e);
            requestDeviceId(2000);
        }
    };

    const requestAuthToken = function(delay) {
        if(requestAuthTokenTimer === null) {
            requestAuthTokenTimer = window.setTimeout(getAuthToken, delay);
        }
    };

    const getAuthToken = function() {
        requestAuthTokenTimer = null;
        try {
            authTokenRequest.open("GET", servicePresets.authService + "/devices/" + deviceId, true);
            authTokenRequest.send();
        } catch(e) {
            console.log(e);
            requestAuthToken(2000);
        }
    };

    deviceIdRequest.onerror = function() {
        requestDeviceId(2000);
    };

    deviceIdRequest.onreadystatechange = function() {
        if (this.readyState == 4) {
            if(this.status == 201) {
                let data = JSON.parse(this.response);
                let deviceCode = data.code;
                deviceId = data.id;
                
                //emits the device ID so the screen can be updated
                self.emit('deviceIdChanged', { deviceId: deviceCode });
           
                requestAuthToken();

            } else if(this.status === 0) {
                // Network failure, try again.
                requestDeviceId(2000);
            }
        }
    };

    authTokenRequest.onerror = function() {
        requestAuthToken(2000);
    };
    
    authTokenRequest.onreadystatechange = function() {
        if (this.readyState == 4) {
            if(this.status == 200) {
                const response = JSON.parse(this.responseText);
                self.emit('accessToken', { 
                    accessToken: response.access_token,
                    deviceId: deviceId,
                    auxiliaryData: response.aux,
                    servicePresets: servicePresets
                });
            } else if (this.status == 204) {
                requestAuthToken(2000);
            } else if (this.status == 404) {
                requestDeviceId(0);
            } else if(this.status === 0) {
                // Network failure, try again.
                requestAuthToken(2000);
            }
        }
    };

    // Determine which auth service URL to use based on server env configuration
    if('servicePresetsUrl' in launchData) {
        loadServicePresets(launchData.servicePresetsUrl, function(presetUrls) {
            if(presetUrls) {
                servicePresets = presetUrls[launchData.serverEnv];
                requestDeviceId(0);
            } else {
                console.log("Failed to load service presets from: " + launchData.servicePresetsUrl)
            }
        });
    }
}


// TokenManager inherits EventEmitter
TokenManager.prototype = new EventEmitter();

// self.emit('myevent', { mykey: myvalue, anotherkey: anothervalue }

module.exports = TokenManager; //export default TokenManager;
