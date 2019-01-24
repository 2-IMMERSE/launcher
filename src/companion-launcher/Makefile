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

clean-js-bundle = rm -f bundle.js bundle.js.map

SRC = /src/companion-launcher
NODE_MODS=/build/node_modules
BIN = $(NODE_MODS)/.bin
IMAGES = $(wildcard $(SRC)/images/*)
DIST_IMAGES = $(subst $(SRC)/,,$(IMAGES))
FONTS = $(wildcard $(SRC)/fonts/*)
DIST_FONTS = $(subst $(SRC)/,,$(FONTS))

.PHONY: all lint clean

all: companion-launcher.html companion-emu-launcher.html
all: css/companion-launcher.min.css css/companion-launcher.min.css.map
all: js/companion-launcher.min.js js/companion-launcher.min.js.map
all: $(DIST_IMAGES)
all: $(DIST_FONTS)

js/companion-launcher.min.js js/companion-launcher.min.js.map: $(wildcard $(SRC)/js/*.js)

# Run the recipe for dummy.intermediate if either target is missing
js/companion-launcher.min.js js/companion-launcher.min.js.map: jsdummy.companion-launcher.intermediate

# Make doesn't have an intuitive way to handle multiple targets
# Stack overflow has a solution:
# http://stackoverflow.com/questions/2973445/gnu-makefile-rule-generating-a-few-targets-from-a-single-source-file
# Targets that .INTERMEDIATE depends on are treated as intermediate files.
# This tells make that dummy.companion-launcher.intermediate won't exist when make is run
# but its absence won't cause the recipe to be run spuriously.
.INTERMEDIATE: jsdummy.companion-launcher.intermediate
jsdummy.companion-launcher.intermediate: | js
	NODE_PATH=$(NODE_MODS) "$(BIN)/browserify" --external DMAppCompLib --external DMAppClientLib $(SRC)/js/companion-launcher.js --debug -t [ babelify --presets [es2015] --no-babelrc ] | \
	"$(BIN)/exorcist" bundle.js.map > bundle.js
	"$(BIN)/uglifyjs" bundle.js --in-source-map bundle.js.map --source-map js/companion-launcher.min.js.map \
	--source-map-url companion-launcher.min.js.map -o js/companion-launcher.min.js -c
	$(clean-js-bundle)

css/companion-launcher.min.css css/companion-launcher.min.css.map: $(wildcard $(SRC)/css/*.scss)
css/companion-launcher.min.css css/companion-launcher.min.css.map: cssdummy.companion-launcher.intermediate

.INTERMEDIATE: cssdummy.companion-launcher.intermediate
cssdummy.companion-launcher.intermediate: | css
	"$(BIN)/node-sass" --source-map=css/companion-launcher.min.css.map --output-style=compressed \
	--include-path $(NODE_MODS) \
	$(SRC)/css/companion-launcher.scss css/companion-launcher.min.css

companion-emu-launcher.html: $(SRC)/companion-emu-launcher.html.template
	cat $(SRC)/companion-emu-launcher.html.template | sed \
	-e "s|###CLIENT_DEPLOYMENT_BASE_URL###|$(CLIENT_DEPLOYMENT_BASE_URL)|" > companion-emu-launcher.html

%.html: $(SRC)/%.html
	cp -f $< $@

fonts/%: $(SRC)/fonts/%
	mkdir -p $(dir $@)
	cp -f $< $@

clean:
	$(clean-js-bundle)
	rm -fr css js images fonts *.html

js:
	mkdir -p js

css:
	mkdir -p css

images/%: $(SRC)/images/%
	mkdir -p $(dir $@)
	cp -f $< $@

lint:
	"$(BIN)/eslint" $(wildcard $(SRC)/js/*.js)
	"$(BIN)/sass-lint" $(SRC)/css/*.scss
