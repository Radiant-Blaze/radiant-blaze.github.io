---
title: Interception
category: Crypto
points: 250
difficulty: 2
flag: picoCTF{n0nce_r3us3_1s_f4t4l}
solves: 1204
tags: [crypto, aes-ctr, nonce-reuse]
author: Radiant Blaze
description: Two messages encrypted under the same AES-CTR nonce leak their XOR. Crib-drag to recover both.
---
## The Capture

We are given two ciphertexts and told they were produced by the same AES-CTR service. CTR turns the block cipher into a keystream generator: `ciphertext = plaintext XOR keystream`. The keystream depends only on the key and the nonce.

## The Mistake

Both messages share a nonce. That means they share a keystream `K`, so:

```
c1 = m1 XOR K
c2 = m2 XOR K
c1 XOR c2 = m1 XOR m2
```

The key never enters the equation. XORing the two ciphertexts cancels the keystream entirely and hands us the XOR of the two plaintexts.

> A nonce is a *number used once*. Reuse it under a stream cipher and confidentiality collapses to a paper-and-pencil puzzle.

## Recovery

With `m1 XOR m2` in hand, crib-drag a likely word (`the`, `flag`, `picoCTF{`) across the result. Every correct guess in one message reveals the aligned bytes of the other:

```python
guess = b"picoCTF{"
xored = bytes(a ^ b for a, b in zip(c1, c2))
for i in range(len(xored) - len(guess)):
    window = bytes(x ^ g for x, g in zip(xored[i:], guess))
    if window.isascii():
        print(i, window)
```

Extending the readable fragments recovers both plaintexts, one of which carries the flag.

## Flag

```
picoCTF{n0nce_r3us3_1s_f4t4l}
```
