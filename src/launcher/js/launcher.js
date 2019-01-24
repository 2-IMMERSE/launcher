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

// launcher.js
import TokenManager from "./tokenmanager.js";
import NotificationClient from "./notification-client.js";

(function(window, document){
"use strict";

try {
  require('bootstrap');
} catch(e){}

function initFirmwareNotifications(config) {
    const notificationClient = new NotificationClient(config);

    notificationClient.on('connection', function(peerId) {
        console.log('Connected to notification client.');
    });

    notificationClient.on('pending', function(connectionInfo) {
        var bodyElem = document.getElementsByTagName('body')[0];
        bodyElem.dataset.state = "pending";
    });

    notificationClient.on('netup', function(connectionInfo) {
        var bodyElem = document.getElementsByTagName('body')[0];
        bodyElem.dataset.state = "netup";
    });

    notificationClient.on('netdown', function() {
        location.href="http://localhost:3000/device";
    });

    notificationClient.on('netchange', function(state) {

        var wifiStatusElem = document.querySelector(".wifi-status");
        var wifiIpAddrElem = document.getElementById('ip-addr-wifi');
        if(state.wifiInfo === null) {
            wifiStatusElem.style.display = "none";
            wifiIpAddrElem.textContent = "";
        } else {
            wifiStatusElem.style.display = "block";
            wifiIpAddrElem.textContent = state.wifiInfo.ip_addr;
        }

        var wiredStatusElem = document.querySelector(".wired-status");
        var wiredIpAddrElem = document.getElementById("ip-addr-wired");
        if(state.wiredInfo === null) {
            wiredStatusElem.style.display = "none";
            wiredIpAddrElem.textContent = "";
        } else {
            wiredStatusElem.style.display = "block";
            wiredIpAddrElem.textContent = state.wiredInfo.ip_addr;
        }
    });

    notificationClient.on('href', function(url) {
        location.href = url;
    });

    notificationClient.on('error', (err) => {
        console.log('Error: ', err);
    });

    notificationClient.on('apName', (friendlyName) => {
        document.querySelector('.friendly-name').textContent = friendlyName;
    });
}

function initDisplayClock() {
    const timeLabels = document.getElementsByClassName("time"); 
    const updateTime = function() {
        var date = new Date();
        if((date.getMonth().toString().length + 1) == 1){
            var dateString = date.getDate() + "/0" + (date.getMonth()+1) + "/" + date.getFullYear();
        } else{
            var dateString = date.getDate() + "/" + (date.getMonth()+1) + "/" + date.getFullYear();
        }
        if(date.getMinutes().toString().length === 1){
            var time = date.getHours() + ":0" + date.getMinutes();
        } else{
            var time = date.getHours() + ":" + date.getMinutes();
        }
        if(date.getSeconds().toString().length === 1){
            time = time + ":0" + date.getSeconds();
        } else {
            time = time + ":" + date.getSeconds();
        }
        for(let i = 0; i < timeLabels.length; i++){
            timeLabels[i].textContent = dateString + "  •  " + time + " ";
        }
    }//fn update time

    updateTime();
    window.setInterval(updateTime, 1000);
}

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

// Post additionalData back to DIAL server
function updateDIALAdditionalData(additionalDataUrl, additionalData, callback) {
    const self = this;
    const xhr = new XMLHttpRequest();
    xhr.onreadystatechange = function() {
        if(xhr.readyState == 4) {
            if(xhr.status == 200) {
                callback(true);
            } else {
                // This REST call is implemented, despite peer-dial returning http status code 501 (Not Implemented)
                callback(false);
            }
        }
    };
    xhr.open("POST", additionalDataUrl, true);
    xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
    try {
        xhr.send("launchData=" + encodeURIComponent(JSON.stringify(additionalData)));
    } catch(e) {
        console.log(e);
        callback(false);
    }
    return xhr;
}

function getEnvType(serverEnv) {
    let env = "prod";
    if(serverEnv.indexOf("edge") !== -1) {
        env = "edge";
    } else if(serverEnv.indexOf("test") !== -1) {
        env = "test"
    }
    return env;  
}

function getDeployment(launchData) {
    let env = getEnvType(launchData.serverEnv);
    return launchData.programmeDescription.deviceRoles[launchData.deviceRole].deployments[env];    
}

function launch(launchData, additionalDataUrl, details) {
    const DMAppClientLib = require('DMAppClientLib');
    const deployment = getDeployment(launchData);
    const variations = deployment.inputDoc.variations;
    const overlay = deployment.inputDoc.overlay;

    const inputDoc = new DMAppClientLib.InputDocument.InputDocumentHandler({ inputUrl: deployment.inputDoc.inputDocUrl });
    if(launchData.master) {
        inputDoc.applyOverlay({
            "controllerOptions": {
                "setDeviceId": launchData.udn, //details.deviceId, // Don't use device ID assigned by Auth service, use UDN given to us by DIAL
            }
        });
    } else {
        inputDoc.applyOverlay({
            "companionDiscoveryOptions": {
                "joinFirst": false
            }
        });
    }
    inputDoc.applyOverlay({
        "localSignalValues": {
            "TestUtilAuthServiceComponentAuthToken": details.accessToken,
        },
    });
    if (overlay) {
        inputDoc.applyOverlay(overlay);
    }
    if (variations) {
        for (let prop in variations) {
            inputDoc.setVariation(prop, variations[prop]);
        }
    }
    if(details.servicePresets) {
        inputDoc.applyOverlay({
            serviceUrls: details.servicePresets,
        });
    }
    document.getElementById("welcome-screen").classList.remove("visible");
    document.getElementById("spinner").classList.add("visible");
    inputDoc.executeDocument().then(function(ctx) {
        if(launchData.master) {
            // Omit extensive device-roles and launch configuration params.
            // The companion device can look those up again from the EPG using the programmeId
            const advertisedLaunchData = {
                "serverEnv": launchData.serverEnv,
                "servicePresetsUrl": launchData.servicePresetsUrl,
                "master": true
            };

            // Only advertise programmeId if defined in the launchData, otherwise advertise
            // complete launch data. 
            if(launchData.programmeId) {
                advertisedLaunchData.programmeId = launchData.programmeId;
            } else {
                advertisedLaunchData.programmeDescription = launchData.programmeDescription;
            }

            // TODO: We should POST contextId to DIAL server using this mechanism too.
            updateDIALAdditionalData(additionalDataUrl, advertisedLaunchData, function(success) {
                document.getElementById("spinner").classList.remove("visible");
            });
        } else {
            ctx.compController.joinDevice(launchData.device);
        }
    });
}//fn launch


initDisplayClock();

initFirmwareNotifications({
    host: "localhost",
    port: 3000,
    path: '/', // location on the website where REST API is hosted/mounted
    secure: false, // Requires https?
});

const request = URLToArray(location.search);
if(request.launchData) {
    const launchData = JSON.parse(request.launchData);
    // Token manager obtains us an access token to use the 2-IMMERSE services
    const tokenManager = new TokenManager(launchData);
    tokenManager.on('accessToken', launch.bind(null, launchData, request.additionalDataUrl));
}

document.addEventListener('WebComponentsReady', function() {
    if(request.launchData) {
        document.getElementsByTagName('body')[0].classList.add("no-background");
    } else {
        document.getElementById("welcome-screen").classList.add("visible");
    }
    document.getElementById("spinner").classList.remove("visible");
});

})(window, document);