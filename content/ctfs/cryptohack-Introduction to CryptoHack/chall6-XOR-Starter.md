---
title: XOR-Starter
category: Crypto
points: 100
difficulty: 1
flag: crypto{aloha}
solves: 
tags: [crypto, xor]
author: Radiant Blaze
description: XOR each character of the string "label" with the integer 13 and convert the resulting integers back into characters.
---

## The Capture

XOR is a bitwise operator that returns `0` when two bits are the same and `1` when they are different.

The XOR operation is commonly represented using `^` in programming languages.

For two bits:

```text
A B Output
0 0   0
0 1   1
1 0   1
1 1   0
````

For longer binary numbers, XOR is performed bit by bit:

```text
0110 ^ 1010 = 1100
```

We are given the string:

```text
label
```

The challenge asks us to XOR each character with the integer `13`, convert the resulting integers back into characters, and submit the result in the format:

```text
crypto{new_string}
```

## The Mistake

Each character can be converted into its integer representation using `ord()`.

We can then XOR that integer with `13`:

```python
ord(character) ^ 13
```

Finally, `chr()` converts the resulting integer back into a character.

## Recovery

We can implement the XOR operation manually:

```python
encoded = "label"

decoded = []

for e in encoded:
    decoded.append(ord(e) ^ 13)

print("".join(chr(a) for a in decoded))
```

The output is:

```text
aloha
```

The challenge also provides an alternative using pwntools' `xor()` function:

```python
from pwn import *

encoded = "label"

decoded = xor(encoded, 13)

print(decoded)
```

Both approaches produce the same result.

## Flag

```text
crypto{aloha}
```