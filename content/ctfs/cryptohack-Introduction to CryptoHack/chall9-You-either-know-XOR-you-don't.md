---
title: You either know XOR you don't
category: Crypto
points: 100
difficulty: 1
flag: crypto{1f_y0u_Kn0w_En0uGH_y0u_Kn0w_1t_4ll}
solves: 
tags: [crypto, xor, known-plaintext]
author: Radiant Blaze
description: Recover a repeating XOR key by using the known CryptoHack flag format, then decrypt the ciphertext.
---

## The Capture

We are given a ciphertext encoded as hexadecimal:

```text
0e0b213f26041e480b26217f27342e175d0e070a3c5b103e2526217f27342e175d0e077e263451150104
````

The challenge tells us that the flag has been encrypted using a secret XOR key.

The important clue is the standard flag format:

```text
crypto{
```

Since XOR is reversible, we can use the known beginning of the plaintext to recover the key.

## The Mistake

First, decode the ciphertext from hexadecimal:

```python
cipher = bytes.fromhex(
    "0e0b213f26041e480b26217f27342e175d0e070a3c5b103e2526217f27342e175d0e077e263451150104"
)
```

We know the plaintext begins with:

```text
crypto{
```

XORing the first bytes of the ciphertext with `crypto{` reveals the repeating key:

```text
myXORkey
```

The key is therefore:

```python
key = b"myXORkey"
```

## Recovery

We can now XOR the entire ciphertext with the recovered key:

```python
from pwn import xor

cipher = bytes.fromhex(
    "0e0b213f26041e480b26217f27342e175d0e070a3c5b103e2526217f27342e175d0e077e263451150104"
)

# Using the known "crypto{" prefix reveals the repeating XOR key:
# key = b"myXORkey"

key = b"myXORkey"

flag = xor(cipher, key)

print(flag)
```

The output is:

```text
b'crypto{1f_y0u_Kn0w_En0uGH_y0u_Kn0w_1t_4ll}'
```

The key was not actually impossible to guess. The known plaintext prefix gave us enough information to recover it.

## Flag

```text
crypto{1f_y0u_Kn0w_En0uGH_y0u_Kn0w_1t_4ll}
```