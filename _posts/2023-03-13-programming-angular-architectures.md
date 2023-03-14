---
layout: post
title: "Programming Angular Architectures"
excerpt_separator: <!--more-->
tags: angular fundamentals architecture
date: 2023-03-13
---

## Angular applications fundamentals

Angular applications are a great innovation in web development. They allow for a better architecture and separation of concerns, when it comes to managing your files.
<!--more-->

They do set a clear boundary between HTML, CSS and TypeScript, allowing developers to focus on what matters.


### Components, Modules, Services and Directives

The most important parts of an Angular applications are Components, Modules, Services and Directives. I put Components as first because recent changes in the Angular framework have allowed us to basically work with independent Componens and get rid of the Modules.

#### Components

Components are a basic building block of interface. They often represent a page or a portion of it, and programming reusable here is key.

#### Modules

Modules are the glue between components and different aspects and portions of our webapp. Surely we want at least to have one module per page...and maybe have others that are not only regarding pages or UI (someone likes the SharedModule technique, which I personally find useless, but that's a personal opinion).
With modules we need to carefully consider the structure and dependencies of our application. Also, never forget that declaring the same providers in different modules, will only create an issue with services that are supposed to be Singletons

#### Services

Services, yes...well...these are actually the most important part of the whole application. They should really wrap all the business logice, as they are solely classes to be instantiated.
Also when testing, you will realise how you can create an instance just by using the new operator, like a normal instantiation for any TypeScript instance.
It means they are potentially portable to any other code base, even a react application. I say potentially cause in the end, you may still have dependencies coming from other modules that are using the Angular framework in the background (like NgZone)

#### Directives

Directive are quite a broad topic. If you consider that even components are directives, it's already confusing enough. They are also a pretty strict Angular features and are mainly divided in two big groups: structural and attribute directives. They both basically interact with the DOM, but the first being one that is changind its structure, the second behing one changing the appearance or behavior.

### Conclusion

This is rather a test blog post, to check how this would work using Github Pages and Jekyll. Soon maybe something more will be to come, just need to figure out what is more productive.
