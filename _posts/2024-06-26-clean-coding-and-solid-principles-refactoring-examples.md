---
layout: post
title: "Clean Coding and SOLID Principles with Python Refactoring Examples"
date: 2024-06-26
excerpt_separator: <!--more-->
cover-img: assets/images/python.svg
linkedin-img: assets/images/python.png
tag: python solid-programming clean-code uncle-bob
comments: true
css:
- "/assets/css/python.css"
---

In the ever-evolving world of software development, writing clean, maintainable, and scalable code is paramount.
<!--more-->
Two foundational concepts that aid in achieving this are **Clean Code** and **SOLID principles**. This post delves into these concepts and provides practical refactoring examples to illustrate their application.

## Clean Code

Clean Code, as popularized by [**Robert C. Martin**](http://cleancoder.com/products), emphasizes readability, simplicity, and clarity. It's about writing code that others can easily understand and modify. Here are some key practices:

1. **Meaningful Names**: Use descriptive and unambiguous names.
2. **Small Functions**: Functions should be small and do one thing.
3. **Single Responsibility Principle**: A class should have one, and only one, reason to change.
4. **Avoid Magic Numbers**: Use named constants instead of hard-coded numbers.
5. **Consistent Formatting**: Follow a consistent style guide.

## SOLID Principles

SOLID is an acronym representing five principles that make software designs more understandable, flexible, and maintainable:

1. **Single Responsibility Principle (SRP)**: A class should have one, and only one, reason to change.
2. **Open/Closed Principle (OCP)**: Software entities should be open for extension but closed for modification.
3. **Liskov Substitution Principle (LSP)**: Subtypes must be substitutable for their base types.
4. **Interface Segregation Principle (ISP)**: No client should be forced to depend on methods it does not use.
5. **Dependency Inversion Principle (DIP)**: High-level modules should not depend on low-level modules. Both should depend on abstractions.

## Refactoring Examples

Let's refactor some code to adhere to Clean Code practices and SOLID principles.

### Example 1: Single Responsibility Principle (SRP)

**Before Refactoring:**

```python
class User:
    def __init__(self, username, email):
        self.username = username
        self.email = email

    def save_to_db(self):
        # Code to save user to database
        pass

    def send_welcome_email(self):
        # Code to send a welcome email
        pass
```

**Problems:**

The User class has multiple responsibilities: user data management and sending emails.

**After Refactoring:**

```python
class User:
    def __init__(self, username, email):
        self.username = username
        self.email = email

class UserRepository:
    def save_to_db(self, user):
        # Code to save user to database
        pass

class EmailService:
    def send_welcome_email(self, user):
        # Code to send a welcome email
        pass
```

**Benefits:**

Each class now has a single responsibility, making the code easier to understand and maintain.

### Example 2: Open/Closed Principle (OCP)

**Before Refactoring:**

```python
class Discount:
    def __init__(self, customer_type):
        self.customer_type = customer_type

    def get_discount(self):
        if self.customer_type == 'regular':
            return 0.1
        elif self.customer_type == 'vip':
            return 0.2
        else:
            return 0.0

```

**Problems:**

* The get_discount method needs to be modified whenever a new customer type is added.

**After Refactoring:**

```python
from abc import ABC, abstractmethod

class Discount(ABC):
    @abstractmethod
    def get_discount(self):
        pass

class RegularDiscount(Discount):
    def get_discount(self):
        return 0.1

class VIPDiscount(Discount):
    def get_discount(self):
        return 0.2

class DiscountService:
    def __init__(self, discount: Discount):
        self.discount = discount

    def calculate_discount(self):
        return self.discount.get_discount()
```

**Benefits:**

* New discount types can be added without modifying existing code.

### Example 3: Interface Segregation Principle (ISP)

**Before Refactoring:**

```python
class MultiFunctionPrinter:
    def print(self, document):
        pass

    def fax(self, document):
        pass

    def scan(self, document):
        pass
```

**Problems:**

* Clients that only need printing capabilities are forced to depend on fax and scan methods as well.

**After Refactoring:**

```python
class Printer:
    def print(self, document):
        pass

class Scanner:
    def scan(self, document):
        pass

class FaxMachine:
    def fax(self, document):
        pass

class MultiFunctionDevice(Printer, Scanner, FaxMachine):
    pass
```

**Benefits:**

* Clients can depend on only the methods they need, promoting flexibility and reducing unnecessary dependencies.

## Conclusion

Adhering to Clean Code practices and SOLID principles leads to code that is easier to read, maintain, and extend. By breaking down responsibilities, favoring composition over inheritance, and designing flexible interfaces, developers can create robust software systems that stand the test of time. The refactoring examples provided illustrate the practical application of these principles, making your code cleaner and more resilient.

Happy coding!
