---
title: Modular-Arithmetic-2
category: Crypto
points: 100
difficulty: 1
flag: 1
solves: 
tags: [crypto, modular-arithmetic, fermats-little-theorem, diffie-hellman]
author: Radiant Blaze
description: Use Fermat's Little Theorem to simplify modular exponentiation with prime moduli.
---

## The Capture

In the previous challenge, we worked with modular arithmetic.

Here we restrict ourselves to the case where the modulus `p` is prime. The integers modulo `p` form a finite field, denoted by `Fₚ`.

A key result we need is **Fermat's Little Theorem**:

```text
a^(p-1) ≡ 1 mod p
````

when `p` is prime and `a` is not divisible by `p`.

Equivalently:

```text
a^p ≡ a mod p
```

This theorem will become useful later when working with cryptographic systems such as RSA and Diffie-Hellman.

## The Mistake

We are first asked to calculate powers modulo `17`:

```text
3^17 mod 17
5^17 mod 17
7^16 mod 17
```

Because `17` is prime, Fermat's Little Theorem tells us:

```text
a^16 mod 17 = 1
```

for any `a` not divisible by `17`.

Therefore:

```text
3^17 mod 17 = 3
5^17 mod 17 = 5
7^16 mod 17 = 1
```

The challenge then gives a much larger calculation:

```text
273246787654^65536 mod 65537
```

Since `65537` is prime:

```text
65537 - 1 = 65536
```

so Fermat's Little Theorem directly applies.

## Recovery

Python's built-in `pow()` function can calculate modular exponentiation efficiently using:

```python
pow(base, exponent, modulus)
```

The complete solution is:

```python
# Fermat's Little Theorem
# If p is prime and a is not divisible by p:
# a^(p-1) mod p = 1
# a^p mod p = a

print("3^17 % 17 =", pow(3, 17, 17))
print("3^16 % 17 =", pow(3, 16, 17), "\n")

print("5^17 % 17 =", pow(5, 17, 17))
print("5^16 % 17 =", pow(5, 16, 17), "\n")

# Since 65537 is prime:
# a^(65537-1) mod 65537 = 1

print(
    "273246787654^65536 % 65537 =",
    pow(273246787654, 65536, 65537),
    "\n"
)

print("Fermat's Little Theorem:")
print("If p is prime and a is not divisible by p:")
print("a^(p-1) mod p = 1")
```

The important calculation gives:

```text
273246787654^65536 mod 65537 = 1
```

No giant number needs to be calculated directly. The prime modulus and Fermat's Little Theorem do the heavy lifting.

## Flag

```text
1
```