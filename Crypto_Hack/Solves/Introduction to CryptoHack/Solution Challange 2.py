cipher = [99, 114, 121, 112, 116, 111, 123, 65, 83, 67, 73, 73, 95, 112, 114, 49, 110, 116, 52, 98, 108, 51, 125]

message     = []
ciphertext  = []

for c in cipher:
    message.append      ( chr(c) )      #int -> str

for m in message:
    ciphertext.append   ( ord(m) )      #str -> int

print( "Original Message    : " + "".join(message) )
print( "Cipher Text         : " + " ".join( str(c)  for c in ciphertext) )