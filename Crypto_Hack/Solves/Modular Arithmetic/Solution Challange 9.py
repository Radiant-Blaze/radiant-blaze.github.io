# x ≡ 2 (mod 5)
# x ≡ 3 (mod 11)
# x ≡ 5 (mod 17)

# Start with the largest modulus
x = 5

while True:

    if x % 11 == 3 and x % 5 == 2:
        print("Answer:", x)
        break

    # Next number satisfying x ≡ 5 (mod 17)
    x += 17