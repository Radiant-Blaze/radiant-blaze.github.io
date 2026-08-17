---
title: Adrien's Signs
category: Crypto
points: 100
difficulty: 1
flag: crypto{p4tterns_1n_re5idu3s}
solves:
tags: [crypto, goldwasser-micali, legendre-symbol, quadratic-residues, modular-arithmetic]
author: Radiant Blaze
description: Recover the flag by identifying the quadratic residue pattern in a Goldwasser-Micali style encryption scheme.
---
## The Capture

The challenge provides two files:

```text
output.py
output.txt
```

The encryption code converts every byte of the flag into 8 bits and encrypts each bit independently.

The important part is:

```python
for b in plaintext:
    e = randint(1, p)
    n = pow(a, e, p)

    if b == '1':
        ciphertext.append(n)
    else:
        n = -n % p
        ciphertext.append(n)
```

The public values are:

```python
a = 288260533169915
p = 1007621497415251
```

The challenge itself tells us that this is based on the **Goldwasser-Micali cryptosystem**.

The key observation is that the encryption does not hide the bit using a complicated operation. Instead, it changes whether the resulting number is a **quadratic residue** modulo `p`.

## The Mistake

For every plaintext bit, the encryption first calculates:

```python
n = a^e mod p
```

If the bit is `1`, the ciphertext is simply:

```text
n
```

If the bit is `0`, the ciphertext becomes:

```text
-n mod p
```

So the ciphertext is effectively one of two possible forms:

```text
1 bit ->  a^e mod p
0 bit -> -a^e mod p
```

The important mathematical property is the **Legendre symbol**.

For a value `x` modulo a prime `p`, the Legendre symbol tells us whether `x` is a quadratic residue:

```text
(x / p) =  1   -> quadratic residue
(x / p) = -1   -> quadratic non-residue
```

Euler's criterion gives us a convenient way to calculate it:

```text
(x / p) ≡ x^((p-1)/2) mod p
```

The result is:

```text
1      if x is a quadratic residue
p - 1  if x is a non-residue
```

which we can convert to:

```text
1  ->  1
p-1 -> -1
```

## Recovery

We can implement the Legendre symbol directly in Python:

```python
def legendre_symbol(a, p):
    ls = pow(a, (p - 1) // 2, p)

    if ls == p - 1:
        return -1

    return ls
```

Now we examine every ciphertext value.

The important property is:

```text
Legendre(a^e, p) = 1
```

because `a^e` is a quadratic residue.

For the other case, the encryption uses:

```text
-a^e mod p
```

and this changes the quadratic-residue status.

Therefore, the Legendre symbol reveals the encrypted bit.

We can recover the bit string with:

```python
bits = ""

for c in ciphertext:

    if legendre_symbol(c, p) == 1:
        bits += "1"
    else:
        bits += "0"
```

The recovered bits are still grouped into 8-bit bytes because the original encryption converted every flag character using:

```python
plaintext = ''.join(
    [bin(i)[2:].zfill(8) for i in flag]
)
```

So we reverse that process:

```python
flag = bytes(
    int(bits[i:i+8], 2)
    for i in range(0, len(bits), 8)
)
```

The complete recovery script is:

```python
a = 288260533169915
p = 1007621497415251

ciphertext = [
    # Full ciphertext from output.txt
]


def legendre_symbol(a, p):
    ls = pow(a, (p - 1) // 2, p)

    if ls == p - 1:
        return -1

    return ls


bits = ""

for c in ciphertext:

    if legendre_symbol(c, p) == 1:
        bits += "1"
    else:
        bits += "0"


flag = bytes(
    int(bits[i:i+8], 2)
    for i in range(0, len(bits), 8)
)

print("Bits:")
print(bits)

print("\nFlag:")
print(flag)
```

The resulting plaintext is:

```text
crypto{p4tterns_1n_re5idu3s}
```

## Verification

The recovered flag follows the expected CTF flag format:

```text
crypto{...}
```

The important part of the recovery is that each ciphertext value can be classified using its Legendre symbol.

The encryption therefore leaks the plaintext bit through its quadratic-residue status.

In short:

```text
Legendre(c, p) =  1  ->  bit 1
Legendre(c, p) = -1  ->  bit 0
```

After converting the recovered binary string back into bytes:

```text
b'crypto{p4tterns_1n_re5idu3s}'
```

is obtained.

## Flag

```text
crypto{p4tterns_1n_re5idu3s}
```
