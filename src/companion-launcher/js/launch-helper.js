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

const EventEmitter = require('eventemitter3'); //.EventEmitter;

function LaunchHelper(options) {
    if (!(this instanceof LaunchHelper)) {
        return new LaunchHelper(options);
    }
    EventEmitter.call(this);

    const self = this;

    self.options = options;

    self.appName = "HbbTV"; // Name of 2-Immerse unified DMApp.

    const DMAppClientLib = require('DMAppClientLib');
    const DMAppCompLib = require('DMAppCompLib');

    const controller = new DMAppClientLib.DMAppController({
        deviceIdPrefix: "companion",
        deviceIdNamespace: "companion",
        deviceType: "companion",
        communalDevice: false,
        longFormConsoleLogging: true,
        defaultLogLevel: DMAppClientLib.Logger.levels.TRACE,
        networkLogLevel: DMAppClientLib.Logger.levels.TRACE,
        showUserErrorMessageUI: true,
        singleInstance: false
    });

    self.DMAppClientLib = DMAppClientLib;
    self.DMAppCompLib = DMAppCompLib;

    self.controller = controller;
    self.compController = new DMAppCompLib.DMAppComp(controller);
}

// LaunchHelper inherits EventEmitter
LaunchHelper.prototype = new EventEmitter();

LaunchHelper.prototype.Discover = function() {
    const self = this;
    const makeDeviceInfo = function(device) {
        return { 
            device: device,
            join: (deployment, accessToken) => self.Join(device, deployment, accessToken),
            launch: (launchData, callback) => self.Launch(device, launchData, callback),
            stop: (callback) => self.Stop(device, callback)
        };
    };

    //self.inputDocHandler.getDocumentContents().then(function(doc) {
        const opts = {};
        /*if (doc && doc.companionDiscoveryOptions && doc.companionDiscoveryOptions.discoveryFilterConfig) {
            // apply discovery filtering from input document, before performing our own filtering afterwards
            opts.discoveryFilterConfig = doc.companionDiscoveryOptions.discoveryFilterConfig;
        }*/
        const discoveryCtl = self.compController.setupCompanionPlatformSpecificDiscovery(opts);
        if (discoveryCtl) {
            self.discoveryCtl = discoveryCtl;

            const discoveryFilter = new self.DMAppCompLib.DMAppCompDiscoveryFilter(discoveryCtl, {
                needContextId: false,
                deduplicateInstances: true,
                autoStart: false,
            });

            discoveryFilter.on('newDevice', (device) => self.emit('addDevice', makeDeviceInfo(device)));
            discoveryFilter.on('updateDevice', (device) => self.emit('addDevice', makeDeviceInfo(device)));
            discoveryFilter.on('removeDevice', (deviceId) => self.emit('removeDevice', deviceId));

            discoveryFilter.start();

        } else {
            self.controller.logger.error("No discovery module available from setupCompanionPlatformSpecificDiscovery()");
        }
    //});
}

LaunchHelper.prototype.GetAppData = function(device, callback) {
    const self = this;
    const xhr = new XMLHttpRequest();
    xhr.open("GET", device.applicationUrl.replace(/\/$/, "") + "/" + self.appName, true);
    xhr.onload = function() {
        if(xhr.status === 200) {
            // Translate XML elements into JSON properties
            const additionalDataElems = xhr.responseXML.getElementsByTagName("additionalData");
            if(additionalDataElems && additionalDataElems.length) {
                let appData = {};
                for(let i = 0; i < additionalDataElems[0].children.length; ++i) {
                    appData[additionalDataElems[0].children[i].tagName] = additionalDataElems[0].children[i].textContent;
                }
                callback(appData);
            }
        }
        callback(null);
    };
    xhr.onerror = function() {
        callback(null);
    };
    try {
        xhr.send();
    } catch(e) {
        console.warn(e.message);
        callback(null);
    }
    return xhr;
}

LaunchHelper.prototype.Launch = function(device, launchData, callback) {
    const self = this;
    
    // TODO: Query availability of application on TV
    // TODO: Query state of application (stopped, running, installable etc.) on TV

    // Tell DIAL's REST server to launch the HbbTV application
    const xhr = new XMLHttpRequest();
    xhr.onreadystatechange = function() {
        if(xhr.readyState == 4) {
            if(xhr.status == 200 || xhr.status == 201) {
                try {
                    //const response = xhr.responseText; // "OK"
                    callback();
                } catch(error) {
                    console.log(error);
                    callback(error);
                }
            } else {
                // Applicaiton not installed.
                callback(new Error("Application not installed"));
            }
        }
    };
    // cordova-plugin-hbbtv adds a trailing slash to applicationUrl
    xhr.open("POST", device.applicationUrl.replace(/\/$/, "") + "/" + self.appName);
    xhr.setRequestHeader("Content-Type", "text/plain; charset=utf-8");
    try {
        xhr.send(JSON.stringify(launchData));
    } catch(error) {
        console.log(error);
        callback(error);
    }
    return xhr;
}

LaunchHelper.prototype.Stop = function(device, callback) {
    const self = this;

    // Tell DIAL's REST server to stop the HbbTV application
    const xhr = new XMLHttpRequest();
    xhr.onreadystatechange = function() {
        if(xhr.readyState == 4) {
            if(xhr.status == 200) {
                callback();
            } else {
                // Applicaiton not installed.
                callback(new Error("Application not installed"));
            }
        }
    };
    // cordova-plugin-hbbtv adds a trailing slash to applicationUrl
    xhr.open("DELETE", device.applicationUrl.replace(/\/$/, "") + "/" + self.appName + "/run");
    try {
        xhr.send();
    } catch(error) {
        callback(error);
    }
    return xhr;
}

LaunchHelper.prototype.Join = function(device, deployment, accessToken) {
    const self = this;

    self.inputDocHandler = new self.DMAppClientLib.InputDocument.InputDocumentHandler({ 
        inputUrl: deployment.inputDoc.inputDocUrl 
    });

    // Variations from the .apk launcher app
    if (self.options.inputDocVariations) {
        const inputDocVariationsObj = JSON.parse(self.options.inputDocVariations);
        for (let prop in inputDocVariationsObj) {
            self.inputDocHandler.setVariation(prop, inputDocVariationsObj[prop]);
        }
    }

    // Variations defined in the EPG
    if(deployment.inputDoc.variations) {
        for (let prop in deployment.inputDoc.variations) {
            self.inputDocHandler.setVariation(prop, deployment.inputDoc.variations[prop]);
        }
    }

    // Overlay from the .apk launcher app
    if(self.options.inputDocOverlay) {
        const inputDocOverlayObj = JSON.parse(self.options.inputDocOverlay);
        self.inputDocHandler.applyOverlay(inputDocOverlayObj);
    }

    // Overlay from the EPG
    if(deployment.inputDoc.overlay) {
        self.inputDocHandler.applyOverlay(deployment.inputDoc.overlay);
    }

    if (self.options.serviceUrls) {
        self.inputDocHandler.applyOverlay({
            serviceUrls: self.options.serviceUrls
        });
    }

    // Disable automatic joining of first experience discovered and the debug login system
    self.inputDocHandler.applyOverlay({
        "companionDiscoveryOptions": {
            "joinFirst": false
        },
        "localSignalValues": {
            "TestUtilAuthServiceComponentAuthToken": accessToken,
        },
    });

    self.inputDocHandler.executeDocument().then(function(ctx) {
        ctx.compController.joinDevice(device);
    });
};

LaunchHelper.prototype.Destroy = function() {
    const self = this;

    if (self.discoveryCtl) {
        self.discoveryCtl.destroy();
        self.discoveryCtl = null;
    }
};

module.exports = LaunchHelper;
