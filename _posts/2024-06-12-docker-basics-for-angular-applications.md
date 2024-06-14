---
cover-img: assets/images/docker-angular.svg
linkedin-img: assets/images/docker-angular.png
layout: post
excerpt_separator: <!--more-->
title: "Creating a Docker Image for Angular applications"
date: 2024-06-12
tags: docker angular
comments: true
---

# Creating a Docker Image for Angular applications

Docker is a powerful tool that allows developers to package applications and their dependencies into a portable container<!--more-->, ensuring consistency across different environments.
 In this post, we’ll walk through the steps to create a basic Docker image for an Angular web application and serve it locally.

## Prerequisites

Before you begin, ensure you have the following installed on your machine:

- [Node.js and npm](https://nodejs.org/en/download/package-manager)
- [Angular CLI](https://v17.angular.io/cli#installing-angular-cli)
- [Docker](https://www.docker.com/products/docker-desktop/)

## Step 1: Create an Angular Application

First, create a new Angular application if you don’t already have one. Open your terminal and run:

```bash
ng new my-angular-app
cd my-angular-app
```

This will create a new Angular project in the `my-angular-app` directory.

## Step 2: Create a Dockerfile

Create a `Dockerfile` in the root of your Angular project. This file will define the environment for your Angular app.

```dockerfile
# Step 1: Use an official Node.js runtime as a parent image
FROM node:18

# Step 2: Set the working directory
WORKDIR /app

# Step 3: Expose the port that Angular's development server runs on
EXPOSE 4200

```

It's going to be a very simple file, using `Node.js v18` (but you can change the parent image as needed).

## Step 3: Create a Docker Compose File

Create a `docker-compose.yml` file in the root of your project directory. This file will define the service and map the local directory to the container `app` directory, where we will be working.

```yaml
version: '3.8'

services:
  angular-app:
    container_name: my-angular-app
    build: .
    ports:
      - "4200:4200"
    volumes:
      - type: bind
        source: .
        target: /app
        consistency: cached
      - /app/node_modules
      - /app/dist
    command: ["sleep", "infinity"]
```

Note: the use of `command: ["sleep", "infinity"]` command: this is a workaround to keep the container running and be able to interact with it in its shell afterwards, to run all the commands we normally run working in an Angular project.

## Step 4: Update package.json for Live Reload

Ensure your `package.json` file has a script to start the Angular development server. It should look like this:

```json
"scripts": {
  "start": "ng serve --host 0.0.0.0 --poll 100"
}
```

The `--host 0.0.0.0` flag allows the server to be accessible from outside the container, and `--poll 2000` enables polling to detect file changes for live reload.

## Step 5: Build and Run the Docker Container

Now you can build and run your Docker container using Docker Compose.

```bash
docker-compose up --build
```

## Step 6: Start the container shell

Start a bash shell in the running container.

```bash
docker exec -it my-angular-app /bin/bash
```

## Step 7: Start working with your angular project

Now we can start our usual workflow running the commands in the container shell.

```bash
npm install
npm start
```

## Conclusion

By following these steps, you’ve created a basic Docker image for an Angular web application and served it locally. Dockerizing your Angular application ensures a consistent runtime environment, making it easier to work in a consistent environment throughout your team, ensuring the correct setup of the environment.

Stay tuned for more tutorials on advanced Docker techniques and Angular development tips!

Happy coding!
