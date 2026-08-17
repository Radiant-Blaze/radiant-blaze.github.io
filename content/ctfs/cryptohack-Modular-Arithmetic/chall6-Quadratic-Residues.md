---
title: Quadratic Residues
category: Crypto
points: 100
difficulty: 1
flag: 8
solves: 
tags: [crypto, quadratic-residues, modular-arithmetic]
author: Radiant Blaze
description: Determine which integers are quadratic residues modulo a prime by checking whether they have square roots.
---

## The Capture

A **Quadratic Residue (QR)** modulo `p` is a number `x` for which there exists some integer `a` satisfying:

```text
(a · a) % p = x
````

If such an `a` exists, then `a` is a square root of `x` modulo `p`.

For this challenge, we use:

```text
p = 29
```

Since we're working modulo `29`, we only need to check values from:

```text
0, 1, 2, ..., 28
```

After `p - 1`, the values repeat because of modular arithmetic.

## The Mistake

We need to determine whether the following values are quadratic residues modulo `29`:

```text
14, 6, 11
```

We can simply test every possible value `a` from `0` to `28` and check whether:

```text
(a · a) % 29 == x
```

If we find a root, the value is a **Quadratic Residue**.

If we find no root, it is a **Quadratic Non-Residue**.

For a prime modulus, every non-zero quadratic residue has two roots:

```text
a
p - a
```

because:

```text
(-a)² ≡ a² mod p
```

## Recovery

The solution checks every possible value modulo `29`:

```python
p = 29
ints = [14, 6, 11]

for x in ints:
    roots = []

    for a in range(p):
        if (a * a) % p == x:
            roots.append(a)

    if roots:
        print(f"{x} is a Quadratic Residue having roots: ", roots)
    else:
        print(f"{x} is NOT a Quadratic Residue")
```

The results show that `6` is a quadratic residue because:

```text
8² % 29 = 6
21² % 29 = 6
```

Therefore, the roots are:

```text
8 and 21
```

The other values do not have a square root modulo `29`.

So:

```text
14 → Quadratic Non-Residue
6  → Quadratic Residue
11 → Quadratic Non-Residue
```

The challenge asks for the value associated with the quadratic residue.

## Flag

```text
8
```