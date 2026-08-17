---
title: Favorite byte
category: Crypto
points: 100
difficulty: 1
flag: crypto{0x10_15_my_f4v0ur173_by7e}
solves: 
tags: [crypto, xor, brute-force]
author: Radiant Blaze
description: A hexadecimal ciphertext has been XORed with a single unknown byte. Brute-force all 256 possible keys to recover the plaintext.
---

## The Capture

We are given a ciphertext encoded as hexadecimal:

```text
73626960647f6b206821204f21254f7d694f7624662065622127234f726927756d
````

The challenge tells us that the data was hidden using XOR with a **single byte**, but the byte itself is unknown.

Since a byte can have `256` possible values, we can simply try every possible key.

## The Mistake

First, we need to decode the hexadecimal ciphertext into bytes:

```python
cipher = bytes.fromhex(
    "73626960647f6b206821204f21254f7d694f7624662065622127234f726927756d"
)
```

We then XOR the ciphertext with every possible key from `0` to `255`.

Because the expected plaintext follows the CryptoHack flag format, we can look for the string `crypto` in the decrypted result.

## Recovery

Using pwntools' `xor()` function:

```python
from pwn import xor

cipher = bytes.fromhex(
    "73626960647f6b206821204f21254f7d694f7624662065622127234f726927756d"
)

for key in range(256):
    plaintext = xor(cipher, key)

    if b"crypto" in plaintext:
        print("Key:", key)
        print("Plaintext:", plaintext.decode())
        break
```

The loop tries all possible single-byte keys until it finds a plaintext containing `crypto`.

The correct key produces the readable plaintext:

```text
crypto{0x10_15_my_f4v0ur173_by7e}
```

## Flag

```text
crypto{0x10_15_my_f4v0ur173_by7e}
```