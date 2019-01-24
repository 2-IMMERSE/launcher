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

SRC_DIR := $(dir $(abspath $(lastword $(MAKEFILE_LIST))))src

ifndef HOST_BUILD_DIR
	HOST_BUILD_DIR := $(dir $(abspath $(lastword $(MAKEFILE_LIST))))build
endif

ifndef PORT
	PORT := 3000
endif

ifdef http_proxy
	BUILD_PROXY = --build-arg http_proxy=$(http_proxy)
	RUN_PROXY = --env http_proxy=$(http_proxy)
endif

ifdef https_proxy
	BUILD_PROXY += --build-arg https_proxy=$(https_proxy)
	RUN_PROXY += --env https_proxy=$(https_proxy)
endif

ifndef DOCKER_IMAGE_NAME
	DOCKER_IMAGE_NAME := bbcrd-launcher-builder
endif

ifndef CLIENT_DEPLOYMENT_BASE_URL
    # CLIENT_DEPLOYMENT_BASE_URL must be defined for 'www-app' and 'all' targets
    ifneq ($(filter all www-app,$(MAKECMDGOALS)),)
		$(error 'CLIENT_DEPLOYMENT_BASE_URL' environment variable is required)
    endif
endif

.PHONY: all lint clean info dockerimage www-app web-server run-web-server shell

all: Makefile dockerimage www-app

info:
	@echo "2-Immerse Launcher Builder"
	@echo "--------------------------"
	@echo "Makefile targets:"
	@echo "  all                 Builds the launcher using a docker image."
	@echo "  dockerimage         Just builds the docker image."
	@echo "  lint                Runs eslint, lintian, sasslint etc."
	@echo "  www-app             Just builds the launcher web applications."
	@echo "  run-web-server      Runs a local web server to host the launcher applications (port 3000)"
	@echo "  shell               Launches a bash session hosted by the docker container for debugging"
	@echo "  clean               Deletes the docker image and all build artefacts"
	@echo ""
	@echo "Environment variables:"
	@echo "  CLIENT_DEPLOYMENT_BASE_URL   (Required) URL of directory where the 2-IMMERSE client-api is deployed"
	@echo "  HOST_BUILD_DIR      (Optional) Directory to store build artefacts. Defaults to CWD."
	@echo "  DOCKER_IMAGE_NAME   (Optional) Name to use for docker image for building firmware"
	@echo "  PORT                (Optional) Override default port of 3000 for local web server"
	@echo ""
	@echo "Example:"
	@echo ""
	@echo "  CLIENT_DEPLOYMENT_BASE_URL=https://origin.platform.2immerse.eu/client-api/master/dist make all"

dockerimage: Dockerfile | $(HOST_BUILD_DIR)
	docker build $(BUILD_PROXY) -t $(DOCKER_IMAGE_NAME) .

$(HOST_BUILD_DIR):
	mkdir -p $(HOST_BUILD_DIR)

web-server: dockerimage
	docker run $(RUN_PROXY) --rm -t \
	-v $(SRC_DIR):/src \
	-v $(HOST_BUILD_DIR):/build \
	$(DOCKER_IMAGE_NAME) make -C /build -f /src/Makefile BUILD_DIR=/build web-server

www-app: dockerimage
	docker run $(RUN_PROXY) --rm -t \
	--env CLIENT_DEPLOYMENT_BASE_URL=$(CLIENT_DEPLOYMENT_BASE_URL) \
	-v $(SRC_DIR):/src \
	-v $(HOST_BUILD_DIR):/build \
	$(DOCKER_IMAGE_NAME) make -C /build -f /src/Makefile BUILD_DIR=/build all

run-web-server: dockerimage web-server
	docker run $(RUN_PROXY) --rm -it \
	-p $(PORT):$(PORT) \
	-v $(SRC_DIR):/src \
	-v $(HOST_BUILD_DIR):/build \
	$(DOCKER_IMAGE_NAME) make -C /build -f /src/Makefile BUILD_DIR=/build PORT=$(PORT) run-web-server

# Invoke 'make shell' for debugging the docker container
shell: | $(HOST_BUILD_DIR) dockerimage
	docker run $(RUN_PROXY) --rm -it \
	-v $(SRC_DIR):/src \
	-v $(HOST_BUILD_DIR):/build \
	$(DOCKER_IMAGE_NAME) bash

lint: dockerimage
	docker run $(RUN_PROXY) --rm -t \
	-v $(SRC_DIR):/src \
	-v $(HOST_BUILD_DIR):/build \
	$(DOCKER_IMAGE_NAME) make -C /build -f /src/Makefile BUILD_DIR=/build lint

clean: dockerimage
	docker run $(RUN_PROXY) --rm -t \
	-v $(SRC_DIR):/src \
	-v $(HOST_BUILD_DIR):/build \
	$(DOCKER_IMAGE_NAME) make -C /build -f /src/Makefile BUILD_DIR=/build clean
	docker rmi $(DOCKER_IMAGE_NAME)
ifndef WORKING_DIR
	rm -fr $(HOST_BUILD_DIR)
endif
