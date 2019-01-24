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

function EditorSessions(options) {
    if (!(this instanceof EditorSessions)) {
        return new EditorSessions(options);
    }
    EventEmitter.call(this);

    const self = this;

    self.editorServiceUrl = options.serviceUrls.editorService;
    self.editorSessionRequest = new XMLHttpRequest();
    self.editorSessionTimer = null;

    self.editorSessionRequest.onerror = function() {
        self.editorSessionTimer = null;
        self.Discover(6000); // try again (longer delay)
    };

    self.editorSessionRequest.onreadystatechange = function() {
        if (this.readyState == 4) {
            if(this.status == 200) {
                try{
                    self.emit('onsessions', JSON.parse(this.response));
                } catch(err) {
                    console.error(err);
                }
            }
            self.editorSessionTimer = null;
            self.Discover(4000);
        }
    };
}
// EditorSessions inherits EventEmitter
EditorSessions.prototype = new EventEmitter();

EditorSessions.prototype.Discover = function(delay) {
    const self = this;
    delay = (delay) | 0;
    if(self.editorSessionTimer === null) {
        self.editorSessionTimer = window.setTimeout(function() {
            try {
                self.editorSessionRequest.open("GET", self.editorServiceUrl + "/api/v1/document", true);
                self.editorSessionRequest.send();
            } catch(e) {
                console.error(e);
            }
        }, delay);
    }
};

EditorSessions.prototype.Destroy = function() {
    const self = this;
    if(self.editorSessionTimer) {
        self.editorSessionRequest.abort();
        window.clearTimeout(self.editorSessionTimer);
        self.editorSessionTimer = null;
    }
};

module.exports = EditorSessions;
