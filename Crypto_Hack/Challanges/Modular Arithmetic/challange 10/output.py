from random import randint

a = 288260533169915
p = 1007621497415251

FLAG = b'crypto{????????????????????}'


def encrypt_flag(flag):
    ciphertext = []
    plaintext = ''.join([bin(i)[2:].zfill(8) for i in flag])
    for b in plaintext:
        e = randint(1, p)
        n = pow(a, e, p)
        if b == '1':
            ciphertext.append(n)
        else:
            n = -n % p
            ciphertext.append(n)
    return ciphertext


print(encrypt_flag(FLAG))


#This challenge is introducing the Goldwasser-Micali cryptosystem, or at least the core idea behind it.
# It looks confusing at first, but each line is actually doing something simple.

# for i in flag: Iterates through every item in the flag variable
# .bin(i): Turns the integer into a binary string starting with 0b (e.g., 5 becomes 0b101)
# .[2:]: Removes the 0b prefix from the binary string.
# .zfill(8): Pads the string with zeros on the left until it is 8 characters long, making a full byte
# .' ''.join(...): Glues all the 8-bit binary chunks into one long string.