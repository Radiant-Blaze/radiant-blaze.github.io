---
title: ASCII
category: Crypto
points: 100
difficulty: 1
flag: crypto{ASCII_pr1nt4bl3}
solves: 
tags: [crypto, ascii]
author: Radiant Blaze
description: "CryptoHack ASCII: convert a list of decimal character codes back into text with Python's chr(), then reverse it with ord() to check the round trip."
---

## The Capture

ASCII is a 7-bit encoding standard that represents text using integers from `0` to `127`.

We are given the following integer array:

```python
cipher = [99, 114, 121, 112, 116, 111, 123, 65, 83, 67, 73, 73, 95, 112, 114, 49, 110, 116, 52, 98, 108, 51, 125]
````

Each number corresponds directly to an ASCII character.

## The Mistake

There is no encryption to break here. We simply need to convert each integer into its corresponding character.

In Python, `chr()` converts an integer into a character:

```python
chr(99)
```

which gives:

```text
c
```

## Recovery

We can loop through the array, convert every value using `chr()`, and join the resulting characters into a single string:

```python
cipher = [99, 114, 121, 112, 116, 111, 123, 65, 83, 67, 73, 73, 95, 112, 114, 49, 110, 116, 52, 98, 108, 51, 125]

message = []
ciphertext = []

for c in cipher:
    message.append(chr(c))

for m in message:
    ciphertext.append(ord(m))

print("Original Message    : " + "".join(message))
print("Cipher Text         : " + " ".join(str(c) for c in ciphertext))
```

The decoded message is:

```text
crypto{ASCII_pr1nt4bl3}
```

The second loop simply converts the characters back into their ASCII integer values using `ord()`, demonstrating the reverse operation.

Once the bytes are text, [HEX](/generated/writeups/cryptohack-Introduction%20to%20CryptoHack/chall3-Hex.html) and [Base64](/generated/writeups/cryptohack-Introduction%20to%20CryptoHack/chall4-Base64.html) show how the same bytes are encoded for transport.

## Flag

```text
crypto{ASCII_pr1nt4bl3}
```