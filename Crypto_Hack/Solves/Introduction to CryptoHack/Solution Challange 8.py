from pwn import xor

cipher = bytes.fromhex("73626960647f6b206821204f21254f7d694f7624662065622127234f726927756d")

for key in range(256):
    plaintext = xor(cipher, key)

    if b"crypto" in plaintext:
        print("Key:", key)
        print("Plaintext:", plaintext.decode())
        break