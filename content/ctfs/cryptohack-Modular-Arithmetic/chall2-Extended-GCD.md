---
title: Extended GCD
category: Crypto
points: 100
difficulty: 1
flag: -8404
solves: 
tags: [crypto, gcd, extended-gcd, rsa]
author: Radiant Blaze
description: Use the Extended Euclidean Algorithm to find integers u and v satisfying p·u + q·v = gcd(p,q).
---

## The Capture

The Extended Euclidean Algorithm is an efficient way to find integers `u` and `v` such that:

```text
a · u + b · v = gcd(a, b)
````

This becomes especially important later when working with RSA, where the algorithm can be used to calculate modular inverses.

We are given two primes:

```text
p = 26513
q = 32321
```

We need to find `u` and `v` such that:

```text
p · u + q · v = gcd(p, q)
```

The challenge asks us to submit whichever of `u` and `v` is the lower number.

## The Mistake

Since `p` and `q` are both prime and are different from each other, we expect:

```text
gcd(p, q) = 1
```

We can use SymPy's `gcdex()` function to calculate the coefficients directly.

## Recovery

The solution is:

```python
from sympy import gcdex

p = 26513
q = 32321

u, v, g = gcdex(p, q)

print(u)
print(v)
print(g)
```

The output is:

```text
10245
-8404
1
```

Therefore:

```text
u = 10245
v = -8404
gcd(p, q) = 1
```

We can verify the result:

```text
26513 × 10245 + 32321 × (-8404) = 1
```

Since `-8404` is the lower of `u` and `v`, it is the required answer.

## Alternative Solution

If SymPy is not available, we can implement the Extended Euclidean Algorithm ourselves:

```python
def extended_gcd(a, b):
    if b == 0:
        return a, 1, 0

    gcd, x1, y1 = extended_gcd(b, a % b)

    x = y1
    y = x1 - (a // b) * y1

    return gcd, x, y

p = 26513
q = 32321

g, u, v = extended_gcd(p, q)

print(u)
print(v)
print(g)
```

This produces the same coefficients:

```text
u = 10245
v = -8404
gcd = 1
```

## Flag

```text
-8404
```