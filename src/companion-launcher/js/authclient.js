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

const EventEmitter = require('eventemitter3');

function AuthClient(authServiceUrl, expiryHandler) {
    if (!(this instanceof AuthClient)) {
        return new AuthClient(authServiceUrl);
    }
    EventEmitter.call(this);

    const self = this;

    self.authServiceUrl = authServiceUrl;
    self.accessToken = null;
    self.expiryHandler = expiryHandler;

    self._getJSON = function(url, callback) {
        const xhr = new XMLHttpRequest();
        xhr.onreadystatechange = function() {
            if(xhr.readyState == 4) {
                if(xhr.status == 200) {
                    callback(JSON.parse(xhr.responseText));
                } else if(xhr.status == 403) {
                    self.Logout();
                    self.expiryHandler();
                } else {
                    callback(null);
                }
            }
        };
        xhr.open("GET", url);
        xhr.setRequestHeader("Content-Type", "application/json");
        xhr.setRequestHeader("Authorization", self.accessToken);
        try {
            // On Android/cordova, a 400 response causes an exception that seems to reload the
            // page. Catching the exception fixes this problem.
            xhr.send();
        } catch(error) {
            console.log(error);
            callback(null);
        }
        return xhr;
    };
}

// AuthClient inherits EventEmitter
AuthClient.prototype = new EventEmitter();

AuthClient.prototype.Login = function(username, password, rememberMe, callback) {
    const self = this;
    const xhr = new XMLHttpRequest();
    xhr.onreadystatechange = function() {
        if(xhr.readyState == 4) {
            if(xhr.status == 201) {
                try {
                    const response = JSON.parse(xhr.responseText);
                    self.accessToken = response.access_token;

                    if(rememberMe) {
		                window.localStorage.setItem("accessToken", self.accessToken);
		            } else {
		                window.localStorage.removeItem("accessToken");
                        document.cookie = "2immerse_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
		            }

		            self.GetUserDetails(function(userDetails) {
		            	callback(userDetails);
		            });

                } catch(error) {
                    console.log(error);
                    callback(null);
                }
            } else {
                callback(null);
            }
        }
    };

    // Remove any previous accessToken 
    self.Logout();

    xhr.open("POST", self.authServiceUrl + "/auth/tokens");
    xhr.setRequestHeader("Content-Type", "application/json");
    try {
        // On Android/cordova, a 400 response causes an exception that seems to reload the
        // page. Catching the exception fixes this problem.
        xhr.send(JSON.stringify({"username":username,"password":password}));
    } catch(error) {
        console.log(error);
        callback(null);
    }
    return xhr;
};

AuthClient.prototype.Logout = function() {
    const self = this;
    let accessTokenLocal = window.localStorage.getItem("accessToken");
    if(accessTokenLocal !== null){
        window.localStorage.removeItem("accessToken");
        document.cookie = "2immerse_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    }
    self.accessToken = null;
};

AuthClient.prototype.GetUserDetails = function(callback) {
    const self = this;
    return self._getJSON(self.authServiceUrl + "/me", callback);
};

AuthClient.prototype.GetUserProfile = function(callback) {
    const self = this;
    return self._getJSON(self.authServiceUrl + "/me/profile", callback);  
};

AuthClient.prototype.PatchUserProfile = function(patch, callback) {
    const self = this;
    const xhr = new XMLHttpRequest();
    xhr.onreadystatechange = function() {
        if(xhr.readyState == 4) {
            if(xhr.status == 204) {
                callback(true);
            } else if(xhr.status == 403) {
                self.Logout();
                self.expiryHandler();
            } else {
                callback(false);
            }
        }
    };
    xhr.open("PATCH", self.authServiceUrl + "/me/profile");
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.setRequestHeader("Authorization", self.accessToken);
    try {
        // On Android/cordova, a 400 response causes an exception that seems to reload the
        // page. Catching the exception fixes this problem.
        xhr.send(JSON.stringify(patch));
    } catch(e) {
        console.log(e);
        callback(false);
    }
    return xhr;
};

AuthClient.prototype.CheckAccessToken = function(callback) {
    const self = this;
    let accessTokenLocal = window.localStorage.getItem("accessToken");
    if(accessTokenLocal !== null) {
    	// We have a cookie with an access token. Doesn't mean it's valid.
        self.accessToken = accessTokenLocal;
        // Check access token is valid
        self.GetUserDetails(function(userDetails) {
            if(!userDetails) {
                // Remove old accessToken
                self.Logout();
            }
            callback(userDetails)
        });
    } else {
        callback(null);
    }
};

AuthClient.prototype.GetLinkedDevices = function(callback) {
    const self = this;
    return self._getJSON(self.authServiceUrl + "/devices", function(devices) {
        if(devices) {
            // The device 'aux' property is used to store a friendly name for the device
            for(var i = 0; i < devices.length; ++i) {
                devices[i].aux = (devices[i].aux) ? JSON.parse(devices[i].aux) : {friendlyDeviceName:"Unknown"};
            }
            callback(devices);            
        } else {
            callback(null);
        }
    });  
};

AuthClient.prototype.RegisterDevice = function(udn, callback) {
    const self = this;
    const xhr = new XMLHttpRequest();
    xhr.onreadystatechange = function() {
        if(xhr.readyState == 4) {
            callback((xhr.status == 201) ? null : new Error("Failed to register device '"+udn+"' with the auth-service."));
        }
    };
    xhr.open("POST", self.authServiceUrl + "/devices", true);
    xhr.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
    try {
        xhr.send(JSON.stringify({ "type" : "communal", "code": udn }));
    } catch(e) {
        callback(e);
    }
    return xhr;
}

AuthClient.prototype.PairDevice = function(udn, friendlyDeviceName, callback) {
    const self = this;
    const xhr = new XMLHttpRequest();
    xhr.onreadystatechange = function() {
        if(xhr.readyState == 4) {
            if(xhr.status == 204) {
            	callback();
            } else if(xhr.status == 403) {
                self.Logout();
                self.expiryHandler();
            } else {
                callback(new Error("Failed to link device '"+udn+"' to user account."));
            }
        }
    };
    xhr.open("POST", self.authServiceUrl + "/me/link");
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.setRequestHeader("Authorization", self.accessToken);
    const aux = {
        friendlyDeviceName: friendlyDeviceName
    };
    const data = {
        "code": udn,
        "aux": JSON.stringify(aux)
    };
    try {
        // On Android/cordova, a 400 response causes an exception that seems to reload the
        // page. Catching the exception fixes this problem.
	    xhr.send(JSON.stringify(data));
    } catch(e) {
        callback(e);
    }
    return xhr;
};

AuthClient.prototype.UnpairDevice = function(linkedDeviceId, callback) {
    const self = this;
    const xhr = new XMLHttpRequest();
    xhr.onreadystatechange = function() {
        if(xhr.readyState == 4) {
            if(xhr.status == 204) {
            	callback(true);
            } else if (xhr.status == 403) {
            	self.Logout();
            	self.expiryHandler();
            } else {
                callback(false);
            }
        }
    };
    xhr.open("DELETE", self.authServiceUrl + "/devices/" + linkedDeviceId);
    xhr.setRequestHeader("Authorization", self.accessToken);
    try {
        // On Android/cordova, a 400 response causes an exception that seems to reload the
        // page. Catching the exception fixes this problem.
	    xhr.send();
    } catch(e) {
        console.log(e);
        callback(false);
    }
    return xhr;
};

AuthClient.prototype.Destroy = function() {
    const self = this;
    self.Logout();
    // TODO: Cancel any pending XMLHttpRequests
};

module.exports = AuthClient;