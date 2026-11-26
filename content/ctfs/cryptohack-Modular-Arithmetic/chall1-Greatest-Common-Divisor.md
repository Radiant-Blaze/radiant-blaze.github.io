---
title: Greatest Common Divisor
category: Crypto
points: 100
difficulty: 1
flag: 
solves: 
tags: [crypto, gcd, euclidean-algorithm]
author: Radiant Blaze
description: "CryptoHack Greatest Common Divisor: compute gcd(66528, 52920) with Python's math.gcd and confirm the result by hand with Euclid's algorithm."
---

## The Capture

The Greatest Common Divisor (GCD), sometimes known as the highest common factor, is the largest number that divides two positive integers.

For example, for `a = 12` and `b = 8`, the divisors are:

```text
12: {1, 2, 3, 4, 6, 12}
8:  {1, 2, 4, 8}
````

The largest value they have in common is `4`, so:

```text
gcd(12, 8) = 4
```

If the GCD of two integers is `1`, the numbers are called **coprime**.

## The Mistake

We are asked to calculate:

```text
a = 66528
b = 52920
```

The challenge recommends using **Euclid's Algorithm**, which repeatedly calculates remainders until the remainder becomes `0`.

The final non-zero remainder is the GCD.

We can also use Python's built-in `gcd()` function from the `math` module.

## Recovery

The solution uses `gcd()` and also checks whether the two numbers are coprime:

```python
from math import gcd

def coprime_chk(a, b):
    remainder = gcd(a, b)

    if remainder == 1:
        return "They are coprime"
    else:
        return "They are not coprime"

def line(a, b):
    print(
        "GCD of ", a, " and ", b,
        "\t = ", gcd(a, b),
        "\t and ", coprime_chk(a, b), "\n"
    )

a = 12
b = 8
line(a, b)

a = 11
b = 17
line(a, b)

a = 66528
b = 52920
line(a, b)
```

For the challenge values:

```text
gcd(66528, 52920) = 1512
```

Therefore, the numbers are **not coprime**.

We can verify the Euclidean Algorithm manually:

```text
66528 = 52920 × 1 + 13608
52920 = 13608 × 3 + 12096
13608 = 12096 × 1 + 1512
12096 = 1512 × 8 + 0
```

The last non-zero remainder is `1512`.

The same algorithm with coefficients is the subject of [Extended GCD](/generated/writeups/cryptohack-Modular-Arithmetic/chall2-Extended-GCD.html), which later becomes the modular inverse.

## Result

```text
GCD = 1512
```

There is no flag for this challenge. The required answer is the GCD:

```text
1512
```