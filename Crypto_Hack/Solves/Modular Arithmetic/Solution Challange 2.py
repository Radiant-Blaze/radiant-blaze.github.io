from sympy import gcdex

p = 26513
q = 32321

u, v, g = gcdex(p, q)

print(u)
print(v)
print(g)

#def extended_gcd(a, b):
#    if b == 0:
#        return a, 1, 0
#
#    gcd, x1, y1 = extended_gcd(b, a % b)
#
#    x = y1
#    y = x1 - (a // b) * y1
#
#    return gcd, x, y