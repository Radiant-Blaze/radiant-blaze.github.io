---
title: Promise
category: Crypto
points: 120
difficulty: 3
flag: "crypto{r4t10s_0f_sh1ft3d_1nv3rs3s_c0nv3rg3_t0_th3_k3y1794649908OFtMEeTDb00a936b06aebab4f8ffd28c5b18dd0eef6c7109_523}"
solves:
tags: [crypto, knapsack, continued-fractions, number-theory, modular-inverse, ctf]
author: Radiant Blaze
description: A knapsack-style KEM whose public key is a set of primes' modular inverses shifted by one common secret. Recover every prime with continued fractions, rebuild the private key, and unmask the flag.
---

# Promise


| Item | Value |
|---|---|
| Service | `nc 52.146.88.61 35628` |
| Handout | `chall.py` (Python 3, `pycryptodome`) + an instance dump (`params`, `pk`, `c1`, `c2`, `enc`) |
| Parameters | `n = 150`, `t = 20`, `b = 40`, `beta = 5` |
| Sizes | `p_i` prime in `[2^40, 2^45)`, `g` in `[2^1802, 2^1803)`, 20 non-zero multipliers below `2^40` |
| Primitives | knapsack-like KEM, continued-fraction ("rational reconstruction") decryption, `SHA-256` + `SHAKE-256` |

The service prints one instance per connection:

```
params = (150, 20, 40, 5)
pk = [19044193886165081599..., 34388522331157288459718..., ...]   # 150 entries
c1 = 22995376076831719957...      # 150-digit integer
c2 = 12305602476974               # sum of the 20 secret coefficients
enc = 0d8f1c...                   # 116 bytes of flag XOR keystream
```

The objective: given `pk`, `c1`, `c2`, recover the plaintext vector `e`, derive the KEM key and unmask `enc`.

## TL;DR

1. `chall.py` publishes `t_i = (h_i - u) mod g` where `h_i = p_i^{-1} mod g` and `u` is one secret offset shared by all 150 entries.
2. Writing `y_i` for the representative of `t_i + u`, we get the exact identity `y_i * p_i = 1 + K_i * g` with `0 < K_i < 2 * p_i < 2^46`.
3. For a reference index `r`, the ratio `(t_i - t_r) / (t_j - t_r)` equals `(n_i * p_j) / (n_j * p_i) * (1 + O(2^-1800))` with `n_x = K_x * p_r - K_r * p_x` and `|n_x| < 2^92`.
4. That approximating fraction has numerator/denominator below `2^138` while the error is about `2^-1800`, so by Legendre's theorem it is a continued-fraction convergent — and because the *next* convergent jumps to a denominator around `2^1660`, it is the **last convergent with denominator below `2^140`**.
5. For a fixed `i` and varying `j` those spike denominators are `n_j * p_i / gcd(...)`, so their **gcd is exactly `p_i`**. All 150 primes come out of the public key alone (about 2 s of continued fractions).
6. `g = gcd_ij [ p_i * p_j * (t_i - t_j) + p_i - p_j ]` (each bracket is an exact multiple of `g`), and `u = p_i^{-1} - t_i mod g`.
7. Plug `(ps, g, u)` into the challenge's own continued-fraction `decrypt` to get `e`, then `key = sha256("1|" + str(e) + "|" + str((c1, c2)))` and `flag = enc XOR shake_256(key)`.

## Attack Chain

```mermaid
flowchart TD
    %% ---------- Target ----------
    T0["Target: promise KEM<br/>t_i = (p_i^-1 - u) mod g<br/>prints pk, c1, c2, enc"]:::target
    A1["Attacker: connect and capture<br/>nc 52.146.88.61 35628"]:::attacker

    %% ---------- The leak ----------
    V1{{"LEAK: (t_i - t_r)/(t_j - t_r)<br/>= (n_i p_j)/(n_j p_i) * (1 + O(2^-1800))<br/>num and den below 2^138"}}:::vuln

    %% ---------- Step 1: primes ----------
    S1["Attacker: CF of each ratio<br/>take last convergent with den &lt; 2^140"]:::attacker
    S2["Attacker: gcd of spike denominators<br/>for fixed i over all j<br/>=&gt; p_i exactly"]:::attacker
    S2r["Target data: all 150 primes p_i recovered"]:::target

    %% ---------- Step 2: private key ----------
    S3["Attacker: g = gcd_ij p_i p_j (t_i - t_j) + p_i - p_j"]:::attacker
    S4["Attacker: u = p_i^-1 - t_i mod g"]:::attacker
    S4r["Target data: private key (ps, g, u) rebuilt"]:::target

    %% ---------- Step 3: plaintext ----------
    S5["Attacker: s = (c1 + u c2) mod g<br/>CF reconstructs den = P, num = sum e_i P/p_i"]:::attacker
    S6["Attacker: e_i = num * (P/p_i)^-1 mod p_i<br/>(e_i &lt; 2^40 &lt; p_i)"]:::attacker

    %% ---------- Step 4: flag ----------
    S7["Attacker: key = sha256(1|e|(c1,c2))<br/>flag = enc XOR shake_256(key)"]:::attacker
    F["FLAG<br/>crypto{r4t10s_0f_sh1ft3d_1nv3rs3s_c0nv3rg3_t0_th3_k3y1794649908OFtMEeTDb00a936b06aebab4f8ffd28c5b18dd0eef6c7109_523}"]:::flag

    %% ---------- Edges ----------
    T0 --> A1 --> V1 --> S1 --> S2 --> S2r
    S2r --> S3 --> S4 --> S4r
    T0 --> S5
    S4r --> S5 --> S6 --> S7 --> F

    %% ---------- Roles ----------
    classDef target fill:var(--panel),stroke:var(--accent-cyan),color:var(--text)
    classDef attacker fill:var(--panel),stroke:var(--accent-pink),color:var(--text)
    classDef vuln fill:var(--panel),stroke:var(--accent-orange),stroke-width:3px,color:var(--text)
    classDef flag fill:var(--panel),stroke:var(--accent-pink),stroke-width:3px,color:var(--text)
```

The chain is linear: public key -> all primes -> `g` -> `u` -> `e` -> key -> flag. No lattice reduction and no search are needed anywhere.

## The scheme in `chall.py`

### Parameters

```python
n, t, b, beta = 150, 20, 40, 5
z = 1 << b                       # 2^40, upper bound for each plaintext digit
d = b + beta                     # 45 bits per prime
B = max(b + ceil(log2(t)) + (t - 1) * d, t * d)   # 900
G = 2 * B + 3                    # 1803 bits for the modulus
```

`B = 900` is the size of the largest number the decryption has to reconstruct, and `G = 2B + 3 = 1803` makes `sqrt(g) > 2^901 > 2^900`. That margin is the whole "promise" of the scheme.

### Key generation

```python
ps = [next_prime(randrange(1 << b, 1 << (b + beta))) ...]   # 150 distinct primes in [2^40, 2^45)
g  = randrange(1 << (G - 1), 1 << G)                        # ~2^1803, coprime to every p_i
hs = [inverse(p, g) for p in ps]                            # h_i = p_i^-1 mod g
u  = randrange(1, g)                                        # one shared secret offset
ts = [(h - u) % g for h in hs]                              # public key
```

So the public key is a **shifted** set of modular inverses: `t_i = (p_i^{-1} - u) mod g`.

### Encryption

```python
e = 20 random non-zero values below 2^40, at 20 random positions out of 150
c1 = sum(e_i * t_i)     # over the integers, not reduced mod g
c2 = sum(e_i)           # the total weight, leaked on purpose
```

### Decryption (the promise)

```python
s = (c1 + u * c2) % g            # = sum e_i * p_i^-1 (mod g)
den, num = reconstruct(g, s)     # continued fractions: v1 * s = r1 (mod g), |r1| < sqrt(g)
```

Multiplying `s` by `P = prod(p_i for i in support)` gives

```text
P * s  =  sum_i e_i * P / p_i   (mod g)  =:  num
```

with `P < 2^900` and `num < 2^900`, both below `sqrt(g)`. The continued fraction of `s/g` uniquely exposes that pair, so `den = P` and `num = sum e_i * P/p_i`. Then `e_i = num * (P/p_i)^{-1} mod p_i`, and because `e_i < 2^40 <= p_i`, the residue is the digit itself.

The `encap`/`decap` wrapper turns that into a KEM: `key = sha256("1|e|ct")`, the ciphertext is `(c1, c2)`, and the flag is XORed with `shake_256(key)`.

## Where it breaks

### Exact shape of the shift

Let `y_i` be the representative of `t_i + u` in `(0, g]` — i.e. `t_i + u` itself, or `t_i + u - g` if that wrapped. Since `y_i = p_i^{-1} (mod g)`,

```text
y_i * p_i = 1 + K_i * g          with  0 < K_i < 2 * p_i < 2^46
```

(`K_i = k_i` without a wrap and `K_i = k_i + p_i` with one, where `k_i = floor(p_i * y_i / g)`).

Two facts are worth noticing before doing anything clever:

- `t_i` carries a common unknown `u`, but `t_i - t_r = y_i - y_r` — the offset **cancels in differences**.
- `g` also cancels in **ratios of differences**, leaving a rational whose denominator is only about `2^90`.

### Ratios of differences are too good to be random

With a fixed reference `r` and any `i, j != r`, substituting `y_i = (1 + K_i g)/p_i` gives

```text
t_i - t_r        g * (K_i * p_r - K_r * p_i) + (p_r - p_i)      n_i
---------  =  --------------------------------------------  =  ----- * (1 + eps)
t_j - t_r        g * (K_j * p_r - K_r * p_j) + (p_r - p_j)      n_j
```

with

```text
n_x  =  K_x * p_r - K_r * p_x          |n_x| < 2^46 * 2^45 * 2 = 2^92
eps  =  O( p_r / (g * n_x) )           roughly 2^-1800
```

So the known rational `(t_i - t_r)/(t_j - t_r)` is approximated by `(n_i * p_j)/(n_j * p_i)` with

| quantity | size |
|---|---|
| `K_i` | `< 2^46` |
| `n_x` | `< 2^92` |
| numerator `n_i * p_j` | `< 2^138` |
| denominator `n_j * p_i` | `< 2^138` |
| approximation error | about `2^-1800` |

For a fraction `a/b` with `b < 2^138`, a random rational is only guaranteed accuracy around `1/b^2 = 2^-276`. The observed error is more than a thousand bits better, so by **Legendre's theorem** (a rational within `1/(2b^2)` of `x` must be a convergent of the continued fraction of `x`) this fraction *is* a convergent of `(t_i - t_r)/(t_j - t_r)`.

Even better, the convergent *after* it has denominator roughly `2^(1800-137) = 2^1660`: the approximation is a visible "spike" in the continued fraction. Around it the partial quotients are ordinary, so the practical rule is simply:

> the convergent we want is the **last convergent whose denominator is below `2^140`**.

### Turning convergents into primes

Fix the numerator index `i` and let `j` run over all other indices. The spike denominators are

```text
den_j  =  n_j * p_i / gcd(n_i * p_j, n_j * p_i)         (generically n_j * p_i / gcd(n_i, n_j))
```

The `n_j` are effectively random 92-bit integers, so their gcd is 1 and

```text
gcd_j ( den_j )  =  p_i          exactly
```

This was checked against a locally generated instance with full ground truth: for a real-size instance the recovered gcd-of-denominators was **bit-for-bit equal** to the true `p_i` (`p_i = 22188660368639`, `equal? True`). The numerator gcds reproduce `n_i` up to a small common factor, but `n_i` is not needed, so no cleanup is required.

### Finishing the private key

With all `p_i` known, each difference satisfies an exact congruence:

```text
(t_i - t_j) * p_i * p_j  =  (p_j - p_i) + g * n_ij
```

so `g` divides every `p_i * p_j * (t_i - t_j) + p_i - p_j`, and a gcd over a handful of pairs returns `g` itself (on a small test instance, `gcd(B_ij) / g = 1`). One modulus inversion then gives the offset:

```text
u  =  p_i^{-1} - t_i   (mod g)
```

No lattice reduction, no Coppersmith, no searching: the public key is simply too structured.

## The solver

The solver below is what was used. It reads an instance dump and prints the recovered plaintext, the KEM key and the flag.

```python
#!/usr/bin/env python3
"""crypto-promise solver."""
import sys, ast, re
from math import gcd
from hashlib import sha256, shake_256
try:
    from Crypto.Util.number import inverse, GCD          # remote / pycryptodome
except ImportError:
    from Cryptodome.Util.number import inverse, GCD      # local fallback

def spike(num, den, bound_bits=140):
    """Last convergent of num/den (both > 0) with denominator < 2^bound_bits."""
    p, q = num, den
    pn2, pn1 = 0, 1
    qn2, qn1 = 1, 0
    prev = None
    lim = 1 << bound_bits
    while q:
        a = p // q
        pn2, pn1 = pn1, a * pn1 + pn2
        qn2, qn1 = qn1, a * qn1 + qn2
        if qn1 > lim:                 # we just passed the spike
            return prev               # -> the spike itself
        prev = (pn1, qn1)
        p, q = q, p - a * q
    return prev

def recover_primes(ts, bound_bits=140, verbose=False):
    """For every i: gcd of the spike denominators of (t_i-t_r)/(t_j-t_r) is p_i."""
    n = len(ts)
    ps = [None] * n
    for i in range(n):
        r = 0 if i != 0 else 1               # reference must differ from i
        di = abs(ts[i] - ts[r])
        D, cnt = 0, 0
        for j in range(n):
            if j == i or j == r:
                continue
            dj = abs(ts[j] - ts[r])
            if dj == 0:
                continue
            frac = spike(di, dj, bound_bits)
            if frac is None:
                continue
            D = gcd(D, frac[1])
            cnt += 1
        ps[i] = D
        if verbose:
            print(f'  i={i:3d} pairs={cnt} p_i bits={D.bit_length()}')
    return ps

# --- the challenge's own continued-fraction decryption, unchanged ---
def reconstruct(a, b_):
    r0, r1 = a, b_
    v0, v1 = 0, 1
    c = r0 // r1
    r0, r1 = r1, r0 - c * r1
    v0, v1 = v1, v0 - c * v1
    while r1 * r1 >= a:
        c = r0 // r1
        r0, r1 = r1, r0 - c * r1
        v0, v1 = v1, v0 - c * v1
    return v1, r1

def decrypt(sk, ct):
    ps, g, u = sk
    c1, c2 = ct
    s = (c1 + u * c2) % g
    den, num = reconstruct(g, s)
    if den < 0:
        den, num = -den, -num
    ks = [i for i, p in enumerate(ps) if GCD(p, den) != 1]   # support
    prod = 1
    for i in ks:
        prod *= ps[i]
    scale = prod // den
    den, num = prod, num * scale
    e = [0] * len(ps)
    for i in ks:
        p = ps[i]
        e[i] = num * inverse(den // p % p, p) % p
    return e

def H(bit, e, ct):
    return sha256(f"{bit}|{e}|{ct}".encode()).digest()

def solve(ts, ct, enc, t=20, verbose=False):
    c1, c2 = ct
    n = len(ts)
    ps = recover_primes(ts, verbose=verbose)
    assert all(ps), 'prime recovery failed'
    g = 0
    for i in range(min(n, 12)):                     # a dozen pairs are plenty
        for j in range(i + 1, min(n, 13)):
            g = gcd(g, ps[i] * ps[j] * (ts[i] - ts[j]) + ps[i] - ps[j])
    assert g and g.bit_length() > 1000, 'g recovery failed'
    if verbose:
        print(f'  g bits={g.bit_length()}')
    u = (inverse(ps[0], g) - ts[0]) % g
    e = decrypt((ps, g, u), ct)
    assert sum(1 for x in e if x) == t, 'sparsity check failed'
    assert sum(e) == c2, 'sum check failed'
    assert sum(x * y for x, y in zip(e, ts)) == c1, 'knapsack check failed'
    key = H(1, e, ct)
    flag = bytes(x ^ y for x, y in zip(enc, shake_256(key).digest(len(enc)))) if enc else None
    return flag, (ps, g, u), e

def read_instance(txt):
    p  = ast.literal_eval(re.search(r'params\s*=\s*(\([^)]*\))', txt).group(1))
    pk = ast.literal_eval(re.search(r'pk\s*=\s*(\[[\s\S]*?\])\s*\n', txt).group(1))
    c1 = int(re.search(r'c1\s*=\s*(\d+)', txt).group(1))
    c2 = int(re.search(r'c2\s*=\s*(\d+)', txt).group(1))
    m  = re.search(r'enc\s*=\s*([0-9a-fA-F]*)', txt)
    enc = bytes.fromhex(m.group(1)) if m and m.group(1) else b''
    return p, pk, c1, c2, enc

if __name__ == '__main__':
    txt = open(sys.argv[1]).read() if len(sys.argv) > 1 else sys.stdin.read()
    params, pk, c1, c2, enc = read_instance(txt)
    flag, (ps, g, u), e = solve(pk, (c1, c2), enc, t=params[1], verbose=True)
    print('[+] e =', e)
    print('[+] KEM key =', H(1, e, (c1, c2)).hex())
    print('[+] flag =', flag.decode(errors='replace') if flag else '<enc empty>')
```

Run it on a captured instance:

```bash
python3 solve.py instance.txt
```

Three assertions guard the result: the plaintext must have exactly `t = 20` non-zero digits, their sum must equal `c2`, and `sum(e_i * t_i)` must equal `c1`. A wrong `g`/`u` cannot satisfy all three, so a silent failure is impossible.

## Verification

### Local round trip with ground truth

Before touching the live service the scheme was re-implemented locally (same parameters) so the attack could be graded against the real secrets:

```
n,t,b,beta 150 20 40 5
g bits 1803  p bits min/max 40 45
ps match: True  g match: True  u match: True  e match: True
elapsed 2.2s
flag: b'flag{synthetic_runner_test_OK}'
```

All four secrets came back exactly, and the solver printed the test flag it had XORed in.

### Live instance

Captured from the service and solved offline:

```
[i] params=(150, 20, 40, 5) pk=150 c2=12305602476974 enc=116 bytes
  i=149 pairs=148 p_i bits=43
  g bits=1803
[+] e nonzero count = 20
[+] KEM key = 6f1ca54933a42f6903e79cf81f0b64e6ffee84861c0e18c482b8ec041870f4b5
[+] flag = crypto{r4t10s_0f_sh1ft3d_1nv3rs3s_c0nv3rg3_t0_th3_k3y...}
```

The XOR step was also redone by hand from the captured `enc` and the recovered key (`enc XOR shake_256(key)`, 116 printable bytes), so the flag does not depend on the solver's own XOR line.

## Flag

```text
crypto{r4t10s_0f_sh1ft3d_1nv3rs3s_c0nv3rg3_t0_th3_k3y1794649908OFtMEeTDb00a936b06aebab4f8ffd28c5b18dd0eef6c7109_523}
```

The flag text is a hint for exactly the technique used here: *ratios of shifted inverses converge to the key*.

## Notes

The recovery costs one continued fraction per `(i, j)` pair — about `150 * 148` of them, each stopped as soon as the denominator passes `2^140`. Runtime is around 2 seconds per instance in plain CPython.

## Key Takeaways

- **A shared additive offset is not a hiding place.** `t_i = (p_i^{-1} - u) mod g` shuffles every public value by the same secret, but differences cancel `u` and ratios of differences cancel `g` too, exposing a rational whose denominator is only `2^90`-ish.
- **Legendre's theorem is a detection tool.** When an approximation is much better than `1/b^2`, the fraction must be a continued-fraction convergent. The tell-tale sign is a sudden jump in convergent denominators, which also tells you exactly where to stop reading.
- **Small quantities are clues.** The primes are only 45 bits and the multipliers `K_i` only 46 bits; the whole 1803-bit public value was built from bits that are 40+ bits shorter, and that imbalance is what the continued fractions exploited.
- **Grab the ground truth first.** Re-implementing the challenge locally with the same parameters made it possible to verify the recovery of `p_i`, `g`, `u` and `e` exactly — that is what justified trusting the attack on the live instance.
- **Design lesson.** The scheme's "promise" (a numerator and a denominator both below `sqrt(g)`, so continued fractions can reconstruct them) is also its weakness: the same shortness that lets a legitimate decryptor invert the ciphertext lets an attacker recognise the structure in the public key.
