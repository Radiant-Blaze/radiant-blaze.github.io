ords = [81, 64, 75, 66, 70, 93, 73, 72, 1, 92, 109, 2, 84, 109, 66, 75, 70, 90, 2, 92, 79]

flag = []
for o in ords:
    flag.append( chr (o^50) )

print("".join(flag))

#print("Here is your flag:")
#print("".join(chr(o ^ 0x32) for o in ords))