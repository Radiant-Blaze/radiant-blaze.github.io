---
title: Modular-Arithmetic-1
category: Crypto
points: 100
difficulty: 1
flag: 4
solves: 
tags: [crypto, modular-arithmetic, rsa]
author: Radiant Blaze
description: Calculate two modular arithmetic problems and submit the smaller resulting value.
---

## The Capture

Modular arithmetic is a system where numbers wrap around after reaching a particular modulus.

For example, modulo `12` behaves like a 12-hour clock:

```text
4 + 9 = 1
5 - 7 = 10
2 + 3 = 5
````

These can be verified in Python:

```python
print("4 + 9 =", (4 + 9) % 12)
print("5 - 7 =", (5 - 7) % 12)
print("2 + 3 =", (2 + 3) % 12)
```

The `%` operator returns the remainder after division by the modulus.

## The Mistake

We need to calculate:

```text
11 = x mod 6
8146798528947 = y mod 17
```

In Python, this is simply the `%` operator:

```python
x = 11 % 6
y = 8146798528947 % 17
```

This gives:

```text
x = 5
y = 4
```

The challenge asks for the **smaller** of the two values.

## Recovery

The complete solution is:

```python
# Question 1 -> 11 = x mod 6
x = 11 % 6

# Question 2 -> 8146798528947 = y mod 17
y = 8146798528947 % 17

print("x =", x)
print("y =", y)

# The challenge asks for the smaller value
print("Answer =", min(x, y))

print()

# Proof
print("4 + 9 =", (4 + 9) % 12)
print("5 - 7 =", (5 - 7) % 12)
print("2 + 3 =", (2 + 3) % 12)
```

The results are:

```text
x = 5
y = 4
Answer = 4
```

The `% 12` operation behaves like a 12-hour clock. We divide by `12` and keep only the remainder.

For example:

```text
5 PM + 8 hours = 13 hours
13 % 12 = 1
```

And:

```text
2 AM - 3 hours = -1 hour
-1 % 12 = 11
```

So the final answer is `4`.

## Flag

```text
4
```