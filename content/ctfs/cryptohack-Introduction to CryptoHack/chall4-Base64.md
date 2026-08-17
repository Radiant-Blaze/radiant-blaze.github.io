---
title: Base64
category: Crypto
points: 100
difficulty: 1
flag: crypto{Base+64+Encoding+is+Web+Safe}
solves: 
tags: [crypto, base64, encoding]
author: Radiant Blaze
description: Decode a hexadecimal string into bytes and then encode those bytes using Base64.
---

## The Capture

Base64 is another common encoding scheme that represents binary data as an ASCII string using an alphabet of 64 characters.

Each Base64 character represents 6 bits, meaning 4 Base64 characters encode 3 bytes.

We are given the following hexadecimal string:

```text
72bca9b68fc16ac7beeb8f849dca1d8a783e8acf9679bf9269f7bf
````

The challenge asks us to first decode the hex string into bytes and then encode those bytes using Base64.

## The Mistake

The important part is the order of operations.

First, we convert the hexadecimal string into bytes using `bytes.fromhex()`.

Then, we use `base64.b64encode()` to encode those bytes into Base64.

```python id="q4w2sp"
import base64

cipher_hex = "72bca9b68fc16ac7beeb8f849dca1d8a783e8acf9679bf9269f7bf"

cipher_base64 = bytes.fromhex(cipher_hex)

message = base64.b64encode(cipher_base64)

print("Encoded Hex    : ", cipher_hex)
print("Encoded Base64 : ", message)
```

## Recovery

The complete solution is:

```python id="n8f3zc"
import base64

cipher_hex = "72bca9b68fc16ac7beeb8f849dca1d8a783e8acf9679bf9269f7bf"

cipher_base64 = bytes.fromhex(cipher_hex)

message = base64.b64encode(cipher_base64)
cipher = bytes.hex(base64.b64decode(message))

print("Encoded Hex    : ", cipher_hex)
print("Encoded Base64 : ", cipher_base64)
print("Message        : ", message)
print("Cipher         : ", cipher)
```

The resulting Base64 value is:
b'crypto/Base+64+Encoding+is+Web+Safe/
```

## Flag

```text
crypto{Base+64+Encoding+is+Web+Safe}
```