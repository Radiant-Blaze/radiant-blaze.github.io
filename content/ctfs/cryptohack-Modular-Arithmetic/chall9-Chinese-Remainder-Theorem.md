---
title: Chinese Remainder Theorem
category: Crypto
points: 100
difficulty: 1
flag: 872
solves:
tags: [crypto, chinese-remainder-theorem, crt, modular-arithmetic]
author: Radiant Blaze
description: Find a number that satisfies multiple modular equations using the Chinese Remainder Theorem.
---

## The Capture

The **Chinese Remainder Theorem (CRT)** allows us to find one number `x` that satisfies multiple modular equations.

For example:

```text
x ≡ 2 (mod 5)
x ≡ 3 (mod 11)
x ≡ 5 (mod 17)
````

The goal is to find a single value of `x` that satisfies all three equations.

## The Mistake

We can start with the largest modulus:

```text
x ≡ 5 (mod 17)
```

This means that `x` can be written as:

```text
x = 5 + 17k
```

where `k` is an integer.

We can then try values of `k` until the other equations are satisfied.

The solution is:

```text
x = 872
```

Let's verify it:

```text
872 % 5  = 2
872 % 11 = 3
872 % 17 = 5
```

Therefore:

```text
x ≡ 872 (mod 935)
```

The modulus `935` comes from:

```text
5 × 11 × 17 = 935
```

Since `5`, `11`, and `17` are pairwise coprime, CRT guarantees a unique solution modulo `935`.

## Recovery

For this small example, we can solve it using a simple loop.

We start with `x = 5`, which already satisfies:

```text
x ≡ 5 (mod 17)
```

Then we keep adding `17` until the other conditions are satisfied.

```python
# x ≡ 2 (mod 5)
# x ≡ 3 (mod 11)
# x ≡ 5 (mod 17)

# Start with the largest modulus
x = 5

while True:

    if x % 11 == 3 and x % 5 == 2:
        print("Answer:", x)
        break

    # Next number satisfying x ≡ 5 (mod 17)
    x += 17
```

The program checks:

```text
5, 22, 39, 56, ...
```

Every value continues to satisfy:

```text
x ≡ 5 (mod 17)
```

Eventually we reach:

```text
872
```

which also satisfies the other two equations.

## Verification

```text
872 % 5  = 2
872 % 11 = 3
872 % 17 = 5
```

All three equations are satisfied.

## Flag

```text
872
```