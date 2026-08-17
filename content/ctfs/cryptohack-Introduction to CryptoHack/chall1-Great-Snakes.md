---
title: Great Snakes
category: Crypto
points: 100
difficulty: 1
flag: crypto{z3n_0f_pyth0n}
solves: 
tags: [crypto, xor]
author: Radiant Blaze
description: A sequence of integers has been XORed by 50. Reverse the XOR operation to recover the hidden message.
---

## The Capture

We are given a sequence of integers:

```python
ords = [81, 64, 75, 66, 70, 93, 73, 72, 1, 92, 109, 2, 84, 109, 66, 75, 70, 90, 2, 92, 79]
````

The challenge tells us that the values were XORed by 50.

## The Mistake

XOR is reversible. Applying the same value again cancels the original XOR:

```text
x XOR 50 XOR 50 = x
```

So we simply XOR every number with `50` to recover the original characters.

## Recovery

The solve script iterates through every value and converts the result back into a character:

```python
ords = [81, 64, 75, 66, 70, 93, 73, 72, 1, 92, 109, 2, 84, 109, 66, 75, 70, 90, 2, 92, 79]

flag = []

for o in ords:
    flag.append(chr(o ^ 50))

print("".join(flag))
```

Since `50` in hexadecimal is `0x32`, the same operation can also be written more compactly:

```python
print("".join(chr(o ^ 0x32) for o in ords))
```

Running the decoder reveals the original message.

## Flag

```text
crypto{z3n_0f_pyth0n}
```
