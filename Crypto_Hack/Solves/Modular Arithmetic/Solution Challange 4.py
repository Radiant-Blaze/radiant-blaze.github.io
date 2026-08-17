# Fermat's Little Theorem
# If p is prime and a is not divisible by p:
# a^(p-1)   mod p = 1
# a^p       mod p = a

print("3^17 % 17 =", pow(3, 17, 17))
print("3^16 % 17 =", pow(3, 16, 17), "\n")

print("5^17 % 17 =", pow(5, 17, 17))
print("5^16 % 17 =", pow(5, 16, 17), "\n")

# Since 65537 is prime:
# a^(65537-1) mod 65537 = 1

print("273246787654^65536 % 65537 =", pow(273246787654, 65536, 65537), "\n")

print("Fermat's Little Theorem:")
print("If p is prime and a is not divisible by p:")
print("a^(p-1) mod p = 1 \n")