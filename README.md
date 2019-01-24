# Launcher Web Applications

<img src="https://2immerse.eu/wp-content/uploads/2016/04/2-IMM_150x50.png" align="left"/><em>This project was originally developed as part of the <a href="https://2immerse.eu/">2-IMMERSE</a> project, co-funded by the European Commission’s <a hef="http://ec.europa.eu/programmes/horizon2020/">Horizon 2020</a> Research Programme</em>

# Introduction

This repository contains a web application for TVs and a web application for companion devices, scoping user enrolment, device discovery, device association, multi-device authentication, session discovery and session creation. There are two variants of the web application, reflecting the different roles that TVs and companion devices play in multi-screen DMApps. In particular, companion devices are responsible for launching programmes across a number of TVs. The TV web application is very simple compared to the companion web application.

Together the web applications implement a 'unified launcher' scheme, so called because they can launch any statically hosted or live DMApp. The unified launcher companion application dynamically updates an electronic programme guide (EPG) with available DMApp experiences and displays a list of discovered programmes that are running on the local network.

# Directory structure:

* `src/companion-launcher`
  Unified launcher source code and build scripts for companion devices and companion emulators.
* `src/launcher`
  Unified launcher source code and build scripts for TV devices and emulators.
* `epg/`
  JSON schema defining valid EPG JSON files

# Overview

The companion-launcher web application is intended to be loaded by the android-unified-launcher Android app located in the 2-IMMERSE/android-unified-launcher repository. This Android application uses the Cordova framework to the web application in a WebView whilst also running background serices necessary to support the web application's DIAL (UDP-based) discovery mechanism.

The companion-emu-launcher web application has the same functionality as the companion-launcher but is intended to be run in a web browser on an ordinary desktop computer for the purpose of debugging and development. When using the companion emulator web application, it is necessary to run the DIAL client background service manually, which is located in the 2-IMMERSE/client-api repository under the 'server-compemu' directory. Before you can run the client server, you'll need to build it using `npm install`. After this you can run the launch script located in 2-IMMERSE/client-api/test directory to start the server.

The launcher web application is intended to be run on a TV emulator in a web browser. It also assumes a background service is running to act as a DIAL server. This is located in the 2-IMMERSE/client-api repository in the 'server-tvemu' directory. Before you can run this server, you'll need to build it using `npm install`. After this you can run the launch script located in 2-IMMERSE/client-api/test directory to start the server.

Note that the browser will initially prevent the web applications from connecting to these background services i.e. to localhost. It's necessary to temporarily disable web security for the page. In Chrome/Chromium, this can be achived by looking for a shield icon in the address bar of the page and disabling security. Alternatively, you can run a fresh copy of Chrome/Chromium and disable web security on the command line. For example, on Mac OS X, you could run:

```
open -n -a "Google Chrome" --args --user-data-dir=/tmp/temp_chrome_user_data_dir --disable-web-security
```

# Building  

To build everything, ensure Docker is installed and run:

```bash
make CLIENT_DEPLOYMENT_BASE_URL=<client-api-deployment-url> all
```

See `make info` for more details.

This creates a docker image called 'bbcrd-launcher-builder' containing the build tools and SDKs necessary to compile the web applications. There is no need to install anything else onto the host computer.

The resulting web applications are built to:

`./build/www`

NB: The URL of the deployments of the client-api must be specified using the CLIENT_DEPLOYMENT_BASE_URL environment variable. The URL specified by this environment variable is embedded into the resulting HTML. See the 'src/launcher/launcher.html.template' and 'src/companion-launcher/companion-emu-launcher.html.template' files for more details.

# Licence and Authors

All code and documentation is licensed by the original author and contributors under the Apache License v2.0:

* [British Broadcasting Corporation](http://www.bbc.co.uk/rd) (original author)
* [British Telecommunications (BT) PLC](http://www.bt.com/)

See AUTHORS.md file for a full list of individuals and organisations that have
contributed to this code.

## Contributing

If you wish to contribute to this project, please get in touch with the authors.