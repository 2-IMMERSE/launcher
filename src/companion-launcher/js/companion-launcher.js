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

(function() {
"use strict";

try {
    const DMAppClientLib = require('DMAppClientLib');
    window.jQuery = window.$ = DMAppClientLib.deps.jquery;
    require('bootstrap');
} catch(e) {}

let authClient = null;
let launchHelper = null;
let editorSessions = null;
let discoveredDevices = {};
let userProfile = {};
let selectedlinkedDeviceId = null;
let selectedProgramme = null;
let userProfileReq = null;
let mainDoc = document;
let epg = null;

function getEnvType(serverEnv) {
    let env = "prod";
    if(serverEnv.indexOf("edge") !== -1) {
        env = "edge";
    } else if(serverEnv.indexOf("test") !== -1) {
        env = "test"
    }
    return env;  
}

function isProgLaunchable(serverEnv, prog) {
    let env = getEnvType(serverEnv);
    // Find a deployment that matches the serverEnv for a master device role
    for(let role in prog.deviceRoles) {
        const deviceRole = prog.deviceRoles[role];
        if(deviceRole.master) {
            for(let deployment in deviceRole.deployments) {
                if(deployment.indexOf(env) !== -1) {
                    return true;
                }
            }
        }
    }
    return false;
}

function getDeployment(serverEnv, prog, deviceRole) {
    let env = getEnvType(serverEnv);
    return prog.deviceRoles[deviceRole].deployments[env];    
}

function validateDeviceRoles() {
    // TODO: On launch, we need to validate that sensible device roles have been assigned. 
    //       i.e. that required device roles have been satisfied
    // NOTE: There is a 'required' field defined against each device role in the EPG
    return true;
}

function showLaunchError(error, supplementalErrorContent) {
    if(error) {
        document.querySelector("#error-alert .launch-error-message").textContent = error.message;
        const supplementalElem = document.querySelector("#error-alert > div");
        supplementalElem.innerHTML = (supplementalErrorContent) ? supplementalErrorContent : "";
        $("#error-alert").show();
    }
}

function launchOnDevice(deviceInfo, launchData, callback) {
    // Launch the 2-IMMERSE web-app on the device
    deviceInfo.launch(launchData, function(err) {
        if(err) {
            callback(err);
        } else {
            // We don't give the device sufficient time to register itself with the auth service
            // in the web-app before this app issues a PairDevice(), which resulting in PairDevice() failing. 
            // One option is to wait and try again if failure occurs. A more robust option is
            // to register the device on behalf of the device here. This is safe because a repeated 
            // registration request to the auth-service always returns the same deviceId.
            authClient.RegisterDevice(deviceInfo.device.UDN, function(err) {
                if(err) {
                    callback(err)
                } else {
                    // Grant the TV device an access token using its UDN as a pairing code.
                    // TODO: Need only one of the devices to be the master, the others need to 
                    //       be slaves that join the experience.
                    //       Maybe JOIN/LAUNCH or MASTER/SLAVE is a verb attached to the launch payload?
                    authClient.PairDevice(deviceInfo.device.UDN, deviceInfo.device.friendlyName, callback);
                }
            });
        }
    });
}

function getDeviceRole(prog, udn) {
    if(prog.profileKey in userProfile.communal) {
        const progProfile = userProfile.communal[prog.profileKey];
        if(udn in progProfile) {
            return progProfile[udn];
        }
    }
    return "";
}

function getMasterCommunal(devices, prog) {
    for(let i = 0; i < devices.length; ++i) {
        let deviceInfo = discoveredDevices[devices[i].dataset.linkedDeviceId];
        const role = getDeviceRole(prog, deviceInfo.device.UDN);
        if((role !== "") && (prog.deviceRoles[role].master)) {
            return deviceInfo;
        }
    }
    return null;
}

function launchSlave(deviceInfo, role, masterDeviceInfo, launchData, callback) {
    launchData.master = false;
    launchData.udn =  deviceInfo.device.UDN; // Used as a pairing code with auth-service to help grant device an access token
    launchData.deviceRole = role;
    launchData.device = masterDeviceInfo.device;
    launchOnDevice(deviceInfo, launchData, showLaunchError);
}

function pollContextId(n, deviceInfo, callback) {
    launchHelper.GetAppData(deviceInfo.device, function(appData) {
        if(appData && ("im2:X_2Immerse_ContextId" in appData)) {
            const val = appData["im2:X_2Immerse_ContextId"];
            if(val && val != '') {
                callback();
            } else if(n > 0) {
                window.setTimeout(pollContextId.bind(null, n-1, deviceInfo, callback), 1000);
            } else {
                callback(new Error("Failed to query contextId from master"));
            }
        }
    })
}

function launchMaster(deviceInfo, role, launchData, callback) {
    launchData.master = true;
    launchData.udn =  deviceInfo.device.UDN; // Used as a pairing code with auth-service to help grant device an access token
    launchData.deviceRole = role;
    launchData.device = null;
    let numRetries = 16;
    launchOnDevice(deviceInfo, launchData, function(err) {
        if(!err) {
            pollContextId(numRetries, deviceInfo, callback);
        }
    });
}

function launch(serverConfig, prog) {
    if(!validateDeviceRoles()) {
        showLaunchError(new Error("Validation failed. The following device roles have not been fulfilled."), "");
    } else {

        // The launch message includes EPG fragment describing how to launch the programme
        let launchData = {
            "serverEnv": serverConfig.serverEnv,
            "servicePresetsUrl": serverConfig.servicePresetsUrl,
            "programmeDescription": {
                "titleText": prog.titleText,
                "captionText": prog.captionText,
                "descriptionText": prog.descriptionText,
                "imageUrl": prog.imageUrl
            },
            "master": false
        };

        // Absence of prog.id in programme definitions tells us to ask the DIAL server to advertise all the launch details
        // as opposed to make reference to them by EPG
        if(prog.id) {
            launchData.programmeId = prog.id;
        }

        // Only add launchData from the EPG that's specific to the chosen server environment
        // to the payload to be advertised by the DIAL server.
        let smallDeviceRoles = {};
        let env = getEnvType(serverConfig.serverEnv);
        for(let role in prog.deviceRoles) {
            const deviceRole = prog.deviceRoles[role];
            const smallDeviceRole = {
                "required": deviceRole.required,
                "master": deviceRole.master,
                "deployments": {}
            };
            smallDeviceRole.deployments[env] = deviceRole.deployments[env];
            smallDeviceRoles[role] = smallDeviceRole;
        }
        launchData.programmeDescription.deviceRoles = smallDeviceRoles;

        // Launch prog on all linked devices, starting with the master communal device.
        const devices = document.querySelectorAll("#deviceList div[data-linked-device-id]");
        const masterDeviceInfo = getMasterCommunal(devices, prog);
        if(masterDeviceInfo) {
            const role = getDeviceRole(prog, masterDeviceInfo.device.UDN);
            launchMaster(masterDeviceInfo, role, launchData, function(err) {
                if(err) {
                    showLaunchError(err, "");
                } else {
                    for(let i = 0; i < devices.length; ++i) {
                        let deviceInfo = discoveredDevices[devices[i].dataset.linkedDeviceId];
                        if(deviceInfo && (deviceInfo.device.UDN !== masterDeviceInfo.device.UDN)) {
                            const role = getDeviceRole(prog, deviceInfo.device.UDN);
                            if(role !== "") {
                                launchSlave(deviceInfo, role, masterDeviceInfo, launchData, showLaunchError);
                            }
                        }
                    } // Next device
                }
            });

            // Goto JOIN tab
            $('#join-tab').tab('show');
            setPageState("state-discover");
            selectedProgramme = null;
        } // no master device
    }
}

function unpairSelectedDevice() {
    authClient.UnpairDevice(selectedlinkedDeviceId, function(success) {
        const errorMessage = document.querySelector('#unpairDeviceModal .error-message');
        if(success) {
            delete errorMessage.dataset.tryAgain;
            $('#unpairDeviceModal').modal('hide');
            updateLinkedDeviceList();            
        } else {
            errorMessage.dataset.tryAgain = "true";
        }
    });
}

function createLaunchListItem(deviceInfo, deviceRoles, serverEnv, progProfile, onChange) {
    const template = document.querySelector('template#device-roles-template');
    const clone = template.content.cloneNode(true);
    clone.firstElementChild.setAttribute("data-linked-device-id", deviceInfo.device.UDN);
    const friendlyDeviceNameSpan = clone.querySelector(".linked-device-name");
    friendlyDeviceNameSpan.textContent = deviceInfo.device.friendlyName;
    const deviceIdSpan = clone.querySelector(".linked-device-id");
    deviceIdSpan.textContent = deviceInfo.device.UDN;
    const selectElem = clone.querySelector('.custom-select');
    selectElem.selectedIndex = 0;

    let env = getEnvType(serverEnv);

    // Populate the SELECT combo boxes with available device roles for the programme
    for(let role in deviceRoles) {
        const deviceRole = deviceRoles[role];
        for(let deployment in deviceRole.deployments) {
            if(deployment.indexOf(env) !== -1 && !deviceRole.companionOnly) {
                const optionElem = document.createElement("option");
                optionElem.value = optionElem.textContent = role;
                // Set current selection based on value stored in the profile.
                if(progProfile && (deviceInfo.device.UDN in progProfile)) {
                    if(progProfile[deviceInfo.device.UDN] === role) {
                        optionElem.setAttribute('selected', true);
                    }
                }
                selectElem.appendChild(optionElem);
            }
        }
    }
    selectElem.addEventListener('change', onChange);
    return clone;
}

function updateLaunchConfig(prog, serverEnv) {
    // If an update is already pending, don't issue another.
    if(userProfileReq) {
        // ...unless user is viewing a different programm
        if(selectedProgramme !== prog) {
            userProfileReq.abort();
            userProfileReq = null;
        } else {
            return;
        }
    }
    
    const listGroup = document.querySelector("#deviceList .list-group");
    listGroup.innerHTML = "";

    // Read user profile for pre-configured device role assignments
    userProfileReq = authClient.GetUserProfile(function(profile) {
        userProfileReq = null;
        if(profile) {
            userProfile = profile;

            // Auth service addes 'communal', but sets it to null for new users.
            if(userProfile.communal === null) {
                userProfile.communal = {};
            }
            //delete userProfile.communal[prog.profileKey];
            const progProfile = userProfile.communal[prog.profileKey];
            for(let udn in discoveredDevices) {
                let deviceInfo = discoveredDevices[udn];

                let onDeviceRoleChangedCallback = function(event) {
                    if(!(prog.profileKey in userProfile.communal)) {
                        // Not seen this device before, initialise device's profile with empty entry.
                        userProfile.communal[prog.profileKey] = {};
                    }
                    userProfile.communal[prog.profileKey][deviceInfo.device.UDN] = event.target.value;
                    authClient.PatchUserProfile(userProfile, function(success) {
                        if(!success) {
                            console.warn("Failed to update device role in user profile.");
                        } else {
                            console.log("Changing profile: userProfile.communal['" + prog.profileKey + "']['"+ deviceInfo.device.UDN + "'] = \"" + event.target.value + "\"");
                        }
                    });
                };
                const listItem = createLaunchListItem(deviceInfo, prog.deviceRoles, serverEnv, progProfile, onDeviceRoleChangedCallback);
                listGroup.appendChild(listItem);
            }
        }
    });
}

function showLaunchConfig(prog, serverEnv) {
    document.querySelector('.launch-config-title').textContent = prog.titleText;
    document.querySelector('#deviceList .card-text').textContent = prog.captionText;
    selectedProgramme = prog;
    setPageState("state-device-manager");
    updateLaunchConfig(prog, serverEnv);
}

function createProgrammeListItem(prog, serverEnv, sessionId) {
    // Filter list of programmes according to ones we can deploy using the currently configured
    // server environment.
    if(!isProgLaunchable(serverEnv, prog)) {
        console.error("No suitable launch details found in EPG for '" + prog.titleText + "' using environment '" + serverConfig.serverEnv + "'.");
    } else {
        const template = document.querySelector('template#editor-session-template');
        const clone = template.content.cloneNode(true);
        if(sessionId) {
            clone.firstElementChild.setAttribute("data-session-id", sessionId);
        }
        const dmappNameSpan = clone.querySelector(".dmapp-name");
        dmappNameSpan.textContent = prog.titleText;
        const dmappJoinTextSpan = clone.querySelector(".card-text");
        dmappJoinTextSpan.textContent = prog.captionText;
        const detailsTextSpan = clone.querySelector(".card-details");
        detailsTextSpan.textContent = prog.descriptionText;
        const img = clone.querySelector(".card-img-top");
        img.src = prog.imageUrl;
        clone.firstElementChild.addEventListener('click', (e) => {
            showLaunchConfig(prog, serverEnv);
        });
        return clone;
    }
    return null;
}

function updateLaunchList(serverConfig, progs) {
    const inputGroup = document.querySelector('#launchList .list-group');
    inputGroup.innerHTML = "";
    for(let i = 0; i < progs.length; ++i) {
        const listItem = createProgrammeListItem(progs[i], serverConfig.serverEnv);
        if(listItem) {
            inputGroup.appendChild(listItem);
        }
    }
}

function updateLinkedDeviceList() {
    const listGroup = document.querySelector('#pairList .list-group');
    listGroup.innerHTML = "";

    authClient.GetLinkedDevices(function(devices) {
        if(devices) {
            var numPairedDevicesBadge = document.getElementById('numPairedDevices');
            numPairedDevicesBadge.textContent = devices.length;
            for(var i = 0; i < devices.length; ++i) {

                var deviceId = devices[i].id;
                var friendlyDeviceName = devices[i].aux.friendlyDeviceName;

                const template = document.querySelector('template#linked-device-template');
                const clone = template.content.cloneNode(true);
                clone.firstElementChild.setAttribute("data-linked-device-id", deviceId);
                const idSelector = "div[data-linked-device-id='" + deviceId + "']";
                const friendlyDeviceNameSpan = clone.querySelector(idSelector + " .linked-device-name");
                friendlyDeviceNameSpan.textContent = friendlyDeviceName;
                const deviceIdSpan = clone.querySelector(idSelector + " .linked-device-id");
                deviceIdSpan.textContent = deviceId;
                const unpairImage = clone.querySelector(idSelector + " img");
                unpairImage.setAttribute("data-linked-device-id", deviceId);
                listGroup.appendChild(clone);
            }
        }
    });
}

function getProgrammeDescription(id) {
    // Lookup description in EPG
    for(let i = 0; i < epg.length; ++i) {
        if(epg[i].id === id) {
            return epg[i];
        }
    }
    return null;
}

function addRunningProgramme(deviceInfo, serverEnv) {
    const inputGroup = document.querySelector('#joinList .list-group');
    const deviceIdSelector = "div[data-device-id='" + deviceInfo.device.UDN + "']";
    const deviceElem = inputGroup.querySelector(deviceIdSelector + ".list-group-item");
    if(deviceElem) {
        inputGroup.removeChild(deviceElem);
    }

    // Ignore devices that aren't running the 2-Immerse app
    if(deviceInfo.device.state === "stopped") {
        return;
    } 

    const discoveredExperienceTemplate = document.querySelector('template#discovered-experience-template');

    // Get info about programme running on the device from the DIAL server.
    deviceInfo.pendingRequest = launchHelper.GetAppData(deviceInfo.device, function(appData) {
        if(appData && ("im2:X_2Immerse_LaunchData" in appData) && deviceInfo.device.contextId) {
            const ld = appData["im2:X_2Immerse_LaunchData"];
            if(ld) { // Protect against legacy server-tvemu versions
                const launchData = JSON.parse(decodeURIComponent(ld));
                // Only add programmes that can be launched on the currently set server environment
                // and only add programmes advertised by the master device 
                if((launchData.serverEnv === serverEnv) && (launchData.master === true)) {

                    // Support complete launch descriptions and programmeId lookups
                    // Complete launch descriptions are still used for live editor sessions ATM.
                    const programmeDescription = (launchData.programmeId) ? getProgrammeDescription(launchData.programmeId) : launchData.programmeDescription;
                    if(programmeDescription) {

                        const clone = discoveredExperienceTemplate.content.cloneNode(true);
                        clone.firstElementChild.setAttribute("data-device-id", deviceInfo.device.UDN);
                        const joinButton = clone.querySelector(deviceIdSelector + " button.join");

                        // Populate the SELECT combo boxes with available device roles for the programme
                        const selectElem = clone.querySelector(deviceIdSelector + " .custom-select");
                        selectElem.selectedIndex = 0;
                        const env = getEnvType(serverEnv);
                        const deviceRoles = programmeDescription.deviceRoles;
                        for(let role in deviceRoles) {
                            const deviceRole = deviceRoles[role];
                            for(let deployment in deviceRole.deployments) {
                                if(deployment.indexOf(env) !== -1 && !deviceRole.tvOnly) {
                                    const optionElem = document.createElement("option");
                                    optionElem.value = optionElem.textContent = role;
                                    if(role === "Companion") {
                                        // If the "Companion" role is available, set it by default.
                                        optionElem.setAttribute('selected', true);
                                    }
                                    selectElem.appendChild(optionElem);
                                }
                            }
                        }

                        joinButton.addEventListener('click', () => {
                            setPageState("state-launch");
                            const deployment = getDeployment(serverEnv, programmeDescription, selectElem.value);
                            deviceInfo.join(deployment, authClient.accessToken);
                            stopDiscovery();
                        });

                        const closeButton = clone.querySelector(deviceIdSelector + " button.stop");
                        closeButton.addEventListener('click', () => deviceInfo.stop(()=>{}));

                        const ipAddrSpan = clone.querySelector(deviceIdSelector + " .ip-addr");
                        const ipAddr = deviceInfo.device.ciiSyncUrl.match(/ws:\/\/(\d+(\.\d+)+)/i);
                        ipAddrSpan.textContent = ipAddr[1];

                        const dmappNameSpan = clone.querySelector(deviceIdSelector + " .dmapp-name");
                        dmappNameSpan.textContent = programmeDescription.titleText;

                        const dmappJoinTextSpan = clone.querySelector(deviceIdSelector + " .card-text");
                        dmappJoinTextSpan.textContent = programmeDescription.captionText;

                        const img = clone.querySelector(deviceIdSelector + " .card-img-top");
                        img.src = programmeDescription.imageUrl;

                        inputGroup.appendChild(clone);
                    }
                }
            }
        }
    });
}

function removeRunningProgramme(deviceInfo) {
    const inputGroup = document.querySelector('#joinList .list-group');
    const deviceElem = inputGroup.querySelector("div[data-device-id='" + deviceInfo.device.UDN + "'].list-group-item");
    if(deviceElem) {
        inputGroup.removeChild(deviceElem);
    }
}

function addDevice(deviceInfo, serverEnv) {
    // Changing internet connection causes peer-dial to report the same DIAL device multiple times with
    // different IP addresses in the app2app, descriptionUrl and applicationUrl properties.
    // TODO: Investigate further

    // A second 'addDevice' must cancel any pending async request.
    const oldDeviceInfo = discoveredDevices[deviceInfo.device.UDN];
    if(oldDeviceInfo && oldDeviceInfo.pendingRequest) {
        oldDeviceInfo.pendingRequest.abort();
        oldDeviceInfo.pendingRequest = null;
    }
    // Update with new deviceInfo
    discoveredDevices[deviceInfo.device.UDN] = deviceInfo;

    // Query for whether a programme is running on this device and display in the UI
    addRunningProgramme(deviceInfo, serverEnv);

    // A valid selectedProgramme means the app is displaying that programme's launch configuration.
    // Update available devices displayed there.
    if(selectedProgramme) {
        updateLaunchConfig(selectedProgramme, serverEnv);
    }
}

function removeDevice(deviceInfo, serverEnv) {
    if(deviceInfo.pendingRequest) {
        deviceInfo.pendingRequest.abort();
        deviceInfo.pendingRequest = null;
    }
    removeRunningProgramme(deviceInfo);
    delete discoveredDevices[deviceInfo.device.UDN];
    if(selectedProgramme) {
        updateLaunchConfig(selectedProgramme, serverEnv);
    }
}

function getDeviceInfoById(deviceId) {
    for(let udn in discoveredDevices) {
        const deviceInfo = discoveredDevices[udn];
        if(deviceInfo.id === deviceId) {
            return deviceInfo;
        }
    }
    return null;
}

function startDiscovery(serverConfig) {
    const launchConfig = {
        serviceUrls: serverConfig.serviceUrls,
        /*authServiceUrl: serverConfig.serviceUrls.authService,
        editorServiceUrl: serverConfig.serviceUrls.editorService,*/
        serverEnv: serverConfig.serverEnv,
        // Options from the unified application launcher .apk
        inputDocOverlay: (serverConfig.inputDocOverlay) ? serverConfig.inputDocOverlay : "",
        inputDocVariations: (serverConfig.inputDocVariations) ? serverConfig.inputDocVariations : ""
    };

    const LaunchHelper = require("./launch-helper.js");
    launchHelper = new LaunchHelper(launchConfig);

    launchHelper.on('addDevice', function(deviceInfo) {
        addDevice(deviceInfo, serverConfig.serverEnv);
    });

    launchHelper.on('removeDevice', function(deviceId) {
        const deviceInfo = getDeviceInfoById(deviceId);
        if(deviceInfo) {
            removeDevice(deviceInfo, serverConfig.serverEnv);
        }
    });

    const EditorSessions = require("./editor-sessions.js");
    editorSessions = new EditorSessions(launchConfig);

    editorSessions.on('onsessions', function(sessions) {
        const inputGroup = document.querySelector('#launchList .list-group');

        // Cleanup editor sessions that have ended.
        const elems = inputGroup.querySelectorAll("div[data-session-id]");
        for(var i = 0; i < elems.length; ++i) {
            var found = false;
            for(var j = 0; j < sessions.length; ++j) {
                if(elems[i].dataset.sessionId === sessions[j].id) {
                    found = true;
                    break;
                }
            }
            if(!found) {
                inputGroup.removeChild(elems[i]);
            }
        }
        for(var j = 0; j < sessions.length; ++j) {
            var found = false;
            for(var i = 0; i < elems.length; ++i) {
                if(elems[i].dataset.sessionId === sessions[j].id) {
                    found = true;
                    break;
                }
            }
            if(!found) {

                let env = "/";
                if(serverConfig.serverEnv.indexOf("edge") !== -1) {
                    env = "/deployment/edge/";
                } else if(serverConfig.serverEnv.indexOf("test") !== -1) {
                    env = "/deployment/test/"
                }

                // All editor sessions are football sessions (at the moment).
                // TODO: A completed programme description conforming to the JSON schema should
                //       come from the editor service, as opposed to constructing one here.
                let prog = {
                    "profileKey": "live_session_1_0_0",
                    "titleText": "Current Live Session",
                    "captionText": "Join the live session.",
                    "descriptionText": sessions[j].description,
                    "imageUrl": serverConfig.serviceUrls.originServer + "/unified-launcher/epg/images/live.svg",
                    "deviceRoles": {
                        "Primary Communal": {
                            "required": true,
                            "master": true,
                            "deployments": {}                            
                        },
                        "Companion": {
                            "required": false,
                            "deployments": {}                            
                        },
                    }
                };
                const envType = getEnvType(serverConfig.serverEnv);
                prog.deviceRoles["Primary Communal"].deployments[envType] = {
                    "inputDoc": {
                        "inputDocUrl": serverConfig.serviceUrls.editorService + "/api/v1/document/" + sessions[j].id + "/viewer/client.json?mode=tv"
                    }
                };

                // IBC workaround for the lack of property to differentiate between programme types
                let ibcProgrammeType = "football";
                if(sessions[j].description && sessions[j].description.indexOf("motogp") !== -1) {
                    ibcProgrammeType = "motogp";
                }

                prog.deviceRoles["Companion"].deployments[envType] = {
                    "inputDoc": {
                        "inputDocUrl": serverConfig.serviceUrls.originServer + env + "dmapps/" + ibcProgrammeType + "/companion-client.json"
                    }
                };

                const clonedItem = createProgrammeListItem(prog, serverConfig.serverEnv, sessions[j].id);
                if(clonedItem) {
                    inputGroup.appendChild(clonedItem);
                }
            }
        }
    });

    setPageState("state-discover");

    launchHelper.Discover();
    editorSessions.Discover();
}

function stopDiscovery() {
    if (launchHelper) {
        launchHelper.Destroy();
        launchHelper = null;
    }
    if(editorSessions) {
        editorSessions.Destroy();
        editorSessions = null;
    }
}

function initDialogListeners(serverConfig) {

    $('#pairDeviceModal').on('show.bs.modal', function(e) {
        // Clears password box when modal box is opened
        const deviceIdInput = document.getElementById('deviceIdInput');
        deviceIdInput.value = "";
        const deviceNameInput = document.getElementById('deviceNameInput');
        deviceNameInput.value = "";
    });

    const unpairButton = document.querySelector("#unpairDeviceModal button[type=submit]");
    unpairButton.addEventListener('click', unpairSelectedDevice);

    document.getElementById('launchButton').addEventListener('click', function() {
        launch(serverConfig, selectedProgramme);
    });


    // When the user selects a device to unpair, capture the deviceId in question
    $('#unpairDeviceModal').on('show.bs.modal', function(e) {
        if(typeof e.relatedTarget.dataset.linkedDeviceId !== "undefined") {
            selectedlinkedDeviceId = e.relatedTarget.dataset.linkedDeviceId;
        } else {
            selectedlinkedDeviceId = null;
        }
    });

    var backArrow = document.querySelector(".back-arrow");
    backArrow.addEventListener('click', () => {
        setPageState("state-discover");
        selectedProgramme = null;
    });

    window.submitLogin = function() {
        const usernameInput = document.getElementById('userNameInput');
        const passwordInput = document.getElementById('passwordInput');
        const rememberMe = document.querySelector("#remember input").checked;

        // Remove accidental leading/trailing whitespace from username and password.
        const usernameInputValue = usernameInput.value.trim();
        const passwordInputValue = passwordInput.value.trim();

        authClient.Login(usernameInputValue, passwordInputValue, rememberMe, function(userDetails) {
            const errorMsg = document.querySelector('.state-login .error-message');
            if(userDetails) { // Successful login!
                updateAccountDisplay(userDetails);
                updateLinkedDeviceList();
                delete errorMsg.dataset.tryAgain;
                startDiscovery(serverConfig);
            } else {
                // Ask the user to retry
                errorMsg.dataset.tryAgain = "true";
            }
        });

        event.preventDefault();
        return false;   // Override normal form submission
    };

    // Invoked when user logs out using the logout modal
    window.submitLogout = function() {
        logout();
        event.preventDefault();
        return false;   // Override normal form submission
    };

    window.submitPairingCode = function() {
        const errorMsg = document.querySelector('#pairDeviceModal .error-message');
        const deviceIdInput = document.getElementById('deviceIdInput');
        const deviceNameInput = document.getElementById('deviceNameInput');
        var friendlyDeviceName = deviceNameInput.value;
        if(friendlyDeviceName == "") {
            // TODO: Generate unique friendly name
            friendlyDeviceName = "2-ImmerseTV";
        }
        authClient.PairDevice(deviceIdInput.value, friendlyDeviceName, function(success) {
            if(success) {
                delete errorMsg.dataset.tryAgain;
                $('#pairDeviceModal').modal('hide');
                updateLinkedDeviceList();
            } else {
                errorMsg.dataset.tryAgain = "true";
            }
        });
        event.preventDefault();
        return false;   // Override normal form submission
    };
}

function closeModalDialogs() {
    // Hide any modal dialog boxes that might still be open
    try {
        $('#signOutModal').modal('hide');
        $('#unpairDeviceModal').modal('hide');
        $('#pairDeviceModal').modal('hide');
    } catch(e) {
        // There is a timing problem with hiding the signOutModal
        // If it is already being closed by bootstrap, bootstrap 
        // will raise an exception with the message "Modal is transitioning"
    }
}

// Handles cleanup after manual logout or credentials have expired.
function logout() {
    closeModalDialogs();

    // Reset 'try again' message
    const errorMsg = document.querySelector('#pairDeviceModal .error-message');
    delete errorMsg.dataset.tryAgain;

    authClient.Logout();
    // Prompt user to sign in
    setPageState("state-login");
    stopDiscovery();
}

function setPageState(state) {
    const stateElem = document.querySelector('*[data-state]');
    stateElem.dataset.state = state;
}

function updateAccountDisplay(accountInfo) {
    // All fields in accountInfo are optional (as returned from the auth server), so need checking.
    var displayName = "";
    if(accountInfo.display_name) {
        displayName = accountInfo.display_name;
    } else {
        if(accountInfo.first_name) {
            displayName = accountInfo.first_name + " ";
        }
        if(accountInfo.last_name) {
            displayName += accountInfo.last_name;
        }
    }
    var emailAddr = (accountInfo.email) ? accountInfo.email : "";
    document.querySelector(".user-name").textContent = displayName;
    document.querySelector(".email-addr").textContent = emailAddr;
}

function updateAppInfo(serverConfig) {
    document.getElementById('server-env').textContent = serverConfig.serverEnv;
    document.getElementById('epg').textContent = serverConfig.epgUrl;
    document.getElementById('service-presets-url').textContent = serverConfig.servicePresetsUrl;
}

function loadEPG(originServerUrl, epgUrl, callback) {
    let loadConfig = require("./configloader.js");
    loadConfig(epgUrl, function(epg) {
        if(epg) {
            // Apply origin server prefix Url to paths defined in the EPG
            for(let i = 0; i < epg.programmes.length; ++i) {
                let prog = epg.programmes[i];
                prog.imageUrl = originServerUrl + prog.imageUrl;
                for (let role in prog.deviceRoles) {
                    const deployments = prog.deviceRoles[role].deployments;
                    for(let key in deployments) {
                        const d = deployments[key];
                        if(d.inputDoc) {
                            d.inputDoc.inputDocUrl = originServerUrl + d.inputDoc.inputDocUrl;
                        } else if(d.serviceInput) {
                            d.serviceInput.layoutDoc = originServerUrl + d.serviceInput.layoutDoc;
                            d.serviceInput.timelineDoc = originServerUrl + d.serviceInput.timelineDoc;
                        }
                    }
                }
            }
            callback(epg.programmes);
        } else {
            console.error("Unable to load EPG from '" + epgUrl + "'.");
        }
    });
}

function initApplication() {
    const loadServerConfig = require("./serverconfig.js")
    loadServerConfig(function(serverConfig) {
        if(serverConfig) {
            loadEPG(serverConfig.serviceUrls.originServer, serverConfig.epgUrl, function(progs) {
                epg = progs;
                updateLaunchList(serverConfig, progs);
                updateAppInfo(serverConfig);
                initDialogListeners(serverConfig);

                // Check if browser has remembered previous login
                const AuthClient = require("./authclient.js");
                authClient = new AuthClient(serverConfig.serviceUrls.authService, logout);
                authClient.CheckAccessToken(function(userDetails) {
                    if(userDetails) {
                        updateAccountDisplay(userDetails);
                        updateLinkedDeviceList();
                        startDiscovery(serverConfig);
                    } else {
                        // Prompt user to sign in
                        setPageState("state-login");
                    }
                });
            });
        }
    });
}

window.setTimeout(initApplication, 100);

})();