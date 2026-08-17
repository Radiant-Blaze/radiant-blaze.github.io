---
title: Modular Inverting
category: Crypto
points: 100
difficulty: 1
flag: 9
solves: 
tags: [crypto, modular-arithmetic, modular-inverse]
author: Radiant Blaze
description: Find the multiplicative inverse of 3 modulo 13 using modular arithmetic.
---

## The Capture

In a finite field `Fₚ`, every non-zero element has a unique multiplicative inverse.

For an element `g`, its inverse `d` satisfies:

```text
g · d ≡ 1 mod p
````

For example:

```text
7 · 8 = 56 ≡ 1 mod 11
```

We are asked to find the inverse of `3` modulo `13`:

```text
3 · d ≡ 1 mod 13
```

## The Mistake

The multiplicative inverse can be written as:

```text
a^-1
```

and we want:

```text
(a · a^-1) mod p = 1
```

Python's `pow()` function can calculate the modular inverse directly using:

```python
pow(a, -1, p)
```

So for this challenge:

```python
pow(3, -1, 13)
```

## Recovery

The complete solution is:

```python
# What is the inverse element: d = 3^-1 such that 3 · d = 1 mod 13

print("(3 * 3^-1) mod 13 =", pow(3, -1, 13))
```

The result is:

```text
9
```

We can verify it:

```text
3 · 9 = 27
27 mod 13 = 1
```

Therefore:

```text
3^-1 ≡ 9 mod 13
```

## Flag

```text
9
```