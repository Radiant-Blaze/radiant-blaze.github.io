from pwn import * 

encoded = "label"
#decoded = xor( encoded, 13 )

#print(decoded)

decoded = []

for e in encoded:
    decoded.append( ord(e) ^ 13 )

print("".join( chr(a) for a in decoded ))