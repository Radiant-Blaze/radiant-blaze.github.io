---
title: XOR Properties
category: Crypto
points: 100
difficulty: 1
flag: crypto{x0r_i5_ass0c1at1v3}
solves: 
tags: [crypto, xor]
author: Radiant Blaze
description: Use the properties of XOR to undo a chain of XOR operations and recover the encrypted flag.
---

## The Capture

In the previous challenge, we saw how XOR works at the bit level.

This challenge focuses on the properties of XOR and how they can be used to reverse a chain of XOR operations.

There are four important properties:

```text
Commutative:   A ⊕ B = B ⊕ A
Associative:   A ⊕ (B ⊕ C) = (A ⊕ B) ⊕ C
Identity:      A ⊕ 0 = A
Self-Inverse:  A ⊕ A = 0
````

The commutative property means the order of XOR operations does not matter.

The associative property means we can rearrange a chain of XOR operations without worrying about brackets.

The identity property tells us that XORing something with `0` leaves it unchanged.

Finally, the self-inverse property means that XORing something with itself cancels it out.

## The Mistake

We are given several XOR relationships between three keys and the flag:

```text
KEY1 = a6c8b6733c9b22de7bc0253266a3867df55acde8635e19c73313

KEY2 ^ KEY1 = 37dcb292030faa90d07eec17e3b1c6d8daf94c35d4c9191a5e1e

KEY2 ^ KEY3 = c1545756687e7573db23aa1c3452a098b71a7fbf0fddddde5fc1

FLAG ^ KEY1 ^ KEY3 ^ KEY2 = 04ee9855208a2cd59091d04767ae47963170d1660df7f56f5faf
```

Before performing the XOR operations, the hexadecimal values must be converted into bytes.

We can recover `KEY2` using:

```text
KEY2 = (KEY2 ^ KEY1) ^ KEY1
```

Then we can recover `KEY3` using:

```text
KEY3 = (KEY2 ^ KEY3) ^ KEY2
```

Once all three keys are known, XORing them with the final encrypted value cancels the keys and leaves the flag.

## Recovery

Using pwntools' `xor()` function makes the calculations straightforward:

```python
from pwn import xor

key1 = bytes.fromhex(
    "a6c8b6733c9b22de7bc0253266a3867df55acde8635e19c73313"
)

key2 = xor(
    bytes.fromhex(
        "37dcb292030faa90d07eec17e3b1c6d8daf94c35d4c9191a5e1e"
    ),
    key1
)

key3 = xor(
    bytes.fromhex(
        "c1545756687e7573db23aa1c3452a098b71a7fbf0fddddde5fc1"
    ),
    key2
)

flag = xor(
    bytes.fromhex(
        "04ee9855208a2cd59091d04767ae47963170d1660df7f56f5faf"
    ),
    key1,
    key2,
    key3
)

print(flag)
```

The important idea is that XORing the same key again cancels it:

```text
A ^ B ^ B = A
```

Therefore, the three unknown keys can be eliminated from the final expression, leaving the original flag.

## Flag

```text
crypto{x0r_i5_ass0c1at1v3}
```