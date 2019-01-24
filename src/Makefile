# Copyright 2019 British Broadcasting Corporation
# 
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
# 
#   http://www.apache.org/licenses/LICENSE-2.0
# 
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

SRC=/src
WWW_DIR = www
NODE_MODS = /build/node_modules
WWW_DIRS = launcher companion-launcher

ifndef PORT
	PORT:=3000
endif

PHONY_WWW_CLEAN_DIRS = $(addprefix $(SRC)/,$(addprefix clean_,$(WWW_DIRS)))
PHONY_WWW_DEPLOY_DIRS = $(addprefix $(SRC)/,$(addprefix deploy_,$(WWW_DIRS)))
PHONY_WWW_LINT_DIRS = $(addprefix $(SRC)/,$(addprefix lint_,$(WWW_DIRS)))
PHONY_WWW_SRC_DIRS = $(addprefix $(SRC)/,$(WWW_DIRS))

#------------------------------------------------------------------------------
# Build rules
#------------------------------------------------------------------------------

.PHONY: all clean lint run-web-server web-server build-deps www-app
.PHONY: $(PHONY_WWW_SRC_DIRS) $(PHONY_WWW_CLEAN_DIRS) $(PHONY_WWW_LINT_DIRS)

all: www-app
all: $(SRC)/Makefile 
	
www-app: $(PHONY_WWW_SRC_DIRS)

$(PHONY_WWW_SRC_DIRS): build-deps
	make -C $(WWW_DIR) -f $@/Makefile BUILD_DIR=$(WWW_DIR)

build-deps: node_modules $(WWW_DIR)

$(WWW_DIR):
	mkdir -p $@

# Install build tools
node_modules: $(SRC)/package.json
	cp -f $(SRC)/package.json . 
	npm install --only=dev
	npm install --only=prod
	rm -f package.json 

run-web-server: node_modules www-app
	NODE_PATH=$(NODE_MODS) /usr/bin/nodejs $(SRC)/index.js -p $(PORT) $(WWW_DIR)

lint: $(PHONY_WWW_LINT_DIRS)
$(PHONY_WWW_LINT_DIRS): build-deps
	make -C $(WWW_DIR) -f $(subst lint_,,$@/Makefile) lint BUILD_DIR=$(WWW_DIR)

clean: $(PHONY_WWW_CLEAN_DIRS)
$(PHONY_WWW_CLEAN_DIRS):
	make -C $(WWW_DIR) -f $(subst clean_,,$@/Makefile) clean BUILD_DIR=$(WWW_DIR)
