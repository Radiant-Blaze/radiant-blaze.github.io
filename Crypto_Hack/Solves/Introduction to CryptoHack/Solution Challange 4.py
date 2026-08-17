import base64

cipher_hex      = "72bca9b68fc16ac7beeb8f849dca1d8a783e8acf9679bf9269f7bf"
cipher_base64   = bytes.fromhex(cipher_hex)

print("Encoded Hex      : " , cipher_hex)
print("Encoded Base64   : " , cipher_base64)

#message = base64.b64encode( bytes.fromhex(cipher_hex) )
message = base64.b64encode(cipher_base64)
cipher  = bytes.hex( base64.b64decode(message))

print("Message  : " , message)
print("Cipher   : " , cipher)