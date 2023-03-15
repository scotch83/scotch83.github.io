---
layout: post
title: "Redux files generator plugin for VSCode"
excerpt_separator: <!--more-->
tags: angular redux vscode plugins
#thumbnail-img: assets/images/redux-vscode-logos-cross.svg
cover-img: assets/images/redux-vscode-logos-cross.svg
date: 2023-03-15
---

## Angular 2 Redux Files Generator

This is an Angular 2 Redux files generator that I developed a long time ago in the context of a project, for my needs.

<!--more-->

## Features

#### Generate redux files bundle

All the templates in the configuration object, marked with `create: true` will be generated.
Templates for actions, reducers, effects and services exist.

* Right click in the files explorer in vscode
* Select `Generate redux bundle`
* Type a name for your files
* depending on the setting `generateInDestinationPath`: the generator will generate the files in a specified path or where you have clicked to generate them.

#### Generate single redux files

Generates just one file, given a string with an existing template

* Right click in the files explorer in vscode
* Select `Generate redux file`
* Type in the template that you want to generate, using the keys of the `templates` object in the configuration.
* Type the name for the file that is going to be generated
* depending on the setting `generateInDestinationPath`: the generator will generate the files in a specified path or where you have clicked to generate them.

## Extension Settings

```
ngReduxGen.config = {
    "global": {
        // generate a folder containing the generated file(s)
        "generateFolder": true,
        // use the specified destination path in the template object as a destination
        "generateInDestinationPath": true
    },
    // define templates for action, effect, reducer, service file
    "templates": {
        "action": {
            // a destination path where the file must be generated
            "destinationPath": "src/app/store/actions",
            // create this template when creating a bundle
            "create": true,
            // append to the filename this string
            "extension": "actions.ts"
        },
        "effect": {
            "destinationPath": "src/app/store/effects",
            "create": true,
            "extension": "effects.ts"
        },
        "reducer": {
            "destinationPath": "src/app/store/reducers",
            "create": true,
            "extension": "reducer.ts"
        },
        "service": {
            "destinationPath": "src/app/store/services",
            "create": true,
            "extension": "service.ts"
        }
    }
```

## Release Notes

#### 0.0.1
First release of this extension (my first extension for VS code)

#### 0.0.2
Update package.json file for better VS code marketplace integration

#### 0.0.3
Update README

-----------------------------------------------------------------------------------------------------------
