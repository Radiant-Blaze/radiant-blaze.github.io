---
title: Hackel
category: Crypto
points: 24
difficulty: 3
flag: ASIS{sEm1d!r3c7_gr0uP_pr3S3nt4T10n____k3y___r3C0verY_4TtacK!!}
solves:
tags: [crypto, group-theory, classification, encoding]
author: Radiant Blaze
description: Recover the flag by identifying a leaked one-bit classification rule from the training samples and decoding the resulting 496-bit stream as ASCII.
---

# ASIS CTF Writeup: Hackel Security Service

## Challenge Overview

The challenge exposes a service called **Hackel Security Service v1.0** with several options:

```text
[1] View Public Parameters & Relations
[2] View Training Samples & Encrypted Flag Words
[3] Homomorphic Word Concatenation Oracle
[4] Submit Recovered Equivalent Key (Unlock Flag)
[5] Interactive Speed Challenge (Unlock Flag)
[6] Exit
```

The public parameters make the challenge look like a difficult group-theory or cryptanalysis problem. We are given a degree-11 presentation with upper- and lower-case generators, several relations, mixed relations, and a homomorphic concatenation oracle.

The key, however, is hidden in plain sight in the **training samples**.

## 1. Inspecting the Public Parameters

Selecting option `1` gives:

```text
[+] Parameters: degree n = 11
[+] Upper symbols: ['A', 'B', 'C', 'D', 'E']
[+] Lower symbols: ['a', 'b', 'c', 'd', 'e']
```

This is followed by a collection of relations such as:

```text
AAAAAAAAAA = 1
BBBBBBBBBBB = 1
AB = C
AD = BC
CD = E
ABD = E
AC = AAB
DE = DCD
CB = ABB
ED = CDD
```

There are corresponding lower-case relations:

```text
aaaaaaaaaa = 1
bbbbbbbbbbb = 1
ab = c
ad = bc
cd = e
abd = e
ac = aab
de = dcd
cb = abb
ed = cdd
```

There are also mixed relations:

```text
Aa = aA
Ab = abaaaaaaaaaA
Bb = bB
Ba = babbbbbbbbbbB
```

At this point, it is tempting to start solving the group presentation, deriving normal forms, or exploiting the homomorphic oracle.

That turns out to be unnecessary.

## 2. Inspecting the Training Samples

Option `2` reveals the most important information.

The service provides 16 training samples for class `0`:

```text
[+] Zero Training Words (16):
    aaaaaa, a, aaaaaa, aaaaaaa, aaa, aaaaaaaa,
    aaa, aaaaa, aaaaaaaaa, aaaaaa, aaaa, aaaaaaa,
    aaa, aaaaaaa, aaaaaaaaa, a
```

Every sample consists exclusively of `a`.

For class `1`, we get:

```text
[+] One Training Words (16):
    aaaab, aaaaab, aaab, aaaab, aaaab, aab,
    b, b, aaaaaab, aaaaab, aaaaab, aab, aab,
    aaab, ab, aaaaaaaab
```

Every word contains a `b`, and in these examples the `b` is the final character.

For example:

```text
Class 0:
a
aaa
aaaaaa
aaaaaaaaa

Class 1:
b
ab
aab
aaab
aaaab
```

This immediately suggests that the classifier is encoding a single binary property:

```text
a...a  →  0
a...ab →  1
```

In other words:

> **The bit is determined by whether the word ends in `b`.**

This is the crucial vulnerability.

## 3. Inspecting the "Encrypted" Flag Words

The service then provides:

```text
[+] Encrypted Flag Words (496):
    aaaaaaaa, aaaaab, aa, aaa, aaaaa, ...
```

Although these are called **encrypted flag words**, their structure is identical to the training data.

Each word is simply a unary representation ending either in `a` or `b`.

Therefore, instead of attempting to decrypt each word using the group relations, we can classify each word directly.

The mapping is:

```text
word ending in a → 0
word ending in b → 1
```

For example:

```text
aaaaaaaa  → 0
aaaaab    → 1
aa        → 0
aaa       → 0
aab       → 1
```

Thus, the entire ciphertext can be interpreted as a binary stream.

## 4. Why the Length Matters

There are exactly:

```text
496
```

encrypted words.

Each word gives exactly one bit, so:

```text
496 bits
─────── = 62 bytes
   8
```

This is a strong indication that the resulting bitstream is intended to represent an ASCII message.

We can therefore reconstruct the flag by:

1. Checking the final character of every encrypted word.
2. Mapping `a → 0` and `b → 1`.
3. Grouping the resulting bits into groups of 8.
4. Converting each byte to ASCII.

## 5. Recovering the Bitstream

A minimal extraction script is:

```python
words = [
    # Paste the 496 encrypted words here.
]

bits = ''.join(
    '1' if word.endswith('b') else '0'
    for word in words
)

print(f"Number of bits: {len(bits)}")
```

The expected result is:

```text
Number of bits: 496
```

We can then convert the bitstream to bytes:

```python
flag = bytes(
    int(bits[i:i + 8], 2)
    for i in range(0, len(bits), 8)
)

print(flag.decode())
```

## 6. Full Solver

A convenient complete solver is:

```python
encrypted_words = [
    # Paste the 496 encrypted words here.
]

# Extract one bit from every word.
#
# Training data shows:
#   a...a  -> 0
#   a...ab -> 1

bits = ''.join(
    '1' if word.endswith('b') else '0'
    for word in encrypted_words
)

assert len(bits) == 496

# Convert the binary stream to ASCII.
flag = ''.join(
    chr(int(bits[i:i + 8], 2))
    for i in range(0, len(bits), 8)
)

print(flag)
```

The result is:

```text
ASIS{sEm1d!r3c7_gr0uP_pr3S3nt4T10n____k3y___r3C0verY_4TtacK!!}
```

## 7. What About the Homomorphic Oracle?

Option `3` provides a concatenation oracle:

```text
[3] Homomorphic Word Concatenation Oracle

Enter Word 1:
abcd

Enter Word 2:
efgh

[+] Homomorphic Product Word: abcdefgh
```

For the supplied example:

```text
abcd · efgh
```

produces:

```text
abcdefgh
```

This confirms that the system performs a homomorphic operation on the words.

However, the oracle is unnecessary for flag recovery.

The training data already reveals the feature used by the classifier, and the encrypted flag words preserve that same feature.

Therefore, we do not need to reverse the group presentation or perform any complicated algebraic manipulation.

---

## 8. Why the Group Relations Are a Red Herring

The challenge deliberately provides a lot of intimidating mathematical material:

```text
degree n = 11
```

along with numerous group relations:

```text
AB = C
AD = BC
AC = AAB
...
```

and mixed upper/lower-case relations.

This strongly encourages an attacker to investigate the underlying algebraic structure.

However, the training samples provide a much simpler attack surface.

The actual information flow is:

```text
Training samples
       │
       ▼
Observe distinguishing feature
       │
       ▼
Does the word end in b?
       │
   ┌───┴───┐
   │       │
  No      Yes
   │       │
   ▼       ▼
   0       1
       │
       ▼
496-bit stream
       │
       ▼
62 ASCII bytes
       │
       ▼
      FLAG
```

The complicated group structure is therefore mostly camouflage for a much simpler classification leak.

---

## 9. Why the Training Samples Give It Away

The zero samples look like:

```text
a
aa
aaa
aaaa
...
```

while the one samples look like:

```text
b
ab
aab
aaab
aaaab
...
```

The number of `a`s varies between samples, so the length itself cannot be the classification feature.

For example:

```text
aaa       → 0
aaab      → 1
```

The meaningful difference is the final symbol.

Thus:

```text
aaaaaaaa  → 0
aaaaaaaab → 1
```

regardless of how many `a`s precede it.

The challenge effectively provides the encoding rule through the supervised examples.

---

## 10. Final Flag

The recovered 496-bit stream decodes to:

```text
ASIS{sEm1d!r3c7_gr0uP_pr3S3nt4T10n____k3y___r3C0verY_4TtacK!!}
```

Therefore, the final flag is:

```text
ASIS{sEm1d!r3c7_gr0uP_pr3S3nt4T10n____k3y___r3C0verY_4TtacK!!}
```

---

## TL;DR

The challenge appears to require breaking a complicated degree-11 group presentation, but the training data leaks the classifier directly.

```text
Zero:
a, aa, aaa, ...

One:
b, ab, aab, aaab, ...
```

Therefore:

```text
ends in a → 0
ends in b → 1
```

The 496 encrypted words give:

```text
496 bits = 62 bytes
```

Converting those bits to ASCII gives:

```text
ASIS{sEm1d!r3c7_gr0uP_pr3S3nt4T10n____k3y___r3C0verY_4TtacK!!}
```

## Key Takeaway

> **Always inspect the training data before attacking the mathematical construction.**

The challenge dresses a one-bit-per-word encoding scheme in an intimidating suit of group theory, but the classifier's behavior is already exposed by the supplied examples.