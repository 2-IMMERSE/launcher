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

SRC = /src/launcher
NODE_MODS=/build/node_modules
BIN = $(NODE_MODS)/.bin
IMAGES = $(wildcard $(SRC)/images/*)
DIST_IMAGES = $(subst $(SRC)/,,$(IMAGES))
FONTS = $(wildcard $(SRC)/fonts/*)
DIST_FONTS = $(subst $(SRC)/,,$(FONTS))

.PHONY: all lint clean

all: launcher.html
all: css/launcher.min.css css/launcher.min.css.map
all: js/launcher.min.js js/launcher.min.js.map
all: $(DIST_IMAGES)
all: $(DIST_FONTS)

js/launcher.min.js js/launcher.min.js.map: $(wildcard $(SRC)/js/*.js)

# Run the recipe for dummy.intermediate if either target is missing
js/launcher.min.js js/launcher.min.js.map: jsdummy.launcher.intermediate

# Make doesn't have an intuitive way to handle multiple targets
# Stack overflow has a solution:
# http://stackoverflow.com/questions/2973445/gnu-makefile-rule-generating-a-few-targets-from-a-single-source-file
# Targets that .INTERMEDIATE depends on are treated as intermediate files.
# This tells make that dummy.launcher.intermediate won't exist when make is run
# but its absence won't cause the recipe to be run spuriously.
.INTERMEDIATE: jsdummy.launcher.intermediate
jsdummy.launcher.intermediate: | js
	NODE_PATH=$(NODE_MODS) "$(BIN)/browserify" --external DMAppClientLib $(SRC)/js/launcher.js --debug -t [ babelify --presets [es2015] --no-babelrc ] | \
	"$(BIN)/exorcist" bundle.js.map > bundle.js
	"$(BIN)/uglifyjs" bundle.js --in-source-map bundle.js.map --source-map js/launcher.min.js.map \
	--source-map-url launcher.min.js.map -o js/launcher.min.js -c
	$(clean-js-bundle)

css/launcher.min.css css/launcher.min.css.map: $(wildcard $(SRC)/css/*.scss)
css/launcher.min.css css/launcher.min.css.map: cssdummy.launcher.intermediate

.INTERMEDIATE: cssdummy.launcher.intermediate
cssdummy.launcher.intermediate: | css
	"$(BIN)/node-sass" --source-map=css/launcher.min.css.map --output-style=compressed \
	$(SRC)/css/launcher.scss css/launcher.min.css

launcher.html: $(SRC)/launcher.html.template
	cat $(SRC)/launcher.html.template | sed \
	-e "s|###CLIENT_DEPLOYMENT_BASE_URL###|$(CLIENT_DEPLOYMENT_BASE_URL)|" > launcher.html

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
