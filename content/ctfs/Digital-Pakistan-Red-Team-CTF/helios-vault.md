---
title: Helios Vault
category: Programming
points: 50
difficulty: 2
flag: "prg{th3_qu0rum_h0lds_[A-Za-z0-9]{81794651779Y1v4PR83785774856de4af93010f8d78d130265e4a462089_523}"
solves:
tags: [programming, crypto, shamir-secret-sharing, lagrange-interpolation, ctf]
author: Radiant Blaze
description: Recover a sealed secret from a threshold secret-sharing scheme. The service sends a quorum of shares over a fresh prime field in each of 50 rounds and expects the polynomial's value at x = 0.
---

# Helios Vault

## Challenge Overview

Helios is a key-management vault that protects a master secret with a **threshold scheme**. Instead of storing the secret in one place, the vault splits it into shares, and any quorum (`threshold` shares) is enough to rebuild it. The remote service acts as the unseal process, but it works against us: it hands over a quorum of shares and demands the sealed secret back, round after round.

| Item | Value |
|------|-------|
| Objective | Return the sealed secret for all 50 rounds |
| Limit | 20-second window (`window_seconds`) |
| Protocol | Newline-delimited JSON over TCP |

Although the mechanism is cryptographic, the challenge is classified as programming. It is a speed test wrapped around a well-known algorithm: the math is standard, so the real work is automating it - parse a round, interpolate, answer, repeat, all faster than you could do by hand.

## Attack Chain

```mermaid
flowchart TD
    %% ---------- Target ----------
    A[("Target: Helios Vault<br/>52.146.88.61:36412")]:::target
    B["Connect with nc<br/>read header JSON"]:::attacker
    C["Header: 50 rounds, 20 s window<br/>reply: secret in [0, prime)"]:::target
    D["Recon: threshold secret sharing<br/>secret = f(0), degree t-1"]:::recon
    W{{"Weakness: exactly t points given<br/>t points fix a degree t-1 polynomial"}}:::vuln
    E["Receive round JSON<br/>prime, threshold t, t shares"]:::target
    F["Lagrange interpolation at x = 0<br/>all math mod prime<br/>inverse via pow(den, -1, p)"]:::attacker
    G["Send {secret: f(0)}<br/>one JSON line"]:::attacker
    H{"Rounds remaining?"}:::decision
    I["Server status:<br/>unsealed, rounds 50"]:::target
    J(["Flag recovered:<br/>prg{th3_qu0rum_h0lds_...}"]):::flag

    %% ---------- Edges ----------
    A --> B
    B -->|"header JSON"| C
    C --> D
    D --> W
    W -->|"solver design"| E
    E -->|"round JSON"| F
    F --> G
    G -->|"secret reply"| H
    H -->|"yes: next round"| E
    H -->|"no: all 50 answered"| I
    I -->|"status with flag"| J

    %% ---------- Roles ----------
    classDef target fill:var(--panel),stroke:var(--accent-cyan),color:var(--text)
    classDef attacker fill:var(--panel),stroke:var(--accent-pink),color:var(--text)
    classDef recon fill:var(--panel),stroke:var(--muted),color:var(--text)
    classDef vuln fill:var(--panel),stroke:var(--accent-orange),stroke-width:3px,color:var(--text)
    classDef decision fill:var(--panel),stroke:var(--accent-orange),color:var(--text)
    classDef flag fill:var(--panel),stroke:var(--accent-pink),stroke-width:3px,color:var(--text)
```

The chain is linear: connect, read the banner, interpolate every round, answer it, and repeat fifty times.

## Initial Analysis

A first connection reveals the protocol directly, with no files to download:

```bash
nc 52.146.88.61 36412
```

The server opens with a header line:

```json
{"service": "Helios Vault :: threshold unseal", "format": "newline-delimited JSON - one request per line, answer with one line", "rounds": 50, "window_seconds": 20.0, "field": "every share value is an element of GF(prime); a fresh prime is given each round", "task": "each round gives `threshold` points [x, share] that lie on a secret polynomial of degree threshold-1; return the sealed secret = that polynomial evaluated at x = 0", "reply": {"secret": "<integer in [0, prime)>"}}
```

Every field we need is stated up front:

- **`rounds: 50`** - fifty challenges must be answered in one session.
- **`task`** - each round gives `threshold` points on a polynomial of degree `threshold - 1`; we must return that polynomial evaluated at `x = 0`.
- **`reply`** - the expected answer is a single JSON object: `{"secret": <integer in [0, prime)>}`.
- **`field`** - a fresh prime is used each round.

The first round arrives as a single JSON line:

```json
{"round": 1, "prime": 1478616303227738723, "threshold": 9, "shares": [[1387322470162783777, 1265916940676034033], [721790015139415492, 233728811494920526], [988495008654581189, 49685712056734484], [1249476344602296357, 109696295801146317], [496946415259594823, 565690933654595847], [569859639077843980, 114886452163461588], [965911201683639021, 78307101034556644], [733113341250019858, 437831775329762869], [841887086015670200, 1440830964198922657]]}
```

Reading this line tells us what the scheme really is:

- **Shamir's Secret Sharing.** Each share `[x, y]` is a point on a secret polynomial `f` of degree `threshold - 1` over the finite field GF(`prime`). The sealed secret is the constant term - the value at `x = 0`, since an unsealed secret at "zero position" is the obvious design.
- **A quorum is exactly what we need.** Here `threshold` is 9 and the server sends 9 shares. A polynomial of degree 8 is uniquely determined by 9 distinct points, so the round is fully solvable with no guessing.
- **Nothing is hardcoded.** The prime and the threshold change between rounds, so the solver must read them out of each message.

One subtlety: the sample above was captured during reconnaissance. Every connection draws its own fresh rounds, each with a new prime and threshold, so the solve session shown later reports a different `threshold` for *its* round 1. The solver therefore never assumes anything about a round beyond what that round's message contains.

In other words, the design is correct cryptography. The quorum genuinely reconstructs the secret - and the service deliberately gives us that quorum. The challenge is not to break Shamir, but to *be* the reconstruction algorithm at machine speed.

### The mathematical tool: Lagrange interpolation at x = 0

Given `t` points `(x_i, y_i)` on a polynomial of degree `t - 1`, the value at any point - including `x = 0` - is given by the Lagrange formula:

$$
f(0) = \sum_{i=1}^{t} y_i \prod_{j \neq i} \frac{0 - x_j}{x_i - x_j} \pmod{p}
$$

Each product term is a Lagrange basis polynomial: it evaluates to 1 at `x_i` and to 0 at every other `x_j`. Multiplying it by `y_i` and summing therefore reproduces the curve exactly, and setting the target coordinate to `x = 0` yields the secret directly. This avoids solving a linear system for all coefficients - we only need the constant term.

Because we are working in GF(p), all arithmetic is modular and that division is really multiplication by a modular inverse. Since `p` is prime and the `x`-coordinates are distinct, every denominator is coprime with `p`, so the inverse always exists. Python computes it with `pow(den, -1, p)`.

## Solution

### Step 1: Implement the solver

The script connects once, reads each round, interpolates `f(0)`, and writes the answer back as one JSON line.

```python
# solve.py - recover the Shamir secret (f(0)) for every round
import socket, json

HOST, PORT = "52.146.88.61", 36412

def recover(p, shares):
    # Lagrange interpolation evaluated at x = 0 over GF(p)
    secret = 0
    for i, (xi, yi) in enumerate(shares):
        num, den = 1, 1
        for j, (xj, _) in enumerate(shares):
            if i != j:
                num = num * (-xj) % p          # factor (0 - x_j)
                den = den * (xi - xj) % p      # factor (x_i - x_j)
        # divide by den via its modular inverse (valid because p is prime)
        secret = (secret + yi * num * pow(den, -1, p)) % p
    return secret

def main():
    s = socket.create_connection((HOST, PORT), timeout=30)
    f = s.makefile("rwb")

    def readline():
        line = f.readline()
        if not line:
            raise SystemExit("connection closed")
        return json.loads(line)

    hello = readline()                          # header line, not a round
    print("hello:", {k: hello[k] for k in ("rounds", "window_seconds")}, flush=True)

    while True:
        msg = readline()
        if "shares" not in msg:                 # final status message
            print("server:", msg, flush=True)
            break

        # each round supplies its own prime, threshold, and shares
        secret = recover(msg["prime"], [tuple(x) for x in msg["shares"]])
        f.write((json.dumps({"secret": secret}) + "\n").encode())
        f.flush()
        print(f"round {msg.get('round')} t={msg['threshold']} secret={secret}", flush=True)

main()
```

Design notes:

- **Read the field per round.** The prime and shares are taken from every message, so a rotating prime never breaks the solver.
- **Modular inverse, not floating point.** `pow(den, -1, p)` gives the exact inverse; integers stay exact at 64-bit scale, where floats would lose precision.
- **Answer immediately.** Each round is parsed, solved, and answered before the next message is read, so the time budget is never a concern.
- **Break on the status message.** The final server message has no `shares` key; that is the natural loop exit.

### Step 2: Run it

```bash
cd /tmp/helios && timeout 120 python3 solve.py
```

Excerpt from the solve run (a fresh session, so its round 1 differs from the reconnaissance sample above):

```text
hello: {'rounds': 50, 'window_seconds': 20.0}
round 1 t=5 secret=14479869441710379
round 2 t=7 secret=1078447066830618870
round 3 t=3 secret=549184523904330006
...
round 49 t=7 secret=994939925788202210
round 50 t=9 secret=1513132986169293939
server: {'status': 'unsealed', 'rounds': 50, 'flag': 'prg{th3_qu0rum_h0lds_[A-Za-z0-9]{81794651779Y1v4PR83785774856de4af93010f8d78d130265e4a462089_523}'}
```

All 50 rounds were answered. The whole session finished in about 11 seconds, comfortably inside the window, and the server reported `unsealed`.

## Flag

Once every round was solved, the server replaced the round feed with a status message carrying the flag:

```text
prg{th3_qu0rum_h0lds_[A-Za-z0-9]{81794651779Y1v4PR83785774856de4af93010f8d78d130265e4a462089_523}
```

The flag is reproduced exactly as the server sent it. Note that the string contains a regex-like fragment, `[A-Za-z0-9]{...}`. That may be part of the intended flag or a placeholder in the challenge deployment; verify the exact format against the submission rules before entering it.

## Key Takeaways

- **Threshold secret sharing (Shamir).** A secret is the constant term of a random polynomial of degree `t - 1`. Fewer than `t` shares reveal nothing, while any `t` shares reconstruct it. The security lives in the quorum size, not in the individual shares - so a party that legitimately holds a quorum can always recover the secret.
- **Lagrange interpolation.** Any `t` points on a degree `t - 1` polynomial determine it uniquely. Evaluating at `x = 0` costs a fraction of solving for the coefficients, which matters when speed is the objective.
- **Finite-field arithmetic.** Work in GF(p) for a prime `p`; division becomes multiplication by the modular inverse, and exactness is preserved because no floating point is involved.
- **Automate the protocol, not just the math.** The cryptographic primitive was standard. The winning move was a socket client that parsed newline-delimited JSON, answered each round inline, and never fell behind.
