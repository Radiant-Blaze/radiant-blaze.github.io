p = 29
ints = [14, 6, 11]  # check them if tehy are Quadratic root of 29 or not

for x in ints:
    roots = []

    for a in range(p):
        if (a * a) % p == x:
            roots.append(a)

    if roots:
        print(f"{x} is a Quadratic Residue having roots: ", roots)
    else:
        print(f"{x} is NOT a Quadratic Residue ")