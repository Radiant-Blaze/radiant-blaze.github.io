ords = [81, 64, 75, 66, 70, 93, 73, 72, 1, 92, 109, 2, 84, 109, 66, 75, 70, 90, 2, 92, 79]

cipher = []

for o in ords:
    cipher.append( str(o) + " " )
    
print("Decode This (Xored by 50): " + "".join(cipher))