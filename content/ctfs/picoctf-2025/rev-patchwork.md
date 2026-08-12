---
title: Patchwork
category: Reversing
points: 300
difficulty: 3
flag: picoCTF{0ne_by73_t0_rul3_th3m_4ll}
solves: 640
tags: [reversing, ghidra, binary-patching]
author: Radiant Blaze
description: A license check compares against a mangled string. Patch a single conditional jump and the binary confesses.
---
## First Look

The binary asks for a license key and exits with `Invalid key.` for everything. Running `strings` shows no plaintext flag, so the check is computed at runtime.

## Static Analysis

Loading it in Ghidra, `main` calls `verify()` and branches on its return value:

```c
if (verify(input) == 0) {
    puts("Invalid key.");
} else {
    print_flag();
}
```

`verify` derives the flag by XORing the stored blob with a key that only materialises when the comparison passes — so we cannot simply read it out. The decision funnels through one `JZ` at `0x11a7`.

> You do not always need to *understand* the check. Sometimes you only need to disagree with it.

## The Patch

Flip the conditional jump so the success path is always taken. `JZ` (`74`) becomes `JNZ` (`75`) — a single byte:

```sh
printf '\x75' | dd of=patchwork conv=notrunc bs=1 seek=$((0x11a7))
./patchwork AAAA
```

`print_flag()` now runs regardless of the key, deriving the flag on the fly.

## Flag

```
picoCTF{0ne_by73_t0_rul3_th3m_4ll}
```
