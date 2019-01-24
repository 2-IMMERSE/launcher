# Electronic Programme Guide

The companion launcher application is populated with programmes defined in an EPG.
This directory contains a JSON schema defining a valid EPG JSON file together with an example EPG.

# Validation

There are several ways of validating a JSON file against a JSON schema. One option is to use the python jsonschema project:

`$ pip install jsonschema`

Then to validate an epg:

`$ jsonschema -i example.json epg.schema`

Alternatively, there are online schema/json validation services such as:

https://www.jsonschemavalidator.net/

