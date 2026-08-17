---
title: HEX
category: Crypto
points: 100
difficulty: 1
flag: crypto{You_will_be_working_with_hex_strings_a_lot}
solves: 
tags: [crypto, hex, encoding]
author: Radiant Blaze
description: Decode a hexadecimal string back into bytes to recover the original flag.
---

## The Capture

When we encrypt something, the resulting ciphertext commonly contains bytes that are not printable ASCII characters.

To make encrypted data easier to share and more portable across different systems, we can encode it using hexadecimal.

We are given the following hex string:

```text
63727970746f7b596f755f77696c6c5f62655f776f726b696e675f776974685f6865785f737472696e67735f615f6c6f747d
````

Each pair of hexadecimal characters represents one byte.

## The Mistake

The important part is that this is **hex encoding**, not encryption.

Python provides `bytes.fromhex()` to convert a hexadecimal string back into bytes:

```python
bytes.fromhex(cipher_hex)
```

The reverse operation can be performed using the `.hex()` method on a byte string.

## Recovery

We can decode the hex string using `bytes.fromhex()`:

```python
cipher_hex = "63727970746f7b596f755f77696c6c5f62655f776f726b696e675f776974685f6865785f737472696e67735f615f6c6f747d"

message = bytes.fromhex(cipher_hex)
cipher = bytes.hex(message)

print("Message : ", message)
print("Cipher  : ", cipher)
```

The decoded bytes reveal the flag:

```text
b'crypto{You_will_be_working_with_hex_strings_a_lot}'
```

## Flag

```text
crypto{You_will_be_working_with_hex_strings_a_lot}
```