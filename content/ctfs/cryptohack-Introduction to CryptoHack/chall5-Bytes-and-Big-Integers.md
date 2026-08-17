---
title: Bytes and Big Integers
category: Crypto
points: 100
difficulty: 1
flag: crypto{3nc0d1n6_4ll_7h3_w4y_d0wn}
solves: 
tags: [crypto, bytes, big-integers, rsa]
author: Radiant Blaze
description: Convert a large integer back into its original byte representation to recover the message.
---

## The Capture

Cryptosystems such as RSA work with numbers, but messages are made up of characters.

A common way to convert a message into a number is to take the ordinal bytes of the message, convert them into hexadecimal, and concatenate them together.

For example:

```text
message: HELLO
ascii bytes: [72, 69, 76, 76, 79]
hex bytes: [0x48, 0x45, 0x4c, 0x4c, 0x4f]
base-16: 0x48454c4c4f
base-10: 310400273487
````

We are given the following large integer and need to convert it back into a message:

```text
11515195063862318899931685488813747395775516287289682636499965282714637259206269
```

## The Mistake

The integer is simply the numerical representation of the original bytes.

PyCryptodome provides `long_to_bytes()` to convert a large integer back into its byte representation.

This reverses the process used to convert bytes into a large integer.

## Recovery

We can use `long_to_bytes()` to decode the given integer:

```python
from Cryptodome.Util.number import long_to_bytes
# from Crypto.Util.number import long_to_bytes  # For Windows

encoded_message = 11515195063862318899931685488813747395775516287289682636499965282714637259206269

decoded_message = long_to_bytes(encoded_message)

print("encoded message : ", encoded_message)
print("decoded message : ", decoded_message)
```

The decoded bytes reveal the flag:

```text
b'crypto{3nc0d1n6_4ll_7h3_w4y_d0wn}'
```

> **Windows warning:** If `from Cryptodome.Util.number import long_to_bytes` does not work, use `from Crypto.Util.number import long_to_bytes` instead.

## Flag

```text
crypto{3nc0d1n6_4ll_7h3_w4y_d0wn}
```