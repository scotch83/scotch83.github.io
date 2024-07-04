---
title: "Unit Testing in Angular Using Standalone Components and Jasmine"

excerpt_separator: <!--more-->
cover-img: assets/images/jasmine-angular.svg
linkedin-img: assets/images/jasmine-angular.png
comments: true
layout: post
date: 2024-07-04
tags: angular unittesting standalonecomponents jasmine frontend developer
author: Mattia Collalti
---

As Angular evolves, so do its best practices and approaches. One of the latest advancements in **Angular** is the introduction of **standalone components**, which simplifies module management and promotes component reusability. With this new paradigm, it’s crucial to understand how to effectively perform **unit testing** to ensure our applications remain robust and maintainable. In this post, we'll explore how to unit test Angular applications using **standalone components**, including handling injected services and signal's input properties.

## What are Standalone Components?

Standalone components in Angular allow you to create components that are not tied to any Angular module (`NgModule`). This new feature, introduced in [**Angular 15**](https://v15.angular.io/guide/standalone-components), simplifies the creation and use of components, making it easier to manage dependencies and improve modularity.

### Benefits of Standalone Components

- **Simplified Dependency Management**: Standalone components can directly import the dependencies they need, reducing the complexity of managing shared and feature modules.
- **Improved Tree-Shaking**: Since standalone components bring in only the dependencies they use, it can lead to better tree-shaking and smaller bundle sizes.
- **Enhanced Reusability**: These components are more self-contained, making them easier to reuse across different parts of the application or even in different projects.

## Setting Up a Standalone Component with Injected Services and Input Properties

Before we dive into unit testing, let's see how to create a standalone component with an injected service, signal properties, and input properties using the `input` function. Here's a basic example:

```typescript
import { CommonModule } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { GreetingService } from './greeting.service';

@Component({
  selector: 'app-hello-world',
  standalone: true,
  imports: [CommonModule],
  template: `<h1>{% raw %}{{ message() }}{% endraw %}</h1>`,
})
export class HelloWorldComponent {
  name = input<string>('World');
  message = computed(() => this.greetingService.getGreeting() + ', ' + this.name() + '!');
  /**
   *
   */
  constructor(
    protected readonly greetingService: GreetingService
  ) {

  }
}

```

In this example, `HelloWorldComponent` is a standalone component that injects a `GreetingService`. It is worth noting that I am intentionally not using the `inject` function from the new Angular APIs because I believe it makes our architecture less maintainable and testable, as we do not see the class dependencies expressed in their constructors, breaking the concept of `Dependency Injection`.

The component also uses Angular's new signal properties to manage its state and has an input property name which is set using the input function. Here a basic implementation of the `GreetingService`:

```typescript
import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class GreetingService {
  getGreeting() {
    return 'Hello, Mock';
  }

  constructor() { }
}
```

## Unit Testing Standalone Components with Injected Services, Signal Properties, and Input Properties

Unit testing in Angular revolves around the TestBed utility, which provides a testing environment for Angular applications. Testing standalone components with injected services, signal properties, and input properties involves mocking these services and setting the input properties. Let's look at how to do this.

### Step-by-Step Guide to Testing

1. **Mock the Service:** Use a [`Jasmine` spy](https://jasmine.github.io/api/edge/jasmine.html#.createSpy) for the `getGreeting` method of our service and use it to create the service mock.
2. **Configure the TestBed:** Use `TestBed.configureTestingModule` to set up the testing module, including the service mock.
3. **Create the Component Fixture:** The fixture is used to interact with the component instance and the rendered DOM.
4. **Write Tests:** Use `Jasmine` to write your tests.

Here's an example of how to set up and test a standalone component with an injected service and input properties:

```typescript
import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GreetingService } from './greeting.service';
import { HelloWorldComponent } from './hello-world.component';

let fixture: ComponentFixture<HelloWorldComponent>;
let component: HelloWorldComponent;

// Create a spy for the getGreeting method of our injected service
const getGreeting = jasmine.createSpy('getGreetingMock');

const staticServiceReturnString = 'Hello, Mock';

describe(HelloWorldComponent.name, () => {
  beforeEach(async () => {
    // Configure the testing module
    await TestBed.configureTestingModule({
      imports: [HelloWorldComponent, CommonModule],
      providers: [{
        provide: GreetingService, useValue: { getGreeting } //  provide a mock for our injected service
      }],
    }).compileComponents();

    fixture = TestBed.createComponent(HelloWorldComponent);
    component = fixture.componentInstance;

    // use the jasmine spy to control the possible use cases of your code
    getGreeting.and.returnValue(staticServiceReturnString)
  });

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  it('should render "Hello, Mock, World!" by default', () => {
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain(`${staticServiceReturnString}, ${component.name()}!`);
  });

  it('should update with input property "name"', () => {
    const name = 'Angular';
    fixture.componentRef.setInput('name', name)
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain(`${staticServiceReturnString}, ${name}!`);
  });
});
```

### Key Points

1. **Mocking Services:** Create a mock service to provide predictable and controlled behavior for the component under test.
1. **Imports:** Ensure you import the standalone component and any other necessary modules (e.g., CommonModule).
1. **Fixture:** The fixture is crucial for accessing the component instance and triggering change detection.
1. **Signal Properties:** Test signal properties by setting their values and verifying the DOM updates accordingly.
1. **Input Properties:** Test input properties by setting their values and verifying the DOM updates accordingly.

## Conclusion

Unit testing standalone components in **Angular** is straightforward and leverages familiar tools like `TestBed`. The primary difference is in how you configure the testing module and import the standalone component, especially when dealing with injected services and input properties. By following the steps outlined above, you can ensure your standalone components are thoroughly tested and reliable.

As **Angular** continues to evolve, embracing new features like standalone components and refining your testing strategies will help you build more maintainable and scalable applications.

Happy coding!
